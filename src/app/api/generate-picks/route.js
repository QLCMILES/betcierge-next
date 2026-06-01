import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // ✅ fixed
);

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const today = new Date().toISOString().split('T')[0];

    await supabase
      .from('daily_picks')
      .update({ status: 'inactive' })
      .eq('date', today);

    const oddsRes = await fetch('https://betcierge-next.vercel.app/api/odds');
    const oddsData = await oddsRes.json();
    const now = new Date();
    const cutoff = new Date(now.getTime() + 2 * 60 * 60 * 1000);
    const slimGames = (oddsData.games || [])
      .filter(g => new Date(g.commence_time) > cutoff)
      .slice(0, 12)
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
        };
      });

    const gamesContext = JSON.stringify(slimGames);
    const today_display = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric'
    });

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 8000,  // ✅ bumped for long breakdowns
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are Hunter, an elite sports betting analyst and professional handicapper. Today is ${today_display}.

You have web search — use it aggressively. Search for EACH pick before writing about it. You are looking for:
- Current injury reports and lineup confirmations
- Starting pitcher stats: ERA, xERA, xFIP, WHIP, last 6 start splits, home/away splits, advanced metrics (whiff%, K%, barrel%)
- Bullpen ERA, usage last 7 days, save situation
- Team offensive stats: wRC+, OPS, road/home records, last 10 game form
- Line movement from open to current — where is sharp money?
- Head-to-head history, weather, ballpark factors

Write each insight like a PROFESSIONAL HANDICAPPER making a case. Use bold section headers. Cite specific numbers. Name the pitchers. Show the mismatch. Make it compelling and detailed — this is what bettors are paying for. Minimum 150 words per insight. Never be vague. Every claim needs a real stat behind it.`,
        messages: [{
          role: 'user',
          content: `Today is ${today_display}. Available games with current lines: ${gamesContext}

Search the web for today's matchup data, then select the 3 best pre-game plays. Return ONLY raw JSON, no markdown:
{"picks":[{"sport":"...","game":"...","pick":"...","odds":"...","confidence":"High|Medium|Low","insight":"DETAILED multi-paragraph breakdown with bold headers, specific stats, pitcher names, line movement, and sharp money context. Minimum 150 words.","units":1}]}`
        }],
      }),
    });

    const data = await response.json();
    const text = (data.content || [])
      .filter(c => c.type === 'text')
      .map(c => c.text)
      .join('');

    const clean = text.replace(/```json|```/g, '').trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('No JSON in response');
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.picks) throw new Error('Invalid format');

    const rows = parsed.picks.map(p => ({
      date: today,
      sport: p.sport,
      game: p.game,
      pick: p.pick,
      odds: p.odds,
      confidence: p.confidence,
      insight: p.insight,
      units: parseInt(p.units) || 1,
      status: 'active',
      created_at: new Date().toISOString(),
    }));

    const { data: insertData, error } = await supabase
      .from('daily_picks')
      .insert(rows)
      .select();

    if (error) throw error;
    return Response.json({ success: true, picks: insertData, count: insertData.length });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
