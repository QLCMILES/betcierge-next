// ── THROWAWAY PROBE — DELETE AFTER USE ───────────────────────────────────
// Proves the single unverified mechanic the Step 4 research loop depends on:
// can we pass an assistant turn (containing server_tool_use + web_search_tool_
// result blocks) back into the message history VERBATIM, add a follow-up user
// turn, and have claude-sonnet-4-6 accept it and perform MORE searches?
//
// It also measures input-token growth turn 1 -> turn 2, so we can confirm with
// real numbers whether verbatim passback is sustainable within a 3-turn ceiling
// (vs. needing truncation, which is likely API-illegal for server tool result
// blocks anyway because of their opaque encrypted_content).
//
// Gated behind CRON_SECRET so it isn't publicly callable. Returns the full
// result in the HTTP response — no DB writes, no pipeline impact. Two cheap
// weather searches, ~a few cents total.

export const maxDuration = 120;
export const dynamic = 'force-dynamic';

const MODEL = 'claude-sonnet-4-6';

async function callAnthropic(messages) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: 2000,
      messages,
      tools: [{ type: 'web_search_20250305', name: 'web_search' }],
    }),
  });
  let data;
  try { data = await res.json(); }
  catch (e) { data = { type: 'error', error: { type: 'non_json_response', message: String(e) } }; }
  return { httpStatus: res.status, data };
}

function summarize(data) {
  const content = Array.isArray(data && data.content) ? data.content : [];
  const blockTypes = {};
  for (const b of content) blockTypes[b.type] = (blockTypes[b.type] || 0) + 1;
  return {
    stop_reason: data && data.stop_reason != null ? data.stop_reason : null,
    block_types: blockTypes,
    searches: blockTypes['server_tool_use'] || 0,
    search_results: blockTypes['web_search_tool_result'] || 0,
    usage: data && data.usage ? data.usage : null,
    is_error: !!(data && data.type === 'error'),
    error: data && data.type === 'error' ? data.error : null,
  };
}

async function runSmoke() {
  const out = { model: MODEL, turns: [] };

  // Turn 1 — a question that forces a live web search.
  const messages = [{
    role: 'user',
    content: 'Search the web for the current weather in Boston, MA today, then tell me the temperature in one sentence.',
  }];
  const t1 = await callAnthropic(messages);
  const s1 = summarize(t1.data);
  out.turns.push({ turn: 1, httpStatus: t1.httpStatus, ...s1 });

  if (s1.is_error) {
    out.verdict = 'TURN 1 FAILED — could not even start; check ANTHROPIC_API_KEY / model / tool name.';
    return out;
  }

  // THE TEST: append the assistant turn VERBATIM (server_tool_use +
  // web_search_tool_result blocks and all), then a follow-up user turn.
  messages.push({ role: 'assistant', content: t1.data.content });
  messages.push({
    role: 'user',
    content: 'Now also search the web for the current weather in Chicago, IL today, and tell me that temperature in one sentence.',
  });
  const t2 = await callAnthropic(messages);
  const s2 = summarize(t2.data);
  out.turns.push({ turn: 2, httpStatus: t2.httpStatus, ...s2 });

  // Answers the questions the loop build actually needs.
  out.passback_accepted = !s2.is_error;
  out.turn2_did_more_searches = s2.searches > 0;
  const in1 = s1.usage && s1.usage.input_tokens;
  const in2 = s2.usage && s2.usage.input_tokens;
  out.input_token_growth = (in1 != null && in2 != null)
    ? { turn1: in1, turn2: in2, delta: in2 - in1 }
    : null;

  out.verdict = out.passback_accepted
    ? 'PASSBACK OK — verbatim assistant-turn passback accepted; multi-turn web_search is viable for the loop.'
    : 'PASSBACK REJECTED — see turn 2 error; loop message assembly needs adjustment before building.';
  return out;
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const cronSecret = request.headers.get('x-cron-secret');
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}` && cronSecret !== process.env.CRON_SECRET) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runSmoke();
    return Response.json({ success: true, result });
  } catch (err) {
    return Response.json({ success: false, error: String((err && err.message) || err) }, { status: 500 });
  }
}

export async function POST(request) { return GET(request); }
