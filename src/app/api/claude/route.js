
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Free-tier users get this many Hunter chat messages per day (ET). Paid and
// trialing users are unlimited. Enforced server-side so it can't be bypassed
// from the browser. Tune here only.
const FREE_DAILY_MESSAGE_LIMIT = 3;

// Mirror of isEntitled() in lib/pricing.js — kept in sync deliberately. Answers
// "does this user currently have paid access (active trial or subscription)?"
function isEntitledServer(profile) {
  if (!profile) return false;
  if (profile.trial_ends_at && new Date(profile.trial_ends_at) > new Date()) return true;
  const status = (profile.subscription_status || '').toLowerCase();
  return status === 'active' || status === 'trialing';
}

export async function POST(request) {
  try {
    const body = await request.json();

    // Only Hunter chat sends enforceLimit. Other internal callers (e.g. bet-slip
    // parsing) omit it and pass straight through, uncounted and unblocked.
    if (body.enforceLimit) {
      const authHeader = request.headers.get('authorization') || '';
      const token = authHeader.replace('Bearer ', '');
      if (!token) {
        return Response.json({ error: 'Missing auth token' }, { status: 401 });
      }
      const { data: { user }, error: authError } = await supabase.auth.getUser(token);
      if (authError || !user) {
        return Response.json({ error: 'Invalid session' }, { status: 401 });
      }
      const { data: profile } = await supabase
        .from('user_profiles')
        .select('trial_ends_at, subscription_status')
        .eq('user_id', user.id)
        .single();

      // Free-tier users are capped; entitled users skip the check entirely.
      if (!isEntitledServer(profile)) {
        const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const { count } = await supabase
          .from('user_conversations')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('role', 'user')
          .gte('created_at', `${today}T00:00:00`)
          .lte('created_at', `${today}T23:59:59`);
        // The browser saves the user's message BEFORE calling this route, so the
        // current message is already counted. Allowing 3 answered messages means
        // blocking once the saved count exceeds 3 (i.e. the 4th attempt).
        if ((count || 0) > FREE_DAILY_MESSAGE_LIMIT) {
          return Response.json({ limitReached: true });
        }
      }
    }

    // Strip our internal flag before forwarding to Anthropic — it's not a valid
    // Messages API field.
    const { enforceLimit, ...anthropicBody } = body;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': process.env.ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(anthropicBody),
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
      .eq('status', 'active')
      .eq('pipeline_source', 'legacy')
      .limit(3)
      .order('created_at', { ascending: true });
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
