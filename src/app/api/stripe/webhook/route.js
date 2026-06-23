import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const PRICE_TO_TIER = {
  [process.env.STRIPE_PRICE_TEAM_MONTHLY]: 'team',
  [process.env.STRIPE_PRICE_TEAM_ANNUAL]: 'team',
  [process.env.STRIPE_PRICE_EDGE_MONTHLY]: 'edge',
  [process.env.STRIPE_PRICE_EDGE_ANNUAL]: 'edge',
};

export async function POST(req) {
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');

  let event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return NextResponse.json({ error: 'Invalid signature' }, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        const userId = session.metadata?.userId;
        const subscriptionId = session.subscription;
        if (!userId || !subscriptionId) break;

        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        const priceId = subscription.items.data[0]?.price?.id;
        const tier = PRICE_TO_TIER[priceId] || 'team';
        const trialEnd = subscription.trial_end
          ? new Date(subscription.trial_end * 1000).toISOString()
          : null;
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        await supabase.from('user_profiles').update({
          subscription_tier: tier,
          stripe_subscription_id: subscriptionId,
          stripe_price_id: priceId,
          trial_ends_at: trialEnd,
          subscription_ends_at: currentPeriodEnd,
          subscription_status: subscription.status,
        }).eq('user_id', userId);

        console.log(`✅ Subscription created for user ${userId} — tier: ${tier}`);
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!profile) break;

        const priceId = subscription.items.data[0]?.price?.id;
        const tier = PRICE_TO_TIER[priceId] || 'team';
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();

        await supabase.from('user_profiles').update({
          subscription_tier: tier,
          stripe_price_id: priceId,
          subscription_ends_at: currentPeriodEnd,
          subscription_status: subscription.status,
        }).eq('user_id', profile.user_id);

        console.log(`✅ Subscription updated for user ${profile.user_id} — tier: ${tier}`);
        break;
      }

      case 'customer.subscription.deleted': {
        const subscription = event.data.object;
        const customerId = subscription.customer;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!profile) break;

        await supabase.from('user_profiles').update({
          subscription_tier: 'free',
          subscription_status: 'canceled',
          stripe_subscription_id: null,
          stripe_price_id: null,
          subscription_ends_at: null,
        }).eq('user_id', profile.user_id);

        console.log(`✅ Subscription canceled for user ${profile.user_id}`);
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const customerId = invoice.customer;

        const { data: profile } = await supabase
          .from('user_profiles')
          .select('user_id')
          .eq('stripe_customer_id', customerId)
          .single();

        if (!profile) break;

        await supabase.from('user_profiles').update({
          subscription_status: 'past_due',
        }).eq('user_id', profile.user_id);

        console.log(`⚠️ Payment failed for user ${profile.user_id}`);
        break;
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error('Webhook handler error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
