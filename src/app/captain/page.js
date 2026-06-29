"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

const GOLD = "#f5a623";
const DARK = "#0a0a0f";
const CARD = "#111118";
const BORDER = "#1e1e2e";
const GREEN = "#2ecc71";
const GRAY = "#6b7280";
const LIGHT = "#d1d5db";
const PURPLE = "#a78bfa";

const FOUNDING_TOTAL = 500;
const FOUNDING_TAKEN = 6; // update this as spots fill

const features = [
  { icon: "🎯", name: "Daily picks at 11 AM ET", desc: "Three best plays every morning — same picks from the CaptainPicks Discord, now with full AI-powered analysis behind each one." },
  { icon: "🤖", name: "Hunter — your betting brain", desc: "Ask about any game, any line, any matchup. Get a clear, honest breakdown in seconds — like texting Miles directly." },
  { icon: "📸", name: "Snap to Log", desc: "Screenshot your bet slip. We log it automatically. No typing, no spreadsheets." },
  { icon: "📡", name: "Live Gamecast", desc: "Watch your games and your money move in real time on one screen." },
  { icon: "📋", name: "Full bet tracking", desc: "Every pick tracked — wins and losses. Your real record, always visible." },
  { icon: "⚡", name: "Auto-settlement", desc: "Your bets settle automatically after every game. No manual updates." },
  { icon: "🛡️", name: "Bankroll guardrails", desc: "Set your limits once. Hunter flags you before you go over." },
  { icon: "🧠", name: "Tilt protection", desc: "Down bad? Hunter slows you down before you do something you'll regret." },
];

const faqs = [
  { q: "Is this the same picks as CaptainPicks Discord?", a: "Yes — same research, same plays. Betcierge adds AI analysis behind every pick, full bet tracking, snap to log, and live gamecast. Think of it as the Discord plus a full betting assistant." },
  { q: "What does 'founding member' mean?", a: "The first 500 members lock in $24.99/mo forever. When regular pricing launches at $29.99/mo, your price never changes. Ever." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel from your account settings — no calls, no hoops, no questions asked." },
  { q: "What's the difference between Team and Edge?", a: "Team gets you the daily picks, full Hunter AI chat, snap to log, and all tracking features. Edge adds exclusive deeper plays, advanced analytics, and priority access to new features as they launch." },
  { q: "Is there really a 3-day free trial?", a: "Yes. Full access, no charge for 3 days. If it's not for you, cancel before day 3 and you pay nothing." },
  { q: "Do you show losses?", a: "Every single one. A record that hides losses is a lie. Ours does not." },
];

export default function CaptainPage({ onGetStarted }) {
  const [openFaq, setOpenFaq] = useState(null);
  const [spotsLeft, setSpotsLeft] = useState(FOUNDING_TOTAL - FOUNDING_TAKEN);
  const go = () => { if (onGetStarted) onGetStarted(); };

  // Fetch real user count for spot counter
  useEffect(() => {
    // In production, replace with a real API call to get user count
    // For now using hardcoded value
    setSpotsLeft(FOUNDING_TOTAL - FOUNDING_TAKEN);
  }, []);

  return (
    <div style={{ background: DARK, minHeight: "100vh", fontFamily: "'Outfit', sans-serif", color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Urgency Banner */}
      <div style={{ background: "#1a0f00", borderBottom: "1px solid #f5a62333", padding: "10px 20px", textAlign: "center", fontSize: 13 }}>
        <span style={{ color: GOLD, fontWeight: 700 }}>⚡ {spotsLeft} of {FOUNDING_TOTAL} founding spots remaining</span>
        <span style={{ color: LIGHT, marginLeft: 8 }}>· Lock in $24.99/mo forever ·{" "}
          <span style={{ color: GOLD, cursor: "pointer", textDecoration: "underline" }} onClick={go}>claim yours</span>
        </span>
      </div>

      {/* Nav */}
      <nav style={{ padding: "16px 24px", display: "flex", justifyContent: "space-between", alignItems: "center", maxWidth: 900, margin: "0 auto" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 22, fontWeight: 700, color: GOLD, letterSpacing: 2 }}>BETCIERGE</div>
        <button onClick={go} style={{ background: "none", border: "1px solid #1e1e2e", color: LIGHT, padding: "8px 18px", borderRadius: 8, cursor: "pointer", fontSize: 13, fontWeight: 500 }}>Sign in</button>
      </nav>

      {/* Hero */}
      <section style={{ maxWidth: 680, margin: "0 auto", padding: "60px 24px 40px", textAlign: "center" }}>
        <div style={{ display: "inline-block", background: "#1a1200", border: "1px solid #f5a62344", borderRadius: 20, padding: "4px 14px", fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 20 }}>
          From the team behind CaptainPicks
        </div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(34px, 8vw, 54px)", fontWeight: 700, lineHeight: 1.1, marginBottom: 16, color: "#fff" }}>
          The Discord. <em style={{ color: GOLD, fontStyle: "italic" }}>Plus AI.</em><br />For $24.99/mo.
        </h1>
        <p style={{ fontSize: 17, color: GRAY, lineHeight: 1.7, maxWidth: 520, margin: "0 auto 12px" }}>
          You've been getting CaptainPicks plays in the Discord. Betcierge is everything that has — same picks, same research — plus an AI betting assistant, full bet tracking, and live gamecast.
        </p>
        <p style={{ fontSize: 15, color: LIGHT, lineHeight: 1.7, maxWidth: 520, margin: "0 auto 32px", borderTop: "1px solid #1e1e2e", paddingTop: 16 }}>
          The Discord is <strong style={{ color: "#fff" }}>$600/mo</strong>. As a founding member, Betcierge is <strong style={{ color: GOLD }}>$24.99/mo — locked for life.</strong>
        </p>

        {/* Spot Counter */}
        <div style={{ background: "#1a0f00", border: "1px solid #f5a62344", borderRadius: 12, padding: "12px 20px", marginBottom: 24, display: "inline-block" }}>
          <div style={{ color: GOLD, fontWeight: 700, fontSize: 15 }}>⚡ {spotsLeft} founding spots left</div>
          <div style={{ color: GRAY, fontSize: 12, marginTop: 2 }}>After {FOUNDING_TOTAL} members, price goes to $29.99/mo</div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={go} style={{ background: GOLD, color: "#000", border: "none", borderRadius: 10, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Claim Founding Spot — $24.99/mo
          </button>
        </div>
        <p style={{ fontSize: 12, color: GRAY, marginTop: 12 }}>3-day free trial · Price locked forever · Cancel anytime</p>
      </section>

      {/* Stats */}
      <section style={{ maxWidth: 600, margin: "0 auto 60px", padding: "0 24px" }}>
        <div style={{ background: CARD, border: "1px solid #1e1e2e", borderRadius: 14, padding: "24px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: GRAY, marginBottom: 16 }}>Hunter's record since June 11, 2026</div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap", marginBottom: 16 }}>
            {[["36W-17L", "Record"], ["68%", "Win Rate"], ["+19.2u", "Units"], ["+27.8%", "ROI"]].map(([val, lbl]) => (
              <div key={lbl} style={{ textAlign: "center", minWidth: 70 }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: GREEN }}>{val}</div>
                <div style={{ fontSize: 11, color: GRAY }}>{lbl}</div>
              </div>
            ))}
          </div>
          <div style={{ color: GRAY, fontSize: 12, borderTop: "1px solid #1e1e2e", paddingTop: 12 }}>
            Wins and losses both shown. Nothing hidden.
          </div>
        </div>
      </section>

      {/* What you get */}
      <section style={{ maxWidth: 700, margin: "0 auto 60px", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>WHAT'S INSIDE</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "#fff" }}>Everything the Discord has, and more</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {features.map((f, i) => (
            <div key={i} style={{ background: CARD, border: "1px solid #1e1e2e", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 16, alignItems: "flex-start" }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{f.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{f.name}</div>
                <div style={{ color: GRAY, fontSize: 13, lineHeight: 1.5 }}>{f.desc}</div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Founding Pricing */}
      <section style={{ maxWidth: 700, margin: "0 auto 60px", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>FOUNDING MEMBER PRICING</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "#fff" }}>Lock it in before it's gone</h2>
          <p style={{ color: GRAY, fontSize: 14, marginTop: 8 }}>These prices disappear when the {FOUNDING_TOTAL} founding spots are filled.</p>
        </div>

        {/* Price Comparison Bar */}
        <div style={{ background: "#1a0f00", border: "1px solid #f5a62333", borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", justifyContent: "space-around", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: GRAY, fontSize: 12, textDecoration: "line-through" }}>CaptainPicks Discord</div>
            <div style={{ color: "#e74c3c", fontSize: 22, fontWeight: 800 }}>$600/mo</div>
          </div>
          <div style={{ color: GOLD, fontSize: 24, fontWeight: 700 }}>→</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: GRAY, fontSize: 12 }}>Betcierge Founding Team</div>
            <div style={{ color: GREEN, fontSize: 22, fontWeight: 800 }}>$24.99/mo</div>
            <div style={{ color: GOLD, fontSize: 11, fontWeight: 700 }}>🔒 LOCKED FOR LIFE</div>
          </div>
        </div>

        {/* Team Founding */}
        <div style={{ background: "#0d0a00", border: "2px solid #f5a623", borderRadius: 16, padding: "24px", marginBottom: 16, position: "relative" }}>
          <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: GOLD, color: "#000", fontSize: 11, fontWeight: 700, padding: "3px 14px", borderRadius: 20, whiteSpace: "nowrap" }}>
            MOST POPULAR
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>FOUNDING TEAM</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: "#fff" }}>$24.99<span style={{ fontSize: 14, color: GRAY, fontWeight: 400 }}>/mo</span></div>
                <div style={{ fontSize: 16, color: GRAY, textDecoration: "line-through" }}>$29.99</div>
              </div>
              <div style={{ color: GREEN, fontSize: 13, marginTop: 4 }}>🔒 Price locked for life</div>
              <div style={{ color: GRAY, fontSize: 12, marginTop: 2 }}>3-day free trial · Cancel anytime</div>
            </div>
            <div style={{ fontSize: 32 }}>🎯</div>
          </div>
          {["Daily picks at 11 AM ET", "Full Hunter AI chat — unlimited", "Snap to Log bet slips", "Live Gamecast", "Full bet tracking & auto-settlement", "Bankroll guardrails & tilt protection"].map((f, i) => (
            <div key={i} style={{ color: LIGHT, fontSize: 13, marginBottom: 8, display: "flex", gap: 8 }}>
              <span style={{ color: GREEN }}>✓</span>{f}
            </div>
          ))}
          <button onClick={go} style={{ width: "100%", marginTop: 16, padding: "14px", borderRadius: 10, border: "none", background: GOLD, color: "#000", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Claim Founding Team — $24.99/mo
          </button>
        </div>

        {/* Edge Founding */}
        <div style={{ background: CARD, border: "1px solid #2a1f4e", borderRadius: 16, padding: "24px", marginBottom: 12, position: "relative" }}>
          <div style={{ position: "absolute", top: -12, right: 20, background: PURPLE, color: "#000", fontSize: 10, fontWeight: 800, padding: "3px 10px", borderRadius: 20 }}>
            FOUNDING PRICE
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: PURPLE, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>FOUNDING EDGE</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: "#fff" }}>$59.99<span style={{ fontSize: 14, color: GRAY, fontWeight: 400 }}>/mo</span></div>
                <div style={{ fontSize: 16, color: GRAY, textDecoration: "line-through" }}>$79.99</div>
              </div>
              <div style={{ color: GREEN, fontSize: 13, marginTop: 4 }}>🔒 Price locked for life</div>
              <div style={{ color: GRAY, fontSize: 12, marginTop: 2 }}>3-day free trial · Cancel anytime</div>
            </div>
            <div style={{ fontSize: 32 }}>⚡</div>
          </div>
          <div style={{ color: GRAY, fontSize: 13, marginBottom: 10 }}>Everything in Founding Team, plus:</div>
          {["Exclusive edge plays beyond the daily 3", "Advanced analytics & deeper breakdowns", "Priority access to new features", "Early access to premium tools as they launch"].map((f, i) => (
            <div key={i} style={{ color: LIGHT, fontSize: 13, marginBottom: 8, display: "flex", gap: 8 }}>
              <span style={{ color: PURPLE }}>✓</span>{f}
            </div>
          ))}
          <button onClick={go} style={{ width: "100%", marginTop: 16, padding: "13px", borderRadius: 10, border: "1px solid #a78bfa", background: "none", color: PURPLE, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>
            Claim Founding Edge — $59.99/mo
          </button>
        </div>

        {/* Spot counter reminder */}
        <div style={{ textAlign: "center", color: GRAY, fontSize: 13, marginTop: 16 }}>
          <span style={{ color: GOLD, fontWeight: 700 }}>{spotsLeft} spots remaining</span> at founding pricing · After {FOUNDING_TOTAL} members, price goes to $29.99/$79.99
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 600, margin: "0 auto 60px", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>GOOD TO KNOW</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "#fff" }}>Questions, answered</h2>
        </div>
        {faqs.map((f, i) => (
          <div key={i} style={{ borderBottom: "1px solid #1e1e2e" }}>
            <button onClick={() => setOpenFaq(openFaq === i ? null : i)} style={{ width: "100%", background: "none", border: "none", padding: "18px 0", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", color: "#fff", fontSize: 14, fontWeight: 600, textAlign: "left" }}>
              {f.q}<span style={{ color: GOLD, fontSize: 20, flexShrink: 0, marginLeft: 12 }}>{openFaq === i ? "−" : "+"}</span>
            </button>
            {openFaq === i && <div style={{ color: GRAY, fontSize: 13, lineHeight: 1.7, paddingBottom: 16 }}>{f.a}</div>}
          </div>
        ))}
      </section>

      {/* Final CTA */}
      <section style={{ maxWidth: 600, margin: "0 auto 80px", padding: "0 24px" }}>
        <div style={{ background: "#0d0a00", border: "1px solid #f5a62344", borderRadius: 16, padding: "32px 28px", textAlign: "center" }}>
          <div style={{ color: GOLD, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>⚡ {spotsLeft} founding spots remaining</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 12 }}>
            Same picks. Better tools.<br />$24.99/mo — forever.
          </h2>
          <p style={{ color: GRAY, fontSize: 14, marginBottom: 8 }}>3 days free. Full access. No commitment.</p>
          <p style={{ color: GRAY, fontSize: 13, marginBottom: 24 }}>Cancel anytime from your account settings — <strong style={{ color: GOLD }}>no hoops, no calls.</strong></p>
          <button onClick={go} style={{ background: GOLD, color: "#000", border: "none", borderRadius: 10, padding: "14px 40px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%", marginBottom: 12 }}>
            Claim Founding Team — $24.99/mo
          </button>
          <button onClick={go} style={{ background: "none", border: "1px solid #2a1f4e", color: PURPLE, borderRadius: 10, padding: "12px 40px", fontSize: 14, fontWeight: 600, cursor: "pointer", width: "100%" }}>
            Claim Founding Edge — $59.99/mo
          </button>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ borderTop: "1px solid #1e1e2e", padding: "24px", textAlign: "center" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 18, fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 8 }}>BETCIERGE</div>
        <p style={{ color: GRAY, fontSize: 11, maxWidth: 480, margin: "0 auto", lineHeight: 1.7 }}>
          21+ · Bet responsibly · We help you set limits.<br />
          If gambling stops being fun, it is time to stop. Call 1-800-GAMBLER for free, confidential help.<br />
          Betcierge is an information and discipline tool. It is not a sportsbook and does not take bets.
        </p>
      </footer>
    </div>
  );
}
