// src/lib/pricing.js
//
// Single source of truth for pricing, founding-spot count, and paid-access
// checks. Before this file existed, the founding spot count was hardcoded
// separately in captain/page.js AND page.js's UpgradeScreen (two different
// constants, same value, no shared source — the classic drift bug). This
// file replaces both.
//
// Per the July 24 Round 2 build spec:
//   - Single paid tier at launch: $24.99/mo founding (locked for life),
//     $29.99/mo regular after founding spots fill.
//   - No automated oversell cutoff — Miles monitors the count manually and
//     updates FOUNDING_TAKEN by hand. Do NOT wire this to an automatic
//     Stripe/Supabase query unless that's a deliberate later decision.
//   - Edge tier is PAUSED, not deleted — its Stripe price ID stays defined
//     here (unused by any UI) so reintroducing a second paid tier later is
//     additive, not a rebuild.
//   - Access control must be tier-agnostic: "is this user a paying
//     subscriber," not a hardcoded check against tier name strings.

// ─── Founding spot count ────────────────────────────────────────────────
// Manually updated by Miles as spots fill. This is the ONLY place this
// number should live — captain/page.js, landing/page.js, and page.js's
// UpgradeScreen all import from here now.
export const FOUNDING_TOTAL = 500;
export const FOUNDING_TAKEN = 6; // ← update this by hand as spots fill
export const FOUNDING_SPOTS_LEFT = FOUNDING_TOTAL - FOUNDING_TAKEN;
export const FOUNDING_ACTIVE = FOUNDING_SPOTS_LEFT > 0;

// ─── Pricing ────────────────────────────────────────────────────────────
export const FOUNDING_PRICE_DISPLAY = "$24.99/mo";
export const REGULAR_PRICE_DISPLAY = "$29.99/mo";
export const FOUNDING_PRICE_NUM = 24.99;
export const REGULAR_PRICE_NUM = 29.99;

// The single price shown anywhere in the app right now.
export const CURRENT_PRICE_DISPLAY = FOUNDING_ACTIVE
  ? FOUNDING_PRICE_DISPLAY
  : REGULAR_PRICE_DISPLAY;

// ─── Stripe price IDs ───────────────────────────────────────────────────
// Single tier in use. Edge IDs kept defined-but-unused per the spec, so
// re-enabling a second paid tier later is additive, not a rebuild.
export const STRIPE_PRICE_FOUNDING =
  process.env.NEXT_PUBLIC_STRIPE_PRICE_FOUNDING_TEAM_MONTHLY;
export const STRIPE_PRICE_REGULAR =
  process.env.NEXT_PUBLIC_STRIPE_PRICE_TEAM_MONTHLY;
export const STRIPE_PRICE_CURRENT = FOUNDING_ACTIVE
  ? STRIPE_PRICE_FOUNDING
  : STRIPE_PRICE_REGULAR;

// Defined but not referenced by any active UI — Edge is paused, not deleted.
export const _STRIPE_PRICE_FOUNDING_EDGE_UNUSED =
  process.env.NEXT_PUBLIC_STRIPE_PRICE_FOUNDING_EDGE_MONTHLY;
export const _STRIPE_PRICE_EDGE_UNUSED =
  process.env.NEXT_PUBLIC_STRIPE_PRICE_EDGE_MONTHLY;

// ─── Entitlements (tier-agnostic access control) ───────────────────────
// Replaces the old getAccessLevel()/isPaid() pair in page.js, which
// hardcoded checks against the literal strings 'team' and 'edge'. That
// broke the spec's "tier-agnostic" requirement outright: with a single
// tier, a user's subscription_tier value is an implementation detail, not
// something UI code should ever compare against by name.
//
// isEntitled(user) answers exactly one question: "does this user currently
// have paid access, for any reason (active trial or active subscription)?"
export function isEntitled(user) {
  if (!user) return false;

  // Active trial = full access, regardless of tier.
  if (user.trial_ends_at) {
    const trialEnd = new Date(user.trial_ends_at);
    if (trialEnd > new Date()) return true;
  }

  // Active or trialing paid subscription, whatever the tier is named.
  const status = user.subscription_status?.toLowerCase();
  if (status === "active" || status === "trialing") return true;

  return false;
}

// Kept as a thin alias so existing call sites (isPaid(user)) don't all
// need to be renamed in the same pass — but new code should call
// isEntitled() directly.
export const isPaid = isEntitled;