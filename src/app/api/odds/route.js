export const dynamic = 'force-dynamic';

const SPORTS = [
  'baseball_mlb',
  'basketball_nba',
  'americanfootball_nfl',
  'icehockey_nhl',
  'basketball_ncaab',
  'americanfootball_ncaaf',
  'mma_mixed_martial_arts',
  'soccer_usa_mls',
];

async function fetchOdds(apiKey) {
  
  const results = await Promise.all(
    fetch(
      `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`,
      { cache: 'no-store' }
    )
      .then(r => r.ok ? r.json() : [])
      .catch(() => [])
  );

  return results.flat().filter(g => g && g.id);
}

// POST — used by client at bet-log time (never cached by Vercel)
export async function POST() {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) return Response.json({ error: 'No API key' }, { status: 500 });
    const games = await fetchOdds(apiKey);
    return Response.json({ games }, {
      headers: { 'Cache-Control': 'no-store' }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

// GET — kept for Betsy's system prompt injection (settle-bets, internal use)
export async function GET() {
  try {
    const apiKey = process.env.ODDS_API_KEY;
    if (!apiKey) return Response.json({ error: 'No API key' }, { status: 500 });
    const games = await fetchOdds(apiKey);
    return Response.json({ games }, {
      headers: { 'Cache-Control': 'no-store, no-cache, must-revalidate' }
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}