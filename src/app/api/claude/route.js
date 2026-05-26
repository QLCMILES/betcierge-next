import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY  // switched to service role for writes
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
    const today = new Date().toISOString().split('T')[0];
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

    await supabase
      .from('daily_picks')
      .update({ status: 'inactive' })
      .eq('date', date);

    const { data, error } = await supabase
      .from('daily_picks')
      .insert({
        date,
        picks,
        status: 'active',
        created_at: new Date().toISOString(),
      })
      .select();

    if (error) throw error;

    return Response.json({ success: true, data });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}
