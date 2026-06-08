import { createClient } from '@supabase/supabase-js';

export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

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

// Maps prop stat keywords from pick text to MLB Stats API stat fields
const PROP_STAT_MAP = {
  'strikeout': { type: 'pitching', field: 'strikeOuts' },
  'strikeouts': { type: 'pitching', field: 'strikeOuts' },
  'k': { type: 'pitching', field: 'strikeOuts' },
  'ks': { type: 'pitching', field: 'strikeOuts' },
  'hit': { type: 'batting', field: 'hits' },
  'hits': { type: 'batting', field: 'hits' },
  'home run': { type: 'batting', field: 'homeRuns' },
  'home runs': { type: 'batting', field: 'homeRuns' },
  'homer': { type: 'batting', field: 'homeRuns' },
  'rbi': { type: 'batting', field: 'rbi' },
  'rbis': { type: 'batting', field: 'rbi' },
  'run': { type: 'batting', field: 'runs' },
  'runs': { type: 'batting', field: 'runs' },
  'walk': { type: 'batting', field: 'baseOnBalls' },
  'walks': { type: 'batting', field: 'baseOnBalls' },
  'stolen base': { type: 'batting', field: 'stolenBases' },
  'stolen bases': { type: 'batting', field: 'stolenBases' },
  'total bases': { type: 'batting', field: 'totalBases' },
  'innings pitched': { type: 'pitching', field: 'inningsPitched' },
  'innings': { type: 'pitching', field: 'inningsPitched' },
  'hits allowed': { type: 'pitching', field: 'hits' },
  'earned runs': { type: 'pitching', field: 'earnedRuns' },
};

// Parse a prop pick string into components
// e.g. "Kyle Harrison Over 6.5 Strikeouts" -> { player, direction, line, statKey }
function parsePropPick(pick) {
  const lower = pick.toLowerCase();
  const directionMatch = lower.match(/\b(over|under)\b/);
  if (!directionMatch) return null;
  const direction = directionMatch[1];

  const lineMatch = lower.match(/(\d+\.?\d*)/);
  if (!lineMatch) return null;
  const line = parseFloat(lineMatch[1]);

  // Find stat type
  let statKey = null;
  for (const keyword of Object.keys(PROP_STAT_MAP)) {
    if (lower.includes(keyword)) {
      statKey = keyword;
      break;
    }
  }
  if (!statKey) return null;

  // Extract player name — everything before "over" or "under"
  const playerPart = pick.substring(0, directionMatch.index).trim();
  if (!playerPart) return null;

  return { player: playerPart, direction, line, statKey };
}

// Fetch MLB gamePks for a given date
async function fetchMLBGamePks(date) {
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&gameType=R&fields=dates,games,gamePk,status,abstractGameState,teams,away,home,team,name`
    );
    const data = await res.json();
    const games = data.dates?.[0]?.games || [];
    return games
      .filter(g => g.status?.abstractGameState === 'Final')
      .map(g => ({
        gamePk: g.gamePk,
        awayTeam: g.teams?.away?.team?.name,
        homeTeam: g.teams?.home?.team?.name,
      }));
  } catch {
    return [];
  }
}

// Fetch box score and return all players with their game stats
async function fetchBoxScorePlayers(gamePk) {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
    const data = await res.json();
    const players = [];
    for (const side of ['away', 'home']) {
      const teamPlayers = data.teams?.[side]?.players || {};
      for (const player of Object.values(teamPlayers)) {
        players.push({
          fullName: player.person?.fullName || '',
          stats: player.stats || {},
        });
      }
    }
    return players;
  } catch {
    return [];
  }
}

// Match player name — handles partial matches e.g. "K. Harrison" vs "Kyle Harrison"
function matchPlayerName(propPlayer, fullName) {
  const prop = propPlayer.toLowerCase().trim();
  const full = fullName.toLowerCase().trim();
  if (full.includes(prop) || prop.includes(full)) return true;
  // Try last name match
  const propLast = prop.split(' ').pop();
  const fullLast = full.split(' ').pop();
  if (propLast && fullLast && propLast === fullLast && propLast.length > 3) return true;
  return false;
}

// Settle a single prop bet using MLB Stats API
async function settleMLBProp(bet) {
  if (!bet.game_date) return null;

  const parsed = parsePropPick(bet.pick);
  if (!parsed) return null;

  const { player, direction, line, statKey } = parsed;
  const statDef = PROP_STAT_MAP[statKey];
  if (!statDef) return null;

  // Get all final games for the bet's date
  const games = await fetchMLBGamePks(bet.game_date);
  if (!games.length) return null;

  // If we have a game_id, try to find the matching gamePk via team name
  // Otherwise search all games that day
  let gamePksToSearch = games.map(g => g.gamePk);

  if (bet.game) {
    const betGame = bet.game.toLowerCase();
    const matchingGame = games.find(g => {
      const away = g.awayTeam?.toLowerCase() || '';
      const home = g.homeTeam?.toLowerCase() || '';
      return betGame.includes(away.split(' ').pop()) ||
             betGame.includes(home.split(' ').pop()) ||
             away.split(' ').some(w => w.length > 3 && betGame.includes(w)) ||
             home.split(' ').some(w => w.length > 3 && betGame.includes(w));
    });
    if (matchingGame) gamePksToSearch = [matchingGame.gamePk];
  }

  // Search each game's box score for the player
  for (const gamePk of gamePksToSearch) {
    const players = await fetchBoxScorePlayers(gamePk);
    const playerData = players.find(p => matchPlayerName(player, p.fullName));
    if (!playerData) continue;

    const statValue = playerData.stats[statDef.type]?.[statDef.field];
    if (statValue === undefined || statValue === null) continue;

    // innings pitched is a string like "6.1" — convert to numeric outs
    let actual = statDef.field === 'inningsPitched'
      ? parseFloat(statValue)
      : parseInt(statValue);

    if (isNaN(actual)) continue;

    if (direction === 'over') {
      return actual > line ? 'Win' : actual === line ? 'Pending' : 'Loss';
    } else {
      return actual < line ? 'Win' : actual === line ? 'Pending' : 'Loss';
    }
  }

  return null;
}

export async function GET(request) {
  const authHeader = request.headers.get('authorization');
  const isVercelCron = request.headers.get('x-vercel-cron') === '1';
  if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { data: pendingBets, error: fetchError } = await supabase
      .from('user_bets')
      .select('*')
      .eq('result', 'Pending');

    if (fetchError) throw fetchError;
    if (!pendingBets || pendingBets.length === 0) {
      return Response.json({ message: 'No pending bets', settled: 0 });
    }

    const sportsNeeded = new Set();
    for (const bet of pendingBets) {
      const key = SPORT_MAP[bet.sport?.toLowerCase()];
      if (key) sportsNeeded.add(key);
    }

    // Fetch game scores for straight/spread/total bets
    const apiKey = process.env.ODDS_API_KEY;
    const scoresPromises = [...sportsNeeded].map(sport =>
      fetch(`https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${apiKey}&daysFrom=3&dateFormat=iso`)
        .then(r => r.json())
        .catch(() => [])
    );
    const scoresResults = await Promise.all(scoresPromises);
    const allScores = scoresResults.flat().filter(g => g.completed === true);

    let settled = 0;
    const settlementLog = [];

    for (const bet of pendingBets) {
      const betType = bet.bet_type?.toLowerCase().replace(/[^a-z]/g, '');
      let result = null;

      // Route prop bets to MLB Stats API
      if (betType?.includes('prop')) {
        const sport = bet.sport?.toLowerCase();
        if (sport === 'mlb' || sport === 'baseball') {
          result = await settleMLBProp(bet);
          settlementLog.push({ id: bet.id, pick: bet.pick, method: 'mlb_stats', result });
        }
      } else {
        // Straight/spread/total — use Odds API scores
        const match = findMatchingGame(bet, allScores);
        if (match) {
          result = determineResult(bet, match);
          settlementLog.push({ id: bet.id, pick: bet.pick, method: 'odds_api', result });
        }
      }

      if (!result) continue;

      await supabase
        .from('user_bets')
        .update({ result, type: result })
        .eq('id', bet.id);

      settled++;
    }

    return Response.json({
      success: true,
      settled,
      total: pendingBets.length,
      sportsQueried: [...sportsNeeded],
      log: settlementLog,
    });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

function findMatchingGame(bet, scores) {
  const betGame = bet.game.toLowerCase();
  const betDate = bet.game_date;
  return scores.find(g => {
    const home = g.home_team.toLowerCase();
    const away = g.away_team.toLowerCase();
    const gameDate = g.commence_time ? new Date(g.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null;
    const dateMatch = !betDate || !gameDate || gameDate === betDate;
    const timeMatch = true;
    const teamMatch = betGame.includes(home) || betGame.includes(away) ||
      home.split(' ').some(w => w.length > 3 && betGame.includes(w)) ||
      away.split(' ').some(w => w.length > 3 && betGame.includes(w));
    return dateMatch && teamMatch && timeMatch;
  });
}

function determineResult(bet, game) {
  if (!game.scores || game.scores.length < 2) return null;

  const homeScore = parseInt(game.scores.find(s => s.name === game.home_team)?.score);
  const awayScore = parseInt(game.scores.find(s => s.name === game.away_team)?.score);
  if (isNaN(homeScore) || isNaN(awayScore)) return null;

  const pick = bet.pick.toLowerCase();
  const betType = bet.bet_type?.toLowerCase().replace(/[^a-z]/g, '');

  if (betType === 'moneyline') {
    const homeWon = homeScore > awayScore;
    const pickedHome = pick.includes(game.home_team.toLowerCase().split(' ').pop());
    return (homeWon === pickedHome) ? 'Win' : 'Loss';
  }

  if (['spread', 'straight', 'runline'].includes(betType)) {
    const spreadMatch = pick.match(/([+-]?\d+\.?\d*)/);
    if (!spreadMatch) return null;
    const spread = parseFloat(spreadMatch[1]);
    const pickedHome = pick.includes(game.home_team.toLowerCase().split(' ').pop());
    const diff = pickedHome ? homeScore - awayScore : awayScore - homeScore;
    return (diff + spread > 0) ? 'Win' : (diff + spread === 0) ? 'Pending' : 'Loss';
  }

  if (['totalou', 'total', 'over', 'under'].includes(betType)) {
    const totalMatch = pick.match(/(\d+\.?\d*)/);
    if (!totalMatch) return null;
    const total = parseFloat(totalMatch[1]);
    const actual = homeScore + awayScore;
    const isOver = pick.includes('over') || betType === 'over';
    return isOver ? (actual > total ? 'Win' : actual === total ? 'Pending' : 'Loss')
                  : (actual < total ? 'Win' : actual === total ? 'Pending' : 'Loss');
  }

  return null;
}
export async function POST(request) {
  return GET(request);
}
