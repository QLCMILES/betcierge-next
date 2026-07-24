"use client";
import { useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import {
  FOUNDING_TOTAL,
  FOUNDING_SPOTS_LEFT,
  FOUNDING_ACTIVE,
  STRIPE_PRICE_CURRENT,
  CURRENT_PRICE_DISPLAY,
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
  { icon: "🤖", name: "Hunter — your betting brain", desc: "Text it like a friend. Ask about any game and get a clear, honest answer in seconds — day or night." },
  { icon: "🎯", name: "The Morning 3", desc: "Three best plays, every day at 11 AM. You get them early — before the lines move and the crowd piles in." },
  { icon: "🛡️", name: "The guardrails", desc: "Tell us your budget once. We make sure you never blow past it — no more 1 AM chasing." },
  { icon: "⚡", name: "Smart bet sizing", desc: "We tell you how much to put on each play, so one bad night can't wipe you out." },
  { icon: "🧠", name: "Tilt protection", desc: "Down bad? Hunter jumps in and helps you slow down before you do something you'll regret." },
  { icon: "📋", name: "The receipts", desc: "We track every pick — wins and losses. Nothing hidden. You always see the real record." },
  { icon: "📡", name: "Live Gamecast", desc: "Watch your games and your money move in real time, all on one screen." },
  { icon: "📸", name: "Snap & log", desc: "Screenshot your bet slip and we log it for you. No typing." },
];

const faqs = [
  { q: "What makes this different from a generic AI chatbot?", a: "A chatbot answers questions. Betcierge is a full system built around one goal — research, bankroll guardrails, bet tracking, and a real public record, all working together to help you bet well, not just get an answer." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel from your account settings — no calls, no hoops. No fees, no questions asked." },
  { q: "Is this betting advice?", a: "Betcierge is an information and discipline tool. We help you research, size bets, and track your record. We do not take bets. Always bet responsibly." },
  { q: "Will it really stop me overspending?", a: "Hunter monitors your weekly P&L and flags when you're approaching your limits. It won't stop you — but it will make sure you see what you're doing before you do it." },
  { q: "What if I'm brand new to this?", a: "Perfect. Hunter explains everything in plain English. No jargon, no assumptions. Just honest, clear analysis built for real bettors at every level." },
  { q: "What do free accounts get?", a: "Our record is fully public and transparent — anyone can see it, no account needed. Our premium research, including full daily picks and Lean Machine, is reserved for subscribers." },
];

export default function Landing({ onGetStarted }) {
  const [openFaq, setOpenFaq] = useState(null);
  const [picks, setPicks] = useState([]);
  const [record, setRecord] = useState({ wins: 0, losses: 0, units: 0, roi: 0, winRate: 0 });
  const go = () => { if (onGetStarted) onGetStarted(); };

  useEffect(() => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    supabase
      .from('daily_picks')
      .select('sport, game, pick, odds, game_time, confidence')
      .eq('date', today)
      .eq('status', 'active')
      .limit(3)
      .then(({ data }) => { if (data) setPicks(data); });

    // Live record — same query captain/page.js uses, so the number is
    // never allowed to drift from what's actually in the database again.
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

      {/* Banner */}
      <div style={{ background: "#1a1200", borderBottom: "1px solid #f5a62333", padding: "10px 20px", textAlign: "center", fontSize: 13 }}>
        <span style={{ color: GOLD, fontWeight: 700 }}>⚡ {FOUNDING_SPOTS_LEFT} of {FOUNDING_TOTAL} founding spots remaining</span>
        <span style={{ color: LIGHT, marginLeft: 8 }}>
          · Lock in {CURRENT_PRICE_DISPLAY} forever ·{" "}
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
          It's not AI. It's EI.
        </div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(36px, 8vw, 58px)", fontWeight: 700, lineHeight: 1.1, marginBottom: 16, color: "#fff" }}>
          Your personal betting coach,<br /><em style={{ color: GOLD, fontStyle: "italic" }}>on call 24/7.</em>
        </h1>
        <div style={{ color: GOLD, fontSize: 15, fontWeight: 600, marginBottom: 16 }}>Change the way you bet.</div>
        <p style={{ fontSize: 17, color: LIGHT, lineHeight: 1.7, maxWidth: 520, margin: "0 auto 12px" }}>
          Enhanced Intelligence — cloned from real sports betting habits, built to research every game the way the pros do, around the clock. Hunter gives you the picks with full reasoning, coaches you through every bet, and answers any question, any hour.
        </p>
        <p style={{ fontSize: 14, color: "#555", lineHeight: 1.7, maxWidth: 520, margin: "0 auto 32px", borderTop: "1px solid #1e1e2e", paddingTop: 16 }}>
          NFL · NBA · MLB · Soccer · NHL · UFC · Golf · Tennis — every sport, every day.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={() => go()} style={{ background: GOLD, color: "#000", border: "none", borderRadius: 10, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Claim Founding Spot — {CURRENT_PRICE_DISPLAY}
          </button>
        </div>
        <p style={{ fontSize: 12, color: GRAY, marginTop: 12 }}>3-day free trial · Price locked forever · Cancel anytime</p>
      </section>

      {/* Slate Preview */}
      <section style={{ maxWidth: 480, margin: "0 auto 60px", padding: "0 24px" }}>
        <div style={{ background: CARD, border: "1px solid #1e1e2e", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e1e2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Today's Slate</span>
            <span style={{ color: GRAY, fontSize: 12 }}>{new Date().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', timeZone: 'America/New_York' })}</span>
          </div>
          {picks.length === 0 ? (
            <div style={{ padding: "20px", textAlign: "center", color: GRAY, fontSize: 13 }}>Today's picks loading...</div>
          ) : picks.map((p, i) => (
            <div key={i} style={{ padding: "14px 18px", borderBottom: i < picks.length - 1 ? "1px solid #1e1e2e" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: i === 0 ? 1 : 0.5 }}>
              <div>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ background: "#1a1a00", color: GOLD, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>{p.sport}</span>
                  {i === 0 && <span style={{ color: GRAY, fontSize: 11 }}>{p.game_time} · {p.confidence} confidence</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, filter: i > 0 ? "blur(4px)" : "none", userSelect: i > 0 ? "none" : "auto" }}>{p.pick}</div>
              </div>
              {i === 0
                ? <span style={{ background: "#0a2e0a", color: GREEN, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>FREE</span>
                : <span style={{ color: GRAY, fontSize: 12, fontWeight: 600 }}>🔒 Locked</span>
              }
            </div>
          ))}
          <div style={{ padding: "12px 18px", background: "#0d0d18", textAlign: "center", fontSize: 12, color: GRAY }}>
            You're seeing <strong style={{ color: "#fff" }}>1 of 3</strong> plays — plus Lean Machine.{" "}
            <span style={{ color: GOLD, cursor: "pointer" }} onClick={go}>Subscribe</span> unlocks everything.
          </div>
        </div>
      </section>

      {/* Credibility — now a single live-fetched record, matching captain/page.js exactly */}
      <section style={{ maxWidth: 600, margin: "0 auto 60px", padding: "0 24px", textAlign: "center" }}>
        <div style={{ background: CARD, border: "1px solid #1e1e2e", borderRadius: 14, padding: "24px 28px" }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "#fff", marginBottom: 8 }}>
            We never promise wins.<br />We show <em style={{ color: GOLD }}>every result</em> — wins and losses.
          </div>
          <div style={{ color: GRAY, fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>A record that hides losses is a lie. Ours does not. Built by bettors, tracked in public.</div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            {[
              [`${record.wins}W-${record.losses}L`, "Since Jun 11"],
              [`${record.winRate}%`, "Win Rate"],
              [`${record.units >= 0 ? '+' : ''}${record.units.toFixed(1)}u`, "Units"],
              [`${record.roi >= 0 ? '+' : ''}${record.roi.toFixed(1)}%`, "ROI"],
            ].map(([val, lbl]) => (
              <div key={lbl} style={{ textAlign: "center" }}>
                <div style={{ fontSize: 22, fontWeight: 800, color: GREEN }}>{val}</div>
                <div style={{ fontSize: 11, color: GRAY }}>{lbl}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Features */}
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

      {/* Pricing — single tier, replacing the old 4-tier Lookout/Team/Edge/Capital structure */}
      <section style={{ maxWidth: 700, margin: "0 auto 60px", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>FOUNDING MEMBER PRICING</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "#fff" }}>Lock it in before it's gone</h2>
          <p style={{ color: GRAY, fontSize: 14, marginTop: 8 }}>This price disappears when the {FOUNDING_TOTAL} founding spots are filled.</p>
        </div>

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
          <button onClick={go} style={{ width: "100%", marginTop: 16, padding: "14px", borderRadius: 10, border: "none", background: GOLD, color: "#000", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>
            Claim Founding Price — $24.99/mo
          </button>
        </div>

        <div style={{ textAlign: "center", color: GRAY, fontSize: 13, marginTop: 4 }}>
          <span style={{ color: GOLD, fontWeight: 700 }}>{FOUNDING_SPOTS_LEFT} spots remaining</span> at founding pricing · After {FOUNDING_TOTAL} members, price goes to $29.99
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
              {f.q}<span style={{ color: GOLD, fontSize: 20, flexShrink: 0 }}>{openFaq === i ? "−" : "+"}</span>
            </button>
            {openFaq === i && <div style={{ color: GRAY, fontSize: 13, lineHeight: 1.7, paddingBottom: 16 }}>{f.a}</div>}
          </div>
        ))}
      </section>

      {/* CTA */}
      <section style={{ maxWidth: 600, margin: "0 auto 80px", padding: "0 24px" }}>
        <div style={{ background: "#0d0a00", border: "1px solid #f5a62344", borderRadius: 16, padding: "32px 28px", textAlign: "center" }}>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Start your free trial today</h2>
          <p style={{ color: GRAY, fontSize: 14, marginBottom: 8 }}>3 days free. Full access. No commitment.</p>
          <p style={{ color: GRAY, fontSize: 13, marginBottom: 24 }}>Cancel anytime from your account settings — <strong style={{ color: GOLD }}>no hoops, no calls.</strong></p>
          <button onClick={go} style={{ background: GOLD, color: "#000", border: "none", borderRadius: 10, padding: "14px 40px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" }}>
            Claim Founding Spot — {CURRENT_PRICE_DISPLAY}
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