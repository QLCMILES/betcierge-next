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

// Every sport the Odds API /scores endpoint can return for us. This is the
// FULL universe; the GET handler below only actually REQUESTS the subset
// that has an active user bet on it (see buildSportsToFetch), so we don't
// pay for sport-requests nobody is watching in Gamecast.
const ALL_SPORTS = [
  "baseball_mlb",
  "basketball_nba",
  "icehockey_nhl",
  "americanfootball_nfl",
  "americanfootball_ncaaf",
  "basketball_ncaab",
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

// Bet sport DISPLAY LABEL -> Odds API sport key(s). Bets store the label
// (e.g. "NCAAF") but the Odds API wants the key ("americanfootball_ncaaf").
// Soccer maps to MULTIPLE league keys because a "Soccer" bet doesn't say
// which league — so when any soccer bet exists we fetch the active soccer
// leagues (still far cheaper than fetching every sport). Anything not in
// this map (a messy Snap-to-Log label, an unusual sport) is handled by the
// safe fallback in buildSportsToFetch — it is never silently dropped.
const LABEL_TO_KEYS = {
  MLB: ["baseball_mlb"],
  NBA: ["basketball_nba"],
  NFL: ["americanfootball_nfl"],
  NHL: ["icehockey_nhl"],
  "UFC/MMA": ["mma_mixed_martial_arts"],
  UFC: ["mma_mixed_martial_arts"],
  MMA: ["mma_mixed_martial_arts"],
  NCAAB: ["basketball_ncaab"],
  NCAAF: ["americanfootball_ncaaf"],
  Soccer: ALL_SPORTS.filter(s => s.startsWith("soccer_")),
};

// Given today's + yesterday's active bets, decide which Odds API sports to
// actually request. Returns a Set of sport keys (a subset of ALL_SPORTS).
//
// Cost win: sports with NO active bet are never requested. On a normal day
// that's most of them (nobody bet hockey/tennis/soccer that day -> we never
// call those). The Odds API meters per sport-request and returns the whole
// slate per call, so filtering by SPORT is the only lever that saves money;
// filtering to individual games would save nothing (you already paid for and
// received the sport's full slate). See handoff notes.
//
// Safety: if a bet's sport label isn't in LABEL_TO_KEYS (bad OCR read, odd
// value), we DON'T know which sport it is — so rather than drop it and hide a
// score, we widen: an unmapped label makes us fall back to fetching ALL
// sports for this run. That's the rare case; the common case (clean labels)
// stays cheap. Correctness first, cost second.
function buildSportsToFetch(betSports) {
  const keys = new Set();
  let sawUnmapped = false;

  for (const raw of betSports) {
    const label = (raw || "").trim();
    if (!label) { sawUnmapped = true; continue; }
    const mapped = LABEL_TO_KEYS[label];
    if (mapped) {
      for (const k of mapped) keys.add(k);
    } else {
      // Unknown label — can't safely narrow. Widen to be safe.
      sawUnmapped = true;
    }
  }

  if (sawUnmapped) {
    // At least one bet's sport couldn't be mapped — fetch everything so we
    // never miss a score. Logged so we can see how often this happens (and
    // extend LABEL_TO_KEYS if a real label keeps showing up here).
    console.log(`[live-scores] Unmapped bet sport label(s) present — fetching ALL_SPORTS this run to avoid hiding a score.`);
    return new Set(ALL_SPORTS);
  }

  // Only keep keys that are actually in ALL_SPORTS (respects seasonal soccer).
  return new Set([...keys].filter(k => ALL_SPORTS.includes(k)));
}

// ─── MLB STATS API LIVE-SCORE ADAPTER ──────────────────────────
// FIX (Gamecast never updated during a live game): confirmed via Vercel
// logs that the Odds-API loop above ran clean every hour all night and
// never picked up a real MLB game's score until 13+ hours after it ended.
// MLB Stats API is the official, real-time source already proven in
// settlement and past-slip resolution. Walks every MLB straight bet /
// parlay leg with a real game_id for today or yesterday, finds the actual
// matchup via team+date match against the MLB schedule, and upserts under
// THAT SAME game_id.
//
// This adapter was ALREADY bet-driven (it reads user_bets/parlay_legs) —
// the Sep 19 cost rework generalizes that same idea to the Odds API loop.
// onConflict is 'game_id,sport' to match the composite unique constraint.
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
      abstractState: g.status?.abstractGameState || '',
    }));
  } catch (e) {
    return [];
  }
}

async function refreshMLBFromStatsAPI(mlbCandidates) {
  try {
    if (!mlbCandidates.length) return 0;

    const scheduleCache = {};
    let updated = 0;

    for (const bet of mlbCandidates) {
      if (!(bet.game_date in scheduleCache)) {
        scheduleCache[bet.game_date] = await fetchMLBScheduleForDate(bet.game_date);
      }
      const games = scheduleCache[bet.game_date];
      if (!games.length) continue;

      const betGame = (bet.game || '').toLowerCase();
      const matched = games.filter(g =>
        g.awayTeam.toLowerCase().split(' ').some(w => w.length > 2 && betGame.includes(w)) ||
        g.homeTeam.toLowerCase().split(' ').some(w => w.length > 2 && betGame.includes(w))
      );
      // Same fail-safe-over-guess rule as the settlement matchers — a short
      // shared nickname (e.g. "Sox") could match more than one game on the
      // same date. Skip rather than show the wrong live score.
      if (matched.length > 1) continue;
      const match = matched[0];
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
      }, { onConflict: 'game_id,sport' });

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
    // Cron-only gate — matches the other scheduled routes. Blocks anyone
    // from triggering the metered Odds API loop by hitting this URL.
    // (POST below stays open — the Gamecast frontend calls it with no secret.)
    const authHeader = req.headers.get('authorization');
    const isVercelCron = req.headers.get('x-vercel-cron') === '1';
    if (!isVercelCron && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const yesterday = new Date(Date.now() - 86400000).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const dates = [today, yesterday];

    // ── Gather the games users actually have active bets on ─────────────
    // Both straight bets and parlay legs, today + yesterday (yesterday
    // catches late-finishing games that haven't settled yet). We need each
    // bet's game_id (for the Odds match) AND its sport label (to decide
    // which sports to request) AND game/game_date (for the MLB adapter).
    const { data: bets } = await supabase
      .from('user_bets')
      .select('game_id, sport, game, game_date')
      .not('game_id', 'is', null)
      .in('game_date', dates);

    const { data: legs } = await supabase
      .from('parlay_legs')
      .select('game_id, sport, game, game_date')
      .not('game_id', 'is', null)
      .in('game_date', dates);

    const activeBetGames = [...(bets || []), ...(legs || [])].filter(b => b.game_id && b.game_date);

    // If nobody has any active bet with a game_id, there's nothing to show in
    // Gamecast — skip the whole metered fetch entirely (the biggest possible
    // saving on a quiet day).
    if (activeBetGames.length === 0) {
      return NextResponse.json({ success: true, count: 0, mlbStatsUpdated: 0, sportsFetched: [], note: 'no active bet games' });
    }

    // Set of game_ids users actually bet on — we only WRITE score rows for
    // these, even within a sport whose slate we fetch.
    const betGameIds = new Set(activeBetGames.map(b => b.game_id));

    // Decide which sports to request based on the bets present.
    const sportsToFetch = buildSportsToFetch(activeBetGames.map(b => b.sport));

    const allScores = [];

    for (const sport of sportsToFetch) {
      const res = await fetch(
        `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=1`,
        { cache: "no-store" }
      );
      if (!res.ok) continue;
      const games = await res.json();

      for (const game of games) {
        // Only write rows for games a user actually bet on.
        if (!betGameIds.has(game.id)) continue;
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
          }, { onConflict: "game_id,sport" });

          allScores.push(game);
        }
      }
    }

    // MLB always goes through its own official Stats API adapter (fresher
    // and free) — pass it only the MLB-sport bet games so it isn't scanning
    // the whole schedule for nothing. Match on the sport label being MLB.
    const mlbCandidates = activeBetGames.filter(b => (b.sport || '').trim().toUpperCase() === 'MLB');
    const mlbStatsUpdated = await refreshMLBFromStatsAPI(mlbCandidates);

    return NextResponse.json({
      success: true,
      count: allScores.length,
      mlbStatsUpdated,
      sportsFetched: [...sportsToFetch],
    });
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
