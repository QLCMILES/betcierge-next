import { createClient } from '@supabase/supabase-js';

export const maxDuration = 300;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY
);

export async function GET(request) {
  // Verify this is called by Vercel Cron or manually with secret
  const authHeader = request.headers.get('authorization');
const isVercelCron = request.headers.get('x-vercel-cron') === '1';
if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
  return Response.json({ error: 'Unauthorized' }, { status: 401 });
}

  try {
    const today = new Date().toISOString().split('T')[0];

    // Deactivate old picks
    await supabase
      .from('daily_picks')
      .update({ status: 'inactive' })
      .eq('date', today);

    // Fetch today's odds
    const oddsRes = await fetch(
      `${process.env.NEXT_PUBLIC_SUPABASE_URL ? 'https://betcierge-next.vercel.app' : 'http://localhost:3000'}/api/odds`
    );
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
    const today_display = new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

    // Call Claude with web search for deep research
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5',
        max_tokens: 4000,
        tools: [{ type: 'web_search_20250305', name: 'web_search' }],
        system: `You are Hunter, an elite sports betting analyst. Today is ${today_display}. You have web search — use it aggressively before every pick. Your insights must reference specific players, stats, injury news, and trends found via search. Generic odds-based reasoning is unacceptable. Return ONLY raw JSON, no markdown, no backticks.`,
        messages: [{
          role: 'user',
          content: `Today is ${today_display}. Available pre-game lines: ${gamesContext}.

Research and find today's 3 best pre-game plays. For each pick:
- Search for starting pitchers (MLB): name, ERA, WHIP, last 3 starts
- Search for injury reports for both teams
- Search for last 10 games record and recent trends
- Search for any sharp money or line movement
- Search for head to head record this season

Build your case like a professional handicapper. Name the pitchers. Cite ERAs and WHIPs. Mention specific injuries. Reference line movement.

Return ONLY raw JSON:
{"picks":[{"sport":"...","game":"...","pick":"...","odds":"...","confidence":"High|Medium|Low","insight":"3-4 sentences with specific player names, stats, and trends from your research","units":1,"game_time":"7:05 PM ET"}],"summary":"1 sharp sentence about today's card"}`
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

    // Save to Supabase
    const rows = parsed.picks.map(p => ({
      date: today,
      sport: p.sport,
      game: p.game,
      pick: p.pick,
      odds: p.odds,
      confidence: p.confidence,
      insight: p.insight,
      units: parseInt(p.units) || 1,
      game_time: p.game_time,
      status: 'active',
      created_at: new Date().toISOString(),
    }));

    const { data: saved, error } = await supabase
      .from('daily_picks')
      .insert(rows)
      .select();

    if (error) throw error;

    return Response.json({ success: true, picks: saved, count: saved.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
