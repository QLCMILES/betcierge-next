export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    const sports = ['basketball_nba', 'americanfootball_nfl', 'baseball_mlb', 'icehockey_nhl'];
    
    const results = await Promise.all(
      sports.map(sport =>
        fetch(`https://api.the-odds-api.com/v4/sports/${sport}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`)
          .then(r => r.json())
      )
    );

    const games = results.flat().filter(g => g && g.id);
    return Response.json({ games }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}