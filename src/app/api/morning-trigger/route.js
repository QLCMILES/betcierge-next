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

// ── Game identity resolution (first-class `games` table) ─────────────────
// Looks up (or creates) the one true row for a real-world game, so
// downstream tables can point at a stable internal id instead of a
// free-text string or a provider id that can silently change (the Odds
// API's own id is a hash of sport+teams+commence_time, and shifts if
// commence_time moves 8+ hours — e.g. a rain postponement).
//
// Non-fatal by design: this is additive infrastructure sitting alongside
// game_candidates creation, not gating it. Any failure here logs and
// returns null — the candidate row still gets written either way.
async function resolveOrCreateGame({ sportKey, homeTeam, awayTeam, commenceTime, oddsApiGameId }) {
  if (!sportKey || !homeTeam || !awayTeam) {
    console.log(`GAME_IDENTITY_SKIPPED: missing sportKey/homeTeam/awayTeam for "${awayTeam} @ ${homeTeam}" — leaving game_ref_id null.`);
    return null;
  }

  try {
    const commenceTimeIso = commenceTime.toISOString();

    // Fast path: direct provider-id lookup.
    if (oddsApiGameId) {
      const { data: byProviderId, error: providerLookupError } = await supabase
        .from('games')
        .select('id, commence_time')
        .eq('odds_api_game_id', oddsApiGameId)
        .maybeSingle();
      if (providerLookupError) {
        console.log(`GAME_IDENTITY_LOOKUP_ERROR (provider id): ${providerLookupError.message}`);
      } else if (byProviderId) {
        if (byProviderId.commence_time !== commenceTimeIso) {
          await supabase
            .from('games')
            .update({ commence_time: commenceTimeIso, updated_at: new Date().toISOString() })
            .eq('id', byProviderId.id);
        }
        return byProviderId.id;
      }
    }

    // Repair path: provider id missed — either a new game, or this game's
    // provider id drifted since we last saw it (e.g. a postponement shifted
    // commence_time enough to change the Odds API's hash). Re-resolve by
    // sport + teams + a wide same-day window, and if found, heal the
    // stored provider id in place rather than creating a duplicate row.
    const windowStart = new Date(commenceTime.getTime() - 18 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(commenceTime.getTime() + 18 * 60 * 60 * 1000).toISOString();
    const { data: byTeamsAndDate, error: repairLookupError } = await supabase
      .from('games')
      .select('id')
      .eq('sport', sportKey)
      .eq('home_team', homeTeam)
      .eq('away_team', awayTeam)
      .gte('commence_time', windowStart)
      .lte('commence_time', windowEnd)
      .maybeSingle();
    if (repairLookupError) {
      console.log(`GAME_IDENTITY_LOOKUP_ERROR (repair path): ${repairLookupError.message}`);
    } else if (byTeamsAndDate) {
      console.log(`GAME_IDENTITY_REPAIRED: ${awayTeam} @ ${homeTeam} matched by teams+date, healing odds_api_game_id -> ${oddsApiGameId || 'null'}`);
      await supabase
        .from('games')
        .update({
          odds_api_game_id: oddsApiGameId || null,
          odds_api_id_synced_at: new Date().toISOString(),
          commence_time: commenceTimeIso,
          updated_at: new Date().toISOString(),
        })
        .eq('id', byTeamsAndDate.id);
      return byTeamsAndDate.id;
    }

    // Genuinely new game — create the one true row for it.
    const { data: created, error: insertError } = await supabase
      .from('games')
      .insert({
        sport: sportKey,
        home_team: homeTeam,
        away_team: awayTeam,
        commence_time: commenceTimeIso,
        odds_api_game_id: oddsApiGameId || null,
        odds_api_id_synced_at: oddsApiGameId ? new Date().toISOString() : null,
      })
      .select('id')
      .single();
    if (insertError) {
      console.log(`GAME_IDENTITY_CREATE_ERROR: ${insertError.message} for ${awayTeam} @ ${homeTeam}`);
      return null;
    }

    console.log(`GAME_IDENTITY_CREATED: ${awayTeam} @ ${homeTeam} -> games.id=${created.id}`);
    return created.id;
  } catch (e) {
    console.log(`GAME_IDENTITY_UNEXPECTED_ERROR: ${e.message} for ${awayTeam} @ ${homeTeam}`);
    return null;
  }
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
  // staleness downside — it doesn't need fresh confirmed lineups the
  // way Stage 2 does, just current lines to pick candidates from. This
  // lets a single early run (see intended 3 AM ET cron) still catch the
  // WHOLE day's slate — early Wednesday MLB matinees AND evening
  // primetime games alike — without needing a second run per day.
  const cutoff = new Date(now.getTime() + 15 * 60 * 1000);
  const upperBound = new Date(now.getTime() + 24 * 60 * 60 * 1000);

  const slimGames = (oddsData.games || [])
    .filter(g => new Date(g.commence_time) > cutoff && new Date(g.commence_time) < upperBound)
    // NOTE: no slice/cap here by design — every game in today's window gets
    // a real, research-based look (see evaluate-scheduler's evaluateGameForEdge). Revisit
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
        // NEW — needed for games-table identity resolution below
        home_team: g.home_team,
        away_team: g.away_team,
        odds_api_game_id: g.id,
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

  console.log(`Queuing all ${slimGames.length} games in today's slate for evaluation — no research happens in this step, evaluate-scheduler picks these up next.`);

  // ── Every game becomes a candidate row immediately, unresearched ─────
  // Real research (the two-call research+extract design) now happens in
  // evaluate-scheduler, a few games at a time, on its own repeating cron —
  // same pattern already proven with research-scheduler. This is what
  // keeps morning-trigger itself fast and safe at any slate size (15
  // games or 150), since it no longer does any LLM work at all.
  const candidates = slimGames.map(g => ({ game: g.game, sport: g.sport }));

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

    // Resolve (or create) this game's one true row in the `games` table.
    // Sequential per-candidate — same scaling note as the rest of this
    // file: fine at MLB-day volume (10-15 games), worth revisiting
    // (batch/parallelize) before college football's 40-100+ game days,
    // same as the maxDuration risk already flagged above.
    const gameRefId = await resolveOrCreateGame({
      sportKey: matchedGame.sport_key,
      homeTeam: matchedGame.home_team,
      awayTeam: matchedGame.away_team,
      commenceTime: gameTime,
      oddsApiGameId: matchedGame.odds_api_game_id,
    });

    benchRank += 1;
    rows.push({
      date: today,
      sport: c.sport,
      game: c.game,
      game_ref_id: gameRefId,
      bet_type: null, // filled in later by evaluate-scheduler once this game is actually evaluated
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
      research_status: 'pending_evaluation',
      status: 'pending_evaluation',
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
