import { createClient } from '@supabase/supabase-js';

// Dedicated SMS / TCPA consent audit route. Deliberately separate from
// create-profile: that route owns account creation + the 21+ audit record
// (and hard-requires is21Confirmed), while this route owns ONLY the SMS
// consent audit, which happens later in onboarding (Screen 2) on a row
// where 21+ was already confirmed on Screen 1. Two single-purpose routes,
// each writing one compliance-critical record, rather than one route with
// branching modes.
//
// Why server-side (same reasoning as create-profile): a legally-defensible
// TCPA consent record needs a trustworthy IP and user-agent captured at the
// moment consent was given. A client can spoof both — only a server route
// reading Vercel's forwarded headers can capture them reliably. The caller's
// token is verified here independently; a client-passed user_id is never
// trusted.

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Version string stamped alongside every consent record, so we can always
// prove WHICH exact consent language a given user agreed to, even after the
// copy changes. Bump this whenever the on-screen consent text or the
// governing ToS SMS section is revised. Current copy corresponds to the
// on-screen checkbox text on onboarding Screen 2 and ToS Section 6
// (Last Updated July 22, 2026).
const SMS_CONSENT_VERSION = 'sms_v1_2026-07-22';

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    if (!token) {
      return Response.json({ error: 'Missing auth token' }, { status: 401 });
    }

    const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
    if (authError || !user) {
      return Response.json({ error: 'Invalid session' }, { status: 401 });
    }

    const { phone, consentGiven } = await req.json();

    // Consent is opt-in and skippable (TCPA: cannot be a condition of
    // service). This route is only ever called when the user actually
    // checked the box AND provided a number — the client does not call it
    // on skip. Guard anyway so a bad/edge call can't write a hollow record.
    if (!consentGiven) {
      return Response.json({ error: 'Consent was not given' }, { status: 400 });
    }
    if (!phone || !phone.trim()) {
      return Response.json({ error: 'Phone number is required to opt in' }, { status: 400 });
    }

    const forwardedFor = req.headers.get('x-forwarded-for') || '';
    const ip = forwardedFor.split(',')[0].trim() || req.headers.get('x-real-ip') || null;
    const userAgent = req.headers.get('user-agent') || null;

    // Update-only (not upsert): the profile row already exists by this point
    // in the flow — Screen 1's create-profile created it. Scoped to the
    // verified user's own id.
    const { error: updateError } = await supabaseAdmin
      .from('user_profiles')
      .update({
        phone: phone.trim(),
        sms_opt_in: true,
        sms_marketing_consent_given_at: new Date().toISOString(),
        sms_consent_version: SMS_CONSENT_VERSION,
        sms_consent_ip: ip,
        sms_consent_ua: userAgent,
      })
      .eq('user_id', user.id);

    if (updateError) {
      console.error('sms-consent update error:', updateError);
      return Response.json({ error: 'Failed to save consent' }, { status: 500 });
    }

    return Response.json({ success: true, version: SMS_CONSENT_VERSION });
  } catch (e) {
    console.error('sms-consent route error:', e);
    return Response.json({ error: 'Unexpected error' }, { status: 500 });
  }
}
