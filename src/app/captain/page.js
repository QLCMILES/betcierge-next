"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  FOUNDING_TOTAL,
  FOUNDING_SPOTS_LEFT,
  FOUNDING_ACTIVE,
  STRIPE_PRICE_CURRENT,
} from "../../lib/pricing";

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

const features = [
  { icon: "🤖", name: "Ask Hunter anything", desc: "The same research behind every pick, for any game, any question, in seconds." },
  { icon: "🕐", name: "Picks when they're ready", desc: "At least one sharp play daily, up to three when the edge is there — never on a fixed clock." },
  { icon: "🛡️", name: "Guardrails built in", desc: "Tilt recognition and real check-ins, not just a P&L tracker." },
  { icon: "📸", name: "Snap to Log", desc: "Screenshot any bet slip — Hunter reads and logs it automatically." },
  { icon: "📡", name: "Live Gamecast", desc: "Watch your games and your money move in real time on one screen." },
  { icon: "📋", name: "Your real record — always visible", desc: "Every pick tracked and auto-settled after every game, every sport. Your true win rate, units, and ROI — always current, never massaged. Wins and losses both shown. The receipts are always there." },
];

const sharedFaqs = [
  { q: "Can I cancel anytime?", a: "Yes — from your account settings, no calls, no hoops." },
  { q: "Do you show losses?", a: "Every single one. A record that hides losses is a lie. Ours does not." },
  { q: "What's included?", a: "Everything — daily picks, full unlimited Hunter chat, Lean Machine, Snap to Log, Live Gamecast, and bankroll guardrails. One price, no tiers to choose between." },
  { q: "What do free accounts get?", a: "Our record is fully public and transparent — anyone can see it, no account needed. Our premium research, including full daily picks and Lean Machine, is reserved for subscribers." },
];

const captainFaqs = [
  { q: "How is this different from the CaptainPicks Discord?", a: "The Discord gives you the picks. Betcierge gives you the picks plus the full reasoning behind every one, Hunter chat for any game at any hour, and your entire record tracked automatically." },
];

export default function CaptainPage({ onGetStarted }) {
  const [openFaq, setOpenFaq] = useState(null);
  const [record, setRecord] = useState({ wins: 0, losses: 0, units: 0, roi: 0, winRate: 0 });
  const [pickOpen, setPickOpen] = useState(false);
  const [hunterOpen, setHunterOpen] = useState(false);
  const go = () => { if (onGetStarted) onGetStarted(); };

  const claimFounding = (priceId, planName) => {
    localStorage.setItem('founding_price_id', priceId);
    localStorage.setItem('founding_plan_name', planName);
    window.location.href = '/';
  };

  // Fetch real user count for spot counter
  useEffect(() => {
    supabase
      .from('daily_picks')
      .select('result, units, odds')
      .eq('status', 'active')
      .gte('date', '2026-06-11')
      .in('result', ['Win', 'Loss'])
      .then(({ data }) => {
        if (!data) return;
        const wins = data.filter(p => p.result === 'Win').length;
        const losses = data.filter(p => p.result === 'Loss').length;
        const settled = wins + losses;
        const winRate = settled > 0 ? Math.round((wins / settled) * 100) : 0;
        const unitsPnl = data.reduce((acc, p) => {
          const u = p.units || 1;
          const odds = parseInt(p.odds) || -110;
          if (p.result === 'Win') {
            const profit = odds > 0 ? u * (odds / 100) : u * (100 / Math.abs(odds));
            return acc + profit;
          }
          if (p.result === 'Loss') return acc - u;
          return acc;
        }, 0);
        const totalRisked = data.reduce((acc, p) => acc + (p.units || 1), 0);
        const roi = totalRisked > 0 ? (unitsPnl / totalRisked) * 100 : 0;
        setRecord({ wins, losses, units: unitsPnl, roi, winRate });
      });
  }, []);

  return (
    <div style={{ background: DARK, minHeight: "100vh", fontFamily: "'Outfit', sans-serif", color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Urgency Banner */}
      <div style={{ background: "#1a0f00", borderBottom: "1px solid #f5a62333", padding: "10px 20px", textAlign: "center", fontSize: 13 }}>
        <span style={{ color: GOLD, fontWeight: 700 }}>⚡ {FOUNDING_SPOTS_LEFT} of {FOUNDING_TOTAL} founding spots remaining</span>
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
          Your personal betting coach,<br /><em style={{ color: GOLD, fontStyle: "italic" }}>on call 24/7.</em>
        </h1>
        <div style={{ color: GOLD, fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Change the way you bet.</div>
        <p style={{ fontSize: 17, color: LIGHT, lineHeight: 1.7, maxWidth: 540, margin: "0 auto 12px" }}>
          Enhanced Intelligence — cloned from six years of CaptainPicks research and systems, built to research every game the way the pros do, around the clock. Hunter gives you the picks with full reasoning, coaches you through every bet, and answers any question, any hour.
        </p>
        <p style={{ fontSize: 15, color: LIGHT, lineHeight: 1.7, maxWidth: 520, margin: "0 auto 32px", borderTop: "1px solid #1e1e2e", paddingTop: 16 }}>
          The Discord was <strong style={{ color: "#fff" }}>$600/mo</strong>. Founding members get all of this for <strong style={{ color: GOLD }}>$24.99/mo — locked for life.</strong>
        </p>

        {/* Spot Counter */}
        <div style={{ background: "#1a0f00", border: "1px solid #f5a62344", borderRadius: 12, padding: "12px 20px", marginBottom: 24, display: "inline-block" }}>
          <div style={{ color: GOLD, fontWeight: 700, fontSize: 15 }}>⚡ {FOUNDING_SPOTS_LEFT} founding spots left</div>
          <div style={{ color: GRAY, fontSize: 12, marginTop: 2 }}>After {FOUNDING_TOTAL} members, price goes to $29.99/mo</div>
        </div>

        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => claimFounding(STRIPE_PRICE_CURRENT, 'Founding Member')} style={{ background: GOLD, color: "#000", border: "none", borderRadius: 10, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
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
            {[
              [`${record.wins}W-${record.losses}L`, "Record"],
              [`${record.winRate}%`, "Win Rate"],
              [`${record.units >= 0 ? '+' : ''}${record.units.toFixed(1)}u`, "Units"],
              [`${record.roi >= 0 ? '+' : ''}${record.roi.toFixed(1)}%`, "ROI"],
            ].map(([val, lbl]) => (
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
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "#fff" }}>Research, tracking, discipline. One system.</h2>
          <p style={{ color: GRAY, fontSize: 14, marginTop: 8, maxWidth: 500, margin: "8px auto 0" }}>Most betting products give you picks. Betcierge gives you the whole operation behind them.</p>
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

      {/* Founding Pricing — single tier */}
      <section style={{ maxWidth: 700, margin: "0 auto 60px", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>FOUNDING MEMBER PRICING</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "#fff" }}>Lock it in before it's gone</h2>
          <p style={{ color: GRAY, fontSize: 14, marginTop: 8 }}>This price disappears when the {FOUNDING_TOTAL} founding spots are filled.</p>
        </div>

        {/* Price Comparison Bar */}
        <div style={{ background: "#1a0f00", border: "1px solid #f5a62333", borderRadius: 12, padding: "16px 20px", marginBottom: 20, display: "flex", justifyContent: "space-around", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: GRAY, fontSize: 12, textDecoration: "line-through" }}>CaptainPicks Discord</div>
            <div style={{ color: "#e74c3c", fontSize: 22, fontWeight: 800 }}>$600/mo</div>
          </div>
          <div style={{ color: GOLD, fontSize: 24, fontWeight: 700 }}>→</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: GRAY, fontSize: 12 }}>Betcierge Founding Member</div>
            <div style={{ color: GREEN, fontSize: 22, fontWeight: 800 }}>$24.99/mo</div>
            <div style={{ color: GOLD, fontSize: 11, fontWeight: 700 }}>🔒 LOCKED FOR LIFE</div>
          </div>
        </div>

        {/* Single Founding Price Card */}
        <div style={{ background: "#0d0a00", border: "2px solid #f5a623", borderRadius: 16, padding: "24px", marginBottom: 16, position: "relative" }}>
          <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: GOLD, color: "#000", fontSize: 11, fontWeight: 700, padding: "3px 14px", borderRadius: 20, whiteSpace: "nowrap" }}>
            FOUNDING PRICE
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 }}>
            <div>
              <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>FOUNDING MEMBER</div>
              <div style={{ display: "flex", alignItems: "baseline", gap: 10 }}>
                <div style={{ fontSize: 36, fontWeight: 800, color: "#fff" }}>$24.99<span style={{ fontSize: 14, color: GRAY, fontWeight: 400 }}>/mo</span></div>
                <div style={{ fontSize: 16, color: GRAY, textDecoration: "line-through" }}>$29.99</div>
              </div>
              <div style={{ color: GREEN, fontSize: 13, marginTop: 4 }}>🔒 Price locked for life</div>
              <div style={{ color: GRAY, fontSize: 12, marginTop: 2 }}>3-day free trial · Cancel anytime</div>
            </div>
            <div style={{ fontSize: 32 }}>🎯</div>
          </div>
          {["Daily picks + full Hunter chat", "Lean Machine — extra plays beyond the daily picks", "Snap to Log bet slips", "Live Gamecast", "Full bet tracking & auto-settlement", "Bankroll guardrails & tilt protection"].map((f, i) => (
            <div key={i} style={{ color: LIGHT, fontSize: 13, marginBottom: 8, display: "flex", gap: 8 }}>
              <span style={{ color: GREEN }}>✓</span>{f}
            </div>
          ))}
          <button onClick={() => claimFounding(STRIPE_PRICE_CURRENT, 'Founding Member')} style={{ width: "100%", marginTop: 16, padding: "14px", borderRadius: 10, border: "none", background: GOLD, color: "#000", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Claim Founding Price — $24.99/mo
          </button>
        </div>

        {/* Spot counter reminder */}
        <div style={{ textAlign: "center", color: GRAY, fontSize: 13, marginTop: 16 }}>
          <span style={{ color: GOLD, fontWeight: 700 }}>{FOUNDING_SPOTS_LEFT} spots remaining</span> at founding pricing · After {FOUNDING_TOTAL} members, price goes to $29.99
        </div>
      </section>

      {/* FAQ */}
      <section style={{ maxWidth: 600, margin: "0 auto 60px", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>GOOD TO KNOW</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "#fff" }}>Questions, answered</h2>
        </div>
        {[...captainFaqs, ...sharedFaqs].map((f, i) => (
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
          <div style={{ color: GOLD, fontWeight: 700, fontSize: 13, marginBottom: 8 }}>⚡ {FOUNDING_SPOTS_LEFT} founding spots remaining</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 12 }}>
            Your personal betting coach.<br />$24.99/mo — forever.
          </h2>
          <p style={{ color: GRAY, fontSize: 14, marginBottom: 8 }}>3 days free. Full access. No commitment.</p>
          <p style={{ color: GRAY, fontSize: 13, marginBottom: 24 }}>Change the way you bet. <strong style={{ color: GOLD }}>Founding price locked for life.</strong></p>
          <button onClick={() => claimFounding(STRIPE_PRICE_CURRENT, 'Founding Member')} style={{ background: GOLD, color: "#000", border: "none", borderRadius: 10, padding: "14px 40px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" }}>
            Claim Founding Price — $24.99/mo
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