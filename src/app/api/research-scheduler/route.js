import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';
import { buildRequirementInstructions, getRequiredSlotKeys } from '../../../lib/researchRequirements';

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

// Single-game isolated research still needs real depth — this mirrors
// the spirit of the old "15 searches minimum across the whole pool" rule,
// scaled down since this call now covers exactly one game, not 8-10.
const MIN_SEARCHES_PER_GAME = 10;

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

// ── Stage 2 system prompt for ONE isolated game ─────────────────────────
// Now driven by the per-bet-type requirement config (researchRequirements.js)
// instead of a single generic research instruction. The requirement set is
// selected from candidate.bet_type (classified by Layer 1) and composed into
// the RESEARCH REQUIREMENTS block. The model returns an `evidence` array —
// one entry per required slot — which the code-owned stopping loop (added in
// the next step) verifies before a pick is allowed to finalize. In this step
// the prompt ASKS for the evidence; enforcement lands separately.
function buildStage2SystemPrompt(candidate, today_display) {
  const sportKey = candidate.sport;
  const betType = candidate.bet_type;
  const requirementBlock = buildRequirementInstructions(sportKey, betType);
  const requiredSlots = getRequiredSlotKeys(sportKey, betType);

  // Defensive: if there are no composed requirements (a sport/market not in
  // the config), fall back to the prior generic instruction so the prompt is
  // never empty. In normal MLB operation this branch is never taken —
  // isMarketFullyMapped gates unmapped markets upstream — but the prompt must
  // still be well-formed if it is ever reached.
  const researchDirective = requirementBlock && requirementBlock.trim().length > 0
    ? `RESEARCH REQUIREMENTS — you MUST establish each of the following for this ${betType} bet. For each, search until you can report it as supported, unavailable, or conflicting — do not skip any. Items marked [REQUIRED — will be verified against official data] are cross-checked against official sources after you respond; do not claim confirmation you did not find.

${requirementBlock}

After researching, report an "evidence" entry for each numbered requirement above (except any marked supplementary), stating what you found. This is how your research depth is measured — by coverage of these requirements, not by search count alone.`
    : `Perform at least ${MIN_SEARCHES_PER_GAME} distinct web searches before finalizing your analysis. Cover: confirmed participants/starters, recent form, injury reports, matchup history, and any line movement or sharp money signals you can find.`;

  const evidenceSlotList = requiredSlots.map(k => `"${k}"`).join(', ');
  const evidenceSchema = requiredSlots.length > 0
    ? `,
  "evidence": [
    // One object per required requirement key. Required keys for this bet: ${evidenceSlotList}
    {
      "requirement": "one of the required keys above",
      "status": "supported" | "unavailable" | "conflicting",
      "finding": "one specific sentence on what you found (with the actual number/fact), or why it was unavailable",
      "direction": "supports_pick" | "against_pick" | "neutral",
      "importance": "high" | "medium" | "low",
      "sources": ["short description or URL of the search result(s) backing this finding"]
    }
  ]`
    : '';

  return `You are Hunter, an elite sports betting analyst. Today is ${today_display}.

This is STAGE 2 — deep research on exactly ONE game. You have already identified this candidate as worth researching:
Game: ${candidate.game}
Sport: ${candidate.sport}
Proposed angle: ${candidate.proposed_pick} (${candidate.stage1_reason})

You are researching THIS GAME ONLY. Do not discuss or reference any other game, any other sport, or any other matchup anywhere in your search queries, your reasoning, or your written insight. This isolation is deliberate — mixing in other games' context is exactly the failure mode we are protecting against.

CRITICAL DATA INTEGRITY RULES:
1. Every stat, injury note, or lineup detail you cite must be about a team or player who is actually IN this specific game (${candidate.game}). Never let a stat about an unrelated team bleed into this analysis.
2. Never invent a game, player, or stat. If you cannot verify something, say so or omit it.
3. For starting pitchers/lineups/goalies: only state a name as confirmed if you found it in a live search result from today. If not confirmed, say so plainly — do not guess or use memory.
4. Never recommend ANY pick — moneyline, run line/spread, or total — at odds of -200 or worse. This applies equally across every bet type: a poor risk/reward price is a poor risk/reward price regardless of which market it's on. Take the alternate line/side or pass entirely.
5. Your insight must directly support your pick — no contradictions between your analysis and your conclusion.

${researchDirective}

WRITING STANDARDS FOR THE INSIGHT FIELD (Aug 5 — matches the established style, do not deviate):
- Structure the insight as 2-3 distinct thematic sections. Each section gets its own short, punchy, declarative header wrapped in <h3></h3> tags (e.g. "The Pitching Mismatch Is Historic-Level"), followed by its supporting paragraph wrapped in <p></p> tags. This is the required format, not a stylistic suggestion.
- Build the case FOR this pick with full confidence. Do not include hedging language, risk disclaimers, or explicit acknowledgment of the counter-case anywhere in the written insight — no "however," "a red flag," "risk of regression," or similar phrasing that undermines your own pick. A customer reading this should come away convinced, not talked into caution.

SELF-VALIDATION (a private check before finalizing — this informs your decision, it is never something you write about):
- Would a sharp bettor agree this edge is real, or does it collapse under scrutiny?
- Does every fact in your insight actually belong to ${candidate.game} specifically?
- Is your pick's direction (favorite/underdog, over/under, spread sign) internally consistent with your own reasoning?
- If the genuine case against this pick is strong enough to concern you, that is a signal to score it honestly lower (the score field exists for exactly this) or reconsider the specific angle/bet type — never a reason to write a hedged, less-confident insight. A published pick should read as real conviction, not a weighed-down compromise.

ELIGIBILITY (report honestly — do not inflate to force a pick through):
Report your confidence in whether the necessary participants for this specific bet (starting pitcher, starting lineup, goalie, etc., as applicable to ${candidate.sport}) are genuinely confirmed as of your searches, not assumed. Use plain, specific language for confirmed_names (e.g. "Zack Wheeler confirmed starting for PHI per today's MLB.com page") — never vague placeholders like "TBD" or "likely starter" reported as if confirmed.

Return ONLY this JSON, no other text:
{
  "game": "${candidate.game}",
  "sport": "${candidate.sport}",
  "pick": "specific pick with line/odds",
  "odds": "e.g. -110",
  "units": 0.5 or 1 or 2,
  "confidence": "Low" or "Medium" or "High",
  "insight": "200+ word HTML-formatted writeup, structured per WRITING STANDARDS above (2-3 <h3> headers each with a supporting <p>)",
  "eligibility": {
    "mandatory_participant_confirmed": true or false,
    "confirmed_names": ["specific confirmed names with source, or empty array if none"],
    "lineup_confirmed": true or false,
    "data_confidence": "Low" or "Medium" or "High"
  },
  "score": 0-10 (your honest assessment of how strong this specific edge is)${evidenceSchema}
}`;
}
const PER_CANDIDATE_TIMEOUT_MS = 120000; // hard cap per candidate's research call

async function callClaudeSync(body, retryCount = 0, timeoutMs = PER_CANDIDATE_TIMEOUT_MS) {
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
      console.log(`ANTHROPIC_API_TIMEOUT (research-scheduler): call exceeded ${timeoutMs}ms`);
      return { type: 'error', error: { type: 'timeout_error', message: `Call exceeded ${timeoutMs}ms` } };
    }
    throw fetchErr;
  }
  clearTimeout(timeoutId);

  const data = await response.json();

  if (data.type === 'error') {
    const errType = data.error?.type || 'unknown';
    const errMsg = data.error?.message || 'no message';
    console.log(`ANTHROPIC_API_ERROR (research-scheduler): http_status=${response.status} error_type=${errType} message="${errMsg}" retry_count=${retryCount}`);
    const transientTypes = ['overloaded_error', 'rate_limit_error', 'api_error'];
    if (transientTypes.includes(errType) && retryCount < 1) {
      console.log('Retrying once after transient API error, waiting 3s...');
      await new Promise(r => setTimeout(r, 3000));
      return callClaudeSync(body, retryCount + 1, timeoutMs);
    }
  }

  return data;
}

// SYNCHRONOUS Stage 2 research on ONE candidate — replaces the old
// submit-to-Batches-API-and-poll-later pattern. Calling /v1/messages
// directly means this either finishes within its own bounded timeout or
// it doesn't — no dependency on Anthropic's batch queue, which has no
// completion-time guarantee and was the actual cause of 4 of 10
// candidates missing their confirmation deadline on July 22 (production
// independently hit the same batch-queue slowness that same day).
async function runStage2Research(candidate, today_display) {
  const system = buildStage2SystemPrompt(candidate, today_display);
  const response = await callClaudeSync({
    model: 'claude-sonnet-4-6',
    max_tokens: 16000,
    system,
    messages: [{
      role: 'user',
      content: `Research ${candidate.game} (${candidate.sport}) now and return the JSON pick.`
    }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  }, 0, PER_CANDIDATE_TIMEOUT_MS);

  const text = extractText(response.content);
  if (!text.trim()) throw new Error('Stage 2 research returned no text');
  return cleanJson(text);
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
async function submitNewResearch(today) {
  const now = new Date().toISOString();

  const { data: candidates, error } = await supabase
    .from('game_candidates')
    .select('*')
    .eq('date', today)
    .eq('research_status', 'pending_research')
    .lte('research_trigger_at', now)
    .order('research_trigger_at', { ascending: true })
    .limit(CONCURRENCY_CAP);

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

      // Fresh odds check passed — run REAL research right now, synchronously.
      // Bounded by PER_CANDIDATE_TIMEOUT_MS inside callClaudeSync — this
      // either finishes within that window or fails now, with no
      // dependency on a batch queue with no completion-time guarantee.
      const pick = await runStage2Research(candidate, today_display);

      await supabase.from('game_candidates').update({
        research_triggered_actual_at: new Date().toISOString(),
        last_odds_snapshot_at: new Date().toISOString(),
        fresh_moneyline: freshOdds.moneyline,
        fresh_spread: freshOdds.spread,
        fresh_total: freshOdds.total,
      }).eq('id', candidate.id);

      // Gate immediately — no more separate poll-later phase for new
      // candidates. Real deadline re-check happens again in finalize-picks
      // regardless, same as before.
      await gateAndFinalizeResearch(candidate, pick, knownGamesToday);

      console.log(`Synchronous research complete for "${candidate.game}".`);
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
