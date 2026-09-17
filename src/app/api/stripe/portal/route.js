import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';
// Same relative depth as create-checkout/route.js (src/app/api/stripe/portal/route.js
// -> src/lib/requireUser.js), so this matches convention exactly.
import { requireUser } from '../../../../lib/requireUser';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(req) {
  try {
    // Identity comes from the verified session token, NOT the request body.
    // Previously this route trusted a userId sent in the body — the same
    // pattern the Sep 17 security pass fixed on create-checkout. A crafted
    // request could open ANOTHER user's Stripe billing portal (see their
    // card on file, cancel their subscription, etc). Now the real user is
    // derived server-side via the same requireUser helper create-checkout
    // uses; the body is not read at all.
    const auth = await requireUser(req);
    if (auth.error) {
      return NextResponse.json({ error: auth.error }, { status: auth.status });
    }
    const userId = auth.user.id;

    const { data: profile } = await supabase
      .from('user_profiles')
      .select('stripe_customer_id')
      .eq('user_id', userId)
      .single();

    if (!profile?.stripe_customer_id) {
      // Comped / manually-granted accounts (no real Stripe subscription
      // behind them) land here by design — this is a normal, expected case
      // for those users, not just an error path. Message is written for the
      // end user to actually read, not a raw internal string.
      return NextResponse.json(
        { error: "We couldn't find a billing account to manage. If you think this is a mistake, contact support." },
        { status: 404 }
      );
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: profile.stripe_customer_id,
      return_url: process.env.NEXT_PUBLIC_APP_URL,
    });

    return NextResponse.json({ url: session.url });
  } catch (error) {
    console.error('Stripe portal error:', error);
    // Don't leak raw Stripe/internal error text to the client.
    return NextResponse.json(
      { error: 'Something went wrong opening your billing portal. Please try again or contact support.' },
      { status: 500 }
    );
  }
}
