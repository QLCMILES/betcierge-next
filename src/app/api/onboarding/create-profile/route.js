import { createClient } from '@supabase/supabase-js';

// Service-role client — this route needs to write to user_profiles regardless
// of RLS, and needs to verify the caller's token independently rather than
// trusting anything sent from the client.
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return Response.json({ error: 'Missing auth token' }, { status: 401 });
    }

    // Verify the token ourselves and get the real user id — never trust a
    // user_id passed in the request body, since that could be spoofed.
    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return Response.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { name, is21Confirmed } = await req.json();

    if (!name || !name.trim()) {
      return Response.json({ error: 'Name is required' }, { status: 400 });
    }
    if (!is21Confirmed) {
      return Response.json({ error: '21+ confirmation is required' }, { status: 400 });
    }

    // Real IP from Vercel's forwarded header. This only works reliably from
    // a server route — a client-side write could never capture a trustworthy
    // IP, which is exactly why this whole write has to happen here.
    const forwardedFor = req.headers.get('x-forwarded-for') || '';
    const ip = forwardedFor.split(',')[0].trim() || req.headers.get('x-real-ip') || null;
    const userAgent = req.headers.get('user-agent') || null;

    const { error: upsertError } = await supabaseAdmin.from('user_profiles').upsert({
      user_id: user.id,
      email: user.email,
      name: name.trim(),
      is_21_confirmed_at: new Date().toISOString(),
      is_21_confirmed_ip: ip,
      is_21_confirmed_ua: userAgent,
      onboarding_step: 'account_created',
    }, { onConflict: 'user_id' });

    if (upsertError) {
      console.error('create-profile upsert error:', upsertError);
      return Response.json({ error: 'Failed to save profile' }, { status: 500 });
    }

    return Response.json({ success: true });
  } catch (e) {
    console.error('create-profile route error:', e);
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}