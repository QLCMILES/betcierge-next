"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";
import {
  FOUNDING_TOTAL,
  FOUNDING_SPOTS_LEFT,
  FOUNDING_ACTIVE,
  STRIPE_PRICE_CURRENT,
} from "../../lib/pricing";

const GOLD = "#f5a623";
const DARK = "#0a0a0f";
const CARD = "#111118";
const BORDER = "#1e1e2e";
const GREEN = "#2ecc71";
const GRAY = "#6b7280";
const LIGHT = "#d1d5db";

const features = [
  { icon: "🤖", name: "Hunter — your betting coach", kicker: "Bring the hunch. Hunter brings the homework.", desc: "Ask about any game, bet, line, or idea. Hunter digs into the numbers, challenges your take, and tells you what he actually thinks — even when you don't want to hear it." },
  { icon: "🎯", name: "Daily Picks", kicker: "No edge? No bet.", desc: "Every game gets researched. When there's a play worth making, you get it. No picks forced just because you want action." },
  { icon: "🛡️", name: "Bankroll Guardrails", kicker: "Because \"I'll win it back\" is not a strategy.", desc: "Hunter keeps your bankroll, weekly goal, and bigger picture in view — especially when your gut is telling you to forget all three." },
];

const sharedFaqs = [
  { q: "Is this betting advice?", a: "Betcierge is a research and discipline tool. We help you find edges, size bets, and track your record — we don't take bets. Always bet responsibly." },
  { q: "Do you show losses?", a: "Every single one. A record that hides losses is a lie. Ours does not." },
  { q: "What happens to my founding price if I cancel?", a: "Your $24.99/mo rate holds for as long as you stay subscribed. If you cancel and resubscribe after founding spots are gone, you'd rejoin at the standard rate." },
  { q: "Can I cancel anytime?", a: "Yes — from your account settings, no calls, no hoops." },
  { q: "What do free accounts get?", a: "Our full record is public, no account needed. Daily Picks and full Hunter chat are for subscribers." },
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
        <span style={{ color: LIGHT, marginLeft: 8 }}>· $24.99/mo, rate holds while subscribed ·{" "}
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
          The research of an analyst.<br /><em style={{ color: GOLD, fontStyle: "italic" }}>The discipline of a pro.</em>
        </h1>
        <div style={{ color: GOLD, fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Bet smarter. Stay disciplined. Win the week.</div>
        <p style={{ fontSize: 17, color: LIGHT, lineHeight: 1.7, maxWidth: 540, margin: "0 auto 12px" }}>
          Hunter is built from six years of CaptainPicks research and systems — the same rigor, now researching every game, challenging your takes, and keeping your bankroll and goals in view while you do it.
        </p>
        <p style={{ fontSize: 15, color: LIGHT, lineHeight: 1.7, maxWidth: 520, margin: "0 auto 32px", borderTop: "1px solid #1e1e2e", paddingTop: 16 }}>
          The Discord was <strong style={{ color: "#fff" }}>$600/mo</strong>. Founding members get all of this for <strong style={{ color: GOLD }}>$24.99/mo — rate holds while you stay subscribed.</strong>
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
        <p style={{ fontSize: 12, color: GRAY, marginTop: 12 }}>3-day free trial · Rate holds while subscribed · Cancel anytime</p>
      </section>

      {/* Stats */}
      <section style={{ maxWidth: 600, margin: "0 auto 60px", padding: "0 24px" }}>
        <div style={{ background: CARD, border: "1px solid #1e1e2e", borderRadius: 14, padding: "24px 28px", textAlign: "center" }}>
          <div style={{ fontSize: 14, color: GRAY, marginBottom: 16 }}>No cherry-picking. No deleted losses. Just the record — since June 11, 2026.</div>
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
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "#fff" }}>This isn't another picks service.<br />It's a better way to bet.</h2>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {features.map((f, i) => (
            <div key={i} style={{ background: CARD, border: "1px solid #1e1e2e", borderRadius: 12, padding: "16px 20px", display: "flex", gap: 16, alignItems: "flex-start" }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>{f.icon}</span>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 3 }}>{f.name}</div>
                <div style={{ color: GOLD, fontSize: 13, fontStyle: "italic", marginBottom: 4 }}>{f.kicker}</div>
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
            <div style={{ color: GOLD, fontSize: 11, fontWeight: 700 }}>🔒 RATE HOLDS WHILE SUBSCRIBED</div>
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
              <div style={{ color: GREEN, fontSize: 13, marginTop: 4 }}>🔒 Rate locked while subscribed</div>
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
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 12 }}>
            You don't need more bets.<br />You need a better way to bet.
          </h2>
          <p style={{ color: GRAY, fontSize: 14, marginBottom: 24 }}>Join the first {FOUNDING_TOTAL} Betcierge members and lock in your $24.99/mo founding rate for as long as you stay subscribed.</p>
          <button onClick={() => claimFounding(STRIPE_PRICE_CURRENT, 'Founding Member')} style={{ background: GOLD, color: "#000", border: "none", borderRadius: 10, padding: "14px 40px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" }}>
            Start My 3-Day Free Trial
          </button>
          <p style={{ color: GRAY, fontSize: 12, marginTop: 12 }}>$24.99/mo after trial · Rate holds while subscribed · Cancel anytime</p>
          <p style={{ color: GOLD, fontSize: 13, fontWeight: 700, marginTop: 8 }}>{FOUNDING_SPOTS_LEFT} founding spots remaining</p>
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