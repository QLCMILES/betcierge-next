import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';

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

// Pre-flight freshness thresholds \u2014 mirrors the same "material move"
// definition used elsewhere in this codebase for the publish-time check.
// This is a coarse filter: catch a candidate that's gone genuinely stale
// (huge line move, likely real news) before spending a Stage 2 call on
// it \u2014 not nitpick normal drift.
const MONEYLINE_REJECT_CENTS = 50;
const POINT_REJECT = 3.0;

// Single-game isolated research still needs real depth \u2014 this mirrors
// the spirit of the old "15 searches minimum across the whole pool" rule,
// scaled down since this call now covers exactly one game, not 8-10.
const MIN_SEARCHES_PER_GAME = 10;

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
      return { stale: true, reason: `Moneyline moved ${diff} cents on ${team} (${origML[team]} \u2192 ${freshML[team]})` };
    }
  }
  const origPts = parsePointsString(originalSpread);
  const freshPts = parsePointsString(freshSpread);
  for (const team of Object.keys(origPts)) {
    if (freshPts[team] === undefined) continue;
    const diff = Math.abs(freshPts[team] - origPts[team]);
    if (diff >= POINT_REJECT) {
      return { stale: true, reason: `Spread moved ${diff} points on ${team} (${origPts[team]} \u2192 ${freshPts[team]})` };
    }
  }
  return { stale: false, reason: null };
}

// ── Stage 2 system prompt for ONE isolated game ─────────────────────────
function buildStage2SystemPrompt(candidate, today_display) {
  return `You are Hunter, an elite sports betting analyst. Today is ${today_display}.

This is STAGE 2 \u2014 deep research on exactly ONE game. You have already identified this candidate as worth researching:
Game: ${candidate.game}
Sport: ${candidate.sport}
Proposed angle: ${candidate.proposed_pick} (${candidate.reason})

You are researching THIS GAME ONLY. Do not discuss or reference any other game, any other sport, or any other matchup anywhere in your search queries, your reasoning, or your written insight. This isolation is deliberate \u2014 mixing in other games' context is exactly the failure mode we are protecting against.

CRITICAL DATA INTEGRITY RULES:
1. Every stat, injury note, or lineup detail you cite must be about a team or player who is actually IN this specific game (${candidate.game}). Never let a stat about an unrelated team bleed into this analysis.
2. Never invent a game, player, or stat. If you cannot verify something, say so or omit it.
3. For starting pitchers/lineups/goalies: only state a name as confirmed if you found it in a live search result from today. If not confirmed, say so plainly \u2014 do not guess or use memory.
4. Perform at least ${MIN_SEARCHES_PER_GAME} distinct web searches before finalizing your analysis. Cover: confirmed participants/starters, recent form, injury reports, matchup history, and any line movement or sharp money signals you can find.
5. Never recommend ANY pick — moneyline, run line/spread, or total — at odds of -200 or worse. This applies equally across every bet type: a poor risk/reward price is a poor risk/reward price regardless of which market it's on. Take the alternate line/side or pass entirely.
6. Your insight must directly support your pick \u2014 no contradictions between your analysis and your conclusion.

SELF-VALIDATION (do this before finalizing):
- Would a sharp bettor agree this edge is real, or does it collapse under scrutiny?
- Does every fact in your insight actually belong to ${candidate.game} specifically?
- Is your pick's direction (favorite/underdog, over/under, spread sign) internally consistent with your own reasoning?
- Weigh the genuine case against your own pick, not just for it \u2014 but do not add a separate visible "Steelman" or "Risk" section calling this out; fold that scrutiny into how you write the insight itself.

ELIGIBILITY (report honestly \u2014 do not inflate to force a pick through):
Report your confidence in whether the necessary participants for this specific bet (starting pitcher, starting lineup, goalie, etc., as applicable to ${candidate.sport}) are genuinely confirmed as of your searches, not assumed. Use plain, specific language for confirmed_names (e.g. "Zack Wheeler confirmed starting for PHI per today's MLB.com page") \u2014 never vague placeholders like "TBD" or "likely starter" reported as if confirmed.

Return ONLY this JSON, no other text:
{
  "game": "${candidate.game}",
  "sport": "${candidate.sport}",
  "pick": "specific pick with line/odds",
  "odds": "e.g. -110",
  "units": 0.5 or 1 or 2,
  "confidence": "Low" or "Medium" or "High",
  "insight": "200+ word HTML-formatted writeup supporting this specific pick",
  "eligibility": {
    "mandatory_participant_confirmed": true or false,
    "confirmed_names": ["specific confirmed names with source, or empty array if none"],
    "lineup_confirmed": true or false,
    "data_confidence": "Low" or "Medium" or "High"
  },
  "score": 0-10 (your honest assessment of how strong this specific edge is)
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
      status: 'rejected_no_edge',
      notes: `Game verification failed: model returned "${pick.game}" instead of "${candidate.game}".`,
    }).eq('id', candidate.id);
    return;
  }

  // ── Gate 2: eligibility ───────────────────────────────────────
  const elig = pick.eligibility || {};
  const vaguePattern = /\b(TBD|tbd|likely starter|probable|unconfirmed|not yet announced)\b/i;
  const stripKnownSafePhrases = (text) => (text || '').replace(/MLB\.com probable pitchers? page/gi, '');
  const namesLookVague = (elig.confirmed_names || []).some(n => vaguePattern.test(stripKnownSafePhrases(n)));
  if (elig.mandatory_participant_confirmed !== true || namesLookVague || !elig.confirmed_names || elig.confirmed_names.length === 0) {
    console.log(`ELIGIBILITY_FAILED: "${candidate.game}" — mandatory_participant_confirmed=${elig.mandatory_participant_confirmed}, names=${JSON.stringify(elig.confirmed_names)}`);
    await supabase.from('game_candidates').update({
      status: 'rejected_no_edge',
      notes: 'Eligibility gate failed: participant confirmation not genuinely established.',
      eligibility: elig,
    }).eq('id', candidate.id);
    return;
  }

  // ── Gate 3: entity-consistency ───────────────────────────────────
  const otherGames = knownGamesToday.filter(g => g !== candidate.game);
  const otherTeamNames = otherGames.flatMap(g => g.split(' @ ').map(t => t.trim())).filter(Boolean);
  const insightLower = (pick.insight || '').toLowerCase();
  const bledInTeam = otherTeamNames.find(team => {
    const lastWord = team.split(' ').pop();
    return lastWord && lastWord.length > 3 && insightLower.includes(lastWord.toLowerCase());
  });
  if (bledInTeam) {
    console.log(`ENTITY_BLEED: "${candidate.game}" insight appears to reference "${bledInTeam}" from a different game — rejecting.`);
    await supabase.from('game_candidates').update({
      status: 'rejected_no_edge',
      notes: `Entity-consistency check failed: insight referenced "${bledInTeam}" from an unrelated game.`,
    }).eq('id', candidate.id);
    return;
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
    research_log: pick,
  }).eq('id', candidate.id);

  console.log(`Research complete and gated successfully: "${candidate.game}" (score: ${pick.score})`);
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

  // For the entity-consistency gate: real team names from every game in
  // today's candidate pool, needed here now since gating happens
  // immediately in this same pass rather than in a later poll phase.
  const { data: todaysCandidates } = await supabase
    .from('game_candidates')
    .select('game')
    .eq('date', today);
  const knownGamesToday = (todaysCandidates || []).map(c => c.game);

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
      console.error(`Error researching candidate ${candidate.id} (${candidate.game}):`, err.message);
      // Leave as pending_research so it can be retried next run, unless
      // the confirmation deadline check above has already expired it.
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

  // For the entity-consistency check: real team names from every game in
  // today's candidate pool, so we can catch a stat/team bleeding in from
  // an unrelated game even though each Stage 2 call is isolated.
  const { data: todaysCandidates } = await supabase
    .from('game_candidates')
    .select('game')
    .eq('date', today);
  const knownGamesToday = (todaysCandidates || []).map(c => c.game);

  for (const candidate of submitted) {
    try {
      // If we've blown past the confirmation deadline, this can never be
      // confirmed and published in time regardless of research outcome.
      if (candidate.confirmation_deadline_at && new Date(candidate.confirmation_deadline_at) < now) {
        console.log(`EXPIRED: "${candidate.game}" batch still in flight past its own confirmation deadline \u2014 marking expired.`);
        await supabase.from('game_candidates').update({
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
        await supabase.from('game_candidates').update({
          status: 'rejected_no_edge',
          notes: `Batch result type: ${resultJson.result?.type || 'unknown'}`,
        }).eq('id', candidate.id);
        continue;
      }

      const text = extractText(resultJson.result.message.content);
      const pick = cleanJson(text);

      // ── Gate 1: game-verification ──────────────────────────────────
      if (pick.game !== candidate.game) {
        console.log(`GAME_MISMATCH: expected "${candidate.game}", got "${pick.game}" \u2014 rejecting.`);
        await supabase.from('game_candidates').update({
          status: 'rejected_no_edge',
          notes: `Game verification failed: model returned "${pick.game}" instead of "${candidate.game}".`,
        }).eq('id', candidate.id);
        continue;
      }

      // ── Gate 2: eligibility ───────────────────────────────────────
      const elig = pick.eligibility || {};
      const vaguePattern = /\b(TBD|tbd|likely starter|probable|unconfirmed|not yet announced)\b/i;
      // "MLB.com probable pitchers page" is the literal, official name of
      // MLB's own pitcher-confirmation source (same terminology as the
      // hydrate=probablePitcher API parameter used elsewhere in this
      // codebase) — citing it is a legitimate confirmation, not uncertainty.
      // Strip that known-safe phrase before checking for actual vague
      // language, so citing the correct source doesn't get punished.
      const stripKnownSafePhrases = (text) => (text || '').replace(/MLB\.com probable pitchers? page/gi, '');
      const namesLookVague = (elig.confirmed_names || []).some(n => vaguePattern.test(stripKnownSafePhrases(n)));
      if (elig.mandatory_participant_confirmed !== true || namesLookVague || !elig.confirmed_names || elig.confirmed_names.length === 0) {
        console.log(`ELIGIBILITY_FAILED: "${candidate.game}" \u2014 mandatory_participant_confirmed=${elig.mandatory_participant_confirmed}, names=${JSON.stringify(elig.confirmed_names)}`);
        await supabase.from('game_candidates').update({
          status: 'rejected_no_edge',
          notes: 'Eligibility gate failed: participant confirmation not genuinely established.',
          eligibility: elig,
        }).eq('id', candidate.id);
        continue;
      }

      // ── Gate 3: entity-consistency ───────────────────────────────────
      const otherGames = knownGamesToday.filter(g => g !== candidate.game);
      const otherTeamNames = otherGames.flatMap(g => g.split(' @ ').map(t => t.trim())).filter(Boolean);
      const insightLower = (pick.insight || '').toLowerCase();
      const bledInTeam = otherTeamNames.find(team => {
        const lastWord = team.split(' ').pop();
        return lastWord && lastWord.length > 3 && insightLower.includes(lastWord.toLowerCase());
      });
      if (bledInTeam) {
        console.log(`ENTITY_BLEED: "${candidate.game}" insight appears to reference "${bledInTeam}" from a different game \u2014 rejecting.`);
        await supabase.from('game_candidates').update({
          status: 'rejected_no_edge',
          notes: `Entity-consistency check failed: insight referenced "${bledInTeam}" from an unrelated game.`,
        }).eq('id', candidate.id);
        continue;
      }

      // All gates passed \u2014 store the research, ready for final confirmation.
      await supabase.from('game_candidates').update({
        research_status: 'researched',
        status: 'awaiting_confirmation',
        score: pick.score ?? null,
        eligibility: elig,
        insight: pick.insight,
        odds: pick.odds,
        units: pick.units,
        research_log: pick,
      }).eq('id', candidate.id);

      console.log(`Research complete and gated successfully: "${candidate.game}" (score: ${pick.score})`);
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
