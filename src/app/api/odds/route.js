export const dynamic = 'force-dynamic';

const month = new Date().getMonth() + 1; // 1-12
const isEuropeanSoccerSeason = month >= 8 || month <= 5; // Aug-May
const isMLSSeason = month >= 3 && month <= 11; // Mar-Nov
const isNFLSeason = month >= 8 || month <= 2; // Aug-Feb
const isNBASeason = month >= 10 || month <= 6; // Oct-Jun
const isNHLSeason = month >= 10 || month <= 6; // Oct-Jun
const isMLBSeason = month >= 3 && month <= 10; // Mar-Oct
const isNCAABSeason = month >= 11 || month <= 4; // Nov-Apr
const isNCAAFSeason = month >= 8 && month <= 1; // Aug-Jan

const SPORTS = [
  ...(isMLBSeason ? ['baseball_mlb'] : []),
  ...(isNBASeason ? ['basketball_nba'] : []),
  ...(isNFLSeason ? ['americanfootball_nfl'] : []),
  ...(isNHLSeason ? ['icehockey_nhl'] : []),
  ...(isNCAABSeason ? ['basketball_ncaab'] : []),
  ...(isNCAAFSeason ? ['americanfootball_ncaaf'] : []),
  'mma_mixed_martial_arts',
  ...(isMLSSeason ? ['soccer_usa_mls'] : []),
  ...(isEuropeanSoccerSeason ? [
    'soccer_epl',
    'soccer_spain_la_liga',
    'soccer_germany_bundesliga',
    'soccer_italy_serie_a',
    'soccer_france_ligue_one',
    'soccer_uefa_champs_league',
    'soccer_uefa_europa_league',
  ] : []),
  'soccer_conmebol_copa_libertadores',
  'soccer_fifa_world_cup',
];

async function fetchOdds(apiKey) {
  const results = await Promise.all(
    SPORTS.map(sport =>
      fetch(
        `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${apiKey}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`,
        { cache: 'no-store' }
      )
        .then(r => r.ok ? r.json() : [])
        .catch(() => [])
    )
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