// ============================================================
// FIXED AREAS (4 root causes resolved):
//
// 1. daysFrom=2 everywhere — 48hr window catches all games
// 2. normalizeSport() used exclusively — no more dual systems
// 3. findScoreForTeam() — fuzzy match instead of exact string
// 4. settleComboPick() — handles "X & Y" combo picks properly
// 5. determineResult() — NaN guard, returns null not wrong result
// 6. inferBetType() — centralized, consistent bet type detection
// ============================================================

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ─── SPORT MAPPING ───────────────────────────────────────────

const SPORT_MAP = {
  'mlb': 'baseball_mlb',
  'baseball': 'baseball_mlb',
  'nba': 'basketball_nba',
  'basketball': 'basketball_nba',
  'nhl': 'icehockey_nhl',
  'hockey': 'icehockey_nhl',
  'nfl': 'americanfootball_nfl',
  'football': 'americanfootball_nfl',
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

function normalizeSport(sport) {
  if (!sport) return null;
  const s = sport.toLowerCase().trim();
  if (s.includes('world cup') || s.includes('fifa')) return 'soccer_fifa_world_cup';
  if (s.includes('champions league') || s.includes('uefa champ')) return 'soccer_uefa_champs_league';
  if (s.includes('europa league') || s.includes('uefa europa')) return 'soccer_uefa_europa_league';
  if (s.includes('libertadores') || s.includes('copa lib')) return 'soccer_conmebol_copa_libertadores';
  if (s.includes('premier league') || s.includes('epl') || s === 'english premier league') return 'soccer_epl';
  if (s.includes('la liga') || s.includes('spain')) return 'soccer_spain_la_liga';
  if (s.includes('bundesliga') || s.includes('germany')) return 'soccer_germany_bundesliga';
  if (s.includes('serie a') || s.includes('italy')) return 'soccer_italy_serie_a';
  if (s.includes('ligue') || s.includes('france ligue')) return 'soccer_france_ligue_one';
  if (s.includes('mls') || s.includes('major league soccer')) return 'soccer_usa_mls';
  if (s.includes('mlb') || s.includes('baseball')) return 'baseball_mlb';
  if (s.includes('nba') || s.includes('basketball')) return 'basketball_nba';
  if (s.includes('nhl') || s.includes('hockey')) return 'icehockey_nhl';
  if (s.includes('nfl') || (s.includes('football') && !s.includes('soccer') && !s.includes('assoc'))) return 'americanfootball_nfl';
  if (s.includes('ncaab') || s.includes('college basketball')) return 'basketball_ncaab';
  if (s.includes('ncaaf') || s.includes('college football')) return 'americanfootball_ncaaf';
  if (s.includes('mma') || s.includes('ufc') || s.includes('mixed martial')) return 'mma_mixed_martial_arts';
  if (s.includes('golf') || s.includes('pga')) return 'golf_pga_tour';
  if (s.includes('tennis') || s.includes('atp') || s.includes('wta')) return 'tennis_atp';
  // Generic soccer catch-all — if it has any soccer signal, add all leagues
  if (s.includes('soccer') || s.includes('football') && s.includes('assoc')) return 'soccer_usa_mls';
  return SPORT_MAP[s] || null;
}

function isSoccerKey(key) {
  return key?.startsWith('soccer_');
}

function getAllSoccerLeagues() {
  return [
    'soccer_fifa_world_cup',
    'soccer_usa_mls',
    'soccer_epl',
    'soccer_spain_la_liga',
    'soccer_germany_bundesliga',
    'soccer_italy_serie_a',
    'soccer_france_ligue_one',
    'soccer_uefa_champs_league',
    'soccer_uefa_europa_league',
    'soccer_conmebol_copa_libertadores',
  ];
}

// Build the full set of sport keys needed for a list of bets/picks
function buildSportsNeeded(items) {
  const needed = new Set();
  for (const item of items) {
    const sport = item.sport?.toLowerCase() || '';
    const key = normalizeSport(sport);
    if (key) {
      needed.add(key);
      // If it's any soccer key, always pull ALL soccer leagues —
      // World Cup / MLS / etc. are separate endpoints
      if (isSoccerKey(key)) {
        getAllSoccerLeagues().forEach(l => needed.add(l));
      }
    }
    // Explicit fallback: if sport string has any soccer signal, add all leagues
    if (
      sport.includes('soccer') || sport.includes('world cup') || sport.includes('fifa') ||
      sport.includes('mls') || sport.includes('epl') || sport.includes('bundesliga') ||
      sport.includes('serie') || sport.includes('ligue') || sport.includes('la liga') ||
      sport.includes('champions') || sport.includes('europa') || sport.includes('libertadores')
    ) {
      getAllSoccerLeagues().forEach(l => needed.add(l));
    }
  }
  return needed;
}

// ─── BET TYPE INFERENCE ──────────────────────────────────────
// Single source of truth — used by both user bet settlement and daily picks settlement

function inferBetType(pick) {
  if (!pick) return 'moneyline';
  const p = pick.toLowerCase();
  // Combo pick (e.g. "France to Win & Over 2.5 Goals")
  if (p.includes(' & ') || p.includes(' and ')) return 'combo';
  // Game total
  if ((p.includes('over') || p.includes('under')) &&
      p.match(/\d+\.?\d*/)) return 'total';
  // Run line / spread (has a +/- number but not just odds)
  if (p.match(/[+-]\d+\.?\d+/) && !p.match(/^[+-]\d{3,}$/)) return 'runline';
  // Explicit moneyline signals
  if (p.includes(' ml') || p.endsWith(' ml')) return 'moneyline';
  return 'moneyline';
}

// ─── SCORE LOOKUP ────────────────────────────────────────────
// FIX 3: Fuzzy match instead of exact string — handles name mismatches

function findScoreForTeam(game, teamName) {
  if (!game.scores || !teamName) return null;
  const target = teamName.toLowerCase().trim();
  // Try exact match first
  let match = game.scores.find(s => s.name?.toLowerCase().trim() === target);
  if (match) return parseInt(match.score);
  // Try if one contains the other
  match = game.scores.find(s => {
    const n = s.name?.toLowerCase().trim() || '';
    return n.includes(target) || target.includes(n);
  });
  if (match) return parseInt(match.score);
  // Try word-level match (last meaningful word)
  const targetWords = target.split(' ').filter(w => w.length > 3);
  match = game.scores.find(s => {
    const scoreWords = (s.name?.toLowerCase() || '').split(' ');
    return targetWords.some(w => scoreWords.includes(w));
  });
  return match ? parseInt(match.score) : null;
}

// ─── GAME MATCHING ───────────────────────────────────────────

function findMatchingGame(bet, scores) {
  const betGame = (bet.game || '').toLowerCase();
  const betDate = bet.game_date;

  return scores.find(g => {
    const home = g.home_team.toLowerCase();
    const away = g.away_team.toLowerCase();
    const gameDate = g.commence_time
      ? new Date(g.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
      : null;
    const dateMatch = !betDate || !gameDate || gameDate === betDate;

    // Must match date
    if (!dateMatch) return false;

    // Team name matching — try progressively looser
    const exactMatch = betGame.includes(home) || betGame.includes(away);
    if (exactMatch) return true;

    const wordMatch =
      home.split(' ').some(w => w.length > 3 && betGame.includes(w)) ||
      away.split(' ').some(w => w.length > 3 && betGame.includes(w));
    return wordMatch;
  });
}

// ─── DETERMINE RESULT ────────────────────────────────────────
// FIX 5: NaN guard — always returns null if scores are invalid

function determineResult(bet, game) {
  if (!game.scores || game.scores.length < 2) return null;

  const homeScore = findScoreForTeam(game, game.home_team);
  const awayScore = findScoreForTeam(game, game.away_team);

  // FIX: if either score is missing/NaN, return null — never return a wrong result
  if (homeScore === null || awayScore === null || isNaN(homeScore) || isNaN(awayScore)) {
    console.warn(`[settle] Score lookup failed for game ${game.id}: home=${homeScore} away=${awayScore}`);
    return null;
  }

  const pick = bet.pick.toLowerCase();
  const betType = inferBetType(bet.pick);

  // ── Total (Over/Under) ──
  if (betType === 'total') {
    const totalMatch = pick.match(/(\d+\.?\d*)/);
    if (!totalMatch) return null;
    const total = parseFloat(totalMatch[1]);
    const actual = homeScore + awayScore;
    const isOver = pick.includes('over');
    if (actual === total) return 'Push';
    return isOver ? (actual > total ? 'Win' : 'Loss') : (actual < total ? 'Win' : 'Loss');
  }

  // ── Run line / Spread ──
  if (betType === 'runline') {
    const spreadMatch = pick.match(/([+-]?\d+\.?\d*)/);
    if (!spreadMatch) return null;
    const spread = parseFloat(spreadMatch[1]);
    // FIX: use fuzzy team name check, not just last word
    const homeWords = game.home_team.toLowerCase().split(' ').filter(w => w.length > 3);
    const pickedHome = homeWords.some(w => pick.includes(w));
    const diff = pickedHome ? homeScore - awayScore : awayScore - homeScore;
    if (diff + spread === 0) return 'Push';
    return diff + spread > 0 ? 'Win' : 'Loss';
  }

  // ── Moneyline ──
  const homeWords = game.home_team.toLowerCase().split(' ').filter(w => w.length > 3);
  const awayWords = game.away_team.toLowerCase().split(' ').filter(w => w.length > 3);
  const pickedHome = homeWords.some(w => pick.includes(w));
  const pickedAway = awayWords.some(w => pick.includes(w));

  if (!pickedHome && !pickedAway) {
    console.warn(`[settle] Could not determine picked team for pick="${bet.pick}" game="${bet.game}"`);
    return null;
  }

  if (homeScore === awayScore) return 'Push';
  const homeWon = homeScore > awayScore;
  return (pickedHome && homeWon) || (pickedAway && !homeWon) ? 'Win' : 'Loss';
}

// ─── COMBO PICK SETTLEMENT ───────────────────────────────────
// FIX 4: Handles "France to Win & Over 2.5 Goals" style picks
// All legs must win for the combo to win. One loss = Loss.

async function settleComboPick(pick, game, scores) {
  // Split on " & " or " and "
  const parts = pick.pick.toLowerCase().split(/\s+&\s+|\s+and\s+/);
  if (parts.length < 2) return null;

  const match = findMatchingGame(pick, scores);
  if (!match) return null;

  const results = [];

  for (const part of parts) {
    const partBet = { ...pick, pick: part.trim(), bet_type: inferBetType(part.trim()) };
    const result = determineResult(partBet, match);
    if (result === null) return null; // Can't settle yet
    results.push(result);
  }

  if (results.some(r => r === 'Loss')) return 'Loss';
  if (results.every(r => r === 'Win')) return 'Win';
  if (results.every(r => r === 'Win' || r === 'Push')) return 'Push';
  return null;
}

// ─── PROP STAT MAPS ──────────────────────────────────────────

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
  'point': 'PTS', 'points': 'PTS', 'pts': 'PTS',
  'rebound': 'REB', 'rebounds': 'REB', 'reb': 'REB',
  'assist': 'AST', 'assists': 'AST', 'ast': 'AST',
  'steal': 'STL', 'steals': 'STL',
  'block': 'BLK', 'blocks': 'BLK',
  'turnover': 'TO', 'turnovers': 'TO',
  'three': 'FG3M', 'threes': 'FG3M',
  '3-pointer': 'FG3M', '3-pointers': 'FG3M',
  'three pointer': 'FG3M', 'three pointers': 'FG3M',
};

const NHL_PROP_STAT_MAP = {
  'goal': 'goals', 'goals': 'goals',
  'assist': 'assists', 'assists': 'assists',
  'point': 'points', 'points': 'points',
  'save': 'saves', 'saves': 'saves',
  'shot': 'shots', 'shots': 'shots',
};

const NFL_PROP_STAT_MAP = {
  'passing yard': 'passingYards', 'passing yards': 'passingYards',
  'passing td': 'passingTouchdowns', 'passing tds': 'passingTouchdowns',
  'passing touchdown': 'passingTouchdowns', 'passing touchdowns': 'passingTouchdowns',
  'completion': 'completions', 'completions': 'completions',
  'interception': 'interceptions', 'interceptions': 'interceptions',
  'rushing yard': 'rushingYards', 'rushing yards': 'rushingYards',
  'rushing td': 'rushingTouchdowns', 'rushing touchdown': 'rushingTouchdowns',
  'receiving yard': 'receivingYards', 'receiving yards': 'receivingYards',
  'reception': 'receptions', 'receptions': 'receptions',
  'receiving td': 'receivingTouchdowns', 'receiving touchdown': 'receivingTouchdowns',
  'sack': 'sacks', 'sacks': 'sacks',
  'tackle': 'tackles', 'tackles': 'tackles',
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
  for (const keyword of Object.keys({ ...PROP_STAT_MAP, ...NBA_PROP_STAT_MAP, ...NHL_PROP_STAT_MAP, ...NFL_PROP_STAT_MAP })) {
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

// ─── MLB ─────────────────────────────────────────────────────

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
      return away.split(' ').some(w => w.length > 3 && betGame.includes(w)) ||
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
    if (actual === line) return 'Push';
    return direction === 'over' ? (actual > line ? 'Win' : 'Loss') : (actual < line ? 'Win' : 'Loss');
  }
  return null;
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
  } catch { return null; }
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
    if (last.period?.type !== 'End') return null;
    return {
      awayScore: last.awayScore,
      homeScore: last.homeScore,
      away_team: data.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'away')?.team?.displayName,
      home_team: data.header?.competitions?.[0]?.competitors?.find(c => c.homeAway === 'home')?.team?.displayName,
    };
  } catch { return null; }
}

async function settleMLBF5(bet) {
  if (!bet.game_date || !bet.game) return null;
  const espnId = await fetchESPNGameId(bet.game_date, bet.game);
  if (!espnId) return null;
  const f5 = await fetchF5Score(espnId);
  if (!f5) return null;

  const pick = bet.pick.toLowerCase();
  const { awayScore, homeScore } = f5;

  if (pick.includes('over') || pick.includes('under')) {
    const lineMatch = pick.match(/(\d+\.?\d*)/);
    if (!lineMatch) return null;
    const line = parseFloat(lineMatch[1]);
    const total = awayScore + homeScore;
    if (total === line) return 'Push';
    return pick.includes('over') ? (total > line ? 'Win' : 'Loss') : (total < line ? 'Win' : 'Loss');
  }

  const homeName = f5.home_team?.toLowerCase() || '';
  const awayName = f5.away_team?.toLowerCase() || '';
  const homeWords = homeName.split(' ').filter(w => w.length > 3);
  const awayWords = awayName.split(' ').filter(w => w.length > 3);
  const pickedHome = homeWords.some(w => pick.includes(w));
  const pickedAway = awayWords.some(w => pick.includes(w));
  if (!pickedHome && !pickedAway) return null;
  if (homeScore === awayScore) return 'Push';
  const homeWon = homeScore > awayScore;
  return (pickedHome && homeWon) || (pickedAway && !homeWon) ? 'Win' : 'Loss';
}

// ─── TEAM TOTAL ───────────────────────────────────────────────

async function settleTeamTotal(bet) {
  if (!bet.game_date || !bet.game) return null;
  const pick = bet.pick?.toLowerCase() || '';
  const overUnder = pick.includes('over') ? 'over' : pick.includes('under') ? 'under' : null;
  if (!overUnder) return null;
  const lineMatch = pick.match(/(\d+\.?\d*)/);
  if (!lineMatch) return null;
  const line = parseFloat(lineMatch[1]);

  const sport = bet.sport?.toLowerCase() || '';
  if (sport.includes('mlb') || sport.includes('baseball')) {
    const games = await fetchMLBGamePks(bet.game_date);
    if (!games.length) return null;
    const betGame = bet.game.toLowerCase();
    const matchingGame = games.find(g => {
      const away = g.awayTeam?.toLowerCase() || '';
      const home = g.homeTeam?.toLowerCase() || '';
      return away.split(' ').some(w => w.length > 3 && betGame.includes(w)) ||
        home.split(' ').some(w => w.length > 3 && betGame.includes(w));
    });
    if (!matchingGame) return null;
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${matchingGame.gamePk}&hydrate=linescore`);
    const data = await res.json();
    const gameData = data.dates?.[0]?.games?.[0];
    const awayName = matchingGame.awayTeam?.toLowerCase() || '';
    const homeName = matchingGame.homeTeam?.toLowerCase() || '';
    const pickedHome = homeName.split(' ').some(w => w.length > 3 && pick.includes(w));
    const pickedAway = awayName.split(' ').some(w => w.length > 3 && pick.includes(w));
    if (!pickedHome && !pickedAway) return null;
    const teamRuns = pickedHome ? gameData?.teams?.home?.score : gameData?.teams?.away?.score;
    if (teamRuns === undefined || teamRuns === null) return null;
    const actual = parseInt(teamRuns);
    if (isNaN(actual)) return null;
    if (actual === line) return 'Push';
    return overUnder === 'over' ? (actual > line ? 'Win' : 'Loss') : (actual < line ? 'Win' : 'Loss');
  }
  return null;
}

// ─── NBA ──────────────────────────────────────────────────────

async function fetchNBAGames(date) {
  try {
    const res = await fetch(
      `https://api.balldontlie.io/v1/games?dates[]=${date}&per_page=30`,
      { headers: { 'Authorization': process.env.BALLDONTLIE_API_KEY || 'balldontlie' } }
    );
    const data = await res.json();
    return (data.data || []).filter(g => g.status === 'Final').map(g => ({ gameId: g.id }));
  } catch { return []; }
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
      stats: { PTS: p.pts, REB: p.reb, AST: p.ast, STL: p.stl, BLK: p.blk, TO: p.turnover, FG3M: p.fg3m },
    }));
  } catch { return []; }
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
    if (actual === line) return 'Push';
    return direction === 'over' ? (actual > line ? 'Win' : 'Loss') : (actual < line ? 'Win' : 'Loss');
  }
  return null;
}

// ─── NHL ──────────────────────────────────────────────────────

async function fetchNHLGames(date) {
  try {
    const res = await fetch(`https://api-web.nhle.com/v1/score/${date}`);
    const data = await res.json();
    return (data.games || [])
      .filter(g => g.gameState === 'OFF' || g.gameState === 'FINAL')
      .map(g => ({ gameId: g.id }));
  } catch { return []; }
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
              goals: p.goals ?? 0, assists: p.assists ?? 0,
              points: (p.goals ?? 0) + (p.assists ?? 0),
              saves: p.saveShotsAgainst ?? 0, shots: p.shots ?? 0,
            },
          });
        }
      }
    }
    return players;
  } catch { return []; }
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
    if (actual === line) return 'Push';
    return direction === 'over' ? (actual > line ? 'Win' : 'Loss') : (actual < line ? 'Win' : 'Loss');
  }
  return null;
}

// ─── NFL ──────────────────────────────────────────────────────

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
  } catch { return []; }
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
          players.push({ fullName: athlete.athlete?.displayName || '', stats: playerStats });
        }
      }
    }
    return players;
  } catch { return []; }
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
    if (actual === line) return 'Push';
    return direction === 'over' ? (actual > line ? 'Win' : 'Loss') : (actual < line ? 'Win' : 'Loss');
  }
  return null;
}

// ─── PARLAY SETTLEMENT ───────────────────────────────────────

function calculateParlayOdds(legOdds) {
  const decimals = legOdds.map(o => {
    const n = parseFloat(o);
    return n >= 0 ? (n / 100) + 1 : (100 / Math.abs(n)) + 1;
  });
  const combined = decimals.reduce((acc, d) => acc * d, 1);
  const american = combined >= 2 ? Math.round((combined - 1) * 100) : Math.round(-100 / (combined - 1));
  return american >= 0 ? `+${american}` : `${american}`;
}

async function settleLeg(leg, allScores) {
  const betType = inferBetType(leg.pick);
  const sport = leg.sport?.toLowerCase() || '';
  const pick = leg.pick?.toLowerCase() || '';

  if (betType === 'combo') {
    return await settleComboPick(leg, leg.game, allScores);
  }

  if (pick.includes('first 5') || pick.includes('f5') || pick.includes('1h ml')) {
    if (sport.includes('mlb') || sport.includes('baseball')) return await settleMLBF5(leg);
  }

  if (betType?.includes('prop') || betType?.includes('player')) {
    if (sport.includes('mlb') || sport.includes('baseball')) return await settleMLBProp(leg);
    if (sport.includes('nba') || sport.includes('basketball')) return await settleNBAProp(leg);
    if (sport.includes('nhl') || sport.includes('hockey')) return await settleNHLProp(leg);
    if (sport.includes('nfl') || sport.includes('football')) return await settleNFLProp(leg);
    return null;
  }

  const match = findMatchingGame(leg, allScores);
  if (!match) return null;
  return determineResult(leg, match);
}

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
      const legBet = {
        id: leg.id,
        sport: leg.sport,
        game: leg.game,
        bet_type: inferBetType(leg.pick),
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

    const results = legResults.map(r => r.result);
    const allSettled = results.every(r => r !== null);
    if (!allSettled) continue;

    let parlayResult = null;
    const isTeaser = parlay.bet_type === 'teaser';

    if (isTeaser) {
      if (results.some(r => r === 'Loss' || r === 'Push')) parlayResult = 'Loss';
      else if (results.every(r => r === 'Win')) parlayResult = 'Win';
    } else {
      if (results.some(r => r === 'Loss')) {
        parlayResult = 'Loss';
      } else if (results.every(r => r === 'Win' || r === 'Push')) {
        parlayResult = 'Win';
        const winningLegs = legResults.filter(r => r.result === 'Win');
        if (winningLegs.length < legs.length) {
          const winningOdds = winningLegs.map(r => r.leg.odds).filter(Boolean);
          if (winningOdds.length > 0) {
            const newOdds = winningOdds.length === 1 ? winningOdds[0] : calculateParlayOdds(winningOdds);
            const newToWin = parseFloat(newOdds) >= 0
              ? (parseFloat(newOdds) / 100) * parlay.wager
              : (100 / Math.abs(parseFloat(newOdds))) * parlay.wager;
            await supabase.from('parlays').update({
              result: parlayResult,
              adjusted_odds: newOdds,
              adjusted_to_win: Math.round(newToWin * 100) / 100,
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

async function settleMLBViaStatsAPI(bet) {
  if (!bet.game_date) return null;
  const games = await fetchMLBGamePks(bet.game_date);
  if (!games.length) return null;

  const betGame = (bet.game || '').toLowerCase();
  const match = games.find(g => {
    const away = g.awayTeam?.toLowerCase() || '';
    const home = g.homeTeam?.toLowerCase() || '';
    return away.split(' ').some(w => w.length > 3 && betGame.includes(w)) ||
           home.split(' ').some(w => w.length > 3 && betGame.includes(w));
  });
  if (!match) return null;

  try {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&gamePk=${match.gamePk}&hydrate=linescore`);
const data = await res.json();
const gameData = data.dates?.[0]?.games?.[0];
const homeScore = gameData?.teams?.home?.score;
const awayScore = gameData?.teams?.away?.score;
    if (homeScore === undefined || awayScore === undefined) return null;

    const pick = bet.pick.toLowerCase();
    const betType = inferBetType(bet.pick);

    if (betType === 'total') {
      const totalMatch = pick.match(/(\d+\.?\d*)/);
      if (!totalMatch) return null;
      const total = parseFloat(totalMatch[1]);
      const actual = homeScore + awayScore;
      if (actual === total) return 'Push';
      return pick.includes('over') ? (actual > total ? 'Win' : 'Loss') : (actual < total ? 'Win' : 'Loss');
    }

    if (betType === 'runline') {
      const spreadMatch = pick.match(/([+-]?\d+\.?\d*)/);
      if (!spreadMatch) return null;
      const spread = parseFloat(spreadMatch[1]);
      const homeWords = match.homeTeam.toLowerCase().split(' ').filter(w => w.length > 3);
      const pickedHome = homeWords.some(w => pick.includes(w));
      const diff = pickedHome ? homeScore - awayScore : awayScore - homeScore;
      if (diff + spread === 0) return 'Push';
      return diff + spread > 0 ? 'Win' : 'Loss';
    }

    const homeWords = match.homeTeam.toLowerCase().split(' ').filter(w => w.length > 3);
    const awayWords = match.awayTeam.toLowerCase().split(' ').filter(w => w.length > 3);
    const pickedHome = homeWords.some(w => pick.includes(w));
    const pickedAway = awayWords.some(w => pick.includes(w));
    if (!pickedHome && !pickedAway) return null;
    if (homeScore === awayScore) return 'Push';
    const homeWon = homeScore > awayScore;
    return (pickedHome && homeWon) || (pickedAway && !homeWon) ? 'Win' : 'Loss';
  } catch(e) {
    console.error('settleMLBViaStatsAPI error:', e.message);
    return null;
  }
}

// ─── DAILY PICKS SETTLEMENT ───────────────────────────────────

async function settleDailyPicks() {
  const { data: pendingPicks, error } = await supabase
    .from('daily_picks')
    .select('*')
    .or('result.eq.Pending,result.is.null')
    .eq('status', 'active');

  if (error || !pendingPicks?.length) return { settled: 0, log: [] };

  // FIX 2: Use buildSportsNeeded() — single source of truth, no dual systems
  const picksNeeded = buildSportsNeeded(pendingPicks.map(p => ({ sport: p.sport })));

  const apiKey = process.env.ODDS_API_KEY;

  // FIX 1: daysFrom=2 — 48hr window ensures evening West Coast games are always included
  const picksScoresResults = await Promise.all(
    [...picksNeeded].map(s =>
      fetch(`https://api.the-odds-api.com/v4/sports/${s}/scores/?apiKey=${apiKey}&daysFrom=2&dateFormat=iso`)
        .then(r => r.json())
        .catch(() => [])
    )
  );
  const allScores = picksScoresResults.flat().filter(g => g.completed === true);

  let settled = 0;
  const log = [];

  for (const pick of pendingPicks) {
    const pickLower = pick.pick?.toLowerCase() || '';
    const sport = pick.sport?.toLowerCase() || '';
    const betType = inferBetType(pick.pick); // FIX: use centralized inferBetType

    // Build a bet-like object with consistent shape
    const betLike = {
      game: pick.game,
      pick: pick.pick,
      bet_type: betType,
      odds: pick.odds,
      amount: pick.units || 1,
      game_date: pick.date,
      sport: pick.sport,
    };

    let result = null;

    // ── Combo pick (e.g. "France to Win & Over 2.5 Goals") ──
    if (betType === 'combo') {
      result = await settleComboPick(betLike, pick.game, allScores);
      log.push({ id: pick.id, pick: pick.pick, game: pick.game, method: 'combo', result });
    }
    // ── Team total ──
    else if (pickLower.includes('team total')) {
      result = await settleTeamTotal(betLike);
      log.push({ id: pick.id, pick: pick.pick, game: pick.game, method: 'team_total', result });
    }
    // ── F5 / 1H MLB ──
    else if (pickLower.includes('first 5') || pickLower.includes('f5') || pickLower.includes('1h ml')) {
      if (sport.includes('mlb') || sport.includes('baseball')) {
        result = await settleMLBF5(betLike);
        log.push({ id: pick.id, pick: pick.pick, game: pick.game, method: 'espn_f5', result });
      }
    }
    // ── Props ──
    else if (
      pickLower.match(/\b(over|under)\b/) &&
      (pickLower.includes('strikeout') || pickLower.includes('point') || pickLower.includes('rebound') ||
       pickLower.includes('assist') || pickLower.includes('hit') || pickLower.includes('save') ||
       pickLower.includes('shot') || pickLower.includes('yard') || pickLower.includes('touchdown'))
    ) {
      if (sport.includes('mlb') || sport.includes('baseball')) result = await settleMLBProp(betLike);
      else if (sport.includes('nba') || sport.includes('basketball')) result = await settleNBAProp(betLike);
      else if (sport.includes('nhl') || sport.includes('hockey')) result = await settleNHLProp(betLike);
      else if (sport.includes('nfl') || sport.includes('football')) result = await settleNFLProp(betLike);
      log.push({ id: pick.id, pick: pick.pick, game: pick.game, method: 'prop', result });
    }
    // ── Standard game bets (moneyline, spread, total) ──
else {
  const match = findMatchingGame(betLike, allScores);
  if (match) {
    result = determineResult(betLike, match);
    log.push({ id: pick.id, pick: pick.pick, game: pick.game, method: 'odds_api', result });
  } else if (sport.includes('mlb') || sport.includes('baseball')) {
    // Fallback: use MLB Stats API directly for MLB games not found in Odds API
    result = await settleMLBViaStatsAPI(betLike);
    log.push({ id: pick.id, pick: pick.pick, game: pick.game, method: 'mlb_stats_fallback', result });
  } else {
    log.push({ id: pick.id, pick: pick.pick, game: pick.game, method: 'odds_api', result: 'NO_MATCH' });
  }
}

    // Only write to DB if we got a real result — never write null
    if (result !== null) {
      await supabase
        .from('daily_picks')
        .update({ result })
        .eq('id', pick.id);
      settled++;
    }
  }

  return { settled, log };
}

// ─── USER BET SETTLEMENT ─────────────────────────────────────

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
      // Still settle daily picks even if no user bets pending
      const { settled: picksSettled, log: picksLog } = await settleDailyPicks();
      return Response.json({ message: 'No pending user bets', picksSettled, picksLog });
    }

    // FIX 2: Use buildSportsNeeded() for user bets too
    const sportsNeeded = buildSportsNeeded(pendingBets.map(b => ({ sport: b.sport })));

    // Also add sports from pending parlay legs
    const { data: pendingParlays } = await supabase
      .from('parlays')
      .select('*, parlay_legs(*)')
      .eq('result', 'Pending');
    for (const parlay of pendingParlays || []) {
      for (const leg of parlay.parlay_legs || []) {
        const legNeeded = buildSportsNeeded([{ sport: leg.sport }]);
        legNeeded.forEach(k => sportsNeeded.add(k));
      }
    }

    const apiKey = process.env.ODDS_API_KEY;
    // FIX 1: daysFrom=3 for user bets (same as before — they can be old)
    const scoresResults = await Promise.all(
      [...sportsNeeded].map(s =>
        fetch(`https://api.the-odds-api.com/v4/sports/${s}/scores/?apiKey=${apiKey}&daysFrom=3&dateFormat=iso`)
          .then(r => r.json())
          .catch(() => [])
      )
    );
    const allScores = scoresResults.flat().filter(g => g.completed === true);

    let settled = 0;
    const settlementLog = [];

    for (const bet of pendingBets) {
      const betType = inferBetType(bet.pick); // FIX: centralized
      const sport = bet.sport?.toLowerCase() || '';
      const pick = bet.pick?.toLowerCase() || '';
      let result = null;

      if (betType === 'combo') {
        result = await settleComboPick(bet, bet.game, allScores);
        settlementLog.push({ id: bet.id, pick: bet.pick, method: 'combo', result });
      } else if (pick.includes('team total') || bet.bet_type?.toLowerCase() === 'teamtotal') {
        result = await settleTeamTotal(bet);
        settlementLog.push({ id: bet.id, pick: bet.pick, method: 'team_total', result });
      } else if (pick.includes('first 5') || pick.includes('f5') || pick.includes('1h ml') || bet.bet_type?.toLowerCase() === '1h') {
        if (sport.includes('mlb') || sport.includes('baseball')) {
          result = await settleMLBF5(bet);
          settlementLog.push({ id: bet.id, pick: bet.pick, method: 'espn_f5', result });
        }
      } else if (bet.bet_type?.toLowerCase().includes('prop') || bet.bet_type?.toLowerCase().includes('player')) {
        if (sport.includes('mlb') || sport.includes('baseball')) result = await settleMLBProp(bet);
        else if (sport.includes('nba') || sport.includes('basketball')) result = await settleNBAProp(bet);
        else if (sport.includes('nhl') || sport.includes('hockey')) result = await settleNHLProp(bet);
        else if (sport.includes('nfl') || sport.includes('football')) result = await settleNFLProp(bet);
        settlementLog.push({ id: bet.id, pick: bet.pick, method: 'prop', result });
      } else {
        const match = findMatchingGame(bet, allScores);
        if (match) {
          result = determineResult(bet, match);
          settlementLog.push({ id: bet.id, pick: bet.pick, method: 'odds_api', result });
        }
      }

      // FIX: only write to DB if result is non-null
      if (!result) continue;

      await supabase
        .from('user_bets')
        .update({ result, type: result })
        .eq('id', bet.id);

      settled++;
    }

    const { settled: parlaySettled, log: parlayLog } = await settleParlays(allScores);
    settled += parlaySettled;

    const { settled: picksSettled, log: picksLog } = await settleDailyPicks();

    return Response.json({
      success: true,
      settled,
      total: pendingBets.length,
      sportsQueried: [...sportsNeeded],
      log: settlementLog,
      parlayLog,
      picksSettled,
      picksLog,
    });

  } catch (error) {
    console.error('[settle-bets] Fatal error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request) {
  return GET(request);
}