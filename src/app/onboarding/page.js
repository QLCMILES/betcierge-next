"use client";
import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../lib/supabase";
import AccountStep from "../../lib/AccountStep";
import {
  CURRENT_PRICE_DISPLAY,
  REGULAR_PRICE_DISPLAY,
  FOUNDING_ACTIVE,
  FOUNDING_SPOTS_LEFT,
  FOUNDING_TOTAL,
  STRIPE_PRICE_CURRENT,
} from "../../lib/pricing";

// ─────────────────────────────────────────────────────────────────────────
// OnboardingFlow — the coordinator for the redesigned 9-screen onboarding.
//
// Per BETC_ONBOARDING_ARCHITECTURE_DECISION.md (Option B): this flow owns
// new-user account creation as its first step (Screen 1 / AccountStep), and
// is reachable BEFORE a session exists. Returning users go through
// LoginScreen instead (LoginScreen simplified to sign-in-only).
//
// ALL NINE SCREENS ARE REAL:
//   Screen 1 (account creation)     — AccountStep (committed separately).
//   Screen 2 (phone/SMS consent)    — full TCPA audit record via
//                                      /api/onboarding/sms-consent
//                                      (server-side IP/UA/version). Opt-in
//                                      and skippable.
//   Screens 3-6 (welcome carousel)  — copy matches approved prototype.
//   Screen 7 (bankroll & goal)      — writes bankroll/goal columns.
//   Screen 8 (sports you bet on)    — writes the sports text[] column.
//   Screen 9 (trial & pricing)      — Stripe checkout, monthly only for now
//                                      (annual deferred; toggle hidden).
//
// onboarding_step / onboarding_completed_at in user_profiles are the source
// of truth across visits/devices/refreshes (architecture non-negotiable #2)
// — local state mirrors that for the current visit, never the reverse.
//
// LAUNCH NOTE (not a code issue): the ToS/Privacy links on Screen 9 point at
// /terms and /privacy — those static pages still need creating, and both
// legal docs still have [INSERT LAUNCH DATE] + arbitration [INSERT MAILING
// ADDRESS] placeholders pending the attorney pass.
// ─────────────────────────────────────────────────────────────────────────

const LAST_STEP = 9;

const SPORTS = [
  { id: "mlb", label: "MLB", emoji: "⚾" },
  { id: "nba", label: "NBA", emoji: "🏀" },
  { id: "nfl", label: "NFL", emoji: "🏈" },
  { id: "nhl", label: "NHL", emoji: "🏒" },
  { id: "soccer", label: "Soccer", emoji: "⚽" },
  { id: "ufc", label: "UFC/MMA", emoji: "🥊" },
  { id: "ncaab", label: "NCAAB", emoji: "🏀" },
  { id: "ncaaf", label: "NCAAF", emoji: "🏈" },
];

const S = {
  wrap: { minHeight: "100vh", background: "#050507", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit', sans-serif", padding: 20 },
  card: { background: "#0a0a0f", border: "1px solid #26262f", borderRadius: 24, padding: "28px 24px", width: "100%", maxWidth: 400 },
  logo: { fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, color: "#f5a623", letterSpacing: 2, textAlign: "center", fontSize: 20, marginBottom: 6 },
  loadingText: { color: "#777", fontSize: 13, textAlign: "center" },
  label: { display: "block", color: "#666", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 14, marginBottom: 4 },
  input: { width: "100%", background: "#16161d", border: "1px solid #2a2a38", borderRadius: 8, padding: "11px 12px", color: "#fff", fontSize: 14, fontFamily: "'Outfit', sans-serif", outline: "none", boxSizing: "border-box" },
  topbar: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, minHeight: 18 },
  backlink: { color: "#666", fontSize: 13, cursor: "pointer", background: "none", border: "none", fontFamily: "'Outfit', sans-serif" },
  skiplink: { color: "#666", fontSize: 11, textTransform: "uppercase", letterSpacing: 0.5, fontWeight: 600, cursor: "pointer", background: "none", border: "none", fontFamily: "'Outfit', sans-serif" },
  navbar: { display: "flex", justifyContent: "flex-end", alignItems: "center", marginTop: 22 },
  primaryBtn: (disabled) => ({ background: "#f5a623", color: "#000", border: "none", borderRadius: 10, padding: "10px 22px", fontSize: 13, fontWeight: 700, fontFamily: "'Outfit', sans-serif", cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1 }),
  h1: { fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, color: "#fff", fontSize: 22, lineHeight: 1.2, marginBottom: 6 },
  sub: { color: "#777", fontSize: 13, lineHeight: 1.5, marginBottom: 16 },
  error: { background: "#2a1a1a", border: "1px solid #5a2a2a", borderRadius: 8, padding: "10px 12px", color: "#e07a7a", fontSize: 13, marginTop: 8 },
  legal: { color: "#4a4a52", fontSize: 10.5, textAlign: "center", lineHeight: 1.6, marginTop: 14 },
  legalLink: { color: "#6a6a72", textDecoration: "underline", cursor: "pointer" },
  consentRow: { display: "flex", gap: 10, background: "#14141b", border: "1px solid #24242e", borderRadius: 12, padding: 12, marginTop: 14, cursor: "pointer" },
  consentText: { color: "#999", fontSize: 11.5, lineHeight: 1.5 },
  checkbox: (checked) => ({ width: 18, height: 18, borderRadius: 5, border: `1.5px solid ${checked ? "#f5a623" : "#444"}`, background: checked ? "#f5a623" : "transparent", flexShrink: 0, marginTop: 1, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, color: "#000" }),
  carousel: {
    dots: { display: "flex", gap: 6, justifyContent: "center", marginBottom: 18 },
    dot: { width: 7, height: 7, borderRadius: "50%", background: "#262626" },
    dotActive: { background: "#f5a623", width: 18, borderRadius: 4 },
    dotDone: { background: "#f5a62380" },
    iconWrap: { width: 60, height: 60, borderRadius: "50%", border: "1.5px solid #f5a62360", background: "#1a1500", display: "flex", alignItems: "center", justifyContent: "center", margin: "10px auto 18px", fontSize: 26 },
    wrap: { textAlign: "center" },
    headline: { fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, color: "#fff", fontSize: 22, marginBottom: 8 },
    sub: { color: "#f5a623", fontSize: 13, fontWeight: 600, marginBottom: 12 },
    body: { color: "#888", fontSize: 13, lineHeight: 1.6, maxWidth: 260, margin: "0 auto" },
  },
  sportGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginTop: 12 },
  sportBtn: (on) => ({ background: on ? "#1f1a00" : "#16161d", border: `1px solid ${on ? "#f5a623" : "#2a2a38"}`, borderRadius: 10, padding: "12px 6px", textAlign: "center", cursor: "pointer", fontSize: 12, color: on ? "#f5a623" : "#aaa", fontWeight: 600 }),
  hint: { color: "#555", fontSize: 11, textAlign: "center", marginTop: 14 },
  gate: {
    checkboxRow: { display: "flex", gap: 10, alignItems: "flex-start", margin: "16px 0", cursor: "pointer" },
    text: { color: "#999", fontSize: 12.5, lineHeight: 1.4 },
    btn: (loading) => ({ width: "100%", background: "#f5a623", color: "#000", border: "none", borderRadius: 10, padding: "13px 0", fontSize: 14, fontWeight: 700, fontFamily: "'Outfit', sans-serif", cursor: loading ? "not-allowed" : "pointer", opacity: loading ? 0.6 : 1, marginTop: 8 }),
  },
  plan: {
    toggleRow: { display: "flex", background: "#16161d", borderRadius: 10, padding: 4, marginBottom: 14 },
    toggleOpt: (active) => ({ flex: 1, textAlign: "center", padding: "8px 0", borderRadius: 8, fontSize: 12, fontWeight: 600, color: active ? "#000" : "#666", background: active ? "#f5a623" : "transparent", cursor: "pointer" }),
    card: { background: "#14100a", border: "2px solid #f5a623", borderRadius: 14, padding: 16, marginTop: 4, position: "relative" },
    badge: { position: "absolute", top: -10, left: "50%", transform: "translateX(-50%)", background: "#f5a623", color: "#000", fontSize: 9.5, fontWeight: 700, padding: "3px 10px", borderRadius: 20, whiteSpace: "nowrap" },
    priceRow: { display: "flex", alignItems: "baseline", gap: 8, marginBottom: 2, marginTop: 4 },
    price: { fontSize: 15, color: "#f5a623", fontWeight: 700 },
    old: { fontSize: 12, color: "#555", textDecoration: "line-through" },
    trial: { color: "#fff", fontSize: 13, fontWeight: 600, margin: "4px 0 2px" },
    note: { color: "#666", fontSize: 11, marginBottom: 10 },
    feat: { color: "#ccc", fontSize: 12, marginBottom: 6, display: "flex", gap: 6 },
    check: { color: "#2ecc71" },
  },
};

const FONT_LINK = "https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap";

function ScreenChrome({ showBack, onBack, skipLabel, onSkip, primaryLabel, onPrimary, primaryDisabled, primaryLoading, children }) {
  return (
    <div style={S.wrap}>
      <link href={FONT_LINK} rel="stylesheet" />
      <div style={S.card}>
        <div style={S.topbar}>
          <button style={{ ...S.backlink, visibility: showBack ? "visible" : "hidden" }} onClick={onBack}>← Back</button>
          <button style={{ ...S.skiplink, visibility: skipLabel ? "visible" : "hidden" }} onClick={onSkip}>{skipLabel || ""}</button>
        </div>
        {children}
        <div style={S.navbar}>
          <button style={S.primaryBtn(primaryDisabled)} onClick={onPrimary} disabled={primaryDisabled}>
            {primaryLoading ? "..." : primaryLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

async function persistStep(userId, step) {
  if (!userId) return;
  const { error } = await supabase
    .from("user_profiles")
    .update({ onboarding_step: String(step) })
    .eq("user_id", userId);
  if (error) console.error("onboarding_step save failed:", error);
}

async function persistCompleted(userId) {
  if (!userId) return;
  const { error } = await supabase
    .from("user_profiles")
    .update({ onboarding_completed_at: new Date().toISOString() })
    .eq("user_id", userId);
  if (error) console.error("onboarding_completed_at save failed:", error);
}

// Minimal, temporary 21+ capture for brand-new Google users, who skip
// Screen 1's audit write entirely. Reuses the SAME create-profile route.
function GoogleAgeGate({ defaultName, onConfirmed }) {
  const [name, setName] = useState(defaultName || "");
  const [checked, setChecked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const submit = async () => {
    setError("");
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (!checked) { setError("You must confirm you are 21 or older to continue."); return; }
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/onboarding/create-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ name: name.trim(), is21Confirmed: true }),
      });
      const result = await res.json();
      if (!res.ok) { setError(result.error || "Something went wrong."); setLoading(false); return; }
      setLoading(false);
      onConfirmed();
    } catch (e) {
      console.error("Google age-gate error:", e);
      setError("Something went wrong. Try again.");
      setLoading(false);
    }
  };

  return (
    <div style={S.wrap}>
      <link href={FONT_LINK} rel="stylesheet" />
      <div style={S.card}>
        <div style={S.logo}>BETCIERGE</div>
        <div style={S.h1}>One more thing.</div>
        <div style={S.sub}>We need to confirm this before you continue.</div>
        {error && <div style={S.error}>{error}</div>}
        <label style={S.label}>Full name</label>
        <input style={S.input} value={name} onChange={e => setName(e.target.value)} />
        <div style={S.gate.checkboxRow} onClick={() => setChecked(c => !c)}>
          <div style={S.checkbox(checked)}>{checked ? "✓" : ""}</div>
          <div style={S.gate.text}>I confirm I am 21 years of age or older.</div>
        </div>
        <button style={S.gate.btn(loading)} onClick={submit} disabled={loading}>
          {loading ? "..." : "Continue →"}
        </button>
      </div>
    </div>
  );
}

// Screen 2 — phone + SMS consent (TCPA). Opt-in, skippable.
function SmsConsentStep({ userId, onBack, onAdvance }) {
  const [phone, setPhone] = useState("");
  const [consent, setConsent] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const proceed = async () => {
    setError("");
    if (!consent || !phone.trim()) {
      await onAdvance();
      return;
    }
    setSaving(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/onboarding/sms-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${session?.access_token}` },
        body: JSON.stringify({ phone: phone.trim(), consentGiven: true }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Couldn't save that. You can continue and add it later in settings.");
        setSaving(false);
        return;
      }
      setSaving(false);
      await onAdvance();
    } catch (e) {
      console.error("SMS consent error:", e);
      setError("Couldn't save that. You can continue and add it later in settings.");
      setSaving(false);
    }
  };

  return (
    <ScreenChrome
      showBack={false}
      skipLabel="Skip for now"
      onSkip={onAdvance}
      primaryLabel="Continue →"
      onPrimary={proceed}
      primaryLoading={saving}
    >
      <div style={S.h1}>Get picks the moment they drop.</div>
      <div style={S.sub}>Optional — you can use Betcierge without this.</div>
      {error && <div style={S.error}>{error}</div>}
      <label style={S.label}>Mobile number</label>
      <input style={S.input} type="tel" placeholder="(555) 555-5555" value={phone} onChange={e => setPhone(e.target.value)} />
      <div style={S.consentRow} onClick={() => setConsent(c => !c)}>
        <div style={S.checkbox(consent)}>{consent ? "✓" : ""}</div>
        <div style={S.consentText}>
          Text me when today's picks drop, plus account alerts. Msg &amp; data rates may apply. Reply STOP to opt out, HELP for help.
        </div>
      </div>
    </ScreenChrome>
  );
}

const CAROUSEL_SLIDES = [
  { icon: "🎯", headline: "Your personal betting coach,", sub: "on call 24/7.", body: "It's not AI. It's EI — Enhanced Intelligence, built from cloning the sports betting habits of our founders to create the ultimate sports betting tool.<br /><br />Most betting products optimize for today's bet. Betcierge optimizes for tomorrow's bettor.", primaryLabel: "Next" },
  { icon: "💬", headline: "Ask Hunter anything.", sub: "The same research, on demand.", body: "Every pick starts with deep research — stats, trends, injuries, line movement, sharp money, weather &amp; more. Hunter Chat gives you that same depth for any game, any question, in seconds. You choose what you need answered.", primaryLabel: "Next" },
  { icon: "🕐", headline: "Picks when they're ready.", sub: "Not on a fixed morning schedule.", body: "Every game gets researched on its own clock — lineups confirm at different times across sports, so picks land as the research clears, not a fixed morning batch. You'll always get at least one sharp play a day, with up to three when the edge is there.", primaryLabel: "Next" },
  { icon: "🛡️", headline: "Watching your back — even from yourself.", sub: "Tilt recognition. Real check-ins.", body: "Down bad after a rough stretch? Hunter notices before you do — flags the pattern, checks in, and sizes every bet against what your bankroll can actually take. The guardrail every bettor needs but almost nobody has.", primaryLabel: "Let's go" },
];

function WelcomeCarousel({ step, onBack, onNext, onSkip }) {
  const idx = step - 3;
  const slide = CAROUSEL_SLIDES[idx];
  return (
    <ScreenChrome showBack={true} onBack={onBack} skipLabel="Skip" onSkip={onSkip} primaryLabel={slide.primaryLabel} onPrimary={onNext}>
      <div style={S.carousel.dots}>
        {[0, 1, 2, 3].map(i => (
          <div key={i} style={{ ...S.carousel.dot, ...(i === idx ? S.carousel.dotActive : i < idx ? S.carousel.dotDone : {}) }} />
        ))}
      </div>
      <div style={S.carousel.wrap}>
        <div style={S.carousel.iconWrap}>{slide.icon}</div>
        <div style={S.carousel.headline}>{slide.headline}</div>
        <div style={S.carousel.sub}>{slide.sub}</div>
        <div style={S.carousel.body} dangerouslySetInnerHTML={{ __html: slide.body }} />
      </div>
    </ScreenChrome>
  );
}

// Screen 7 — bankroll & goal.
function BankrollGoalStep({ userId, onBack, onSaved }) {
  const [bankroll, setBankroll] = useState("");
  const [goal, setGoal] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const bankrollNum = parseFloat(bankroll);
  const goalNum = parseFloat(goal);
  const roi = bankrollNum > 0 && goalNum > 0 ? (goalNum / bankrollNum) * 100 : 0;
  const canSubmit = bankroll && goal && bankrollNum > 0 && goalNum > 0;

  const submit = async () => {
    setError("");
    if (!canSubmit) { setError("Enter a bankroll and goal greater than $0."); return; }
    setSaving(true);
    const { error: dbError } = await supabase
      .from("user_profiles")
      .update({ bankroll: bankrollNum, goal: goalNum, onboarding_step: "8" })
      .eq("user_id", userId);
    setSaving(false);
    if (dbError) {
      console.error("Bankroll/goal save failed:", dbError);
      setError("Something went wrong saving that. Try again.");
      return;
    }
    onSaved(8);
  };

  return (
    <ScreenChrome showBack={true} onBack={onBack} skipLabel={null} primaryLabel="Continue →" onPrimary={submit} primaryDisabled={!canSubmit || saving} primaryLoading={saving}>
      <div style={S.h1}>Set your weekly targets.</div>
      <div style={S.sub}>Hunter uses this to size every bet and flag you before you overdo it.</div>
      {error && <div style={S.error}>{error}</div>}
      <label style={S.label}>Weekly bankroll ($)</label>
      <input style={S.input} type="number" placeholder="e.g. 2500" value={bankroll} onChange={e => setBankroll(e.target.value)} />
      <label style={S.label}>Weekly profit goal ($)</label>
      <input style={S.input} type="number" placeholder="e.g. 250" value={goal} onChange={e => setGoal(e.target.value)} />
      {roi > 20 && (
        <div style={{ color: "#e74c3c", fontSize: 12, marginTop: 8 }}>
          ⚠️ Targeting {roi.toFixed(1)}% ROI weekly is aggressive. Sharpest bettors average 5–10%.
        </div>
      )}
    </ScreenChrome>
  );
}

// Screen 8 — sports you bet on. Writes the sports text[] column.
function SportsStep({ userId, onBack, onSaved }) {
  const [selected, setSelected] = useState(new Set(["mlb"]));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const toggle = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const submit = async () => {
    setError("");
    if (selected.size === 0) { setError("Pick at least one sport."); return; }
    setSaving(true);
    const { error: dbError } = await supabase
      .from("user_profiles")
      .update({ sports: Array.from(selected), onboarding_step: "9" })
      .eq("user_id", userId);
    setSaving(false);
    if (dbError) {
      console.error("Sports save failed:", dbError);
      setError("Something went wrong saving that. Try again.");
      return;
    }
    onSaved(9);
  };

  return (
    <ScreenChrome showBack={true} onBack={onBack} skipLabel={null} primaryLabel="Continue →" onPrimary={submit} primaryDisabled={selected.size === 0 || saving} primaryLoading={saving}>
      <div style={S.h1}>What do you bet on?</div>
      <div style={S.sub}>We'll prioritize these sports for your picks.</div>
      {error && <div style={S.error}>{error}</div>}
      <div style={S.sportGrid}>
        {SPORTS.map(s => (
          <div key={s.id} style={S.sportBtn(selected.has(s.id))} onClick={() => toggle(s.id)}>
            {s.emoji} {s.label}
          </div>
        ))}
      </div>
      <div style={S.hint}>You can change this anytime.</div>
    </ScreenChrome>
  );
}

// Screen 9 — trial & pricing. Monthly-only at launch. Annual deferred until
// an annual Stripe price is wired (the style defs + this comment are left in
// place so re-adding the monthly/annual toggle later is purely additive:
// create the annual price in Stripe, add STRIPE_PRICE_*_ANNUAL to pricing.js
// + env vars, restore the toggle row and a `cycle` state pointing checkout
// at the right price ID).
function TrialPricingStep({ userId, onBack, onCompleteFreeTier }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const startTrial = async () => {
    setError("");
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      // Mark onboarding complete BEFORE redirecting to Stripe — otherwise a
      // user who completes payment and returns via Stripe's redirect would
      // look "not onboarded" and get bounced back here. Completion is about
      // finishing the flow; subscription status is tracked separately by the
      // Stripe webhook.
      await persistCompleted(userId);
      const res = await fetch("/api/stripe/create-checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          priceId: STRIPE_PRICE_CURRENT,
          userId,
          email: session?.user?.email,
        }),
      });
      const data = await res.json();
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError("Couldn't start checkout. Please try again.");
      setLoading(false);
    } catch (e) {
      console.error("Trial checkout error:", e);
      setError("Couldn't start checkout. Please try again.");
      setLoading(false);
    }
  };

  const priceDisplay = CURRENT_PRICE_DISPLAY;
  const oldDisplay = REGULAR_PRICE_DISPLAY.replace("/mo", "");

  return (
    <ScreenChrome showBack={true} onBack={onBack} skipLabel="Skip for now" onSkip={onCompleteFreeTier} primaryLabel="Start free trial →" onPrimary={startTrial} primaryLoading={loading}>
      <div style={S.h1}>Your first 3 days are free.</div>
      <div style={S.sub}>No commitment. Cancel anytime before the trial ends.</div>
      {error && <div style={S.error}>{error}</div>}
      <div style={S.plan.card}>
        {FOUNDING_ACTIVE && <div style={S.plan.badge}>FOUNDING PRICE</div>}
        <div style={S.plan.priceRow}>
          <span style={S.plan.price}>{priceDisplay}</span>
          <span style={S.plan.old}>{oldDisplay}</span>
        </div>
        <div style={S.plan.trial}>3-day free trial, then {priceDisplay}</div>
        <div style={S.plan.note}>🔒 Price locked for life · cancel anytime</div>
        {["Picks as the research clears — no fixed clock", "Unlimited Hunter chat — ask anything, anytime", "Lean Machine — extra plays beyond the daily picks", "Snap to Log + Live Gamecast", "Bankroll guardrails"].map((f, i) => (
          <div key={i} style={S.plan.feat}><span style={S.plan.check}>✓</span>{f}</div>
        ))}
      </div>
      <div style={S.legal}>
        By starting your trial, you agree to our{" "}
        <span style={S.legalLink} onClick={() => window.open("/terms", "_blank")}>Terms of Service</span> and{" "}
        <span style={S.legalLink} onClick={() => window.open("/privacy", "_blank")}>Privacy Policy</span>. Auto-renews unless canceled.
      </div>
    </ScreenChrome>
  );
}

export default function OnboardingFlow() {
  const router = useRouter();
  const [loadingResume, setLoadingResume] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const [userId, setUserId] = useState(null);
  const [needsAgeGate, setNeedsAgeGate] = useState(false);
  const [googleDefaultName, setGoogleDefaultName] = useState("");

  useEffect(() => {
    let cancelled = false;

    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (cancelled) return;

      if (!session) {
        setCurrentStep(1);
        setLoadingResume(false);
        return;
      }

      setUserId(session.user.id);

      const { data: profile, error } = await supabase
        .from("user_profiles")
        .select("onboarding_step, onboarding_completed_at, is_21_confirmed_at")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (error) {
        console.error("Onboarding resume read error:", error);
        setCurrentStep(2);
        setLoadingResume(false);
        return;
      }

      if (profile?.onboarding_completed_at) {
        router.replace("/");
        return;
      }

      if (!profile?.is_21_confirmed_at) {
        setGoogleDefaultName(session.user.user_metadata?.full_name || session.user.user_metadata?.name || "");
        setNeedsAgeGate(true);
        setLoadingResume(false);
        return;
      }

      const resumed = profile?.onboarding_step ? parseInt(profile.onboarding_step, 10) : 2;
      setCurrentStep(Number.isFinite(resumed) && resumed >= 2 ? resumed : 2);
      setLoadingResume(false);
    };

    init();
    return () => { cancelled = true; };
  }, [router]);

  const goToStepLocalOnly = (n) => setCurrentStep(n);

  const goToStepPersist = async (n) => {
    setCurrentStep(n);
    await persistStep(userId, n);
  };

  const handleAccountCreated = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    const uid = session?.user?.id || null;
    setUserId(uid);
    await goToStepPersist(2);
  };

  const handleAgeGateConfirmed = async () => {
    setNeedsAgeGate(false);
    await goToStepPersist(2);
  };

  const advance = async () => {
    if (currentStep === LAST_STEP) {
      await persistCompleted(userId);
      router.replace("/");
      return;
    }
    await goToStepPersist(currentStep + 1);
  };

  const back = async () => {
    await goToStepPersist(Math.max(currentStep - 1, 2));
  };

  const skipTo = async (n) => {
    await goToStepPersist(n);
  };

  const completeFreeTier = async () => {
    await persistCompleted(userId);
    router.replace("/");
  };

  if (loadingResume) {
    return (
      <div style={S.wrap}>
        <div style={S.card}>
          <div style={S.logo}>BETCIERGE</div>
          <div style={S.loadingText}>Setting things up...</div>
        </div>
      </div>
    );
  }

  if (needsAgeGate) {
    return <GoogleAgeGate defaultName={googleDefaultName} onConfirmed={handleAgeGateConfirmed} />;
  }

  if (currentStep === 1) {
    return (
      <AccountStep
        onAccountCreated={handleAccountCreated}
        onSwitchToSignIn={() => router.push("/")}
      />
    );
  }

  if (currentStep === 2) {
    return <SmsConsentStep userId={userId} onBack={back} onAdvance={() => skipTo(3)} />;
  }

  if (currentStep >= 3 && currentStep <= 6) {
    return <WelcomeCarousel step={currentStep} onBack={back} onNext={advance} onSkip={() => skipTo(7)} />;
  }

  if (currentStep === 7) {
    return <BankrollGoalStep userId={userId} onBack={back} onSaved={goToStepLocalOnly} />;
  }

  if (currentStep === 8) {
    return <SportsStep userId={userId} onBack={back} onSaved={goToStepLocalOnly} />;
  }

  return <TrialPricingStep userId={userId} onBack={back} onCompleteFreeTier={completeFreeTier} />;
}
