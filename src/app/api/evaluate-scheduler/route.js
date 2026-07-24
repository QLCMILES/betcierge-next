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

// ── Layer 1: pure research, no format constraint ─────────────────────
async function researchGameFindings(game, today_display, recentPicksMemory) {
  const linesSummary = [
    game.moneyline ? `moneyline: ${game.moneyline}` : null,
    game.spread ? `spread: ${game.spread}` : null,
    game.total ? `total: ${game.total}` : null,
  ].filter(Boolean).join(' | ');

  const system = `You are Hunter, an elite sports betting analyst. Today is ${today_display}.

You are looking at ONE game from today's full slate. Run a REAL, right-now evaluation — deciding fresh from scratch whether this specific game has a genuine betting edge worth pursuing.

Game: ${game.game}
Sport: ${game.sport}
Current lines: ${linesSummary || 'not available'}

Run 3-5 targeted web searches covering whatever's most relevant to this specific game (confirmed starters/lineups, injuries, recent form, line movement, matchup history — as applicable). This is a fast, real check, not the full deep-dive research that happens later for whatever you flag here as worth pursuing.

FOR TOTALS SPECIFICALLY: this system has a real, measured problem — totals proposed on pitching/bullpen narratives alone, without weighing both teams' actual offensive quality, have underperformed badly. If you land on a total here, you MUST have searched and weighed BOTH teams' real recent offensive output, not just the pitching matchup.

Be honest and selective. Passing on this game is the correct, default outcome — do not manufacture an angle that isn't really there just to have something to report. Most individual games will NOT have a real edge today.

${recentPicksMemory}

Write up your honest findings and conclusion in plain language — be specific and back up your reasoning with what you actually found. A colleague will handle structuring your answer afterward, so just focus on giving a real, well-researched take.`;

  const response = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: `Research ${game.game} now and give me your honest findings.` }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  }, 0, 45000);

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
    return null;
  }
  if (!findings || !findings.trim()) return null;

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

  const { data: pending, error } = await supabase
    .from('game_candidates')
    .select('*')
    .eq('date', today)
    .eq('research_status', 'pending_evaluation')
    .order('created_at', { ascending: true })
    .limit(EVALUATE_CONCURRENCY_CAP);

  if (error) throw error;
  if (!pending || pending.length === 0) {
    console.log('No games pending evaluation this run.');
    return;
  }

  console.log(`${pending.length} game(s) pending evaluation — processing this batch now (cap: ${EVALUATE_CONCURRENCY_CAP}).`);

  const recentPicksMemory = await buildRecentPicksMemory();

  const results = await Promise.all(pending.map(async (row) => {
    // NOTE: away_starter/home_starter aren't persisted on game_candidates
    // rows (morning-trigger's MLB pitcher enrichment was only ever used
    // in-memory, never saved to the DB) — a small, pre-existing context
    // loss, not something this change introduces. The live web searches
    // inside researchGameFindings still find real starters regardless.
    const game = {
      game: row.game,
      sport: row.sport,
      moneyline: row.original_moneyline,
      spread: row.original_spread,
      total: row.original_total,
    };
    try {
      const evaluation = await evaluateGameForEdge(game, today_display, recentPicksMemory);
      return { row, evaluation };
    } catch (e) {
      console.log(`EVALUATE_ERROR for "${row.game}": ${e.message}`);
      return { row, evaluation: null };
    }
  }));

  let worthPursuingCount = 0;
  for (const { row, evaluation } of results) {
    if (evaluation && evaluation.worth_pursuing === true) {
      worthPursuingCount += 1;
      // Handing off to research-scheduler: setting research_status back to
      // 'pending_research' is exactly what its existing query already
      // looks for — no changes needed on that side at all.
      await supabase.from('game_candidates').update({
        research_status: 'pending_research',
        status: 'pending_research',
        bet_type: evaluation.bet_type || null,
        proposed_pick: evaluation.pick || null,
        stage1_reason: evaluation.reason || null,
      }).eq('id', row.id);
      console.log(`EVALUATED_WORTH_PURSUING: "${row.game}" — ${evaluation.bet_type}: ${evaluation.pick}`);
    } else {
      await supabase.from('game_candidates').update({
        research_status: 'evaluated_no_edge',
        status: 'rejected_no_edge',
        stage1_reason: evaluation ? (evaluation.reason || null) : 'Evaluation failed (research or extraction error) after retry.',
      }).eq('id', row.id);
      console.log(`EVALUATED_NO_EDGE: "${row.game}"`);
    }
  }

  console.log(`Evaluate-scheduler tick complete: ${worthPursuingCount} of ${pending.length} games in this batch came back worth pursuing.`);
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
