// ── Code-owned multi-turn research loop (Step 4) ──────────────────────────
// Replaces the single-shot runStage2Research. Per candidate, runs an
// intercept -> evaluateEvidence -> maybe-loop-back cycle: call the model with
// web_search, count searches, parse the JSON pick, check via evaluateEvidence()
// whether every required slot is actually SATISFIED (not just mentioned), and
// if gaps remain, continue the SAME conversation (multi-turn, verbatim
// assistant-turn passback — proven viable on claude-sonnet-4-6) naming only the
// unresolved slots. Bounded by a search floor/ceiling, a turn ceiling, and a
// hybrid wall-clock guard so it never risks the 300s function timeout. Prompt
// caching is applied to the (large, static) system prompt and the growing
// conversation prefix, so the multi-turn replay is read from cache at ~10% cost.
//
// Returns a verdict object and performs NO database writes — the caller
// (research-scheduler) decides publish (-> gateAndFinalizeResearch) vs refuse
// (-> candidate_refusals). Keeping DB effects out of the loop is what makes it
// unit-testable in isolation.

import {
  getRequiredSlotKeys,
  getTurn1PriorityKeys,
  buildRequirementInstructions,
  evaluateEvidence,
  REQUIREMENT_META,
} from './researchRequirements';

const MODEL = 'claude-sonnet-4-6';
const MAX_OUTPUT_TOKENS = 16000;

// Locked Aug 20 (three-way review + Miles). Tune from September telemetry.
export const MAX_TURNS = 3;
export const MIN_SEARCH_FLOOR = 5;   // anti-premature-stop backstop
export const MAX_SEARCHES = 15;      // total across all turns; bounds cost
const PER_TURN_CEILING_MS = 120000;  // hybrid timeout: per-turn cap (raised from 90s Aug 24 — secondary safety margin; the primary fix is the turn-1 scoping above)
const MIN_USEFUL_TURN_MS = 20000;    // don't start a turn we can't safely finish
const MIN_SEARCHES_PER_GAME = 10;    // legacy fallback prompt floor (unmapped markets)

// ── JSON helpers (moved from research-scheduler; also used there via import) ──
export function extractText(content) {
  return (content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

export function cleanJson(text) {
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

// ── Stage 2 system prompt for ONE isolated game (moved verbatim) ────────────
function buildStage2SystemPrompt(candidate, today_display) {
  const sportKey = candidate.sport;
  const betType = candidate.bet_type;
  const requiredSlots = getRequiredSlotKeys(sportKey, betType);

  // Turn-1 scoping (Aug 24): the initial call only asks for the turn-1
  // priority subset, not every required item. Root cause it fixes: staging
  // tests (2/2, MLB moneyline) showed the initial call timing out at 90s
  // with ZERO searches completed when asked to establish all 8 baseline
  // items in one non-streaming call — the ask was too big for one turn.
  // Anything not covered here is picked up by buildContinuationPrompt in
  // turn 2+, which already requests exactly the unresolved slots — the
  // completion/critical gate (getRequiredSlotKeys, evaluateEvidence) is
  // unchanged and still checks against the FULL required set regardless of
  // what turn 1 was scoped to. Falls back to the full set if a sport/market
  // has no turn1-flagged keys configured yet (old behavior preserved).
  const turn1KeysRaw = getTurn1PriorityKeys(sportKey, betType);
  const turn1Keys = turn1KeysRaw.length > 0 ? turn1KeysRaw : requiredSlots;
  const turn1Block = buildRequirementInstructions(sportKey, betType, turn1Keys);
  const deferredCount = requiredSlots.length - turn1Keys.length;

  const researchDirective = turn1Block && turn1Block.trim().length > 0
    ? `RESEARCH REQUIREMENTS — FIRST PASS. Establish each of the following for this ${betType} bet now. For each, search until you can report it as supported, unavailable, or conflicting — do not skip any of the items below. Items marked [REQUIRED — will be verified against official data] are cross-checked against official sources after you respond; do not claim confirmation you did not find.

${turn1Block}
${deferredCount > 0 ? `\nThis is a first pass, not the complete requirement set for this bet — ${deferredCount} additional item${deferredCount === 1 ? '' : 's'} exist and will be requested in a follow-up turn if still needed after you report back. Do not try to cover them now; focus your searches on the items listed above and report them thoroughly.\n` : ''}
After researching, report an "evidence" entry for each item listed above. This is how your research depth is measured for this turn — by real coverage of these items, not by search count alone.`
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
3a. If two sources disagree on who's confirmed, do NOT pick a side by assuming one source made an error — check which is actually more current. The team's own official site (e.g. MLB.com/NHL.com/NFL.com probable-pitchers or injury pages) and the most recently-published result outrank an older preview, prediction, or "series preview" article written before the day of the game — a preview published days before a series does not override that day's official page. If you cannot tell which is correct after checking, report the requirement as "conflicting", not "supported" — a genuine disagreement between sources is real information to report, not a problem to explain away.
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

const RETRY_JSON_PROMPT = `Your previous response was not valid JSON. Return ONLY the JSON object with the research findings you have already gathered, in the required schema. Do NOT invent, guess, or fill in any value you did not actually establish — if something is unknown, mark it "unavailable" with a reason. Return only the JSON, no other text.`;

function buildFloorVerifyPrompt(searchesSoFar) {
  return `You reported all requirements as resolved, but only ${searchesSoFar} web search(es) were performed — too few to have independently verified this pick. Run additional web searches now to independently confirm the highest-impact requirements (starting pitching, recent form, bullpen, line/price), then return the COMPLETE updated JSON in the same schema. Do not fabricate sources.`;
}

function buildContinuationPrompt(unresolvedSlots) {
  const lines = unresolvedSlots.map(k => {
    const meta = REQUIREMENT_META[k];
    return `- ${k}${meta && meta.label ? ` (${meta.label})` : ''}`;
  }).join('\n');
  return `Your research so far has NOT yet satisfied every required item. Preserve everything you already resolved — do NOT re-research or change resolved findings unless new evidence directly conflicts with them. Using additional web searches, research ONLY the still-unresolved requirements below, then return the COMPLETE updated JSON (every requirement, in the same schema as before):

${lines}

For each, report a real finding with at least one source, or mark it "unavailable" with a clear reason only if it is genuinely not knowable after searching. Do not fabricate sources.`;
}

// Rolling prompt-cache breakpoint: cache the entire conversation prefix up to
// (and including) the last block of the last message. At call time the last
// message is always the current user turn, so this caches the prior assistant
// turns (with their bulky web_search results) — read back at ~10% cost next
// turn. Only one message-level breakpoint is ever set (plus the system one),
// staying well under the 4-breakpoint limit.
function applyRollingCacheBreakpoint(messages) {
  for (const m of messages) {
    if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b && typeof b === 'object' && b.cache_control) delete b.cache_control;
      }
    }
  }
  const last = messages[messages.length - 1];
  if (last && Array.isArray(last.content) && last.content.length) {
    const block = last.content[last.content.length - 1];
    if (block && typeof block === 'object') block.cache_control = { type: 'ephemeral' };
  }
}

// Bounded, single API call. Returns parsed data, or an {type:'error'} object on
// timeout/transient failure (one retry on transient errors). Injectable fetch
// for tests via the optional _fetch arg; defaults to global fetch in prod.
export async function callClaudeSync(body, retryCount = 0, timeoutMs = PER_TURN_CEILING_MS, _fetch) {
  const doFetch = _fetch || fetch;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  try {
    response = await doFetch('https://api.anthropic.com/v1/messages', {
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
    if (fetchErr && fetchErr.name === 'AbortError') {
      console.log(`ANTHROPIC_API_TIMEOUT (research-loop): call exceeded ${timeoutMs}ms`);
      return { type: 'error', error: { type: 'timeout_error', message: `Call exceeded ${timeoutMs}ms` } };
    }
    throw fetchErr;
  }
  clearTimeout(timeoutId);

  const data = await response.json();

  if (data && data.type === 'error') {
    const errType = (data.error && data.error.type) || 'unknown';
    const errMsg = (data.error && data.error.message) || 'no message';
    console.log(`ANTHROPIC_API_ERROR (research-loop): http_status=${response.status} error_type=${errType} message="${errMsg}" retry_count=${retryCount}`);
    const transientTypes = ['overloaded_error', 'rate_limit_error', 'api_error'];
    if (transientTypes.includes(errType) && retryCount < 1) {
      console.log('Retrying once after transient API error, waiting 3s...');
      await new Promise(r => setTimeout(r, 3000));
      return callClaudeSync(body, retryCount + 1, timeoutMs, _fetch);
    }
  }

  return data;
}

// ── The loop ────────────────────────────────────────────────────────────
// deadlineTs: absolute epoch-ms the loop must not run past (caller computes it
// from the function start with a safety margin already subtracted).
// _fetch: injectable for tests.
export async function runStage2ResearchLoop(candidate, today_display, deadlineTs, _fetch) {
  const sport = candidate.sport;
  const betType = candidate.bet_type;
  const systemText = buildStage2SystemPrompt(candidate, today_display);
  const system = [{ type: 'text', text: systemText, cache_control: { type: 'ephemeral' } }];

  const messages = [{
    role: 'user',
    content: [{ type: 'text', text: `Research ${candidate.game} (${candidate.sport}) now and return the JSON pick.` }],
  }];

  let turn = 0;
  let searchesTotal = 0;
  let lastValidPick = null;
  let lastEval = null;
  const turnLog = [];

  const decide = (verdict, reason) => ({
    verdict,
    pick: lastValidPick,
    evaluation: lastEval,
    diagnostics: { turns: turn, searchesTotal, turnLog, reason: reason || null },
  });

  while (turn < MAX_TURNS) {
    const remainingMs = deadlineTs - Date.now();
    if (remainingMs < MIN_USEFUL_TURN_MS) break; // hybrid guard: no time for a useful turn
    const turnTimeoutMs = Math.min(PER_TURN_CEILING_MS, remainingMs);

    turn++;
    applyRollingCacheBreakpoint(messages);

    const remainingSearchBudget = Math.max(1, MAX_SEARCHES - searchesTotal);
    const body = {
      model: MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system,
      messages,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: remainingSearchBudget }],
    };

    const resp = await callClaudeSync(body, 0, turnTimeoutMs, _fetch);

    if (!resp || resp.type === 'error') {
      turnLog.push({ turn, error: (resp && resp.error && resp.error.type) || 'unknown', searches: 0 });
      break; // fall through to completion policy with whatever we have
    }

    const content = Array.isArray(resp.content) ? resp.content : [];
    const turnSearches = content.filter(b => b && b.type === 'server_tool_use').length;
    searchesTotal += turnSearches;

    messages.push({ role: 'assistant', content }); // verbatim passback

    let parseOk = false;
    try {
      const pick = cleanJson(extractText(content));
      lastValidPick = pick;
      lastEval = evaluateEvidence(sport, betType, pick);
      parseOk = true;
    } catch (e) {
      parseOk = false;
    }

    turnLog.push({
      turn,
      searches: turnSearches,
      searchesTotal,
      parseOk,
      input_tokens: (resp.usage && resp.usage.input_tokens) || null,
      output_tokens: (resp.usage && resp.usage.output_tokens) || null,
      cache_read_input_tokens: (resp.usage && resp.usage.cache_read_input_tokens) || null,
      unresolved: parseOk ? lastEval.unresolved : null,
      criticalUnresolved: parseOk ? lastEval.criticalUnresolved : null,
    });

    const timeLeft = () => (deadlineTs - Date.now()) >= MIN_USEFUL_TURN_MS;

    if (!parseOk) {
      if (turn < MAX_TURNS && timeLeft()) {
        messages.push({ role: 'user', content: [{ type: 'text', text: RETRY_JSON_PROMPT }] });
        continue;
      }
      break;
    }

    if (lastEval.isComplete) {
      if (searchesTotal >= MIN_SEARCH_FLOOR) return decide('publish');
      if (turn < MAX_TURNS && timeLeft() && searchesTotal < MAX_SEARCHES) {
        messages.push({ role: 'user', content: [{ type: 'text', text: buildFloorVerifyPrompt(searchesTotal) }] });
        continue;
      }
      return decide('refuse', 'below_search_floor');
    }

    // Not complete — loop back on the unresolved slots if we can still research.
    if (searchesTotal < MAX_SEARCHES && turn < MAX_TURNS && timeLeft()) {
      messages.push({ role: 'user', content: [{ type: 'text', text: buildContinuationPrompt(lastEval.unresolved) }] });
      continue;
    }
    break; // exhausted searches / turns / time
  }

  // ── Completion policy at ceiling / break ──
  if (!lastValidPick || !lastEval) return decide('refuse', 'no_valid_research');
  if (searchesTotal < MIN_SEARCH_FLOOR) return decide('refuse', 'below_search_floor');
  if (lastEval.publishable) return decide('publish');
  return decide('refuse', 'critical_slots_unresolved');
}
