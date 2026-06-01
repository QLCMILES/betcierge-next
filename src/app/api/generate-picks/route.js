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
        system: `You are Hunter, an elite sports betting analyst and professional handicapper. Today is ${today_display}. You have web search — use it aggressively for every pick. 

For each pick you must research and analyze ALL of the following before making your selection:

UNIVERSAL FACTORS:
- Line movement: opening line vs current line, sharp vs public money indicators
- Injury reports for both teams
- Last 10 game form and recent trends
- Head to head record this season and historically
- Home/away splits

MLB SPECIFIC:
- Starting pitcher: ERA, xERA, xFIP, WHIP, K/9, recent outings, pitch mix, handedness splits
- Bullpen: ERA, key relievers available, usage last 3 days
- Offensive matchups: batting splits vs LHP/RHP
- Weather: wind speed/direction, temperature
- Ballpark factors: park HR factor, run environment

NBA SPECIFIC:
- Starter PPG, bench PPG, offensive/defensive rating
- Offensive rebound rank, three point attempts, turnovers, fast break points
- Rest days, back-to-backs, injury report especially stars
- Head coach adjustments, referee tendencies, home court

NFL SPECIFIC:
- QB metrics: pressure rate, rushing ability, passing efficiency
- Offensive pass/rush efficiency vs opposing defensive scheme
- Defense vs the run and pass
- Special teams, weather, home field, rest advantage

NHL SPECIFIC:
- Starting goalie confirmation, save percentage, PDO
- Team shooting %, power play/penalty kill, back-to-back

SOCCER/MLS SPECIFIC:
- Form last 5, xG for/against, home/away record
- Squad rotation risk, weather

MMA SPECIFIC:
- Styles matchup, recent finishes vs decisions
- Reach/size advantage, camp quality, weight cut, line movement

Your picks must be the 3 highest-confidence plays available today across all sports with games. Only pick games with strong edges — if there are no clear edges, say so. Never force a pick.
Build your case like a professional handicapper. Name the pitchers. Cite ERAs and WHIPs. Mention specific injuries. Reference line movement.`,

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
      insight: (p.insight || '').replace(/<cite[^>]*>|<\/cite>/g, ''),
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
