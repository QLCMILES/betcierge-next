import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    const { message, target, channel } = await req.json();

    let query = supabase.from('user_profiles').select('*');
    if (target === 'team') query = query.in('subscription_tier', ['team', 'edge', 'capital']);
    if (target === 'trial') query = query.not('trial_ends_at', 'is', null);
    if (target === 'free') query = query.eq('subscription_tier', 'lookout');
    
    const { data: users, error } = await query;
console.log('Users:', users?.length, 'Error:', error?.message);
if (!users?.length) return Response.json({ sent: 0, debug: error?.message });

    await supabase.from('notifications').insert({
      message,
      target,
      channel,
      sent_by: 'qlcmiles@gmail.com'
    });

    let smsSent = 0;
    if ((channel === 'sms' || channel === 'both') && process.env.TWILIO_ACCOUNT_SID) {
      const twilio = require('twilio')(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
      const smsUsers = users.filter(u => u.phone && u.sms_opt_in);
      for (const user of smsUsers) {
        try {
          await twilio.messages.create({
            body: `Betcierge: ${message}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: user.phone
          });
          smsSent++;
        } catch(e) {
          console.error('SMS error for', user.phone, e.message);
        }
      }
    }

    await supabase.from('admin_log').insert({
      action: 'send_notification',
      target,
      details: { message, channel, smsSent, totalUsers: users.length },
      performed_by: 'qlcmiles@gmail.com'
    });

    return Response.json({ sent: users.length, smsSent });
  } catch(e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
