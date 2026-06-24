import { NextResponse } from 'next/server';

const ODDS_API_KEY = process.env.ODDS_API_KEY;

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = searchParams.get('sport');
    const game = searchParams.get('game')?.toLowerCase() || '';

    if (!sport || !game) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=2`,
      { cache: 'no-store' }
    );

    if (!res.ok) return NextResponse.json({ error: 'API error' }, { status: 500 });

    const games = await res.json();

    const match = games.find(g => {
      const home = g.home_team.toLowerCase();
      const away = g.away_team.toLowerCase();
      const homeMatch = home.split(' ').filter(w => w.length > 3).every(w => game.includes(w));
      const awayMatch = away.split(' ').filter(w => w.length > 3).every(w => game.includes(w));
      return homeMatch || awayMatch;
    });

    if (!match) return NextResponse.json({ error: 'No match' }, { status: 404 });

    return NextResponse.json({
      game_id: match.id,
      game: `${match.away_team} @ ${match.home_team}`,
      game_date: new Date(match.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
    });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
