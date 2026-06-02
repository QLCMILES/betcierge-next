export async function GET() {
  try {
    const apiKey = process.env.ODDS_API_KEY;10
    
    // Fetch today's NFL, NBA, MLB, NHL games with odds
    const sports = ['basketball_nba', 'americanfootball_nfl', 'baseball_mlb', 'icehockey_nhl'];
    
    const results = await Promise.all(
      sports.map(sport =>
fetch(`https://api.the-odds-api.com/v4/sports/${sport}/odds?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american&commenceTimeFrom=${new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString()}&commenceTimeTo=${new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()}`)          .then(r => r.json())
      )
    );

    const games = results.flat().filter(g => g && g.id);
    return Response.json({ games });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
