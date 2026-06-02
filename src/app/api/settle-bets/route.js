import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Map from bet sport names to Odds API sport keys
const SPORT_MAP = {
  'mlb': 'baseball_mlb',
  'baseball': 'baseball_mlb',
  'nba': 'basketball_nba',
  'basketball': 'basketball_nba',
  'nfl': 'americanfootball_nfl',
  'football': 'americanfootball_nfl',
  'nhl': 'icehockey_nhl',
  'hockey': 'icehockey_nhl',
  'mls': 'soccer_usa_mls',
  'soccer': 'soccer_usa_mls',
  'ncaab': 'basketball_ncaab',
  'college basketball': 'basketball_ncaab',
  'ncaaf': 'americanfootball_ncaaf',
  'college football': 'americanfootball_ncaaf',
  'ufc': 'mma_mixed_martial_arts',
  'mma': 'mma_mixed_martial_arts',
};

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    // Get all pending bets
    const { data: pendingBets, error: fetchError } = await supabase
      .from('user_bets')
      .select('*')
      .eq('result', 'Pending');

    if (fetchError) throw fetchError;
    if (!pendingBets || pendingBets.length === 0) {
      return Response.json({ message: 'No pending bets', settled: 0 });
    }

    // Determine which sports we actually need to query
    const sportsNeeded = new Set();
    for (const bet of pendingBets) {
      const key = SPORT_MAP[bet.sport?.toLowerCase()];
      if (key) sportsNeeded.add(key);
    }

    if (sportsNeeded.size === 0) {
      return Response.json({ message: 'No matching sports to query', settled: 0 });
    }

    // Only fetch scores for sports with pending bets
    const apiKey = process.env.ODDS_API_KEY;
    const scoresPromises = [...sportsNeeded].map(sport =>
      fetch(`https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${apiKey}&daysFrom=1&dateFormat=iso`)
        .then(r => r.json())
        .catch(() => [])
    );
    const scoresResults = await Promise.all(scoresPromises);
    const allScores = scoresResults.flat().filter(g => g.completed === true);

    let settled = 0;

    for (const bet of pendingBets) {
      const match = findMatchingGame(bet, allScores);
      if (!match) continue;

      const result = determineResult(bet, match);
      if (!result) continue;

      await supabase
        .from('user_bets')
        .update({ result })
        .eq('id', bet.id);

      settled++;
    }

    return Response.json({ 
      success: true, 
      settled, 
      total: pendingBets.length,
      sportsQueried: [...sportsNeeded]
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function findMatchingGame(bet, scores) {
  const betGame = bet.game.toLowerCase();
  return scores.find(g => {
    const home = g.home_team.toLowerCase();
    const away = g.away_team.toLowerCase();
    return betGame.includes(home) || betGame.includes(away) ||
      home.split(' ').some(w => w.length > 3 && betGame.includes(w)) ||
      away.split(' ').some(w => w.length > 3 && betGame.includes(w));
  });
}

function determineResult(bet, game) {
  if (!game.scores || game.scores.length < 2) return null;

  const homeScore = parseInt(game.scores.find(s => s.name === game.home_team)?.score);
  const awayScore = parseInt(game.scores.find(s => s.name === game.away_team)?.score);
  if (isNaN(homeScore) || isNaN(awayScore)) return null;

  const pick = bet.pick.toLowerCase();

  // Moneyline
  if (bet.bet_type === 'Moneyline') {
    const homeWon = homeScore > awayScore;
    const pickedHome = pick.includes(game.home_team.toLowerCase().split(' ').pop());
    return (homeWon === pickedHome) ? 'Win' : 'Loss';
  }

  // Spread
  if (bet.bet_type === 'Spread') {
    const spreadMatch = pick.match(/([+-]?\d+\.?\d*)/);
    if (!spreadMatch) return null;
    const spread = parseFloat(spreadMatch[1]);
    const pickedHome = pick.includes(game.home_team.toLowerCase().split(' ').pop());
    const diff = pickedHome ? homeScore - awayScore : awayScore - homeScore;
    return (diff + spread > 0) ? 'Win' : (diff + spread === 0) ? 'Pending' : 'Loss';
  }

  // Total O/U
  if (bet.bet_type === 'Total (O/U)') {
    const totalMatch = pick.match(/(\d+\.?\d*)/);
    if (!totalMatch) return null;
    const total = parseFloat(totalMatch[1]);
    const actual = homeScore + awayScore;
    const isOver = pick.includes('over');
    return isOver ? (actual > total ? 'Win' : actual === total ? 'Pending' : 'Loss')
                  : (actual < total ? 'Win' : actual === total ? 'Pending' : 'Loss');
  }

  return null;
}
