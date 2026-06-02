import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    const body = await request.json();
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });
    const data = await response.json();
    return Response.json(data, { status: response.status });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function GET(request) {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const { data, error } = await supabase
      .from('daily_picks')
      .select('*')
      .eq('date', today)
      .eq('status', 'active');
    if (error) throw error;
    return Response.json({ picks: data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}

export async function PUT(request) {
  try {
    const { picks, date } = await request.json();
    const today = date || new Date().toISOString().split('T')[0];

    // Deactivate old picks for today
    await supabase
      .from('daily_picks')
      .update({ status: 'inactive' })
      .eq('date', today);

    // Insert one row per pick
    const rows = picks.map(p => ({
  date: today,
  sport: p.sport,
  game: p.game,
  pick: p.pick,
  odds: p.odds,
  confidence: p.confidence,
  insight: p.insight,
  units: parseInt(p.units) || 1,
  game_time: p.game_time,
  status: 'active',
  created_at: new Date().toISOString(),
}));

    const { data, error } = await supabase
      .from('daily_picks')
      .insert(rows)
      .select();

    if (error) throw error;

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
