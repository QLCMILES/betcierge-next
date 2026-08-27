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
//
// BATCHED — takes every candidate for this run at once and resolves them
// in a small, fixed number of DB round trips instead of one (or two) per
// candidate. This is the fix for a flagged scaling risk: the original
// per-candidate version was fine at MLB volume (10-15 games) but added
// up to 100-200 sequential round trips at real college-football volume
// (40-100+ games), stacking onto a function that already has a 300s
// ceiling. Common case (brand-new game, or an exact repeat match with no
// drift) now costs exactly 2 round trips total regardless of slate size:
// one bulk fetch, one bulk insert. Only the rare case — a provider id
// that drifted since we last saw this game (e.g. a postponement) — still
// does individual work, and even those run concurrently via
// Promise.all(), not sequentially.
//
// candidates: array of { _index, sportKey, homeTeam, awayTeam, commenceTime (Date), oddsApiGameId }
// returns: Map of _index -> games.id (missing entries mean resolution
// failed for that candidate — non-fatal, caller leaves game_ref_id null)
// Football postponements can shift a game by days, not hours — flex
// scheduling, weather, extreme cases (real historical precedent: the
// 2022 Bills/Bengals postponement, multi-day COVID-era reschedules).
// Time is not a safe identity signal for football the way it is for
// daily sports with real doubleheaders (MLB/NBA/NHL) — see
// resolveOrCreateGamesBatch's repair path below for how this is used.
const FOOTBALL_SPORT_KEYS = new Set(['americanfootball_nfl', 'americanfootball_ncaaf']);

// TEMPORARY (Aug 26, 2026) — pausing all soccer leagues while pre-revenue,
// to cut Layer 1 evaluation cost. Soccer was driving real day-to-day cost
// spikes (multiple leagues, 20-60+ games some days) with no test value
// right now. Flip to false to bring soccer back once ready.
const SKIP_SOCCER = true;

// (Aug 27, 2026) — pin the odds snapshot taken here to a SPECIFIC named
// book, instead of whichever book The Odds API happened to return first
// (bookmakers[0]). research-scheduler's later freshness re-check pins to
// this same book, so the two snapshots are actually comparable — before
// this, a "line move" could just be two different sportsbooks disagreeing
// at two different points in time, not the market actually moving.
// KEEP IN SYNC with the same constant in research-scheduler/route.js.
const PRIMARY_BOOKMAKER_KEY = 'draftkings';

async function resolveOrCreateGamesBatch(candidates) {
  const results = new Map();

  const validCandidates = candidates.filter(c => {
    if (!c.sportKey || !c.homeTeam || !c.awayTeam) {
      console.log(`GAME_IDENTITY_SKIPPED: missing sportKey/homeTeam/awayTeam for "${c.awayTeam} @ ${c.homeTeam}" — leaving game_ref_id null.`);
      return false;
    }
    return true;
  });
  if (validCandidates.length === 0) return results;

  try {
    // One bulk fetch covering every candidate's fast-path AND repair-path
    // window at once — the same 18h buffer used per-candidate before,
    // just applied to the whole batch's time span in a single query.
    // Correct for MLB/NBA/NHL/MLS/MMA, where real doubleheaders/rematches
    // within a day make a narrow window necessary to avoid false matches.
    const allTimesMs = validCandidates.map(c => c.commenceTime.getTime());
    const windowStart = new Date(Math.min(...allTimesMs) - 18 * 60 * 60 * 1000).toISOString();
    const windowEnd = new Date(Math.max(...allTimesMs) + 18 * 60 * 60 * 1000).toISOString();

    const { data: existingGames, error: fetchError } = await supabase
      .from('games')
      .select('id, sport, home_team, away_team, commence_time, odds_api_game_id')
      .gte('commence_time', windowStart)
      .lte('commence_time', windowEnd);

    if (fetchError) {
      console.log(`GAME_IDENTITY_BATCH_FETCH_ERROR: ${fetchError.message} — all candidates in this batch fall back to game_ref_id=null.`);
      return results;
    }

    // Football gets a second, time-unrestricted fetch — see
    // FOOTBALL_SPORT_KEYS comment above for why time isn't a safe
    // identity signal there. One extra bulk fetch, only when the batch
    // actually contains a football candidate — not per-candidate, so
    // this doesn't reintroduce the scaling problem fixed earlier today.
    const hasFootball = validCandidates.some(c => FOOTBALL_SPORT_KEYS.has(c.sportKey));
    let footballGames = [];
    if (hasFootball) {
      const { data: fbGames, error: fbFetchError } = await supabase
        .from('games')
        .select('id, sport, home_team, away_team, commence_time, odds_api_game_id')
        .in('sport', [...FOOTBALL_SPORT_KEYS]);
      if (fbFetchError) {
        console.log(`GAME_IDENTITY_FOOTBALL_FETCH_ERROR: ${fbFetchError.message}`);
      } else {
        footballGames = fbGames || [];
      }
    }

    const byProviderId = new Map();
    for (const g of existingGames || []) {
      if (g.odds_api_game_id) byProviderId.set(g.odds_api_game_id, g);
    }
    // A football game postponed outside the normal time window might not
    // be in existingGames at all — make sure the fast path can still
    // find it by provider id via the unrestricted football set too.
    for (const g of footballGames) {
      if (g.odds_api_game_id && !byProviderId.has(g.odds_api_game_id)) byProviderId.set(g.odds_api_game_id, g);
    }

    const toInsert = [];
    const insertKeyToIndex = new Map(); // keyed by home|away|epoch-ms, not raw ISO string, to avoid any Postgres round-trip formatting mismatch
    const updatePromises = [];

    for (const c of validCandidates) {
      const commenceTimeIso = c.commenceTime.toISOString();
      const isFootball = FOOTBALL_SPORT_KEYS.has(c.sportKey);

      // Fast path: direct provider-id match.
      if (c.oddsApiGameId && byProviderId.has(c.oddsApiGameId)) {
        const existing = byProviderId.get(c.oddsApiGameId);
        results.set(c._index, existing.id);
        if (existing.commence_time !== commenceTimeIso) {
          updatePromises.push(
            supabase.from('games')
              .update({ commence_time: commenceTimeIso, updated_at: new Date().toISOString() })
              .eq('id', existing.id)
              .then(({ error }) => { if (error) console.log(`GAME_IDENTITY_UPDATE_ERROR: ${error.message}`); })
          );
        }
        continue;
      }

      // Repair path: provider id missed — either a new game, or this
      // game's provider id drifted since we last saw it. In-memory match
      // against the already-fetched batch instead of a DB round trip.
      //
      // Two things changed here (Aug 4, three-way review):
      // 1. Football searches the unrestricted footballGames pool with NO
      //    time constraint at all — two football teams essentially never
      //    play each other twice in a season except a scheduled rematch
      //    months apart, so identity alone (sport+teams) is safe. Every
      //    other sport keeps the existing ±18h window, still needed to
      //    correctly disambiguate same-day doubleheaders/rematches.
      // 2. Swap-safe matching for every sport — neutral-site/
      //    international games (NFL London/Germany, neutral-site NCAAF
      //    openers) can have home/away swapped between provider updates,
      //    so a real match must accept either orientation.
      const searchPool = isFootball ? footballGames : (existingGames || []);
      const repaired = searchPool.find(g => {
        if (g.sport !== c.sportKey) return false;
        const namesMatch =
          (g.home_team === c.homeTeam && g.away_team === c.awayTeam) ||
          (g.home_team === c.awayTeam && g.away_team === c.homeTeam);
        if (!namesMatch) return false;
        if (isFootball) return true;
        return Math.abs(new Date(g.commence_time).getTime() - c.commenceTime.getTime()) <= 18 * 60 * 60 * 1000;
      });
      if (repaired) {
        results.set(c._index, repaired.id);
        console.log(`GAME_IDENTITY_REPAIRED: ${c.awayTeam} @ ${c.homeTeam} matched by ${isFootball ? 'teams only, no time constraint (football)' : 'teams+date (swap-safe)'}, healing odds_api_game_id -> ${c.oddsApiGameId || 'null'}`);
        updatePromises.push(
          supabase.from('games')
            .update({
              odds_api_game_id: c.oddsApiGameId || null,
              odds_api_id_synced_at: new Date().toISOString(),
              commence_time: commenceTimeIso,
              updated_at: new Date().toISOString(),
            })
            .eq('id', repaired.id)
            .then(({ error }) => { if (error) console.log(`GAME_IDENTITY_UPDATE_ERROR: ${error.message}`); })
        );
        continue;
      }

      // Genuinely new game — queue for the single bulk insert below.
      insertKeyToIndex.set(`${c.homeTeam}|${c.awayTeam}|${c.commenceTime.getTime()}`, c._index);
      toInsert.push({
        sport: c.sportKey,
        home_team: c.homeTeam,
        away_team: c.awayTeam,
        commence_time: commenceTimeIso,
        odds_api_game_id: c.oddsApiGameId || null,
        odds_api_id_synced_at: c.oddsApiGameId ? new Date().toISOString() : null,
      });
    }

    const work = [...updatePromises];

    if (toInsert.length > 0) {
      work.push(
        supabase.from('games')
          .insert(toInsert)
          .select('id, home_team, away_team, commence_time')
          .then(({ data: created, error: insertError }) => {
            if (insertError) {
              console.log(`GAME_IDENTITY_BATCH_INSERT_ERROR: ${insertError.message}`);
              return;
            }
            console.log(`GAME_IDENTITY_CREATED: ${created.length} new games rows in one batch insert.`);
            for (const row of created) {
              const key = `${row.home_team}|${row.away_team}|${new Date(row.commence_time).getTime()}`;
              const idx = insertKeyToIndex.get(key);
              if (idx !== undefined) results.set(idx, row.id);
            }
          })
      );
    }

    await Promise.all(work);
    return results;
  } catch (e) {
    console.log(`GAME_IDENTITY_BATCH_UNEXPECTED_ERROR: ${e.message}`);
    return results;
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
    .filter(g => !(SKIP_SOCCER && (g.sport_key || '').startsWith('soccer_')))
    .map(g => {
      const bm = g.bookmakers?.find(b => b.key === PRIMARY_BOOKMAKER_KEY) || g.bookmakers?.[0];
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
  // Games-table resolution is deliberately decoupled from this loop —
  // collect the inputs here, resolve everything in one batch afterward.
  // See resolveOrCreateGamesBatch for why (this is the fix for the
  // flagged college-football scaling risk).
  const rows = [];
  const gameRefInputs = [];
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
    const rowIndex = rows.length;
    rows.push({
      date: today,
      sport: c.sport,
      game: c.game,
      game_ref_id: null, // filled in below, after batch resolution
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
    gameRefInputs.push({
      _index: rowIndex,
      sportKey: matchedGame.sport_key,
      homeTeam: matchedGame.home_team,
      awayTeam: matchedGame.away_team,
      commenceTime: gameTime,
      oddsApiGameId: matchedGame.odds_api_game_id,
    });
  }

  if (rows.length === 0) {
    console.log('No viable candidates survived game-matching and timing checks. Nothing written for today.');
    return;
  }

  // One batch resolution for every candidate in this run — 2-3 total DB
  // round trips instead of one (or two) per candidate.
  const gameRefResults = await resolveOrCreateGamesBatch(gameRefInputs);
  for (const [idx, gameRefId] of gameRefResults) {
    rows[idx].game_ref_id = gameRefId;
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
