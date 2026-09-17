import { NextResponse } from 'next/server';
// If your project has the "@/" path alias configured (jsconfig.json or
// tsconfig.json with "paths": { "@/*": ["./src/*"] }), you can use the
// cleaner import instead:  import { requireAdmin } from '@/lib/requireAdmin';
import { requireAdmin } from '../../../../lib/requireAdmin';

export async function POST(req) {
  try {
    // ── Admin gate ──────────────────────────────────────────────────
    // Was previously WIDE OPEN: no auth at all, and the page never sent a
    // token. Now verified server-side via the shared helper.
    const gate = await requireAdmin(req);
    if (gate.error) {
      return NextResponse.json({ error: gate.error }, { status: gate.status });
    }
    const { user, adminClient } = gate;

    const { message, target, channel } = await req.json();
    if (!message || !message.trim()) {
      return NextResponse.json({ error: 'Message required' }, { status: 400 });
    }

    // Recipients fetched with the SERVICE-ROLE client. The old code used the
    // anon client here, which RLS silently blocked — it returned zero users,
    // which is why this route never actually delivered anything.
    let query = adminClient.from('user_profiles').select('user_id, phone, sms_opt_in');
    if (target === 'team') query = query.in('subscription_tier', ['team', 'edge', 'capital']);
    else if (target === 'trial') query = query.not('trial_ends_at', 'is', null);
    else if (target === 'free') query = query.eq('subscription_tier', 'lookout');
    // target === 'all' (or anything else) → no filter → every user.

    const { data: users, error: userError } = await query;
    if (!users?.length) {
      return NextResponse.json({ sent: 0, debug: userError?.message });
    }

    // One broadcast row, then a per-user delivery row for each recipient.
    const { data: notif } = await adminClient.from('notifications').insert({
      message,
      target,
      channel,
      sent_by: user.email,
    }).select().single();

    if (notif) {
      const userNotifs = users.map(u => ({
        user_id: u.user_id,
        notification_id: notif.id,
        read: false,
      }));
      await adminClient.from('user_notifications').insert(userNotifs);
    }

    let smsSent = 0;
    if ((channel === 'sms' || channel === 'both') && process.env.TWILIO_ACCOUNT_SID) {
      const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const smsUsers = users.filter(u => u.phone && u.sms_opt_in);
      for (const u of smsUsers) {
        try {
          await twilio.messages.create({
            body: `Betcierge: ${message}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: u.phone,
          });
          smsSent++;
        } catch (e) {
          console.error('SMS error:', e.message);
        }
      }
    }

    await adminClient.from('admin_log').insert({
      action: 'send_notification',
      target,
      details: { message, channel, smsSent, totalUsers: users.length },
      performed_by: user.id,
    });

    return NextResponse.json({ sent: users.length, smsSent });
  } catch (e) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
