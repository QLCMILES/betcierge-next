import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

// Fixed, explicit whitelist — this is deliberately NOT a generic "patch any
// field" endpoint. Every action is named, has known required fields, and is
// handled by its own narrow code path below. Adding a fifth action later
// means adding a new branch here, not loosening what this route accepts.
const ALLOWED_ACTIONS = ['mark_pick_result', 'mass_void_pick', 'update_user_tier'];
const ALLOWED_PICK_RESULTS = ['Win', 'Loss', 'Push', 'Void', 'Pending'];
const ALLOWED_TIERS = ['lookout', 'team', 'edge', 'capital'];

export async function POST(req) {
  try {
    const authHeader = req.headers.get('authorization') || '';
    const accessToken = authHeader.replace('Bearer ', '').trim();
    if (!accessToken) {
      return NextResponse.json({ error: 'Missing session' }, { status: 401 });
    }

    // Step 1 — verify the caller's identity directly against Supabase Auth.
    // Never trust a user id/email sent in the request body — identity is
    // always derived from the verified access token itself, server-side.
    const userClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      { global: { headers: { Authorization: `Bearer ${accessToken}` } } }
    );
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Invalid session' }, { status: 401 });
    }

    // Step 2 — a completely separate, service-role client. This is never
    // the same client instance as the user-session one above, and its
    // Authorization header is never contaminated by the user's token —
    // reusing the session client here would make privileged writes subject
    // to the user's own RLS permissions instead of actually bypassing them.
    const adminClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Step 3 — verify admin status server-side, against a table with zero
    // client-facing grants or policies (RLS enabled, no policies at all) —
    // only this service-role client can ever read admin_users.
    const { data: adminRow } = await adminClient
      .from('admin_users')
      .select('role')
      .eq('user_id', user.id)
      .single();
    if (!adminRow) {
      return NextResponse.json({ error: 'Not authorized', debugUserId: user.id, debugEmail: user.email }, { status: 403 });
    }

    const body = await req.json();
    const { action } = body;
    if (!ALLOWED_ACTIONS.includes(action)) {
      return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
    }

    let result;
    let auditTarget;
    let auditDetails;

    if (action === 'mark_pick_result') {
      const { pickId, newResult } = body;
      if (!pickId || !ALLOWED_PICK_RESULTS.includes(newResult)) {
        return NextResponse.json({ error: 'Invalid pickId or result' }, { status: 400 });
      }
      const { data: before } = await adminClient.from('daily_picks').select('result').eq('id', pickId).single();
      const { error: updateError } = await adminClient.from('daily_picks').update({ result: newResult }).eq('id', pickId);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      auditTarget = String(pickId);
      auditDetails = { previous_result: before?.result ?? null, new_result: newResult };
      result = { success: true };

    } else if (action === 'mass_void_pick') {
      const { pickId } = body;
      if (!pickId) {
        return NextResponse.json({ error: 'Missing pickId' }, { status: 400 });
      }
      const { data: pick } = await adminClient.from('daily_picks').select('date, pick').eq('id', pickId).single();
      if (!pick) return NextResponse.json({ error: 'Pick not found' }, { status: 404 });

      // Preserves the exact same matching logic as the original dashboard
      // button (game_date + fuzzy ILIKE on pick text). This fixes WHO can
      // trigger this and HOW it's authorized — not the underlying match
      // precision, which is a separate, real thing worth its own look later
      // (a fuzzy text match could in principle catch an unintended bet).
      const { data: affectedBets, error: betsError } = await adminClient
        .from('user_bets')
        .update({ result: 'Void' })
        .eq('game_date', pick.date)
        .ilike('pick', `%${pick.pick}%`)
        .select('id');
      if (betsError) return NextResponse.json({ error: betsError.message }, { status: 500 });

      const { error: pickError } = await adminClient.from('daily_picks').update({ result: 'Void' }).eq('id', pickId);
      if (pickError) return NextResponse.json({ error: pickError.message }, { status: 500 });

      auditTarget = String(pickId);
      auditDetails = { pick_text: pick.pick, game_date: pick.date, user_bets_affected: (affectedBets || []).length };
      result = { success: true, betsAffected: (affectedBets || []).length };

    } else if (action === 'update_user_tier') {
      const { userId, tier } = body;
      if (!userId || !ALLOWED_TIERS.includes(tier)) {
        return NextResponse.json({ error: 'Invalid userId or tier' }, { status: 400 });
      }
      const { data: before } = await adminClient.from('user_profiles').select('subscription_tier').eq('user_id', userId).single();
      const { error: updateError } = await adminClient.from('user_profiles').update({ subscription_tier: tier }).eq('user_id', userId);
      if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });
      auditTarget = String(userId);
      auditDetails = { previous_tier: before?.subscription_tier ?? null, new_tier: tier };
      result = { success: true };
    }

    // Step 4 — audit every privileged action, unconditionally, before
    // returning. Uses the existing admin_log table.
    await adminClient.from('admin_log').insert({
      performed_by: user.id,
      action,
      target: auditTarget,
      details: auditDetails,
    });

    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}