import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';

// Stage 1 now includes a real, search-enabled verification pass per
// candidate (added to fix a measured totals-quality problem), so this
// genuinely needs real time — 300s gives comfortable room while staying
// well under Pro's 800s general-availability ceiling.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// TIME_BUDGET_MS removed — was only used by the old candidate-pool retry
// logic, which no longer exists in this file.

async function callClaude(body, retryCount = 0, timeoutMs = 60000) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (fetchErr) {
    clearTimeout(timeoutId);
    if (fetchErr.name === 'AbortError') {
      console.log(`ANTHROPIC_API_TIMEOUT (morning-trigger): call exceeded ${timeoutMs}ms`);
      return { type: 'error', error: { type: 'timeout_error', message: `Call exceeded ${timeoutMs}ms` } };
    }
    throw fetchErr;
  }
  clearTimeout(timeoutId);

  const data = await response.json();

  if (data.type === 'error') {
    const errType = data.error?.type || 'unknown';
    const errMsg = data.error?.message || 'no message';
    console.log(`ANTHROPIC_API_ERROR (morning-trigger): http_status=${response.status} error_type=${errType} message="${errMsg}" retry_count=${retryCount}`);
    const transientTypes = ['overloaded_error', 'rate_limit_error', 'api_error'];
    if (transientTypes.includes(errType) && retryCount < 1) {
      console.log('Retrying once after transient API error, waiting 3s...');
      await new Promise(r => setTimeout(r, 3000));
      return callClaude(body, retryCount + 1, timeoutMs);
    }
  }

  return data;
}

function extractText(content) {
  return (content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

function cleanJson(text) {
  const clean = text
    .replace(/```json|```/g, '')
    .replace(/<cite[^>]*>([\s\S]*?)<\/cite>/g, '$1')
    .replace(/<cite[^>]*>/g, '')
    .replace(/<\/cite>/g, '')
    .trim();
  const jsonMatch = clean.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error('No JSON found in response: ' + text.slice(0, 300));
  return JSON.parse(jsonMatch[0]);
}

// ── Recent Picks Memory (unchanged from generate-picks) ─────────────────
async function buildRecentPicksMemory() {
  const sevenDaysAgo = new Date();
  sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
  const cutoffDate = sevenDaysAgo.toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  const { data: recentPicks } = await supabase
    .from('daily_picks')
    .select('date, sport, game, pick, odds, result')
    .gte('date', cutoffDate)
    .order('date', { ascending: false });

  if (!recentPicks || recentPicks.length === 0) {
    return 'No picks in the last 7 days — no repetition data available yet.';
  }

  const teamCounts = {};
  const teamPickLog = {};
  for (const p of recentPicks) {
    if (!p.game || !p.pick) continue;
    const teams = p.game.split(/ @ | vs /i).map(t => t.trim()).filter(Boolean);
    for (const team of teams) {
      const lastWord = team.split(' ').pop();
      if (lastWord && lastWord.length > 3 && p.pick.toLowerCase().includes(lastWord.toLowerCase())) {
        teamCounts[team] = (teamCounts[team] || 0) + 1;
        teamPickLog[team] = teamPickLog[team] || [];
        teamPickLog[team].push(`${p.date}: "${p.pick}" at ${p.odds || 'odds not recorded'} vs ${p.game} (result: ${p.result})`);
      }
    }
  }

  const repeatedTeams = Object.entries(teamCounts)
    .filter(([, count]) => count >= 2)
    .sort((a, b) => b[1] - a[1]);

  let summary = `RECENT PICKS — LAST 7 DAYS (${recentPicks.length} total picks):\n`;
  summary += recentPicks.map(p => `- ${p.date}: [${p.sport}] ${p.game} — "${p.pick}" at ${p.odds || 'n/a'} (${p.result})`).join('\n');

  if (repeatedTeams.length > 0) {
    summary += `\n\n⚠️ REPEAT WATCH — teams picked 2+ times in the last 7 days (this is a flag to double-check, not an automatic penalty — a genuinely persistent edge can validly repeat):\n`;
    for (const [team, count] of repeatedTeams) {
      summary += `- ${team}: picked ${count}x — ${teamPickLog[team].join('; ')}\n`;
    }
    summary += `\nIf you pick one of these teams again today, your insight must show the actual market or matchup condition has genuinely changed since last time — compare today's line/odds to what's listed above for the prior pick, note the current opponent, and check current injury/starter status. A real, still-valid edge is a legitimate reason to repeat — you do not need to invent a new storyline. What is NOT sufficient is repeating with the same reasoning while ignoring that the line has already moved to reflect it, or repeating purely because you like the team.`;
  }

  return summary;
}

const EVALUATE_CONCURRENCY_CAP = 5;

// Replaces the old two-step "guess a candidate, then verify it" pattern.
// This runs a REAL, search-based evaluation on EVERY game in today's slate
// directly — no game is excluded before getting a genuine look. Deliberately
// lighter than Stage 2's full research (3-5 searches, not 10+) — this is a
// fast, real check per game, not the deep dive that happens later only for
// whatever comes back worth_pursuing.
async function evaluateGameForEdge(game, today_display, recentPicksMemory) {
  const linesSummary = [
    game.moneyline ? `moneyline: ${game.moneyline}` : null,
    game.spread ? `spread: ${game.spread}` : null,
    game.total ? `total: ${game.total}` : null,
    game.away_starter || null,
    game.home_starter || null,
  ].filter(Boolean).join(' | ');

  const system = `You are Hunter, an elite sports betting analyst. Today is ${today_display}.

You are looking at ONE game from today's full slate. Run a REAL, right-now evaluation — not verifying someone else's guess, deciding fresh from scratch whether this specific game has a genuine betting edge worth pursuing.

Game: ${game.game}
Sport: ${game.sport}
Current lines: ${linesSummary || 'not available'}

Run 3-5 targeted web searches covering whatever's most relevant to this specific game (confirmed starters/lineups, injuries, recent form, line movement, matchup history — as applicable). This is a fast, real check, not the full deep-dive research that happens later for whatever you flag here as worth pursuing.

FOR TOTALS SPECIFICALLY: this system has a real, measured problem — totals proposed on pitching/bullpen narratives alone, without weighing both teams' actual offensive quality, have underperformed badly. If you land on a total here, you MUST have searched and weighed BOTH teams' real recent offensive output, not just the pitching matchup.

Be honest and selective. Passing on this game is the correct, default outcome — do not manufacture an angle that isn't really there just to have something to report. Most individual games will NOT have a real edge today.

${recentPicksMemory}

Return ONLY this JSON, no other text:
{
  "worth_pursuing": true or false,
  "bet_type": "moneyline|spread|total|f5|first_half|prop" (only meaningful if worth_pursuing is true),
  "pick": "the specific pick, e.g. 'Detroit Tigers -1.5'" (only meaningful if worth_pursuing is true),
  "reason": "one or two sentences on what you actually found"
}`;

  const response = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 1000,
    system,
    messages: [{ role: 'user', content: `Evaluate ${game.game} now.` }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  }, 0, 45000);

  const text = extractText(response.content);
  if (!text.trim()) return null;
  try {
    return cleanJson(text);
  } catch (e) {
    console.log(`EVALUATE_PARSE_FAILED for "${game.game}": ${e.message.slice(0, 200)} — attempting JSON-normalization fallback rather than discarding real research.`);
    return await normalizeToJson(text, game);
  }
}

// Second-pass fallback — ONLY fires when the first call did real research
// but wrote it up as prose instead of the required JSON (a real, observed
// failure mode on July 23: the research itself was good, just the wrong
// output format). Does NOT re-research anything — no web_search tool
// here, purely reformats findings that already exist. Uses an
// assistant-turn prefill ('{') to force valid JSON continuation — more
// reliable than just re-asking, since re-prompting the SAME call that
// just did tool use tends to repeat the same prose-first habit.
async function normalizeToJson(freeText, game) {
  const system = `You already completed real research on ${game.game} and wrote up your findings below, but did not format the answer as JSON as required. Do NOT do any new research or add new information — just convert your own findings below into the exact JSON structure requested. If no real, worth-pursuing edge emerged from your findings, that's a legitimate outcome — represent it honestly with worth_pursuing: false, don't invent a pick that isn't really there.

YOUR ORIGINAL FINDINGS:
${freeText.slice(0, 4000)}

Return ONLY this JSON, no other text:
{
  "worth_pursuing": true or false,
  "bet_type": "moneyline|spread|total|f5|first_half|prop",
  "pick": "the specific pick, e.g. 'Detroit Tigers -1.5'",
  "reason": "one or two sentences on what you actually found"
}`;

  const response = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system,
    messages: [
      { role: 'user', content: 'Convert your findings to the JSON now.' },
      { role: 'assistant', content: '{' },
    ],
  }, 0, 30000);

  const text = extractText(response.content);
  if (!text.trim()) {
    console.log(`NORMALIZE_EMPTY for "${game.game}" — fallback call returned nothing, giving up on this game for today.`);
    return null;
  }
  try {
    return cleanJson('{' + text);
  } catch (e) {
    console.log(`NORMALIZE_FAILED for "${game.game}": ${e.message} — giving up on this game for today.`);
    return null;
  }
}

// Runs the real evaluation across every game in today's slate, with a
// concurrency cap so a big slate doesn't fire dozens of simultaneous calls.
// Fails OPEN per-game — if a call errors or times out, that game is simply
// skipped (treated as no edge found), never blocks the rest of the run.
async function evaluateAllGames(slimGames, today_display, recentPicksMemory) {
  const results = new Array(slimGames.length).fill(null);
  for (let i = 0; i < slimGames.length; i += EVALUATE_CONCURRENCY_CAP) {
    const batch = slimGames.slice(i, i + EVALUATE_CONCURRENCY_CAP);
    const batchResults = await Promise.all(batch.map(async (g) => {
      try {
        return await evaluateGameForEdge(g, today_display, recentPicksMemory);
      } catch (e) {
        console.log(`EVALUATE_ERROR for "${g.game}": ${e.message}`);
        return null;
      }
    }));
    batchResults.forEach((r, idx) => { results[i + idx] = r; });
  }
  return results;
}

// ── Per-sport timing ──────────────────────────────────────────────────────
// From Miles's refined timing table. UFC and Tennis are explicitly flagged
// as not fitting the T-minus model — using conservative placeholder
// defaults for now, to be revisited once Phase 3 is live and real timing
// data exists to tune against.
const SPORT_TIMING = {
  mlb:    { researchMinutesBefore: 300, confirmationMinutesBefore: 90,  minLeadMinutes: 60 },
  nhl:    { researchMinutesBefore: 120, confirmationMinutesBefore: 75,  minLeadMinutes: 45 },
  nba:    { researchMinutesBefore: 90,  confirmationMinutesBefore: 45,  minLeadMinutes: 30 },
  nfl:    { researchMinutesBefore: 180, confirmationMinutesBefore: 105, minLeadMinutes: 60 },
  ncaaf:  { researchMinutesBefore: 180, confirmationMinutesBefore: 105, minLeadMinutes: 60 },
  ncaab:  { researchMinutesBefore: 90,  confirmationMinutesBefore: 45,  minLeadMinutes: 30 },
  soccer: { researchMinutesBefore: 90,  confirmationMinutesBefore: 60,  minLeadMinutes: 25 },
};

function normalizeSportForTiming(sportTitle) {
  const s = (sportTitle || '').toLowerCase();
  if (s.includes('mlb') || s.includes('baseball')) return 'mlb';
  if (s.includes('nhl') || s.includes('hockey')) return 'nhl';
  if (s.includes('nba')) return 'nba';
  if (s.includes('nfl')) return 'nfl';
  if (s.includes('ncaaf') || (s.includes('college') && s.includes('football'))) return 'ncaaf';
  if (s.includes('ncaab') || (s.includes('college') && s.includes('basketball'))) return 'ncaab';
  if (s.includes('soccer') || s.includes('epl') || s.includes('la liga') || s.includes('bundesliga') ||
      s.includes('serie a') || s.includes('mls') || s.includes('champions league') || s.includes('europa')) return 'soccer';
  if (s.includes('ufc') || s.includes('mma')) return 'ufc';
  if (s.includes('tennis')) return 'tennis';
  return null;
}

// Returns null if the candidate should be skipped entirely (unknown sport,
// or the game is already too close/started to realistically research and
// publish in time).
function computeTiming(sportTitle, gameTime) {
  const bucket = normalizeSportForTiming(sportTitle);
  if (!bucket) {
    console.log(`TIMING_UNKNOWN_SPORT: "${sportTitle}" does not map to a known timing bucket — skipping this candidate.`);
    return null;
  }

  const gameTimeMs = gameTime.getTime();
  const now = Date.now();
  let result;

  if (bucket === 'ufc') {
    // PROVISIONAL — UFC doesn't fit the T-minus model (weigh-ins are the
    // real gate, per Miles's timing table). Using conservative defaults.
    result = {
      research_trigger_at: new Date(Math.min(now, gameTimeMs - 48 * 60 * 60 * 1000)),
      confirmation_deadline_at: new Date(gameTimeMs - 24 * 60 * 60 * 1000),
      publish_deadline_at: new Date(gameTimeMs - 30 * 60 * 1000),
      min_lead_time_minutes: null,
      timing_note: 'PROVISIONAL: UFC does not fit the T-minus model (weigh-ins are the real gate, not a fixed clock) — using conservative placeholder defaults, revisit once Phase 3 is live.',
    };
  } else if (bucket === 'tennis') {
    // PROVISIONAL — Tennis doesn't fit the T-minus model (no fixed clock,
    // order of play shifts). Using conservative defaults.
    result = {
      research_trigger_at: new Date(now),
      confirmation_deadline_at: new Date(gameTimeMs - 15 * 60 * 1000),
      publish_deadline_at: new Date(gameTimeMs - 10 * 60 * 1000),
      min_lead_time_minutes: null,
      timing_note: 'PROVISIONAL: Tennis does not fit the T-minus model (no fixed clock start, order of play shifts) — using conservative placeholder defaults, revisit once Phase 3 is live.',
    };
  } else {
    const t = SPORT_TIMING[bucket];
    let researchTriggerAt = new Date(gameTimeMs - t.researchMinutesBefore * 60 * 1000);
    // Safety floor: if the ideal research window has already passed (e.g. an
    // early game researched at the normal 8 AM run), trigger immediately
    // instead of silently missing the window.
    if (researchTriggerAt.getTime() <= now) {
      console.log(`TIMING_FLOOR: research_trigger_at for a ${bucket} game already passed — triggering immediately instead.`);
      researchTriggerAt = new Date(now);
    }
    result = {
      research_trigger_at: researchTriggerAt,
      confirmation_deadline_at: new Date(gameTimeMs - t.confirmationMinutesBefore * 60 * 1000),
      publish_deadline_at: new Date(gameTimeMs - t.minLeadMinutes * 60 * 1000),
      min_lead_time_minutes: t.minLeadMinutes,
      timing_note: null,
    };
  }

  // If the publish deadline has already passed, this candidate can never be
  // actionable — skip it rather than writing a dead row.
  if (result.publish_deadline_at.getTime() <= now) {
    console.log(`TIMING_EXPIRED: publish_deadline_at for this game has already passed — skipping, too close/already started.`);
    return null;
  }

  return result;
}

async function generateMorningTrigger() {
  const startTime = Date.now();
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // Prevent duplicates — if today's candidates already exist, don't write a
  // second batch on top of them (e.g. cron retried, or manual re-trigger).
  const { data: existingCandidates } = await supabase
    .from('game_candidates')
    .select('id')
    .eq('date', today)
    .limit(1);
  if (existingCandidates && existingCandidates.length > 0) {
    console.log('game_candidates already written for today, skipping morning trigger');
    return;
  }

  // Fetch odds — same as generate-picks, just no spread-sign ground-truth
  // lookup needed here since this endpoint doesn't publish picks itself.
  const oddsRes = await fetch('https://betcierge-next.vercel.app/api/odds', { method: 'POST' });
  const oddsData = await oddsRes.json();
  const now = new Date();
  // Lookahead window widened to 24 hours (was 14). Stage 1 has no
  // staleness downside \u2014 it doesn't need fresh confirmed lineups the
  // way Stage 2 does, just current lines to pick candidates from. This
  // lets a single early run (see intended 3 AM ET cron) still catch the
  // WHOLE day's slate \u2014 early Wednesday MLB matinees AND evening
  // primetime games alike \u2014 without needing a second run per day.
  const cutoff = new Date(now.getTime() + 15 * 60 * 1000);
  const upperBound = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const slimGames = (oddsData.games || [])
    .filter(g => new Date(g.commence_time) > cutoff && new Date(g.commence_time) < upperBound)
    // NOTE: no slice/cap here by design — every game in today's window gets
    // a real, research-based look (see evaluateGameForEdge below). Revisit
    // this once college football/basketball are back in season: at ~100+
    // games in one day, this loop's wall-clock time could approach or
    // exceed this function's 300s maxDuration. Fine for MLB-only days now.
    .map(g => {
      const bm = g.bookmakers?.[0];
      const h2h = bm?.markets?.find(m => m.key === 'h2h');
      const spread = bm?.markets?.find(m => m.key === 'spreads');
      const total = bm?.markets?.find(m => m.key === 'totals');
      return {
        sport: g.sport_title,
        game: `${g.away_team} @ ${g.home_team}`,
        time: g.commence_time,
        moneyline: h2h?.outcomes?.map(o => `${o.name}: ${o.price}`).join(', '),
        spread: spread?.outcomes?.map(o => `${o.name} ${o.point}: ${o.price}`).join(', '),
        total: total?.outcomes?.map(o => `${o.name} ${o.point}: ${o.price}`).join(', '),
        sport_key: g.sport_key,
      };
    });

  // Enrich MLB games with confirmed starting pitchers — cheap, single free
  // API call, helps Stage 1 avoid proposing candidates around games without
  // an obvious starter yet (Stage 2 will re-verify this properly regardless).
  try {
    const mlbRes = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${today}&gameType=R&hydrate=probablePitcher`
    );
    const mlbData = await mlbRes.json();
    const mlbSchedule = mlbData.dates?.[0]?.games || [];
    for (const game of slimGames) {
      if (game.sport_key !== 'baseball_mlb') continue;
      const awayTeam = game.game.split(' @ ')[0].toLowerCase();
      const homeTeam = game.game.split(' @ ')[1].toLowerCase();
      const match = mlbSchedule.find(s => {
        const sAway = s.teams?.away?.team?.name?.toLowerCase() || '';
        const sHome = s.teams?.home?.team?.name?.toLowerCase() || '';
        return sAway.split(' ').some(w => w.length > 3 && awayTeam.includes(w)) ||
               sHome.split(' ').some(w => w.length > 3 && homeTeam.includes(w));
      });
      if (match) {
        const awayPitcher = match.teams?.away?.probablePitcher?.fullName;
        const homePitcher = match.teams?.home?.probablePitcher?.fullName;
        if (awayPitcher) game.away_starter = `${game.game.split(' @ ')[0]} starter: ${awayPitcher}`;
        if (homePitcher) game.home_starter = `${game.game.split(' @ ')[1]} starter: ${homePitcher}`;
      }
    }
  } catch (e) {
    console.error('Pitcher enrichment error:', e.message);
  }

  const today_display = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York'
  });

  const recentPicksMemory = await buildRecentPicksMemory();
  console.log('Recent picks memory built. Length:', recentPicksMemory.length);

  console.log(`Evaluating all ${slimGames.length} games in today's slate — no pre-filter, every game gets a real research pass.`);

  // ── STAGE 1: Real, per-game research evaluation — no pre-filter ──────
  // Replaces the old "guess 8-10 candidates, then verify them" pattern.
  // Every game in today's slate gets a genuine, search-based look; nothing
  // is excluded before being researched. See maxDuration note above this
  // file's slimGames construction re: revisiting before college season.
  const evaluations = await evaluateAllGames(slimGames, today_display, recentPicksMemory);
  const candidates = slimGames
    .map((g, i) => ({ game: g.game, sport: g.sport, evaluation: evaluations[i] }))
    .filter(c => c.evaluation && c.evaluation.worth_pursuing === true)
    .map(c => ({
      game: c.game,
      sport: c.sport,
      bet_type: c.evaluation.bet_type || 'unknown',
      proposed_pick: c.evaluation.pick || '',
      reason: c.evaluation.reason || '',
    }));

  console.log(`${candidates.length} of ${slimGames.length} games came back worth pursuing.`);

  // ── Write game_candidates rows, one per candidate, with timing ───────
  const rows = [];
  let benchRank = 0;

  for (const c of candidates) {
    const matchedGame = slimGames.find(g => g.game === c.game);
    if (!matchedGame) {
      console.log(`CANDIDATE_GAME_NOT_FOUND: "${c.game}" from Stage 1 candidate pool does not match any game in today's odds feed — discarding.`);
      continue;
    }

    const gameTime = new Date(matchedGame.time);
    if (isNaN(gameTime.getTime())) {
      console.log(`CANDIDATE_BAD_GAME_TIME: "${c.game}" has an unparseable game time — discarding.`);
      continue;
    }

    const timing = computeTiming(matchedGame.sport, gameTime);
    if (!timing) {
      continue; // already logged inside computeTiming
    }

    benchRank += 1;
    rows.push({
      date: today,
      sport: c.sport,
      game: c.game,
      bet_type: c.bet_type || null,
      game_time: gameTime.toISOString(),
      sport_key: matchedGame.sport_key || null,
      original_moneyline: matchedGame.moneyline || null,
      original_spread: matchedGame.spread || null,
      original_total: matchedGame.total || null,
      research_trigger_at: timing.research_trigger_at.toISOString(),
      confirmation_deadline_at: timing.confirmation_deadline_at.toISOString(),
      publish_deadline_at: timing.publish_deadline_at.toISOString(),
      min_lead_time_minutes: timing.min_lead_time_minutes,
      bench_rank: benchRank,
      research_status: 'pending_research',
      status: 'pending_research',
      notes: timing.timing_note,
    });
  }

  if (rows.length === 0) {
    console.log('No viable candidates survived game-matching and timing checks. Nothing written for today.');
    return;
  }

  const { error: insertError } = await supabase.from('game_candidates').insert(rows);
  if (insertError) throw insertError;

  console.log(`Morning trigger wrote ${rows.length} game_candidates rows for ${today}. Total time: ${Date.now() - startTime}ms`);
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const cronSecret = request.headers.get('x-cron-secret');
  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}` && cronSecret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  waitUntil(generateMorningTrigger().catch(err => console.error('generateMorningTrigger error:', err)));
  return Response.json({ success: true, message: 'Morning trigger started' });
}

export async function POST(request) {
  return GET(request);
}
