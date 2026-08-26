import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { runStage2ResearchLoop, extractText, cleanJson } from '../../../lib/researchLoop';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// How many NEW candidates we'll submit research for in a single run.
// Fixes the "burst scheduling" risk flagged in the 3-way review: if 12
// games all cross their trigger in the same 15-min window, we don't want
// to fire 12 Anthropic calls simultaneously. The rest wait for next run.
const CONCURRENCY_CAP = 5;
const MAX_RESEARCH_ATTEMPTS = 3; // after this many failures, stop retrying and mark the candidate done — prevents an indefinite retry loop against a persistently-failing game for the rest of its confirmation window

// Pre-flight freshness thresholds — mirrors the same "material move"
// definition used elsewhere in this codebase for the publish-time check.
// This is a coarse filter: catch a candidate that's gone genuinely stale
// (huge line move, likely real news) before spending a Stage 2 call on
// it — not nitpick normal drift.
const MONEYLINE_REJECT_CENTS = 50;
const POINT_REJECT = 3.0;

// ── Entity-consistency matching ─────────────────────────────────────────
// FIRST-PASS DRAFT — Miles's call, edit freely. These are team-name tokens
// across our covered leagues (MLB/NBA/NFL/NHL/soccer/MMA-style "Team A @
// Team B" formatting) that are also ordinary English words or extremely
// common team-name suffixes. On their own they're too weak a signal to
// prove cross-game bleed — a soccer insight mentioning "capacity crowd"
// or "the offense caught fire" is not evidence of contamination just
// because "City"/"Fire" happens to be another team's name that day.
// Real fix #22 (Jul 25-27): this exact gap caused ~5 of 8 entity-bleed
// rejections that weekend — likely all false positives, not real bleed.
const GENERIC_TEAM_WORDS = new Set([
  'city', 'united', 'real', 'fc', 'sc', 'town', 'county', 'albion',
  'rovers', 'wanderers', 'athletic', 'rangers', 'dynamo', 'sporting',
  'academy', 'olympic', 'fire', 'revolution', 'union', 'crew', 'galaxy',
  'heat', 'magic', 'jazz', 'thunder', 'lightning', 'wild', 'storm',
  'wings', 'kings', 'fortune', 'force',
]);

function escapeRegExp(str) {
  return (str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Scoped to games in the SAME sport as the candidate — an MLB insight has
// no legitimate reason to be checked against an MMA fighter's surname or
// an MLS club's name, and widening the pool only widens the false-positive
// surface without adding real detection power (a real cross-game mixup
// would almost always also trip Gate 1's game-verification check).
//
// Uses word-boundary matching instead of a raw substring check — the old
// `insightLower.includes(lastWord)` matched "city" inside "capacity",
// which is how "Sporting Kansas City" bled false-positive rejections into
// three unrelated MLB games that were simply describing their own city
// name (the Royals ARE Kansas City).
function findEntityBleed(insightText, candidate, knownGamesToday) {
  const otherGames = knownGamesToday.filter(
    g => g.game !== candidate.game && g.sport === candidate.sport
  );
  const otherTeamNames = otherGames
    .flatMap(g => g.game.split(' @ ').map(t => t.trim()))
    .filter(Boolean);

  const insightLower = (insightText || '').toLowerCase();

  for (const team of otherTeamNames) {
    const lastWord = team.split(' ').pop();
    if (!lastWord || lastWord.length <= 3) continue;
    if (GENERIC_TEAM_WORDS.has(lastWord.toLowerCase())) continue; // too common alone to be reliable signal
    const pattern = new RegExp(`\\b${escapeRegExp(lastWord.toLowerCase())}\\b`, 'i');
    if (pattern.test(insightLower)) {
      return team;
    }
  }
  return null;
}

// Parses a string like "American League: 116, National League: -136" into
// { "American League": 116, "National League": -136 } for diffing.
function parseOddsString(str) {
  const out = {};
  if (!str) return out;
  for (const part of str.split(',')) {
    const match = part.trim().match(/^(.+?):\s*(-?\d+(\.\d+)?)$/);
    if (match) out[match[1].trim()] = parseFloat(match[2]);
  }
  return out;
}

function parsePointsString(str) {
  // e.g. "American League 1.5: -182, National League -1.5: 150"
  const out = {};
  if (!str) return out;
  for (const part of str.split(',')) {
    const match = part.trim().match(/^(.+?)\s(-?\d+(\.\d+)?):\s*-?\d+$/);
    if (match) out[match[1].trim()] = parseFloat(match[2]);
  }
  return out;
}

// Returns { stale: boolean, reason: string|null }
function checkFreshness(originalMoneyline, freshMoneyline, originalSpread, freshSpread) {
  const origML = parseOddsString(originalMoneyline);
  const freshML = parseOddsString(freshMoneyline);
  for (const team of Object.keys(origML)) {
    if (freshML[team] === undefined) continue;
    const diff = Math.abs(freshML[team] - origML[team]);
    if (diff >= MONEYLINE_REJECT_CENTS) {
      return { stale: true, reason: `Moneyline moved ${diff} cents on ${team} (${origML[team]} → ${freshML[team]})` };
    }
  }
  const origPts = parsePointsString(originalSpread);
  const freshPts = parsePointsString(freshSpread);
  for (const team of Object.keys(origPts)) {
    if (freshPts[team] === undefined) continue;
    const diff = Math.abs(freshPts[team] - origPts[team]);
    if (diff >= POINT_REJECT) {
      return { stale: true, reason: `Spread moved ${diff} points on ${team} (${origPts[team]} → ${freshPts[team]})` };
    }
  }
  return { stale: false, reason: null };
}

// Shared gating logic — the three quality gates originally lived only
// inside pollSubmittedResearch's batch-completion handler. Extracted here
// so both the new synchronous path (submitNewResearch) and the legacy
// batch-draining path (pollSubmittedResearch, kept only to resolve any
// candidates already mid-flight from before this deploy) run the exact
// same checks, instead of two copies that could quietly diverge over time.
async function gateAndFinalizeResearch(candidate, pick, knownGamesToday) {
  // ── Gate 1: game-verification ──────────────────────────────────
  if (pick.game !== candidate.game) {
    console.log(`GAME_MISMATCH: expected "${candidate.game}", got "${pick.game}" — rejecting.`);
    await supabase.from('game_candidates').update({
      research_status: 'researched',
      status: 'rejected_no_edge',
      notes: `Game verification failed: model returned "${pick.game}" instead of "${candidate.game}".`,
      research_log: pick, // preserve the actual output even on rejection — needed to verify real vs. false-positive gate failures after the fact
    }).eq('id', candidate.id);
    return;
  }

  // ── Gate 2: eligibility ───────────────────────────────────────
  const elig = pick.eligibility || {};
  // "probable" deliberately excluded from this pattern — MLB.com's own
  // "Probable Pitchers" page is the sport's standard confirmed-starter
  // designation before final lineup cards post, not hedging language.
  // Root-caused Aug 4 via live logs: every real ELIGIBILITY_FAILED case
  // in a 24h sample (Twins/Royals, White Sox/Red Sox, Mets/Guardians) had
  // mandatory_participant_confirmed=true and solid sourced confirmed_names
  // — the ONLY thing tripping the gate was this one word. The previous
  // stripKnownSafePhrases workaround only matched the exact phrase
  // "MLB.com probable pitchers page" and missed the equally common
  // "MLB.com official probable pitchers page" phrasing — removed as dead
  // code now that the root word is no longer flagged.
  const vaguePattern = /\b(TBD|tbd|likely starter|unconfirmed|not yet announced)\b/i;
  const namesLookVague = (elig.confirmed_names || []).some(n => vaguePattern.test(n));
  if (elig.mandatory_participant_confirmed !== true || namesLookVague || !elig.confirmed_names || elig.confirmed_names.length === 0) {
    console.log(`ELIGIBILITY_FAILED: "${candidate.game}" — mandatory_participant_confirmed=${elig.mandatory_participant_confirmed}, names=${JSON.stringify(elig.confirmed_names)}`);
    await supabase.from('game_candidates').update({
      research_status: 'researched',
      status: 'rejected_no_edge',
      notes: 'Eligibility gate failed: participant confirmation not genuinely established.',
      eligibility: elig,
      research_log: pick, // preserve the actual output even on rejection — needed to verify real vs. false-positive gate failures after the fact
    }).eq('id', candidate.id);
    return;
  }

  // ── Gate 3: entity-consistency — DOWNGRADED to non-blocking Aug 4 ──
  // Retired as a hard-reject gate after a live audit found 19 of 19
  // recoverable real rejections were false positives — the model
  // correctly citing a team's recent-opponent history (routine, required
  // analysis) that happened to also be playing elsewhere that same day.
  // Zero genuine cross-game bleed found in the sample. Three-way review
  // confirmed the underlying signal ("another team's name appeared
  // somewhere in the text") doesn't reliably distinguish real confusion
  // from legitimate context, and that Gate 1's structural pick.game
  // check already provides the real guarantee against actually writing
  // up the wrong matchup. Kept as a logged, non-blocking flag rather
  // than deleted outright — worth tracking until a proper
  // reasoning-consistency audit (checking whether the prose actually
  // supports the structured pick, not scanning for team names) replaces
  // it as a real fast-follow, not bundled into this same-day fix.
  const bledInTeam = findEntityBleed(pick.insight, candidate, knownGamesToday);
  if (bledInTeam) {
    console.log(`ENTITY_MENTION_NONBLOCKING: "${candidate.game}" insight references "${bledInTeam}" from a different game — logging only, no longer rejecting.`);
  }

  // ── All gates passed — store the research, ready for final confirmation ──
  await supabase.from('game_candidates').update({
    research_status: 'researched',
    status: 'awaiting_confirmation',
    score: pick.score ?? null,
    eligibility: elig,
    insight: pick.insight,
    odds: pick.odds,
    units: pick.units,
    research_log: { ...pick, entity_mention_flag: bledInTeam || null },
  }).eq('id', candidate.id);

  console.log(`Research complete and gated successfully: "${candidate.game}" (score: ${pick.score})${bledInTeam ? ' [entity mention flagged, non-blocking]' : ''}`);
}

// Persists a research-loop refusal to the candidate_refusals audit table.
// Called only for verdict:'refuse' from runStage2ResearchLoop — never for a
// publish (those go through gateAndFinalizeResearch instead). Column mapping
// verified directly against the live candidate_refusals schema: evaluation
// (evaluateEvidence()'s return shape) maps criticalUnresolved/unresolved/
// perSlot onto the array/array/jsonb columns; diagnostics maps turns/
// searchesTotal/turnLog onto the int/int/jsonb columns. turn_history stores
// the COMPACT per-turn log (searches/tokens/unresolved per turn), not the raw
// search transcript, per the Aug 24 decision.
async function recordRefusal(candidate, today, result) {
  const evaluation = result.evaluation || {};
  const diagnostics = result.diagnostics || {};
  const { error } = await supabase.from('candidate_refusals').insert({
    candidate_id: candidate.id,
    date: today,
    game: candidate.game,
    sport: candidate.sport,
    bet_type: candidate.bet_type,
    reason: diagnostics.reason || 'unknown',
    critical_unresolved: evaluation.criticalUnresolved || [],
    unresolved_all: evaluation.unresolved || [],
    per_slot: evaluation.perSlot || null,
    turn_count: diagnostics.turns ?? null,
    search_count: diagnostics.searchesTotal ?? null,
    turn_history: diagnostics.turnLog || null,
    last_valid_pick: result.pick || null,
  });
  if (error) {
    console.error(`Failed to record refusal for "${candidate.game}" in candidate_refusals:`, error.message);
  }
}

async function fetchLiveOddsForGame(gameName, sportKey) {
  const oddsRes = await fetch('https://betcierge-next.vercel.app/api/odds', { method: 'POST' });
  const oddsData = await oddsRes.json();
  const match = (oddsData.games || []).find(g => `${g.away_team} @ ${g.home_team}` === gameName);
  if (!match) return null;
  const bm = match.bookmakers?.[0];
  const h2h = bm?.markets?.find(m => m.key === 'h2h');
  const spread = bm?.markets?.find(m => m.key === 'spreads');
  const total = bm?.markets?.find(m => m.key === 'totals');
  return {
    moneyline: h2h?.outcomes?.map(o => `${o.name}: ${o.price}`).join(', ') || null,
    spread: spread?.outcomes?.map(o => `${o.name} ${o.point}: ${o.price}`).join(', ') || null,
    total: total?.outcomes?.map(o => `${o.name} ${o.point}: ${o.price}`).join(', ') || null,
  };
}

// ── Submit phase: pick up newly-triggered candidates ────────────────────
// ── Submit + synchronously research newly-triggered candidates ──────────
// Function-level time budget for this run of submitNewResearch. Mirrors the
// route's maxDuration (300s) minus a safety margin reserved for the last
// candidate's DB writes and clean shutdown. Computed once per run and passed
// into every runStage2ResearchLoop call — the loop's own hybrid wall-clock
// guard (MIN_USEFUL_TURN_MS) then honors this same deadline internally.
const FUNCTION_BUDGET_MS = 300000;
const SAFETY_MARGIN_MS = 30000;
// Below this much remaining budget, don't even start a new candidate's loop
// this run — leave it pending_research for the next cron tick (it re-selects
// automatically) rather than start a loop that's essentially guaranteed to
// immediately hit its own no-time-left guard and record a manufactured
// refusal that was never a real research attempt.
const MIN_REMAINING_FOR_NEW_CANDIDATE_MS = 30000;

async function submitNewResearch(today) {
  const fnStart = Date.now();
  const deadlineTs = fnStart + FUNCTION_BUDGET_MS - SAFETY_MARGIN_MS;
  const now = new Date().toISOString();

  // Atomic claim (Aug 26) — was a plain SELECT with no locking, so two
  // overlapping runs (manual curl + cron tick, or two cron ticks) could
  // both grab the same pending_research row and pay for the same
  // research twice. claim_research_batch uses FOR UPDATE SKIP LOCKED so
  // a row can only ever be claimed by one run. Mirrors Stage 1's
  // claim_evaluation_batch, added Aug 5.
  const { data: candidates, error } = await supabase
    .rpc('claim_research_batch', { p_date: today, p_cap: CONCURRENCY_CAP });

  if (error) throw error;
  if (!candidates || candidates.length === 0) {
    console.log('No candidates ready for research submission this run.');
    return;
  }

  console.log(`${candidates.length} candidate(s) crossed their research trigger — researching synchronously now (cap: ${CONCURRENCY_CAP}).`);

  const today_display = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York'
  });

  // For the entity-consistency gate: game+sport pairs from every candidate
  // in today's pool, needed here now since gating happens immediately in
  // this same pass rather than in a later poll phase. Sport is included
  // so findEntityBleed() can scope its comparison to same-sport games only.
  const { data: todaysCandidates } = await supabase
    .from('game_candidates')
    .select('game, sport')
    .eq('date', today);
  const knownGamesToday = (todaysCandidates || []).map(c => ({ game: c.game, sport: c.sport }));

  for (const candidate of candidates) {
    try {
      // Time-budget check FIRST — before touching this candidate at all. If
      // this run's shared deadline is nearly up, stop here and leave the
      // rest pending_research for the next tick rather than start (and likely
      // truncate) another candidate's research loop.
      const remainingBudgetMs = deadlineTs - Date.now();
      if (remainingBudgetMs < MIN_REMAINING_FOR_NEW_CANDIDATE_MS) {
        console.log(`TIME_BUDGET_EXHAUSTED: stopping before "${candidate.game}" — only ${Math.round(remainingBudgetMs / 1000)}s left in this run's budget. Remaining candidates stay pending_research for the next tick.`);
        break;
      }

      // Deadline check FIRST, before spending anything.
      if (candidate.confirmation_deadline_at && new Date(candidate.confirmation_deadline_at) < new Date()) {
        console.log(`ALREADY_EXPIRED_AT_SUBMIT: "${candidate.game}" — confirmation deadline already passed before research was even started — skipping entirely, not spending a research call.`);
        await supabase.from('game_candidates').update({
          research_status: 'discarded_stale',
          status: 'expired_unconfirmed',
          notes: 'Confirmation deadline had already passed by the time the research scheduler reached this candidate — never researched.',
        }).eq('id', candidate.id);
        continue;
      }

      // Pre-flight freshness check — cheap, no Claude call.
      const freshOdds = await fetchLiveOddsForGame(candidate.game, candidate.sport_key);
      if (!freshOdds) {
        console.log(`STALE_GAME_VANISHED: "${candidate.game}" no longer appears in the live odds feed — discarding.`);
        await supabase.from('game_candidates').update({
          research_status: 'discarded_stale',
          notes: 'Game no longer found in live odds feed at research-trigger time (likely postponed or pulled).',
        }).eq('id', candidate.id);
        continue;
      }

      const freshness = checkFreshness(
        candidate.original_moneyline, freshOdds.moneyline,
        candidate.original_spread, freshOdds.spread
      );
      if (freshness.stale) {
        console.log(`STALE_LINE_MOVE: "${candidate.game}" — ${freshness.reason} — discarding rather than researching a dead candidate.`);
        await supabase.from('game_candidates').update({
          research_status: 'discarded_stale',
          notes: `Discarded at pre-flight: ${freshness.reason}`,
        }).eq('id', candidate.id);
        continue;
      }

      // Fresh odds check passed — run the real, code-owned multi-turn
      // research loop, bounded by this run's shared deadlineTs (the loop
      // honors it via its own hybrid wall-clock guard). This either reaches
      // a publish/refuse verdict within budget or refuses outright — no
      // dependency on a batch queue with no completion-time guarantee.
      const result = await runStage2ResearchLoop(candidate, today_display, deadlineTs);

      await supabase.from('game_candidates').update({
        research_triggered_actual_at: new Date().toISOString(),
        last_odds_snapshot_at: new Date().toISOString(),
        fresh_moneyline: freshOdds.moneyline,
        fresh_spread: freshOdds.spread,
        fresh_total: freshOdds.total,
      }).eq('id', candidate.id);

      if (result.verdict === 'publish') {
        // Gate immediately — no more separate poll-later phase for new
        // candidates. Real deadline re-check happens again in finalize-picks
        // regardless, same as before.
        await gateAndFinalizeResearch(candidate, result.pick, knownGamesToday);
        console.log(`Synchronous research complete for "${candidate.game}" — published (turns=${result.diagnostics.turns}, searches=${result.diagnostics.searchesTotal}).`);
      } else {
        await recordRefusal(candidate, today, result);
        await supabase.from('game_candidates').update({
          research_status: 'researched',
          status: 'rejected_no_edge',
          notes: `Research loop refused: ${result.diagnostics.reason || 'unknown'} (turns=${result.diagnostics.turns}, searches=${result.diagnostics.searchesTotal}).`,
        }).eq('id', candidate.id);
        console.log(`Synchronous research refused for "${candidate.game}": ${result.diagnostics.reason} (turns=${result.diagnostics.turns}, searches=${result.diagnostics.searchesTotal}).`);
      }
    } catch (err) {
      const attempts = (candidate.research_attempts || 0) + 1;
      console.error(`Error researching candidate ${candidate.id} (${candidate.game}), attempt ${attempts}/${MAX_RESEARCH_ATTEMPTS}:`, err.message);

      if (attempts >= MAX_RESEARCH_ATTEMPTS) {
        console.log(`RESEARCH_ATTEMPTS_EXHAUSTED: "${candidate.game}" failed ${attempts} times — giving up for today rather than retrying until its deadline passes.`);
        await supabase.from('game_candidates').update({
          research_status: 'evaluated_no_edge',
          status: 'rejected_no_edge',
          research_attempts: attempts,
          notes: `Gave up after ${attempts} failed research attempts: ${err.message}`,
        }).eq('id', candidate.id);
      } else {
        await supabase.from('game_candidates').update({
          research_attempts: attempts,
        }).eq('id', candidate.id);
      }
    }
  }
}

// ── Poll phase: check in-flight batches for completion ──────────────────
async function pollSubmittedResearch(today) {
  const now = new Date();

  const { data: submitted, error } = await supabase
    .from('game_candidates')
    .select('*')
    .eq('research_status', 'research_submitted');

  if (error) throw error;
  if (!submitted || submitted.length === 0) {
    console.log('No in-flight research batches to poll this run.');
    return;
  }

  // For the entity-consistency check: game+sport pairs from every game in
  // today's candidate pool, so we can catch a stat/team bleeding in from
  // an unrelated game even though each Stage 2 call is isolated. Sport is
  // included so findEntityBleed() can scope its comparison to same-sport
  // games only.
  const { data: todaysCandidates } = await supabase
    .from('game_candidates')
    .select('game, sport')
    .eq('date', today);
  const knownGamesToday = (todaysCandidates || []).map(c => ({ game: c.game, sport: c.sport }));

  for (const candidate of submitted) {
    try {
      // If we've blown past the confirmation deadline, this can never be
      // confirmed and published in time regardless of research outcome.
      if (candidate.confirmation_deadline_at && new Date(candidate.confirmation_deadline_at) < now) {
        console.log(`EXPIRED: "${candidate.game}" batch still in flight past its own confirmation deadline — marking expired.`);
        // Fix (Aug 5): this branch previously only wrote `status`, never
        // `research_status`. Since the query that picks up work here
        // filters on research_status = 'research_submitted', a row that
        // expired without this field also being updated got silently
        // re-selected and re-"expired" on every single tick forever —
        // confirmed via 18 real rows still stuck from before the July 22
        // synchronous rewrite, all correctly showing status=
        // expired_unconfirmed but research_status still stuck at
        // research_submitted weeks later. Same class of bug as the July
        // 24 fix (commit 58e5414) for the main gating path — that fix
        // never covered this older, separate poll branch.
        await supabase.from('game_candidates').update({
          research_status: 'researched',
          status: 'expired_unconfirmed',
          notes: 'Research batch did not complete before this candidate\'s confirmation deadline.',
        }).eq('id', candidate.id);
        continue;
      }

      const statusRes = await fetch(`https://api.anthropic.com/v1/messages/batches/${candidate.anthropic_batch_id}`, {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      });
      const statusData = await statusRes.json();

      if (statusData.processing_status !== 'ended') {
        console.log(`Still processing: "${candidate.game}" (batch ${candidate.anthropic_batch_id})`);
        continue;
      }

      const resultsRes = await fetch(statusData.results_url, {
        headers: {
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01',
        },
      });
      const resultsText = await resultsRes.text();
      const resultLine = resultsText.trim().split('\n').find(line => {
        try { return JSON.parse(line).custom_id === candidate.id; } catch { return false; }
      });

      if (!resultLine) {
        throw new Error('No matching result line found in batch results');
      }
      const resultJson = JSON.parse(resultLine);

      if (resultJson.result?.type !== 'succeeded') {
        console.log(`Batch result not successful for "${candidate.game}": ${resultJson.result?.type}`);
        // Same fix as the deadline-expiration branch above — this must
        // also set research_status, or this row gets stuck re-fetching
        // the same already-failed batch result from Anthropic on every
        // tick forever.
        await supabase.from('game_candidates').update({
          research_status: 'researched',
          status: 'rejected_no_edge',
          notes: `Batch result type: ${resultJson.result?.type || 'unknown'}`,
        }).eq('id', candidate.id);
        continue;
      }

      const text = extractText(resultJson.result.message.content);
      const pick = cleanJson(text);

      // Gating now genuinely shared with the synchronous path — this used
      // to be a full duplicate copy of all three gates, which is exactly
      // how the entity-consistency bug ended up needing a fix in two
      // places instead of one. One shared function, one place to fix.
      await gateAndFinalizeResearch(candidate, pick, knownGamesToday);
    } catch (err) {
      console.error(`Error polling/gating candidate ${candidate.id} (${candidate.game}):`, err.message);
      // Leave as research_submitted so it gets retried next run, unless
      // the confirmation deadline check above has already expired it.
    }
  }
}

async function runResearchScheduler() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  await pollSubmittedResearch(today);
  await submitNewResearch(today);
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const cronSecret = request.headers.get('x-cron-secret');
  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}` && cronSecret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  waitUntil(runResearchScheduler().catch(err => console.error('runResearchScheduler error:', err)));
  return Response.json({ success: true, message: 'Research scheduler started' });
}

export async function POST(request) {
  return GET(request);
}
