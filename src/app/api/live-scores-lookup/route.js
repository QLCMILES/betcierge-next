import { NextResponse } from 'next/server';

const ODDS_API_KEY = process.env.ODDS_API_KEY;

export async function GET(req) {
  try {
    const { searchParams } = new URL(req.url);
    const sport = searchParams.get('sport');
    const game = searchParams.get('game')?.toLowerCase() || '';
    const ticketTime = searchParams.get('ticket_time'); // ISO string of when bet was placed

    if (!sport || !game) {
      return NextResponse.json({ error: 'Missing params' }, { status: 400 });
    }

    const res = await fetch(
      `https://api.the-odds-api.com/v4/sports/${sport}/scores/?apiKey=${ODDS_API_KEY}&daysFrom=3`,
      { cache: 'no-store' }
    );

    if (!res.ok) return NextResponse.json({ error: 'API error' }, { status: 500 });

    const games = await res.json();

    // Find games matching team names
    const matchingGames = games.filter(g => {
      const home = g.home_team.toLowerCase();
      const away = g.away_team.toLowerCase();
      const homeMatch = home.split(' ').filter(w => w.length > 3).every(w => game.includes(w));
      const awayMatch = away.split(' ').filter(w => w.length > 3).every(w => game.includes(w));
      return homeMatch || awayMatch;
    });

    if (!matchingGames.length) {
      return NextResponse.json({ error: 'No match' }, { status: 404 });
    }

    let match;

    if (ticketTime && matchingGames.length > 1) {
      // For live bets — find the game that was IN PROGRESS at ticket time
      const ticketDate = new Date(ticketTime);
      match = matchingGames.find(g => {
        const gameStart = new Date(g.commence_time);
        const gameEnd = new Date(gameStart.getTime() + 6 * 60 * 60 * 1000); // max 6hr game
        return gameStart <= ticketDate && ticketDate <= gameEnd;
      });
      // Fallback to closest game before ticket time
      if (!match) {
        match = matchingGames
          .filter(g => new Date(g.commence_time) <= ticketDate)
          .sort((a, b) => new Date(b.commence_time) - new Date(a.commence_time))[0];
      }
    } else {
      match = matchingGames[0];
    }

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
