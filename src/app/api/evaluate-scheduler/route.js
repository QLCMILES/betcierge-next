import { createClient } from '@supabase/supabase-js';
import { waitUntil } from '@vercel/functions';

// This is the "evaluate" half of Stage 1, split out from morning-trigger
// specifically so slate size can never again risk one function invocation
// timing out. On July 24, a 36-game day hit real API slowness and
// exceeded morning-trigger's 300s ceiling mid-run, silently losing every
// game after the timeout. morning-trigger now only QUEUES games (fast, no
// LLM calls, seconds regardless of slate size); this endpoint picks up a
// small, bounded batch of not-yet-evaluated games each time it runs,
// processes ONLY that batch in parallel, then stops. Intended cron
// cadence: every 1-2 minutes, same rhythm as research-scheduler.
export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Bounds each tick's wall-clock time to roughly the SLOWEST single game
// in the batch (via Promise.all below), not the sum of all games — this
// is the property that actually survives slate-size growth.
const EVALUATE_CONCURRENCY_CAP = 5;

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
      console.log(`ANTHROPIC_API_TIMEOUT (evaluate-scheduler): call exceeded ${timeoutMs}ms`);
      return { type: 'error', error: { type: 'timeout_error', message: `Call exceeded ${timeoutMs}ms` } };
    }
    throw fetchErr;
  }
  clearTimeout(timeoutId);

  const data = await response.json();

  if (data.type === 'error') {
    const errType = data.error?.type || 'unknown';
    const errMsg = data.error?.message || 'no message';
    console.log(`ANTHROPIC_API_ERROR (evaluate-scheduler): http_status=${response.status} error_type=${errType} message="${errMsg}" retry_count=${retryCount}`);
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

// ── Recent Picks Memory ── same logic morning-trigger used to run once/day;
// recomputed each tick now since this runs every 1-2 min. Cheap query
// (7 days of daily_picks), negligible cost to repeat.
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

// ── Layer 1 per-sport screening criteria ─────────────────────────────
// Stage 1 can only forward the BEST candidates if it screens on the factors
// that actually decide a pick for that sport — a generic "is there an edge"
// pass selects on vibes. Each sport declares the handicapping factors the
// evaluator MUST genuinely assess before concluding, plus any sport-specific
// guardrails. The factors are mandatory INPUTS, not a scoring formula: the
// worth-pursuing bar stays holistic (a real, unpriced edge; passing is the
// default) — the factors only guarantee the judgment is made on the right
// inputs, never that N boxes must light up. Adding a new sport is a new block
// here, not a rewrite of researchGameFindings.
//
// Scoping: the map keys on sport_key (canonical Odds API identifier), so the
// entries below are baseball_mlb / americanfootball_nfl / americanfootball_ncaaf.
// MLB factors are Miles's (Aug 20/24); football factors were drafted and locked
// Aug 25 from Miles's knowledge + research into what sharp NFL/college
// handicappers weight. Core framing: MLB and college are more ABSOLUTE (stack up
// the talent / true strength); NFL is RELATIONAL (talent compresses among pros,
// so the edge is trench/scheme matchup — how the two teams interact — because
// lines are set on team-level data and miss unit-vs-unit mismatches). MLB
// pitching/offense weigh season and recent form EQUALLY (deliberate contrast
// with Stage 2's recency-primary deep dive). NFL five are REGULAR-SEASON tuned —
// preseason is a different screen (starters barely play, soft lines) and is not
// specifically handled here yet. Adding a sport is a new block keyed by its
// sport_key, NOT a rewrite of researchGameFindings.
const SPORT_SCREEN_CRITERIA = {
  baseball_mlb: `MLB SCREENING FACTORS — you MUST genuinely assess EACH of the following before concluding, using real searched data (not reputation or memory). These are the factors that actually decide a baseball pick; a verdict that skipped any of them is not a real evaluation:

1. STARTING PITCHERS — Confirm who is actually starting for both teams today (dated source). If today's starters aren't confirmed yet, note that; do not assume from the rotation.
2. PITCHING QUALITY — How good each starter actually is. Weigh season-long effectiveness (ERA, WHIP, the full-season body of work) and recent form (last 3 starts) EQUALLY — neither overrides the other. When the two disagree, that tension is itself information: note it rather than defaulting to one.
3. STARTING PITCHING EDGE — Weigh the two starters against each other: is there a genuine mismatch tonight, and how big? This is the single biggest driver of a baseball edge.
4. OFFENSIVE QUALITY — How good each team's offense is. Weigh season-long output (the full-year quality of the lineup) and the recent window (last 7-10 days, hot/cold right now) EQUALLY — neither overrides the other. When they disagree, note the tension rather than defaulting to one.
5. LINE MOVEMENT & PRICE — Where the line opened vs. now and where money is pointing. A real edge the market has ALREADY moved to price in is not an edge worth forwarding — the value has to still be on the board.

FOR TOTALS SPECIFICALLY: this system has a real, measured problem — totals proposed on pitching/bullpen narratives alone, without weighing both teams' actual offensive quality, have underperformed badly. If you land on a total here, you MUST have searched and weighed BOTH teams' real offensive quality (per factor 4 above), not just the pitching matchup.

Weigh these factors together holistically — do NOT require a fixed number of them to align. A single dominant factor (e.g. a genuine ace-vs-cold-lineup mismatch) can be a real edge on its own; several mild factors that all merely lean the same way often are not. The question is always: taken together, do these point to a real edge the market has not already priced?`,

  americanfootball_nfl: `NFL SCREENING FACTORS — you MUST genuinely assess EACH of the following before concluding, using real searched data (not reputation or memory). NFL is a RELATIONAL sport: because every player is a pro, raw talent compresses and the edge lives in MATCHUP and SCHEME — how these two specific teams interact, not their ratings in isolation. A verdict that only stacked up abstract team quality is not a real evaluation:

1. UNIT QUALITY (POWER RATINGS) — Rank both teams by unit (O-line, D-line, skill positions, secondary) and build your own read; records lie. This is the absolute-quality baseline BEFORE matchup adjusts it.
2. TRENCH & SCHEME MATCHUP — THE DISRUPTION SPINE. Whose line of scrimmage and scheme takes away what the opponent wants to do? Assess specifically: (a) O-line pass protection vs. the opposing pass rush — can they keep the QB clean, or does pressure arrive before plays develop; (b) run blocking vs. run defense — can they impose the run or get stuffed on early downs and short yardage; (c) coverage vs. receiver personnel — a top corner erasing a No. 1 receiver. THE BETTING EDGE: sportsbook lines are set on TEAM-level data, so a specific unit-vs-unit or scheme mismatch the team number does not capture is exactly where value lives. A lesser team that wins the trenches or takes away the opponent's identity can cover or win outright.
3. QB RELATIVE TO THE DEFENSE HE FACES — QB is the biggest single lever, but frame it relationally: THIS QB against THIS defense's ability to handle his type (mobile QB vs. a contain-weak front; timing passer vs. a fast pass rush; pocket passer vs. heavy pressure). Include QB and key O-line / pass-rush injuries — weight the LESS-OBVIOUS ones the market has not priced, since headline QB injuries are already baked into the line.
4. SITUATIONAL: REST, TRAVEL, SCHEDULE, MOTIVATION — short weeks / Thursday games, bye-week advantage, cross-country and time-zone travel, and letdown/lookahead trap spots. These are absolute, not relational — real regardless of matchup.
5. LINE VALUE & ENVIRONMENT — where the line opened vs. now, where sharp money points, and whether value is still on the board (CLV mindset); plus weather and expected game script/pace that amplify or neutralize the trench/scheme edge from factor 2.

Weigh these factors together holistically — do NOT require a fixed number of them to align. A single dominant factor (e.g. a decisive trench mismatch that takes away the opponent's whole identity) can be a real edge on its own; several mild factors that all merely lean the same way often are not. The question is always: taken together, do these point to a real edge the market has not already priced?`,

  americanfootball_ncaaf: `COLLEGE FOOTBALL SCREENING FACTORS — you MUST genuinely assess EACH of the following before concluding, using real searched data (not reputation or memory). Unlike the NFL, college talent gaps are ENORMOUS and often unbridgeable, so the college edge is more about the REALITY of the talent gap and true team strength than about scheme disruption. A verdict that skipped any of these is not a real evaluation:

1. TRUE TEAM STRENGTH vs. RECORD (POWER RATINGS + SCHEDULE CONTEXT) — Who is actually better, adjusted for wildly unbalanced schedules? Records lie hard in college: a 7-2 team can be worse than a 5-4 team depending on who they have actually played. You cannot screen a college game without accounting for schedule strength. This is the spine.
2. TALENT-GAP REALITY & THE TRENCHES — the "is the underdog LIVE or DEAD" filter. How wide is the real athletic gap, especially at the line of scrimmage? Some big spreads are big because the gap is genuinely UNBRIDGEABLE (e.g. an FCS or bottom-tier team vs. a blue-blood — no scheme or motivation overcomes that athletic mismatch = a dead dog, do not back it). Others are big because the market is OVERRATING a name-brand favorite (= a live dog with real cover/upset value). Distinguishing the two is the core college edge.
3. QB PLAY — arguably the single biggest factor in college. Assess the starter's quality and type (mobile vs. pocket), experience and volatility (freshman/transfer uncertainty), and how the opposing defense handles that specific QB type.
4. SITUATIONAL & MOTIVATIONAL SPOTS — active/motivated underdogs (revenge, coming off a blowout loss, a Group-of-Five team with a signature-win shot against a Power program), trap favorites looking ahead to a bigger game, rivalry intensity, and hostile-environment/travel — which matters MORE in college than any other sport, especially for young teams that do not travel well.
5. LINE VALUE & PACE — where the line opened vs. now and whether value is still on the board (CLV mindset); and pace as a totals INPUT (methodical ~60-play offenses vs. up-tempo 90+-play offenses create real totals volatility) WHEN a total is the natural bet — but do NOT go hunting for totals and do NOT apply any built-in lean toward overs; evaluate a total only on its own merits if the game genuinely points there.

Weigh these factors together holistically — do NOT require a fixed number of them to align. A single dominant factor (e.g. a genuinely unbridgeable talent/trench gap, or a clearly overrated name-brand favorite) can be a real edge on its own; several mild factors that all merely lean the same way often are not. The question is always: taken together, do these point to a real edge the market has not already priced?`,
};

// The generic block preserves the pre-Aug-24 Layer 1 research instruction
// verbatim, for any sport without its own criteria yet (soccer, MMA, and —
// deliberately, for now — football). Keeping the exact prior wording means no
// current sport's screening behavior changes as a side effect of this MLB work.
const GENERIC_SCREEN_CRITERIA = `Run 3-5 targeted web searches covering whatever's most relevant to this specific game (confirmed starters/lineups, injuries, recent form, line movement, matchup history — as applicable). This is a fast, real check, not the full deep-dive research that happens later for whatever you flag here as worth pursuing.

FOR TOTALS SPECIFICALLY: this system has a real, measured problem — totals proposed on pitching/bullpen narratives alone, without weighing both teams' actual offensive quality, have underperformed badly. If you land on a total here, you MUST have searched and weighed BOTH teams' real recent offensive output, not just the pitching matchup.`;

// ── Layer 1: pure research, no format constraint ─────────────────────
async function researchGameFindings(game, today_display, recentPicksMemory) {
  const linesSummary = [
    game.moneyline ? `moneyline: ${game.moneyline}` : null,
    game.spread ? `spread: ${game.spread}` : null,
    game.total ? `total: ${game.total}` : null,
  ].filter(Boolean).join(' | ');

  // Select the sport-specific screening factors, keyed on the STABLE
  // sport_key (the canonical Odds API identifier — baseball_mlb,
  // americanfootball_nfl, americanfootball_ncaaf, etc.) rather than the
  // fragile human-readable `sport` display string, which the feed labels
  // inconsistently ('MLB' but 'La Liga - Spain'). Keying on sport_key removes
  // a whole class of silent-miss failure as sports are added. sport_key is
  // verified non-null on every candidate row, and morning-trigger always
  // writes it alongside sport from the same feed record — so a game with a
  // usable sport_key is guaranteed. If it were ever somehow absent, the game
  // degrades SAFELY to the generic block (still a real evaluation, just not
  // sport-tailored) — no display-string fallback, deliberately, to avoid
  // reintroducing the display-string fragility this re-keying removed.
  const screenCriteria =
    SPORT_SCREEN_CRITERIA[game.sport_key] || GENERIC_SCREEN_CRITERIA;

  const system = `You are Hunter, an elite sports betting analyst. Today is ${today_display}.

You are looking at ONE game from today's full slate. Run a REAL, right-now evaluation — deciding fresh from scratch whether this specific game has a genuine betting edge worth pursuing.

Game: ${game.game}
Sport: ${game.sport}
Current lines: ${linesSummary || 'not available'}

${screenCriteria}

Be honest and selective. Passing on this game is the correct, default outcome — do not manufacture an angle that isn't really there just to have something to report. Most individual games will NOT have a real edge today.

${recentPicksMemory}

Write up your honest findings and conclusion in plain language — be specific and back up your reasoning with what you actually found. A colleague will handle structuring your answer afterward, so just focus on giving a real, well-researched take.`;

  // Timeout raised 45s -> 120s (matching Stage 2's research-scheduler
  // budget) after logged evidence (Jul 24-26) showed evaluate-scheduler
  // invocation durations clustering at 45-77s even on ordinary runs, and
  // every single tick in that window containing at least one timeout at
  // exactly 45000ms. This wasn't catching rare flukes — a normal 3-5
  // search research pass was routinely getting cut off mid-work. Safe to
  // raise: Promise.all bounds the whole tick's wall-clock time by its
  // SLOWEST concurrent call (not the sum), and the function's own 300s
  // ceiling has ample headroom even at 120s + extraction's 30s on top.
  const response = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: `Research ${game.game} now and give me your honest findings.` }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  }, 0, 120000);

  return extractText(response.content);
}

// ── Layer 2: forced structured extraction — API-level guarantee, not a
// prompt instruction the model can choose to ignore. ─────────────────
const EVALUATION_TOOL = {
  name: 'submit_game_evaluation',
  description: 'Submit the final structured evaluation for this game, based on the research findings already gathered.',
  input_schema: {
    type: 'object',
    properties: {
      worth_pursuing: { type: 'boolean', description: 'Whether this game has a genuine, real betting edge worth pursuing today.' },
      bet_type: { type: 'string', enum: ['moneyline', 'spread', 'total', 'f5', 'first_half', 'prop', 'none'], description: "Use 'none' if worth_pursuing is false." },
      pick: { type: 'string', description: "The specific pick, e.g. 'Detroit Tigers -1.5'. Empty string if worth_pursuing is false." },
      reason: { type: 'string', description: 'One or two sentences on what was actually found.' },
    },
    required: ['worth_pursuing', 'bet_type', 'pick', 'reason'],
  },
};

async function extractStructuredEvaluation(findingsText, game) {
  const response = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: `You are structuring a colleague's research findings on ${game.game} into our required format. Do not add new information or re-research anything — just faithfully structure what's below.`,
    messages: [{ role: 'user', content: `Findings:\n\n${findingsText.slice(0, 4000)}\n\nSubmit the structured evaluation now.` }],
    tools: [EVALUATION_TOOL],
    tool_choice: { type: 'tool', name: 'submit_game_evaluation' },
  }, 0, 30000);

  const toolUse = (response.content || []).find(c => c.type === 'tool_use' && c.name === 'submit_game_evaluation');
  if (!toolUse) {
    console.log(`EXTRACT_NO_TOOL_USE for "${game.game}" — response had no matching tool_use block.`);
    return null;
  }
  return toolUse.input;
}

// ── Combined: research, then guaranteed-structure extraction ─────────
async function evaluateGameForEdge(game, today_display, recentPicksMemory) {
  let findings;
  try {
    findings = await researchGameFindings(game, today_display, recentPicksMemory);
  } catch (e) {
    console.log(`RESEARCH_ERROR for "${game.game}": ${e.message}`);
    findings = null;
  }

  // Previously this branch (empty/whitespace findings — the shape a
  // silent timeout takes, since callClaude catches the abort internally
  // and returns no text rather than throwing) had NO log line at all.
  // That's the exact gap that made this failure invisible until we
  // counted raw DB rows by hand — over half of July 25-27's "no edge"
  // verdicts turned out to be this, not real analysis. One explicit
  // local retry here mirrors the pattern extraction already uses below,
  // rather than touching callClaude's shared transient-retry list (which
  // deliberately excludes timeout_error and is reused by other call
  // sites like Stage 2 and the lineup checks — not something to change
  // globally for this specific fix).
  if (!findings || !findings.trim()) {
    console.log(`RESEARCH_EMPTY_OR_TIMEOUT for "${game.game}" — Layer 1 research returned no usable text (a silent timeout, or the RESEARCH_ERROR logged just above) — retrying once.`);
    try {
      findings = await researchGameFindings(game, today_display, recentPicksMemory);
    } catch (e) {
      console.log(`RESEARCH_RETRY_ERROR for "${game.game}": ${e.message}`);
      findings = null;
    }
    if (!findings || !findings.trim()) {
      console.log(`RESEARCH_EMPTY_OR_TIMEOUT for "${game.game}" — retry also returned no usable text, giving up on this look.`);
      return null;
    }
  }

  try {
    const result = await extractStructuredEvaluation(findings, game);
    if (result) return result;
  } catch (e) {
    console.log(`EXTRACT_ERROR for "${game.game}": ${e.message}`);
  }

  // One genuine retry on the extraction step alone — cheap, reuses the
  // same findings rather than re-researching from scratch.
  try {
    const retryResult = await extractStructuredEvaluation(findings, game);
    if (retryResult) return retryResult;
  } catch (e) {
    console.log(`EXTRACT_RETRY_ERROR for "${game.game}": ${e.message}`);
  }

  console.log(`EVALUATE_GIVING_UP for "${game.game}" — research succeeded but structured extraction failed twice in a row.`);
  return null;
}

// ── Main: pick up a bounded batch, process in PARALLEL, stop ─────────
async function runEvaluateScheduler() {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const today_display = new Date().toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    timeZone: 'America/New_York'
  });

  // ── Atomically claim a batch (first-look + second-look, capped) ──────
  // Replaces two plain SELECTs that had no claiming mechanism at all — a
  // real risk found Aug 5: this function is wrapped in waitUntil(),
  // decoupling the cron's HTTP response from actual background
  // completion, so a slow tick (worst-case single-game latency can
  // approach this function's own 300s ceiling) could let a concurrent
  // invocation grab and double-process the same rows, wasting real
  // Anthropic API cost. claim_evaluation_batch claims rows atomically via
  // FOR UPDATE SKIP LOCKED inside one transaction — two overlapping
  // invocations can never claim the same row. It also auto-reclaims any
  // row stuck in a claimed state for more than 6 minutes, in case a prior
  // invocation crashed mid-run without ever writing a final status.
  const { data: claimedRows, error: claimError } = await supabase
    .rpc('claim_evaluation_batch', { p_date: today, p_cap: EVALUATE_CONCURRENCY_CAP });

  if (claimError) throw claimError;

  const pending = (claimedRows || []).map(row => ({
    row,
    isSecondLook: row.research_status === 'evaluating_claimed_second',
  }));

  if (pending.length === 0) {
    console.log('No games pending evaluation (first or second look) this run.');
    return;
  }

  const firstLookCount = pending.filter(p => !p.isSecondLook).length;
  const secondLookCount = pending.length - firstLookCount;
  console.log(`${firstLookCount} first-look + ${secondLookCount} second-look game(s) claimed this tick (combined cap: ${EVALUATE_CONCURRENCY_CAP}).`);

  const recentPicksMemory = await buildRecentPicksMemory();

  const results = await Promise.all(pending.map(async ({ row, isSecondLook }) => {
    const game = {
      game: row.game,
      sport: row.sport,
      sport_key: row.sport_key,
      moneyline: row.original_moneyline,
      spread: row.original_spread,
      total: row.original_total,
    };
    try {
      const evaluation = await evaluateGameForEdge(game, today_display, recentPicksMemory);
      return { row, isSecondLook, evaluation };
    } catch (e) {
      console.log(`EVALUATE_ERROR for "${row.game}": ${e.message}`);
      return { row, isSecondLook, evaluation: null };
    }
  }));

  let worthPursuingCount = 0;
  let awaitingSecondLookCount = 0;
  let terminalNoEdgeCount = 0;

  for (const { row, isSecondLook, evaluation } of results) {
    if (evaluation && evaluation.worth_pursuing === true) {
      worthPursuingCount += 1;
      await supabase.from('game_candidates').update({
        research_status: 'pending_research',
        status: 'pending_research',
        bet_type: evaluation.bet_type || null,
        proposed_pick: evaluation.pick || null,
        stage1_reason: evaluation.reason || null,
      }).eq('id', row.id);
      console.log(`EVALUATED_WORTH_PURSUING${isSecondLook ? ' (second look)' : ''}: "${row.game}" — ${evaluation.bet_type}: ${evaluation.pick}`);
      continue;
    }

    const triggerStillAhead = row.research_trigger_at && new Date(row.research_trigger_at) > new Date();

    if (!isSecondLook && triggerStillAhead) {
      awaitingSecondLookCount += 1;
      await supabase.from('game_candidates').update({
        research_status: 'awaiting_second_look',
        status: 'awaiting_second_look',
        stage1_reason: evaluation ? (evaluation.reason || null) : 'First-look evaluation failed (research or extraction error) after retry.',
      }).eq('id', row.id);
      console.log(`AWAITING_SECOND_LOOK: "${row.game}" — no edge on first look, will re-check once research_trigger_at arrives.`);
    } else {
      terminalNoEdgeCount += 1;
      await supabase.from('game_candidates').update({
        research_status: 'evaluated_no_edge',
        status: 'rejected_no_edge',
        stage1_reason: evaluation ? (evaluation.reason || null) : 'Evaluation failed (research or extraction error) after retry.',
      }).eq('id', row.id);
      console.log(`EVALUATED_NO_EDGE${isSecondLook ? ' (final, after second look)' : ' (final, research_trigger_at already passed)'}: "${row.game}"`);
    }
  }

  console.log(`Evaluate-scheduler tick complete: ${worthPursuingCount} worth pursuing, ${awaitingSecondLookCount} awaiting a second look, ${terminalNoEdgeCount} final no-edge, out of ${pending.length} processed this tick.`);
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  const cronSecret = request.headers.get('x-cron-secret');
  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}` && cronSecret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  waitUntil(runEvaluateScheduler().catch(err => console.error('runEvaluateScheduler error:', err)));
  return Response.json({ success: true, message: 'Evaluate scheduler started' });
}

export async function POST(request) {
  return GET(request);
}
