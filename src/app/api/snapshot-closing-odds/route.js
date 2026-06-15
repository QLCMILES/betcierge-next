import { createClient } from '@supabase/supabase-js';
export const maxDuration = 60;
export const dynamic = 'force-dynamic';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ODDS_API_KEY = process.env.ODDS_API_KEY;

function parseGameTime(gameTimeStr) {
  if (!gameTimeStr) return null;
  try {
    const cleaned = gameTimeStr.replace(' ET', '').trim();
    const [time, meridiem] = cleaned.split(' ');
    let [hours, minutes] = time.split(':').map(Number);
    if (meridiem === 'PM' && hours !== 12) hours += 12;
    if (meridiem === 'AM' && hours === 12) hours = 0;
    const now = new Date();
    const et = new Date(now.toLocaleString('en-US', { timeZone: 'America/New_York' }));
    et.setHours(hours, minutes, 0, 0);
    return et;
  } catch (e) {
    return null;
  }
}

function americanToDecimal(odds) {
  if (odds > 0) return (odds / 100) + 1;
  return (100 / Math.abs(odds)) + 1;
}

function calcCLV(oddsOpen, oddsClose) {
  if (!oddsOpen || !oddsClose) return null;
  const decOpen = americanToDecimal(oddsOpen);
  const decClose = americanToDecimal(oddsClose);
  return ((decOpen - decClose) / decClose) * 100;
}

function normalize(str) {
  return str.toLowerCase().replace(/[^a-z0-9 ]/g, '').replace(/\s+/g, ' ').trim();
}

function extractTeamFromPick(pick) {
  if (!pick) return null;
  const lower = pick.toLowerCase();
  if (lower.startsWith('over') || lower.startsWith('under')) return null;
  return normalize(pick)
    .replace(/ ml$/, '')
    .replace(/ moneyline$/, '')
    .replace(/ [+-]\d+(\.\d+)?$/, '')
    .trim();
}

function extractTeamsFromGame(game) {
  if (!game) return { away: null, home: null };
  const parts = game.split('@').map(s => normalize(s.trim()));
  return { away: parts[0], home: parts[1] };
}

function findMatchingGame(pick, game, oddsGames) {
  const { away, home } = extractTeamsFromGame(game);
  if (!away || !home) return null;
  return oddsGames.find(g => {
    const apiHome = normalize(g.home_team);
    const apiAway = normalize(g.away_team);
    const homeMatch = apiHome.includes(home) || home.includes(apiHome) ||
                      apiHome.split(' ').some(w => w.length > 3 && home.includes(w));
    const awayMatch = apiAway.includes(away) || away.includes(apiAway) ||
                      apiAway.split(' ').some(w => w.length > 3 && away.includes(w));
    return homeMatch && awayMatch;
  });
}

function getOddsForPick(pick, matchedGame) {
  if (!matchedGame || !matchedGame.bookmakers || matchedGame.bookmakers.length === 0) return null;
  const lower = pick.toLowerCase();
  const isOver = lower.startsWith('over');
  const isUnder = lower.startsWith('under');
  const teamFromPick = extractTeamFromPick(pick);
  const bookmaker = matchedGame.bookmakers.find(b => b.key === 'draftkings') || matchedGame.bookmakers[0];
  if (!bookmaker) return null;

  if (isOver || isUnder) {
    const market = bookmaker.markets?.find(m => m.key === 'totals');
    if (!market) return null;
    const outcome = market.outcomes?.find(o => isOver ? o.name === 'Over' : o.name === 'Under');
    return outcome?.price || null;
  }

  const hasSpread = /[+-]\d+\.?\d*$/.test(pick.trim()) && !lower.endsWith('ml');
  if (hasSpread && teamFromPick) {
    const market = bookmaker.markets?.find(m => m.key === 'spreads');
    if (!market) return null;
    const outcome = market.outcomes?.find(o => {
      const apiTeam = normalize(o.name);
      return apiTeam.includes(teamFromPick) || teamFromPick.includes(apiTeam) ||
             apiTeam.split(' ').some(w => w.length > 3 && teamFromPick.includes(w));
    });
    return outcome?.price || null;
  }

  if (teamFromPick) {
    const market = bookmaker.markets?.find(m => m.key === 'h2h');
    if (!market) return null;
    const outcome = market.outcomes?.find(o => {
      const apiTeam = normalize(o.name);
      return apiTeam.includes(teamFromPick) || teamFromPick.includes(apiTeam) ||
             apiTeam.split(' ').some(w => w.length > 3 && teamFromPick.includes(w));
    });
    return outcome?.price || null;
  }

  return null;
}

export async function POST(req) {
  try {
    const secret = req.headers.get('x-cron-secret');
    if (secret !== process.env.CRON_SECRET) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

    const { data: picks, error } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('date', today)
      .eq('status', 'active')
      .is('odds_close', null);

    if (error) throw error;
    if (!picks || picks.length === 0) {
      return Response.json({ message: 'No picks to snapshot', snapped: 0 });
    }

    const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
    const picksToSnap = picks.filter(pick => {
      const gameTime = parseGameTime(pick.game_time);
      if (!gameTime) return false;
      const minsUntilGame = (gameTime - nowET) / 60000;
      return minsUntilGame <= 90 && minsUntilGame >= -30;
    });

    if (picksToSnap.length === 0) {
      return Response.json({ message: 'No games starting soon', snapped: 0 });
    }

    const sportsNeeded = ['baseball_mlb', 'basketball_nba', 'americanfootball_nfl', 'icehockey_nhl', 'mma_mixed_martial_arts', 'soccer_usa_mls'];
    const oddsResults = await Promise.all(
      sportsNeeded.map(sport =>
        fetch(
          `https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=us&markets=h2h,spreads,totals&oddsFormat=american`,
          { cache: 'no-store' }
        ).then(r => r.ok ? r.json() : []).catch(() => [])
      )
    );
    const allOddsGames = oddsResults.flat().filter(g => g && g.id);

    let snapped = 0;
    const results = [];

    for (const pick of picksToSnap) {
      const matchedGame = findMatchingGame(pick.pick, pick.game, allOddsGames);
      if (!matchedGame) {
        results.push({ id: pick.id, pick: pick.pick, status: 'no_match' });
        continue;
      }
      const oddsClose = getOddsForPick(pick.pick, matchedGame);
      if (!oddsClose) {
        results.push({ id: pick.id, pick: pick.pick, status: 'no_odds' });
        continue;
      }
      const clvPct = calcCLV(pick.odds, oddsClose);
      await supabase.from('daily_picks').update({ odds_close: oddsClose, clv_pct: clvPct }).eq('id', pick.id);
      results.push({ id: pick.id, pick: pick.pick, odds_open: pick.odds, odds_close: oddsClose, clv_pct: clvPct, status: 'snapped' });
      snapped++;
    }

    return Response.json({ message: 'Closing odds snapped', snapped, results });

  } catch (err) {
    console.error('snapshot-closing-odds error:', err);
    return Response.json({ error: err.message }, { status: 500 });
  }
}
