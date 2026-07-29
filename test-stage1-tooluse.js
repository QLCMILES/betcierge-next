// Standalone test for the new forced-tool-use Stage 1 design.
// Run locally with: node test-stage1-tooluse.js
// Requires ANTHROPIC_API_KEY in your environment (or paste it directly below).
// Does NOT touch Supabase or any production data — pure function test.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

if (!ANTHROPIC_API_KEY) {
  console.error('Set ANTHROPIC_API_KEY in your environment first, e.g.:');
  console.error('  export ANTHROPIC_API_KEY=sk-ant-...');
  process.exit(1);
}

// ── Pick a real game to test against — edit these to whatever's live today ──
const TEST_GAME = {
  game: 'San Diego Padres @ Miami Marlins',   // one of today's real games that failed earlier
  sport: 'MLB',
  moneyline: null,
  spread: null,
  total: null,
  away_starter: null,
  home_starter: null,
};

async function callClaude(body) {
  const response = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(body),
  });
  return response.json();
}

function extractText(content) {
  return (content || []).filter(c => c.type === 'text').map(c => c.text).join('');
}

async function researchGameFindings(game) {
  const linesSummary = [
    game.moneyline ? `moneyline: ${game.moneyline}` : null,
    game.spread ? `spread: ${game.spread}` : null,
    game.total ? `total: ${game.total}` : null,
    game.away_starter || null,
    game.home_starter || null,
  ].filter(Boolean).join(' | ');

  const system = `You are Hunter, an elite sports betting analyst. Today is ${new Date().toDateString()}.

You are looking at ONE game from today's full slate. Run a REAL, right-now evaluation — deciding fresh from scratch whether this specific game has a genuine betting edge worth pursuing.

Game: ${game.game}
Sport: ${game.sport}
Current lines: ${linesSummary || 'not available'}

Run 3-5 targeted web searches covering whatever's most relevant to this specific game (confirmed starters/lineups, injuries, recent form, line movement, matchup history — as applicable).

Be honest and selective. Passing on this game is the correct, default outcome — do not manufacture an angle that isn't really there just to have something to report.

Write up your honest findings and conclusion in plain language — be specific and back up your reasoning with what you actually found. A colleague will handle structuring your answer afterward, so just focus on giving a real, well-researched take.`;

  console.log('--- STEP 1: Running free-form research (no format constraint) ---');
  const response = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 1500,
    system,
    messages: [{ role: 'user', content: `Research ${game.game} now and give me your honest findings.` }],
    tools: [{ type: 'web_search_20250305', name: 'web_search' }],
  });

  if (response.type === 'error') {
    console.error('RESEARCH CALL ERROR:', JSON.stringify(response.error, null, 2));
    process.exit(1);
  }

  const findings = extractText(response.content);
  console.log('\n--- RAW FINDINGS RETURNED ---\n');
  console.log(findings);
  return findings;
}

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
  console.log('\n--- STEP 2: Forcing structured extraction via tool_choice ---');
  const response = await callClaude({
    model: 'claude-sonnet-4-6',
    max_tokens: 500,
    system: `You are structuring a colleague's research findings on ${game.game} into our required format. Do not add new information or re-research anything — just faithfully structure what's below.`,
    messages: [{ role: 'user', content: `Findings:\n\n${findingsText.slice(0, 4000)}\n\nSubmit the structured evaluation now.` }],
    tools: [EVALUATION_TOOL],
    tool_choice: { type: 'tool', name: 'submit_game_evaluation' },
  });

  if (response.type === 'error') {
    console.error('EXTRACT CALL ERROR:', JSON.stringify(response.error, null, 2));
    return null;
  }

  const toolUse = (response.content || []).find(c => c.type === 'tool_use' && c.name === 'submit_game_evaluation');
  if (!toolUse) {
    console.error('NO TOOL_USE BLOCK RETURNED. Full response:', JSON.stringify(response, null, 2));
    return null;
  }
  return toolUse.input;
}

(async () => {
  console.log(`Testing forced-tool-use Stage 1 design against: ${TEST_GAME.game}\n`);

  const findings = await researchGameFindings(TEST_GAME);
  if (!findings || !findings.trim()) {
    console.error('\nFAIL: research call returned no text at all.');
    process.exit(1);
  }

  const result = await extractStructuredEvaluation(findings, TEST_GAME);
  if (!result) {
    console.error('\nFAIL: structured extraction did not return a valid tool_use block. This means the forced-tool-use guarantee did NOT hold — worth investigating before trusting tomorrow\'s cron.');
    process.exit(1);
  }

  console.log('\n--- SUCCESS: STRUCTURED RESULT ---\n');
  console.log(JSON.stringify(result, null, 2));
})();
