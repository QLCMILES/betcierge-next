import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const month = new Date().getMonth() + 1;
const isEuropeanSoccerSeason = month >= 8 || month <= 5;
const isMLSSeason = month >= 3 && month <= 11;

const SPORTS = [
  "baseball_mlb",
  "basketball_nba",
  "icehockey_nhl",
  "mma_mixed_martial_arts",
  ...(isMLSSeason ? ["soccer_usa_mls"] : []),
  ...(isEuropeanSoccerSeason ? [
    "soccer_epl",
    "soccer_spain_la_liga",
    "soccer_germany_bundesliga",
    "soccer_italy_serie_a",
    "soccer_france_ligue_one",
    "soccer_uefa_champs_league",
    "soccer_uefa_europa_league",
  ] : []),
  "soccer_conmebol_copa_libertadores",
  "soccer_fifa_world_cup",
];

// ─── MLB STATS API LIVE-SCORE ADAPTER ──────────────────────────
// FIX (Gamecast never updated during a live game): confirmed via Vercel
// logs that the Odds-API loop above ran clean every hour all night and
// never picked up a real MLB game's score until 13+ hours after it ended.
// MLB Stats API is the official, real-time source already proven in
// settlement (settleMLBViaStatsAPI) and past-slip resolution. This walks
// every MLB straight bet / parlay leg with a real game_id for today or
// yesterday, finds the actual matchup via team+date match against the
// MLB schedule, and upserts under THAT SAME game_id — so the existing
// frontend lookup (scores.find(s => s.game_id === leg.gameId)) keeps
// working with zero frontend changes.

async function fetchMLBScheduleForDate(date) {
  try {
    const res = await fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&hydrate=linescore`,
      { cache: "no-store" }
    );
    if (!res.ok) return [];
    const data = await res.json();
    const games = data.dates?.[0]?.games || [];
    return games.map(g => ({
      gamePk: g.gamePk,
      homeTeam: g.teams?.home?.team?.name || '',
      awayTeam: g.teams?.away?.team?.name || '',
      homeScore: g.teams?.home?.score,
      awayScore: g.teams?.away?.score,
      // MLB Stats API status: 'Preview' | 'Live' | 'Final'
      abstractState: g.status?.abstractGameState || '',
    }));
  } catch (e) {
    return [];
  }
}

async function refreshMLBFromStatsAPI() {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const dates = [today, yesterday];

    const { data: bets } = await supabase
      .from('user_bets')
      .select('game_id, game, game_date')
      .not('game_id', 'is', null)
      .in('game_date', dates);

    const { data: legs } = await supabase
      .from('parlay_legs')
      .select('game_id, game, game_date')
      .not('game_id', 'is', null)
      .in('game_date', dates);

    const candidates = [...(bets || []), ...(legs || [])].filter(b => b.game_id && b.game_date);
    if (!candidates.length) return 0;

    const scheduleCache = {};
    let updated = 0;

    for (const bet of candidates) {
      if (!(bet.game_date in scheduleCache)) {
        scheduleCache[bet.game_date] = await fetchMLBScheduleForDate(bet.game_date);
      }
      const games = scheduleCache[bet.game_date];
      if (!games.length) continue;

      const betGame = (bet.game || '').toLowerCase();
      const candidates = games.filter(g =>
        g.awayTeam.toLowerCase().split(' ').some(w => w.length > 2 && betGame.includes(w)) ||
        g.homeTeam.toLowerCase().split(' ').some(w => w.length > 2 && betGame.includes(w))
      );
      // Same fail-safe-over-guess rule as the settlement matchers — a short
      // shared nickname (e.g. "Sox") could match more than one game on the
      // same date. Skip rather than show the wrong live score.
      if (candidates.length > 1) continue;
      const match = candidates[0];
      if (!match || !match.homeTeam || !match.awayTeam) continue;
      if (match.homeScore === undefined || match.awayScore === undefined) continue;

      const status = match.abstractState === 'Final' ? 'final'
        : match.abstractState === 'Live' ? 'live'
        : 'upcoming';

      await supabase.from('live_scores').upsert({
        game_id: bet.game_id,
        sport: 'baseball_mlb',
        home_team: match.homeTeam,
        away_team: match.awayTeam,
        home_score: match.homeScore || 0,
        away_score: match.awayScore || 0,
        status,
        period: null,
        clock: null,
        last_updated: new Date().toISOString(),
      }, { onConflict: 'game_id' });

      updated++;
    }

    return updated;
  } catch (e) {
    console.error('[live-scores] MLB Stats API refresh error:', e.message);
    return 0;
  }
}

export async function GET(req) {
  try {
    const allScores = [];

    for (const sport of SPORTS) {
      const res = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=1`,
        { cache: "no-store" }
      );
      if (!res.ok) continue;
      const games = await res.json();

      for (const game of games) {
        if (game.scores) {
          const home = game.scores?.find(s => s.name === game.home_team);
          const away = game.scores?.find(s => s.name === game.away_team);

          await supabase.from("live_scores").upsert({
            game_id: game.id,
            sport,
            home_team: game.home_team,
            away_team: game.away_team,
            home_score: parseInt(home?.score) || 0,
            away_score: parseInt(away?.score) || 0,
            status: game.completed ? "final" : "live",
            period: game.scores?.[0]?.period || null,
            clock: null,
            last_updated: new Date().toISOString()
          }, { onConflict: "game_id" });

          allScores.push(game);
        }
      }
    }

    const mlbStatsUpdated = await refreshMLBFromStatsAPI();

    return NextResponse.json({ success: true, count: allScores.length, mlbStatsUpdated });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

export async function POST(req) {
  try {
    const { gameIds } = await req.json();

    if (!gameIds?.length) {
      return NextResponse.json({ scores: [] });
    }

    const { data, error } = await supabase
      .from("live_scores")
      .select("*")
      .in("game_id", gameIds);

    if (error) throw error;

    return NextResponse.json({ scores: data || [] });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}