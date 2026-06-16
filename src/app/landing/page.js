"use client";
import { useState, useEffect } from "react";

const GOLD = "#f5a623";
const DARK = "#0a0a0f";
const CARD = "#111118";
const BORDER = "#1e1e2e";
const GREEN = "#2ecc71";
const GRAY = "#6b7280";
const LIGHT = "#d1d5db";

const FOUNDING_END = new Date(Date.now() + 6 * 24 * 60 * 60 * 1000);

function useCountdown(target) {
  const [time, setTime] = useState("");
  useEffect(() => {
    const tick = () => {
      const diff = target - Date.now();
      if (diff <= 0) { setTime("Expired"); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      const s = Math.floor((diff % 60000) / 1000);
      setTime(`${d}d ${h}h ${m}m ${s}s`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [target]);
  return time;
}

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
  { q: "Can I cancel anytime?", a: "Yes. Cancel from your account settings — no calls, no hoops. If you're on a founding rate, we'll remind you before anything changes." },
  { q: "Is this betting advice?", a: "Betcierge is an information and discipline tool. We help you research, size bets, and track your record. We do not take bets. Always bet responsibly." },
  { q: "Will it really stop me overspending?", a: "Hunter monitors your weekly P&L and flags when you're approaching your limits. It won't stop you — but it will make sure you see what you're doing before you do it." },
  { q: "What if I'm brand new to this?", a: "Perfect. Hunter explains everything in plain English. No jargon, no assumptions. Just honest, clear analysis built for real bettors at every level." },
  { q: "Do you really show losses?", a: "Every single one. A record that hides losses is a lie. Ours does not. 15W-3L since June 11 — wins and losses both shown." },
];

export default function Landing({ onGetStarted }) {
  const countdown = useCountdown(FOUNDING_END);
  const [openFaq, setOpenFaq] = useState(null);
  const go = () => { if (onGetStarted) onGetStarted(); };

  return (
    <div style={{ background: DARK, minHeight: "100vh", fontFamily: "'Outfit', sans-serif", color: "#fff" }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />

      {/* Banner */}
      <div style={{ background: "#1a1200", borderBottom: "1px solid #f5a62333", padding: "10px 20px", textAlign: "center", fontSize: 13 }}>
        <span style={{ color: GOLD }}>●</span>
        <span style={{ color: LIGHT, marginLeft: 8 }}>
          Founding rate ends in <strong style={{ color: GOLD }}>{countdown}</strong> ·{" "}
          <span style={{ color: GOLD, cursor: "pointer", textDecoration: "underline" }} onClick={go}>lock it for life</span>
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
          AI-Powered Sports Betting
        </div>
        <h1 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: "clamp(36px, 8vw, 58px)", fontWeight: 700, lineHeight: 1.1, marginBottom: 16, color: "#fff" }}>
          Never bet <em style={{ color: GOLD, fontStyle: "italic" }}>alone</em> again.
        </h1>
        <p style={{ fontSize: 17, color: GRAY, lineHeight: 1.7, maxWidth: 520, margin: "0 auto 32px" }}>
          Your own betting team in your pocket. Picks, a real-time analyst, and guardrails that keep you in the game.
        </p>
        <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={go} style={{ background: GOLD, color: "#000", border: "none", borderRadius: 10, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Join The Team — $29.99/mo</button>
          <button onClick={go} style={{ background: "none", border: "1px solid #1e1e2e", color: LIGHT, borderRadius: 10, padding: "14px 24px", fontSize: 15, fontWeight: 500, cursor: "pointer" }}>Start free →</button>
        </div>
        <p style={{ fontSize: 12, color: GRAY, marginTop: 12 }}>No card needed for free tier · Cancel anytime</p>
      </section>

      {/* Slate Preview */}
      <section style={{ maxWidth: 480, margin: "0 auto 60px", padding: "0 24px" }}>
        <div style={{ background: CARD, border: "1px solid #1e1e2e", borderRadius: 16, overflow: "hidden" }}>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e1e2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ fontWeight: 700, fontSize: 14 }}>Today's Slate</span>
            <span style={{ color: GRAY, fontSize: 12 }}>Tue, Jun 16</span>
          </div>
          <div style={{ padding: "14px 18px", borderBottom: "1px solid #1e1e2e", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div>
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                <span style={{ background: "#1a1a00", color: GOLD, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>MLB</span>
                <span style={{ color: GRAY, fontSize: 11 }}>7:10 PM ET · High confidence</span>
              </div>
              <div style={{ fontWeight: 700, fontSize: 14 }}>Cincinnati Reds ML</div>
            </div>
            <span style={{ background: "#0a2e0a", color: GREEN, fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>FREE</span>
          </div>
          {[{ sport: "MLB", label: "Philadelphia Phillies ML" }, { sport: "MLB", label: "Chicago Cubs -1.5" }].map((p, i) => (
            <div key={i} style={{ padding: "14px 18px", borderBottom: i === 0 ? "1px solid #1e1e2e" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: 0.5 }}>
              <div>
                <div style={{ marginBottom: 4 }}>
                  <span style={{ background: "#1a1a00", color: GOLD, fontSize: 9, fontWeight: 700, padding: "2px 6px", borderRadius: 4 }}>{p.sport}</span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, filter: "blur(4px)", userSelect: "none" }}>{p.label}</div>
              </div>
              <span style={{ color: GRAY, fontSize: 12, fontWeight: 600 }}>🔒 Locked</span>
            </div>
          ))}
          <div style={{ padding: "12px 18px", background: "#0d0d18", textAlign: "center", fontSize: 12, color: GRAY }}>
            You're seeing <strong style={{ color: "#fff" }}>1 of 3</strong> plays — shown 1 hour late.{" "}
            <span style={{ color: GOLD, cursor: "pointer" }} onClick={go}>The Team</span> unlocks all 3, early.
          </div>
        </div>
      </section>

      {/* Credibility */}
      <section style={{ maxWidth: 600, margin: "0 auto 60px", padding: "0 24px", textAlign: "center" }}>
        <div style={{ background: CARD, border: "1px solid #1e1e2e", borderRadius: 14, padding: "24px 28px" }}>
          <div style={{ fontSize: 17, fontWeight: 600, color: "#fff", marginBottom: 8 }}>
            We never promise wins.<br />We show <em style={{ color: GOLD }}>every result</em> — wins and losses.
          </div>
          <div style={{ color: GRAY, fontSize: 13, lineHeight: 1.6, marginBottom: 20 }}>A record that hides losses is a lie. Ours does not. Built by bettors, tracked in public.</div>
          <div style={{ display: "flex", gap: 16, justifyContent: "center", flexWrap: "wrap" }}>
            {[["15W-3L", "Since Jun 11"], ["83%", "Win Rate"], ["+16.3u", "Units"], ["+56%", "ROI"]].map(([val, lbl]) => (
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
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "#fff" }}>Everything, in plain English</h2>
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

      {/* Pricing */}
      <section style={{ maxWidth: 700, margin: "0 auto 60px", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>PRICING</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "#fff" }}>Simple, honest pricing</h2>
        </div>

        <div style={{ background: CARD, border: "1px solid #1e1e2e", borderRadius: 16, padding: "24px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: GRAY, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>THE LOOKOUT</div>
          <div style={{ fontSize: 13, color: GRAY, marginBottom: 12 }}>Get a taste. See if we're for real.</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", marginBottom: 16 }}>Free <span style={{ fontSize: 14, color: GRAY, fontWeight: 400 }}>No card needed</span></div>
          {["1 of today's 3 plays (shown 1 hour late)", "Ask Hunter 5 questions a day", "Log your bets and track your record"].map((f, i) => (
            <div key={i} style={{ color: LIGHT, fontSize: 13, marginBottom: 8, display: "flex", gap: 8 }}><span style={{ color: GREEN }}>✓</span>{f}</div>
          ))}
          {["The other 2 plays and the early drop", "The guardrails that stop overspending"].map((f, i) => (
            <div key={i} style={{ color: GRAY, fontSize: 13, marginBottom: 8, display: "flex", gap: 8 }}><span>🔒</span>{f}</div>
          ))}
          <button onClick={go} style={{ width: "100%", marginTop: 16, padding: "13px", borderRadius: 10, border: "1px solid #1e1e2e", background: "none", color: LIGHT, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Start free</button>
        </div>

        <div style={{ background: "#0d0a00", border: "2px solid #f5a623", borderRadius: 16, padding: "24px", marginBottom: 12, position: "relative" }}>
          <div style={{ position: "absolute", top: -12, left: "50%", transform: "translateX(-50%)", background: GOLD, color: "#000", fontSize: 11, fontWeight: 700, padding: "3px 14px", borderRadius: 20, whiteSpace: "nowrap" }}>MOST PEOPLE PICK THIS</div>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>THE TEAM</div>
          <div style={{ fontSize: 13, color: GRAY, marginBottom: 12 }}>Your whole crew, in your corner.</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", marginBottom: 4 }}>$29.99<span style={{ fontSize: 14, color: GRAY, fontWeight: 400 }}> / month</span></div>
          <div style={{ fontSize: 12, color: GRAY, marginBottom: 16 }}>Billed monthly · cancel anytime · <span style={{ color: GREEN }}>or $197/yr and save 45%</span></div>
          {["All 3 plays early at 11 AM sharp", "Unlimited Hunter — ask anything, anytime", "Full guardrails: bet sizing, limits, loss stops", "Tilt protection on losing streaks", "Your full record and closing-line proof", "Live game tracking", "Snap and log bet slips automatically", "Auto-settlement for all sports"].map((f, i) => (
            <div key={i} style={{ color: LIGHT, fontSize: 13, marginBottom: 8, display: "flex", gap: 8 }}><span style={{ color: GREEN }}>✓</span>{f}</div>
          ))}
          <button onClick={go} style={{ width: "100%", marginTop: 16, padding: "14px", borderRadius: 10, border: "none", background: GOLD, color: "#000", fontSize: 15, fontWeight: 700, cursor: "pointer" }}>Join The Team — $29.99/mo</button>
        </div>

        <div style={{ background: CARD, border: "1px solid #1e1e2e", borderRadius: 16, padding: "24px", marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: GREEN, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>THE EDGE</div>
          <div style={{ fontSize: 13, color: GRAY, marginBottom: 12 }}>For serious bettors who want every advantage.</div>
          <div style={{ fontSize: 36, fontWeight: 800, color: "#fff", marginBottom: 4 }}>$79.99<span style={{ fontSize: 14, color: GRAY, fontWeight: 400 }}> / month</span></div>
          <div style={{ fontSize: 12, color: GRAY, marginBottom: 16 }}>or <span style={{ color: GREEN }}>$499/yr and save 48%</span></div>
          {["Everything in The Team plus:", "Extra plays and player props throughout the day", "Pro tools to find the best price on every bet", "Advanced bankroll planning", "Priority Hunter and the sharp channel"].map((f, i) => (
            <div key={i} style={{ color: i === 0 ? GRAY : LIGHT, fontSize: 13, marginBottom: 8, display: "flex", gap: 8 }}>
              {i > 0 && <span style={{ color: GREEN }}>✓</span>}{f}
            </div>
          ))}
          <button onClick={go} style={{ width: "100%", marginTop: 16, padding: "13px", borderRadius: 10, border: "1px solid #2ecc71", background: "none", color: GREEN, fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Go Pro</button>
        </div>

        <div style={{ background: CARD, border: "1px solid #7C3AED44", borderRadius: 16, padding: "24px" }}>
          <div style={{ fontSize: 11, color: "#a78bfa", fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 4 }}>CAPITAL</div>
          <div style={{ fontSize: 13, color: GRAY, marginBottom: 12 }}>By invitation. Run it like a business.</div>
          <div style={{ fontSize: 28, fontWeight: 800, color: "#fff", marginBottom: 16 }}>Invite only</div>
          {["Everything in The Edge", "One-on-one access", "Staking and backing", "Custom limits built around you"].map((f, i) => (
            <div key={i} style={{ color: LIGHT, fontSize: 13, marginBottom: 8, display: "flex", gap: 8 }}><span style={{ color: "#a78bfa" }}>✓</span>{f}</div>
          ))}
          <button style={{ width: "100%", marginTop: 16, padding: "13px", borderRadius: 10, border: "1px solid #7C3AED", background: "none", color: "#a78bfa", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Request an invite</button>
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
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 28, fontWeight: 700, color: "#fff", marginBottom: 12 }}>Lock your founding rate</h2>
          <p style={{ color: GRAY, fontSize: 14, marginBottom: 8 }}>First 500 members keep this price for life. <strong style={{ color: GOLD }}>213 spots left.</strong></p>
          <p style={{ color: GRAY, fontSize: 13, marginBottom: 24 }}>Offer ends in <strong style={{ color: GOLD }}>{countdown}</strong>.</p>
          <button onClick={go} style={{ background: GOLD, color: "#000", border: "none", borderRadius: 10, padding: "14px 40px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" }}>
            Join The Team — $29.99/mo
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
