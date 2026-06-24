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
  'epl': 'soccer_epl',
  'premier league': 'soccer_epl',
  'english premier league': 'soccer_epl',
  'la liga': 'soccer_spain_la_liga',
  'bundesliga': 'soccer_germany_bundesliga',
  'serie a': 'soccer_italy_serie_a',
  'ligue 1': 'soccer_france_ligue_one',
  'champions league': 'soccer_uefa_champs_league',
  'uefa champions league': 'soccer_uefa_champs_league',
  'europa league': 'soccer_uefa_europa_league',
  'copa libertadores': 'soccer_conmebol_copa_libertadores',
  'world cup': 'soccer_fifa_world_cup',
  'fifa world cup': 'soccer_fifa_world_cup',
  'ncaab': 'basketball_ncaab',
  'college basketball': 'basketball_ncaab',
  'ncaaf': 'americanfootball_ncaaf',
  'college football': 'americanfootball_ncaaf',
  'ufc': 'mma_mixed_martial_arts',
  'mma': 'mma_mixed_martial_arts',
};

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

const NBA_PROP_STAT_MAP = {
  'point': 'PTS',
  'points': 'PTS',
  'pts': 'PTS',
  'rebound': 'REB',
  'rebounds': 'REB',
  'reb': 'REB',
  'assist': 'AST',
  'assists': 'AST',
  'ast': 'AST',
  'steal': 'STL',
  'steals': 'STL',
  'block': 'BLK',
  'blocks': 'BLK',
  'turnover': 'TO',
  'turnovers': 'TO',
  'three': 'FG3M',
  'threes': 'FG3M',
  '3-pointer': 'FG3M',
  '3-pointers': 'FG3M',
  'three pointer': 'FG3M',
  'three pointers': 'FG3M',
};

const NHL_PROP_STAT_MAP = {
  'goal': 'goals',
  'goals': 'goals',
  'assist': 'assists',
  'assists': 'assists',
  'point': 'points',
  'points': 'points',
  'save': 'saves',
  'saves': 'saves',
  'shot': 'shots',
  'shots': 'shots',
};
const NFL_PROP_STAT_MAP = {
  'passing yard': 'passingYards',
  'passing yards': 'passingYards',
  'passing td': 'passingTouchdowns',
  'passing tds': 'passingTouchdowns',
  'passing touchdown': 'passingTouchdowns',
  'passing touchdowns': 'passingTouchdowns',
  'completion': 'completions',
  'completions': 'completions',
  'interception': 'interceptions',
  'interceptions': 'interceptions',
  'rushing yard': 'rushingYards',
  'rushing yards': 'rushingYards',
  'rushing td': 'rushingTouchdowns',
  'rushing touchdown': 'rushingTouchdowns',
  'receiving yard': 'receivingYards',
  'receiving yards': 'receivingYards',
  'reception': 'receptions',
  'receptions': 'receptions',
  'receiving td': 'receivingTouchdowns',
  'receiving touchdown': 'receivingTouchdowns',
  'sack': 'sacks',
  'sacks': 'sacks',
  'tackle': 'tackles',
  'tackles': 'tackles',
};

function parsePropPick(pick) {
  const lower = pick.toLowerCase();
  const directionMatch = lower.match(/\b(over|under)\b/);
  if (!directionMatch) return null;
  const direction = directionMatch[1];
  const lineMatch = lower.match(/(\d+\.?\d*)/);
  if (!lineMatch) return null;
  const line = parseFloat(lineMatch[1]);
  let statKey = null;
  for (const keyword of Object.keys({...PROP_STAT_MAP, ...NBA_PROP_STAT_MAP, ...NHL_PROP_STAT_MAP, ...NFL_PROP_STAT_MAP})) {
    if (lower.includes(keyword)) { statKey = keyword; break; }
  }
  if (!statKey) return null;
  const playerPart = pick.substring(0, directionMatch.index).trim();
  if (!playerPart) return null;
  return { player: playerPart, direction, line, statKey };
}

function matchPlayerName(propPlayer, fullName) {
  const prop = propPlayer.toLowerCase().trim();
  const full = fullName.toLowerCase().trim();
  if (full.includes(prop) || prop.includes(full)) return true;
  const propLast = prop.split(' ').pop();
  const fullLast = full.split(' ').pop();
  if (propLast && fullLast && propLast === fullLast && propLast.length > 3) return true;
  return false;
}

async function fetchNFLGames(date) {
  try {
    const dateFormatted = date.replace(/-/g, '');
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard?dates=${dateFormatted}`
    );
    const data = await res.json();
    return (data.events || [])
      .filter(e => e.status?.type?.completed)
      .map(e => ({ gameId: e.id, name: e.name }));
  } catch(e) {
    console.error('fetchNFLGames error:', e.message);
    return [];
  }
}

async function fetchNFLBoxScorePlayers(gameId) {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=${gameId}`
    );
    const data = await res.json();
    const players = [];
    const boxscore = data.boxscore?.players || [];
    for (const team of boxscore) {
      for (const statGroup of team.statistics || []) {
        const keys = statGroup.keys || [];
        for (const athlete of statGroup.athletes || []) {
          const stats = {};
          athlete.stats?.forEach((val, i) => { stats[keys[i]] = val; });
          const category = statGroup.name?.toLowerCase();
          const playerStats = {};
          if (category === 'passing') {
            playerStats.passingYards = parseInt(stats['passingYards'] || stats['YDS'] || 0);
            playerStats.passingTouchdowns = parseInt(stats['passingTouchdowns'] || stats['TD'] || 0);
            playerStats.completions = parseInt((stats['completionsAttempts'] || stats['C/ATT'] || '0/0').split('/')[0]);
            playerStats.interceptions = parseInt(stats['interceptions'] || stats['INT'] || 0);
          } else if (category === 'rushing') {
            playerStats.rushingYards = parseInt(stats['rushingYards'] || stats['YDS'] || 0);
            playerStats.rushingTouchdowns = parseInt(stats['rushingTouchdowns'] || stats['TD'] || 0);
          } else if (category === 'receiving') {
            playerStats.receivingYards = parseInt(stats['receivingYards'] || stats['YDS'] || 0);
            playerStats.receptions = parseInt(stats['receptions'] || stats['REC'] || 0);
            playerStats.receivingTouchdowns = parseInt(stats['receivingTouchdowns'] || stats['TD'] || 0);
          } else if (category === 'defensive') {
            playerStats.sacks = parseFloat(stats['sacks'] || stats['SACKS'] || 0);
            playerStats.tackles = parseInt(stats['totalTackles'] || stats['TOT'] || 0);
            playerStats.interceptions = parseInt(stats['interceptions'] || stats['INT'] || 0);
          }
          players.push({
            fullName: athlete.athlete?.displayName || '',
            stats: playerStats,
          });
        }
      }
    }
    return players;
  } catch(e) {
    console.error('fetchNFLBoxScorePlayers error:', e.message);
    return [];
  }
}

async function settleNFLProp(bet) {
  if (!bet.game_date) return null;
  const parsed = parsePropPick(bet.pick);
  if (!parsed) return null;
  const { player, direction, line, statKey } = parsed;
  const statField = NFL_PROP_STAT_MAP[statKey];
  if (!statField) return null;
  const games = await fetchNFLGames(bet.game_date);
  if (!games.length) return null;
  for (const game of games) {
    const players = await fetchNFLBoxScorePlayers(game.gameId);
    const playerData = players.find(p => matchPlayerName(player, p.fullName));
    if (!playerData) continue;
    const actual = parseFloat(playerData.stats[statField]);
    if (isNaN(actual)) continue;
    return direction === 'over' ? (actual > line ? 'Win' : actual === line ? 'Pending' : 'Loss')
                                : (actual < line ? 'Win' : actual === line ? 'Pending' : 'Loss');
  }
  return null;
}
async function fetchMLBGamePks(date) {
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&gameType=R&fields=dates,games,gamePk,status,abstractGameState,teams,away,home,team,name`
    );
    const data = await res.json();
    const games = data.dates?.[0]?.games || [];
    return games
      .filter(g => g.status?.abstractGameState === 'Final')
      .map(g => ({ gamePk: g.gamePk, awayTeam: g.teams?.away?.team?.name, homeTeam: g.teams?.home?.team?.name }));
  } catch { return []; }
}
async function fetchESPNGameId(date, game) {
  try {
    const dateFormatted = date.replace(/-/g, '');
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/scoreboard?dates=${dateFormatted}`
    );
    const data = await res.json();
    const betGame = game.toLowerCase();
    const event = (data.events || []).find(e => {
      const name = e.name.toLowerCase();
      return name.split(' ').filter(w => w.length > 3).some(w => betGame.includes(w));
    });
    return event?.id || null;
  } catch(e) {
    return null;
  }
}

async function fetchF5Score(espnGameId) {
  try {
    const res = await fetch(
      `https://site.api.espn.com/apis/site/v2/sports/baseball/mlb/summary?event=${espnGameId}`
    );
    const data = await res.json();
    const plays = data.plays || [];
    const inning5plays = plays.filter(p => p.period?.number === 5);
    if (!inning5plays.length) return null;
    const last = inning5plays[inning5plays.length - 1];
    // Only settle if bottom of 5th is complete
    if (last.period?.type !== 'End') return null;
    return {
      awayScore: last.awayScore,
      homeScore: last.homeScore,
      away_team: data.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.displayName,
      home_team: data.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.displayName,
    };
  } catch(e) {
    return null;
  }
}

async function settleMLBF5(bet) {
  if (!bet.game_date || !bet.game) return null;
  const espnId = await fetchESPNGameId(bet.game_date, bet.game);
  if (!espnId) return null;
  const f5 = await fetchF5Score(espnId);
  if (!f5) return null;

  const pick = bet.pick.toLowerCase();
  const awayScore = f5.awayScore;
  const homeScore = f5.homeScore;

  // Total bet (Over/Under)
  if (pick.includes('over') || pick.includes('under')) {
    const lineMatch = pick.match(/(\d+\.?\d*)/);
    if (!lineMatch) return null;
    const line = parseFloat(lineMatch[1]);
    const total = awayScore + homeScore;
    const isOver = pick.includes('over');
    return isOver
      ? (total > line ? 'Win' : total === line ? 'Push' : 'Loss')
      : (total < line ? 'Win' : total === line ? 'Push' : 'Loss');
  }

  // Moneyline bet
  const homeName = f5.home_team?.toLowerCase() || '';
  const awayName = f5.away_team?.toLowerCase() || '';
  const pickedHome = homeName.split(' ').filter(w => w.length > 3).some(w => pick.includes(w));
  const pickedAway = awayName.split(' ').filter(w => w.length > 3).some(w => pick.includes(w));
  
  if (!pickedHome && !pickedAway) return null;
  
  const homeWon = homeScore > awayScore;
  const tied = homeScore === awayScore;
  
  if (tied) return 'Push';
  return (pickedHome && homeWon) || (pickedAway && !homeWon) ? 'Win' : 'Loss';
}

async function fetchBoxScorePlayers(gamePk) {
  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/game/${gamePk}/boxscore`);
    const data = await res.json();
    const players = [];
    for (const side of ['away', 'home']) {
      const teamPlayers = data.teams?.[side]?.players || {};
      for (const player of Object.values(teamPlayers)) {
        players.push({ fullName: player.person?.fullName || '', stats: player.stats || {} });
      }
    }
    return players;
  } catch { return []; }
}

async function settleMLBProp(bet) {
  if (!bet.game_date) return null;
  const parsed = parsePropPick(bet.pick);
  if (!parsed) return null;
  const { player, direction, line, statKey } = parsed;
  const statDef = PROP_STAT_MAP[statKey];
  if (!statDef) return null;
  const games = await fetchMLBGamePks(bet.game_date);
  if (!games.length) return null;
  let gamePksToSearch = games.map(g => g.gamePk);
  if (bet.game) {
    const betGame = bet.game.toLowerCase();
    const matchingGame = games.find(g => {
      const away = g.awayTeam?.toLowerCase() || '';
      const home = g.homeTeam?.toLowerCase() || '';
      return betGame.includes(away.split(' ').pop()) || betGame.includes(home.split(' ').pop()) ||
        away.split(' ').some(w => w.length > 3 && betGame.includes(w)) ||
        home.split(' ').some(w => w.length > 3 && betGame.includes(w));
    });
    if (matchingGame) gamePksToSearch = [matchingGame.gamePk];
  }
  for (const gamePk of gamePksToSearch) {
    const players = await fetchBoxScorePlayers(gamePk);
    const playerData = players.find(p => matchPlayerName(player, p.fullName));
    if (!playerData) continue;
    const statValue = playerData.stats[statDef.type]?.[statDef.field];
    if (statValue === undefined || statValue === null) continue;
    let actual = statDef.field === 'inningsPitched' ? parseFloat(statValue) : parseInt(statValue);
    if (isNaN(actual)) continue;
    return direction === 'over' ? (actual > line ? 'Win' : actual === line ? 'Pending' : 'Loss')
                                : (actual < line ? 'Win' : actual === line ? 'Pending' : 'Loss');
  }
  return null;
}

async function fetchNBAGames(date) {
  try {
    const res = await fetch(
      `https://api.balldontlie.io/v1/games?dates[]=${date}&per_page=30`,
      { headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY || 'balldontlie' } }
    );
    const data = await res.json();
    return (data.data || [])
      .filter(g => g.status === 'Final')
      .map(g => ({ gameId: g.id }));
  } catch(e) {
    console.error('fetchNBAGames error:', e.message);
    return [];
  }
}

async function fetchNBABoxScorePlayers(gameId) {
  try {
    const res = await fetch(
      `https://api.balldontlie.io/v1/stats?game_ids[]=${gameId}&per_page=50`,
      { headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY || 'balldontlie' } }
    );
    const data = await res.json();
    return (data.data || []).map(p => ({
      fullName: `${p.player?.first_name || ''} ${p.player?.last_name || ''}`.trim(),
      stats: {
        PTS: p.pts,
        REB: p.reb,
        AST: p.ast,
        STL: p.stl,
        BLK: p.blk,
        TO: p.turnover,
        FG3M: p.fg3m,
      }
    }));
  } catch(e) {
    console.error('fetchNBABoxScorePlayers error:', e.message);
    return [];
  }
}

async function settleNBAProp(bet) {
  if (!bet.game_date) return null;
  const parsed = parsePropPick(bet.pick);
  if (!parsed) return null;
  const { player, direction, line, statKey } = parsed;
  const statField = NBA_PROP_STAT_MAP[statKey];
  if (!statField) return null;
  const games = await fetchNBAGames(bet.game_date);
  if (!games.length) return null;
  for (const game of games) {
    const players = await fetchNBABoxScorePlayers(game.gameId);
    const playerData = players.find(p => matchPlayerName(player, p.fullName));
    if (!playerData) continue;
    const actual = parseInt(playerData.stats[statField]);
    if (isNaN(actual)) continue;
    return direction === 'over' ? (actual > line ? 'Win' : actual === line ? 'Pending' : 'Loss')
                                : (actual < line ? 'Win' : actual === line ? 'Pending' : 'Loss');
  }
  return null;
}

async function fetchNHLGames(date) {
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/score/${date}`);
    const data = await res.json();
    return (data.games || [])
      .filter(g => g.gameState === 'OFF' || g.gameState === 'FINAL')
      .map(g => ({ gameId: g.id }));
  } catch(e) {
    console.error('fetchNHLGames error:', e.message);
    return [];
  }
}

async function fetchNHLBoxScorePlayers(gameId) {
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/gamecenter/${gameId}/boxscore`);
    const data = await res.json();
    const players = [];
    for (const side of ['homeTeam', 'awayTeam']) {
      const team = data.playerByGameStats?.[side];
      if (!team) continue;
      for (const cat of ['forwards', 'defense', 'goalies']) {
        for (const p of team[cat] || []) {
          players.push({
            fullName: `${p.firstName?.default || ''} ${p.lastName?.default || ''}`.trim(),
            stats: {
              goals: p.goals ?? 0,
              assists: p.assists ?? 0,
              points: (p.goals ?? 0) + (p.assists ?? 0),
              saves: p.saveShotsAgainst ?? 0,
              shots: p.shots ?? 0,
            }
          });
        }
      }
    }
    return players;
  } catch(e) {
    console.error('fetchNHLBoxScorePlayers error:', e.message);
    return [];
  }
}

async function settleNHLProp(bet) {
  if (!bet.game_date) return null;
  const parsed = parsePropPick(bet.pick);
  if (!parsed) return null;
  const { player, direction, line, statKey } = parsed;
  const statField = NHL_PROP_STAT_MAP[statKey];
  if (!statField) return null;
  const games = await fetchNHLGames(bet.game_date);
  if (!games.length) return null;
  for (const game of games) {
    const players = await fetchNHLBoxScorePlayers(game.gameId);
    const playerData = players.find(p => matchPlayerName(player, p.fullName));
    if (!playerData) continue;
    const actual = parseFloat(playerData.stats[statField]);
    if (isNaN(actual)) continue;
    return direction === 'over' ? (actual > line ? 'Win' : actual === line ? 'Pending' : 'Loss')
                                : (actual < line ? 'Win' : actual === line ? 'Pending' : 'Loss');
  }
  return null;
}


// Calculate parlay odds from individual leg odds (American format)
function calculateParlayOdds(legOdds) {
  const decimals = legOdds.map(o => {
    const n = parseFloat(o);
    return n >= 0 ? (n / 100) + 1 : (100 / Math.abs(n)) + 1;
  });
  const combined = decimals.reduce((acc, d) => acc * d, 1);
  const american = combined >= 2 ? Math.round((combined - 1) * 100) : Math.round(-100 / (combined - 1));
  return american >= 0 ? `+${american}` : `${american}`;
}

// Settle a single parlay leg
async function settleLeg(leg, allScores) {
  const betType = leg.bet_type?.toLowerCase().replace(/[^a-z]/g, '') || '';
  const sport = leg.sport?.toLowerCase() || '';
  
  if (betType === '1h' || betType === 'firsthalf' || (leg.pick?.toLowerCase() || '').includes('1h ml') || (leg.pick?.toLowerCase() || '').includes('first 5') || (leg.pick?.toLowerCase() || '').includes('f5')) {
    if (sport === 'mlb' || sport === 'baseball') return await settleMLBF5(leg);
  } else if (betType?.includes('prop') || betType?.includes('player')) {
    if (sport === 'mlb' || sport === 'baseball') return await settleMLBProp(leg);
    if (sport === 'nba' || sport === 'basketball') return await settleNBAProp(leg);
    if (sport === 'nhl' || sport === 'hockey') return await settleNHLProp(leg);
    return null;
  }
  
  const match = findMatchingGame(leg, allScores);
  if (!match) return null;
  return determineResult(leg, match);
}

// Settle all pending parlays
async function settleParlays(allScores) {
  const { data: pendingParlays, error } = await supabase
    .from('parlays')
    .select('*, parlay_legs(*)')
    .eq('result', 'Pending');
  
  if (error || !pendingParlays?.length) return { settled: 0, log: [] };
  
  let settled = 0;
  const log = [];

  for (const parlay of pendingParlays) {
    const legs = parlay.parlay_legs || [];
    if (!legs.length) continue;

    const legResults = [];

    for (const leg of legs) {
      // Build a bet-like object for the leg
      const legBet = {
        id: leg.id,
        sport: leg.sport,
        game: leg.game,
        bet_type: leg.pick?.toLowerCase().includes('over') || leg.pick?.toLowerCase().includes('under') ? 'total' : 'moneyline',
        pick: leg.pick,
        odds: leg.odds,
        amount: parlay.wager,
        game_date: leg.game_date,
        game_time: leg.game_time,
        game_id: leg.game_id,
      };

      const result = await settleLeg(legBet, allScores);
      legResults.push({ leg, result });

      if (result && result !== leg.result) {
        await supabase.from('parlay_legs').update({ result }).eq('id', leg.id);
      }
    }

    // Determine parlay result
    const isTeaser = parlay.bet_type === 'teaser';
    const results = legResults.map(r => r.result);
    const allSettled = results.every(r => r !== null);
    
    if (!allSettled) continue; // Wait for all legs to settle

    let parlayResult = null;

    if (isTeaser) {
      // Teaser: any Loss or Push = Loss, all Win = Win
      if (results.some(r => r === 'Loss' || r === 'Push')) parlayResult = 'Loss';
      else if (results.every(r => r === 'Win')) parlayResult = 'Win';
    } else {
      // Parlay/SGP: any Loss = Loss, mix of Win+Push = Win with recalculated odds
      if (results.some(r => r === 'Loss')) {
        parlayResult = 'Loss';
      } else if (results.every(r => r === 'Win' || r === 'Push')) {
        parlayResult = 'Win';
        // Recalculate odds if any legs pushed
        const winningLegs = legResults.filter(r => r.result === 'Win');
        if (winningLegs.length < legs.length) {
          const winningOdds = winningLegs.map(r => r.leg.odds).filter(Boolean);
          if (winningOdds.length > 0) {
            const newOdds = winningOdds.length === 1 ? winningOdds[0] : calculateParlayOdds(winningOdds);
            const newToWin = winningOdds.length === 0 ? parlay.wager :
              parseFloat(newOdds) >= 0 
                ? (parseFloat(newOdds) / 100) * parlay.wager
                : (100 / Math.abs(parseFloat(newOdds))) * parlay.wager;
            await supabase.from('parlays').update({ 
              result: parlayResult, 
              adjusted_odds: newOdds,
              adjusted_to_win: Math.round(newToWin * 100) / 100
            }).eq('id', parlay.id);
          }
        } else {
          await supabase.from('parlays').update({ result: parlayResult }).eq('id', parlay.id);
        }
        settled++;
        log.push({ id: parlay.id, type: parlay.bet_type, result: parlayResult, legs: results });
        continue;
      }
    }

    if (parlayResult) {
      await supabase.from('parlays').update({ result: parlayResult }).eq('id', parlay.id);
      settled++;
      log.push({ id: parlay.id, type: parlay.bet_type, result: parlayResult, legs: results });
    }
  }

  return { settled, log };
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
      const sport = bet.sport?.toLowerCase();
      const key = SPORT_MAP[sport];
      if (key) sportsNeeded.add(key);
      if (sport === 'soccer') {
        sportsNeeded.add('soccer_usa_mls');
        sportsNeeded.add('soccer_fifa_world_cup');
        sportsNeeded.add('soccer_uefa_champs_league');
        sportsNeeded.add('soccer_uefa_europa_league');
        sportsNeeded.add('soccer_conmebol_copa_libertadores');
        sportsNeeded.add('soccer_epl');
        sportsNeeded.add('soccer_spain_la_liga');
        sportsNeeded.add('soccer_germany_bundesliga');
        sportsNeeded.add('soccer_italy_serie_a');
        sportsNeeded.add('soccer_france_ligue_one');
      }
    }

    const apiKey = process.env.ODDS_API_KEY;
    const scoresPromises = [...sportsNeeded].map(sport =>
      fetch(`https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${apiKey}&daysFrom=3&dateFormat=iso`)
        .then(r => r.json())
        .catch(() => [])
    );
    const scoresResults = await Promise.all(scoresPromises);
    // Also add sports from pending parlay legs
    const { data: pendingParlays } = await supabase
      .from('parlays')
      .select('*, parlay_legs(*)')
      .eq('result', 'Pending');
    for (const parlay of pendingParlays || []) {
      for (const leg of parlay.parlay_legs || []) {
        const legSport = leg.sport?.toLowerCase();
        const legKey = SPORT_MAP[legSport];
        if (legKey) sportsNeeded.add(legKey);
        if (legSport === 'soccer') {
          sportsNeeded.add('soccer_usa_mls');
          sportsNeeded.add('soccer_fifa_world_cup');
          sportsNeeded.add('soccer_uefa_champs_league');
          sportsNeeded.add('soccer_epl');
          sportsNeeded.add('soccer_spain_la_liga');
          sportsNeeded.add('soccer_germany_bundesliga');
          sportsNeeded.add('soccer_italy_serie_a');
          sportsNeeded.add('soccer_france_ligue_one');
          sportsNeeded.add('soccer_uefa_europa_league');
          sportsNeeded.add('soccer_conmebol_copa_libertadores');
        }
      }
    }
    const allScores = scoresResults.flat().filter(g => g.completed === true);

    let settled = 0;
    const settlementLog = [];

    for (const bet of pendingBets) {
      const betType = bet.bet_type?.toLowerCase().replace(/[^a-z]/g, '');
      const sport = bet.sport?.toLowerCase();
      const pick = bet.pick?.toLowerCase() || '';
      let result = null;

      if (betType === '1h' || betType === 'firsthalf' || pick.includes('1h ml') || pick.includes('first 5') || pick.includes('f5')) {
        if (sport === 'mlb' || sport === 'baseball') {
          result = await settleMLBF5(bet);
          settlementLog.push({ id: bet.id, pick: bet.pick, method: 'espn_f5', result });
        }
      } else if (betType?.includes('prop') || betType?.includes('player')) {
        if (sport === 'mlb' || sport === 'baseball') {
          result = await settleMLBProp(bet);
          settlementLog.push({ id: bet.id, pick: bet.pick, method: 'mlb_stats', result });
        } else if (sport === 'nba' || sport === 'basketball') {
          result = await settleNBAProp(bet);
          settlementLog.push({ id: bet.id, pick: bet.pick, method: 'nba_stats', result });
        } else if (sport === 'nhl' || sport === 'hockey') {
          result = await settleNHLProp(bet);
          settlementLog.push({ id: bet.id, pick: bet.pick, method: 'nhl_stats', result });
        } else if (sport === 'nfl' || sport === 'football') {
          result = await settleNFLProp(bet);
          settlementLog.push({ id: bet.id, pick: bet.pick, method: 'nfl_espn', result });
        }
      } else {
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

    // Settle parlays
    const { settled: parlaySettled, log: parlayLog } = await settleParlays(allScores);
    settled += parlaySettled;

    // Settle daily picks
    const { settled: picksSettled, log: picksLog } = await settleDailyPicks(allScores);

    return Response.json({
      success: true,
      settled,
      total: pendingBets.length,
      sportsQueried: [...sportsNeeded],
      log: [...settlementLog, ...parlayLog],
      parlayLog,
      picksSettled,
      picksLog,
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
    const teamMatch = betGame.includes(home) || betGame.includes(away) ||
      home.split(' ').some(w => w.length > 3 && betGame.includes(w)) ||
      away.split(' ').some(w => w.length > 3 && betGame.includes(w));
    return dateMatch && teamMatch;
  });
}

function determineResult(bet, game) {
  if (!game.scores || game.scores.length < 2) return null;
  const homeScore = parseInt(game.scores.find(s => s.name === game.home_team)?.score);
  const awayScore = parseInt(game.scores.find(s => s.name === game.away_team)?.score);
  if (isNaN(homeScore) || isNaN(awayScore)) return null;
  const pick = bet.pick.toLowerCase();
  const betType = bet.bet_type?.toLowerCase().replace(/[^a-z]/g, '');

  // 1H bets are handled separately via settleMLBF5 before reaching here
  const isOverUnder = pick.includes('over') || pick.includes('under');
  const isMoneyline = !isOverUnder && (betType === 'moneyline' || (betType === 'straight' && (pick.includes('ml') || !pick.match(/[+-]?\d+\.?\d+/))));
  if (isMoneyline) {
    const homeWon = homeScore > awayScore;
    const pickedHome = pick.includes(game.home_team.toLowerCase().split(' ').pop());
    return (homeWon === pickedHome) ? 'Win' : 'Loss';
  }
  if (['spread', 'straight', 'runline'].includes(betType) && !isOverUnder) {
    const spreadMatch = pick.match(/([+-]?\d+\.?\d*)/);
    if (!spreadMatch) return null;
    const spread = parseFloat(spreadMatch[1]);
    const pickedHome = pick.includes(game.home_team.toLowerCase().split(' ').pop());
    const diff = pickedHome ? homeScore - awayScore : awayScore - homeScore;
    return (diff + spread > 0) ? 'Win' : (diff + spread === 0) ? 'Push' : 'Loss';
  }
  if (isOverUnder || ['totalou', 'total', 'over', 'under', 'totalrunsoverunder', 'overunder', 'totalpointsoverunder', 'totalgoalsoverunder'].includes(betType)) {
    const totalMatch = pick.match(/(\d+\.?\d*)/);
    if (!totalMatch) return null;
    const total = parseFloat(totalMatch[1]);
    const actual = homeScore + awayScore;
    const isOver = pick.includes('over') || betType === 'over';
    return isOver ? (actual > total ? 'Win' : actual === total ? 'Push' : 'Loss')
                  : (actual < total ? 'Win' : actual === total ? 'Push' : 'Loss');
  }
  return null;
  if (isMoneyline) {
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
    return (diff + spread > 0) ? 'Win' : (diff + spread === 0) ? 'Push' : 'Loss';
  }

  if (['totalou', 'total', 'over', 'under', 'totalrunsoverunder', 'overunder', 'totalpointsoverunder', 'totalgoalsoverunder'].includes(betType)) {
    const totalMatch = pick.match(/(\d+\.?\d*)/);
    if (!totalMatch) return null;
    const total = parseFloat(totalMatch[1]);
    const actual = homeScore + awayScore;
    const isOver = pick.includes('over') || betType === 'over';
    return isOver ? (actual > total ? 'Win' : actual === total ? 'Push' : 'Loss')
                  : (actual < total ? 'Win' : actual === total ? 'Push' : 'Loss');
  }

  return null;
}

async function settleDailyPicks(allScores) {
  const { data: pendingPicks, error } = await supabase
    .from('daily_picks')
    .select('*')
    .or('result.eq.Pending,result.is.null')
    .eq('status', 'active');

  if (error || !pendingPicks?.length) return { settled: 0, log: [] };

  let settled = 0;
  const log = [];

  for (const pick of pendingPicks) {
    const betLike = {
      game: pick.game,
      pick: pick.pick,
      bet_type: pick.pick?.toLowerCase().includes('over') || pick.pick?.toLowerCase().includes('under') ? 'total' : pick.pick?.match(/[+-]\d+\.?\d+/) ? 'runline' : 'moneyline',
      odds: pick.odds,
      amount: pick.units || 1,
      game_date: pick.date,
      sport: pick.sport,
    };

    const pickLower = pick.pick?.toLowerCase() || '';
    const sport = pick.sport?.toLowerCase() || '';
    const isProp = (pickLower.includes('over ') || pickLower.includes('under ')) && (pickLower.includes('strikeout') || pickLower.includes('point') || pickLower.includes('rebound') || pickLower.includes('assist') || pickLower.includes('hit') || pickLower.includes('goal') || pickLower.includes('save') || pickLower.includes('shot'));
    let result = null;
    if (isProp) {
      const betLike2 = { pick: pick.pick, game: pick.game, game_date: pick.date, sport: pick.sport };
      if (sport === 'mlb' || sport === 'baseball') result = await settleMLBProp(betLike2);
      else if (sport === 'nba' || sport === 'basketball') result = await settleNBAProp(betLike2);
      else if (sport === 'nhl' || sport === 'hockey') result = await settleNHLProp(betLike2);
    } else {
      const match = findMatchingGame(betLike, allScores);
      if (match) result = determineResult(betLike, match);
    }

    await supabase
      .from('daily_picks')
      .update({ result })
      .eq('id', pick.id);

    settled++;
    log.push({ id: pick.id, pick: pick.pick, game: pick.game, result });
  }

  return { settled, log };
}

export async function POST(request) {
  return GET(request);
}
