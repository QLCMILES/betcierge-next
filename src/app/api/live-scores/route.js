import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const ODDS_API_KEY = process.env.ODDS_API_KEY;
const SPORTS = ["baseball_mlb", "basketball_nba", "icehockey_nhl"];

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

    return NextResponse.json({ success: true, count: allScores.length });
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