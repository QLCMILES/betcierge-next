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
  { icon: "🎯", name: "The top 3 edges of the day — every morning at 11 AM ET", desc: "Every morning Hunter identifies the three best plays across every sport on the board that day. NFL spreads. NBA totals. MLB run lines. Soccer moneylines. College football. Whatever has the sharpest edge that day — that's what you get. Not limited to one sport. Not forced to fit a format. Just the three best plays, every day, with the full reasoning behind each one." },
  { icon: "🤖", name: "Professional handicapper depth. In seconds.", desc: "Before Betcierge, getting this level of research meant either doing it yourself for hours or paying a professional handicapper thousands a month. Hunter does it in seconds. Ask about any game, any sport, any line — and get a breakdown that covers line movement, injury reports, matchup history, sharp money signals, recent form, and situational angles. The kind of analysis that used to take a full afternoon to produce." },
  { icon: "🔍", name: "Any sport. Any question. Any hour.", desc: "Is your NFL team a trap line this week? What's the sharp money doing on tonight's NBA total? Is this soccer team on a bad run at home? Is the MLB bullpen gassed after a 12-inning game two days ago? Is this college basketball spread too big given the travel schedule? Hunter searches for the answer in real time, no matter the sport, no matter the hour. Day or night. Weekday or weekend. Preseason or playoffs." },
  { icon: "⚡", name: "NFL · College Football · NBA · Soccer · MLB · College Basketball · NHL · UFC · And more", desc: "Hunter doesn't have an off-season. There is always a game. There is always an edge somewhere on the board. And Hunter is always searching for it — across every league, every sport, every day of the year." },
  { icon: "📸", name: "Snap to Log — any sportsbook", desc: "Screenshot your bet slip from TryInk, FanDuel, DraftKings, BetMGM, Caesars, or any offshore book. Hunter reads it and logs every detail automatically. Game, pick, odds, wager, to win — all captured in seconds. No typing. No manual entry." },
  { icon: "📡", name: "Live Gamecast", desc: "Watch your games and your money move in real time on one screen. Live scores across every sport, live P&L on your active bets, everything updating as the action happens. Never lose track of where you stand." },
  { icon: "📋", name: "Your real record — always visible", desc: "Every pick tracked and auto-settled after every game, every sport. Your true win rate, units, and ROI — always current, never massaged. Wins and losses both shown. The receipts are always there." },
  { icon: "🛡️", name: "Bankroll management that actually works", desc: "Set your weekly bankroll and profit targets once. Hunter tracks your P&L in real time, sizes every bet intelligently, and flags you before you breach your limits. One bad night doesn't become a catastrophe. The guardrail every serious bettor needs but almost nobody has." },
];

const faqs = [
  { q: "How is this different from the CaptainPicks Discord?", a: "The Discord gives you the picks. Betcierge gives you the picks plus the full reasoning behind every one — live pitcher research, line movement analysis, sharp money signals, weather, umpire data. Plus you can ask Hunter about any game at any hour and get a professional-level breakdown in seconds. Plus your entire betting record tracked and settled automatically. It's not a supplement to the Discord. It's what the Discord was always trying to be." },
  { q: "How does Hunter actually research games?", a: "Hunter uses live web search on every question and every pick. When it analyzes a game it searches current injury reports, both starting pitchers' last 3 starts, line movement from open to now, sharp money signals, weather at the stadium, and umpire tendencies. It's the same research process a professional handicapper runs — done in seconds, every time." },
  { q: "What does 'founding member' mean?", a: "The first 500 members lock in $24.99/mo forever. When regular pricing launches at $29.99/mo, your price never changes. Ever. You're getting in at the ground floor of something that's going to be a lot more expensive very soon." },
  { q: "What's the difference between Founding Team and Founding Edge?", a: "Team gets you everything — daily picks with full AI analysis, unlimited Hunter chat, snap to log, live gamecast, and full tracking. Edge adds exclusive deeper plays beyond the daily 3, advanced analytics, and priority access to every new feature as it launches. Both prices are locked for life." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel from your account settings — no calls, no hoops, no questions asked. The 3-day trial is genuinely free. If it's not for you, cancel before day 3 and you pay nothing." },
  { q: "Do you show losses?", a: "Every single one. 36W-17L since June 11. The wins and the losses, always visible. A record that hides losses is a lie. Ours does not." },
];

export default function CaptainPage({ onGetStarted }) {
  const [openFaq, setOpenFaq] = useState(null);
  const [spotsLeft, setSpotsLeft] = useState(FOUNDING_TOTAL - FOUNDING_TAKEN);
const [pickOpen, setPickOpen] = useState(false);
const [hunterOpen, setHunterOpen] = useState(false);
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
          Your professional handicapper.<br /><em style={{ color: GOLD, fontStyle: "italic" }}>In your pocket. 24/7.</em>
        </h1>
        <p style={{ fontSize: 17, color: LIGHT, lineHeight: 1.7, maxWidth: 540, margin: "0 auto 12px" }}>
          We took everything we built into CaptainPicks — 6 years of research, systems, and edge — and programmed it into an AI that never sleeps. Hunter researches every game in real time, gives you the picks with full reasoning, manages your bankroll, and answers any question about any line at any hour.
        </p>
        <p style={{ fontSize: 15, color: GRAY, lineHeight: 1.7, maxWidth: 520, margin: "0 auto 12px" }}>
          This isn't the Discord with a chatbot bolted on. This is a completely different level of service — the kind of access that used to cost thousands a month, rebuilt from the ground up for serious bettors.
        </p>
        <p style={{ fontSize: 15, color: LIGHT, lineHeight: 1.7, maxWidth: 520, margin: "0 auto 32px", borderTop: "1px solid #1e1e2e", paddingTop: 16 }}>
          The Discord was <strong style={{ color: "#fff" }}>$600/mo</strong>. Founding members get all of this for <strong style={{ color: GOLD }}>$24.99/mo — locked for life.</strong>
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

      {/* Demo Section */}
<section style={{ maxWidth: 700, margin: "0 auto 60px", padding: "0 24px" }}>
  <div style={{ textAlign: "center", marginBottom: 32 }}>
    <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>SEE IT IN ACTION</div>
    <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "#fff" }}>Real picks. Real research. Real results.</h2>
    <p style={{ color: GRAY, fontSize: 14, marginTop: 8 }}>Every pick comes with the full breakdown. Every question gets a professional answer.</p>
  </div>

  {/* Pick Card */}
  <div style={{ background: "#0d0a00", border: "1.5px solid #f5a623", borderRadius: 16, padding: "18px 20px", marginBottom: 14, position: "relative" }}>
    <div style={{ position: "absolute", top: 16, right: 16, background: "#0a2010", color: "#2ecc71", fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>✓ WIN</div>
    <div style={{ background: "#1a1200", color: GOLD, fontSize: 10, fontWeight: 700, padding: "2px 8px", borderRadius: 4, display: "inline-block", marginBottom: 8 }}>MLB</div>
    <div style={{ fontSize: 12, color: GRAY, marginBottom: 4 }}>Los Angeles Dodgers @ San Diego Padres · 9:40 PM ET</div>
    <div style={{ fontSize: 20, fontWeight: 700, color: "#fff", marginBottom: 10 }}>San Diego Padres ML</div>
    <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 14 }}>
      <span style={{ fontSize: 15, fontWeight: 700, color: GREEN }}>+126</span>
      <span style={{ background: "#f5a62320", color: GOLD, fontSize: 12, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>2U</span>
      <span style={{ fontSize: 12, color: GRAY }}>Medium confidence · Plus money value</span>
    </div>
    <div style={{ borderTop: "1px solid #1e1e2e", marginBottom: 12 }} />
    <div style={{ fontSize: 13, color: "#9ca3af", lineHeight: 1.65 }}>
      <span style={{ color: GOLD, fontWeight: 600 }}>Walker Buehler's Revenge Game at Petco</span> — Buehler posting a 1.72 ERA with 4 straight 1-run starts in June, facing his former team at home. The Dodgers counter with Roki Sasaki (4.76 ERA, just gave up 7 runs to the White Sox). At +126 on a motivated home team with the better starter — this is the value side.
      {pickOpen && (
        <span>
          <br /><br />Buehler spent almost his entire career in Los Angeles before joining San Diego this year, and he's been excellent in June — posting a 1.72 ERA with 15 strikeouts over his last 3 starts. He's allowed exactly 1 run in 4 straight starts this month, lowering his season ERA to 3.96. His cutter has become his signature pitch, averaging 91 mph (0.9 mph above season average), and he induced 10 whiffs on 46 swings in his last outing against Baltimore. At home at Petco Park, Buehler has a 3.32 ERA compared to 4.78 on the road. The veteran knows how to pitch in this park.
          <br /><br /><span style={{ color: GOLD, fontWeight: 600 }}>Roki Sasaki's Struggles Continue</span><br />
          The Dodgers counter with Roki Sasaki, who owns a 4.76 ERA and 1.29 WHIP with a troubling 70:25 K:BB ratio through 68 innings. His last start: 7 runs to the White Sox in just 4.1 innings. The Dodgers are 52-29 but lead the NL West by 9 games — this is a spot where they could look ahead.
          <br /><br /><span style={{ color: GOLD, fontWeight: 600 }}>Padres Riding Momentum, Home Value</span><br />
          San Diego just swept the Braves and is 6-4 in their last 10. They took 2 of 3 from the Dodgers earlier this season. With Michael King anchoring the rotation (3.46 ERA, 72 K's) and the lineup healthy, they match up well. <span style={{ color: GOLD, fontWeight: 600 }}>At +126, the Padres moneyline offers excellent value on a motivated home team with the better starter on the night.</span>
        </span>
      )}
    </div>
    <button onClick={() => setPickOpen(!pickOpen)} style={{ marginTop: 12, background: "none", border: "0.5px solid #f5a62350", color: GOLD, fontSize: 12, fontWeight: 600, padding: "6px 16px", borderRadius: 20, cursor: "pointer" }}>
      {pickOpen ? "Show less ↑" : "Read full breakdown ↓"}
    </button>
  </div>

  {/* Hunter Chat */}
  <div style={{ background: CARD, border: `1px solid ${BORDER}`, borderRadius: 16, overflow: "hidden" }}>
    <div style={{ padding: "12px 16px", borderBottom: `1px solid ${BORDER}`, display: "flex", alignItems: "center", gap: 10 }}>
      <div style={{ width: 32, height: 32, background: "#1a1200", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 16 }}>🤖</div>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: "#fff" }}>Hunter</div>
        <div style={{ fontSize: 11, color: GREEN }}>● Searching live</div>
      </div>
    </div>
    <div style={{ padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 12 }}>
        <div style={{ background: "#1a1a2e", border: `1px solid ${BORDER}`, borderRadius: "12px 12px 2px 12px", padding: "10px 14px", fontSize: 13, color: "#fff", maxWidth: "82%" }}>
          What's the best bet in the Japan vs Brazil match today?
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, alignItems: "flex-start" }}>
        <div style={{ width: 26, height: 26, background: "#1a1200", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13, flexShrink: 0, marginTop: 2 }}>🤖</div>
        <div style={{ background: "#0d0a00", border: "0.5px solid #f5a62340", borderRadius: "2px 12px 12px 12px", padding: "12px 14px", fontSize: 13, color: "#d1d5db", lineHeight: 1.65, width: "100%" }}>
          <div style={{ display: "inline-block", background: "#1a1200", color: "#f5a62370", fontSize: 11, padding: "2px 8px", borderRadius: 4, marginBottom: 10 }}>
            Searched: line movement · group stage form · injury reports · xG · Brazil knockout history
          </div>
          <br />
          <span style={{ color: GOLD, fontWeight: 600 }}>Sharp money is hammering the over.</span> The total opened at +130 on over 2.5 and has been bet down to +125 — significant movement for a World Cup knockout. When the line moves toward the over despite heavy action on Brazil's moneyline, sharps see goals regardless of who wins.
          {hunterOpen && (
            <span>
              <br /><br />
              <span style={{ color: GOLD, fontWeight: 600 }}>Both teams scored in every group match.</span> Brazil produced 9 total goals across 3 games. But Japan is NOT Haiti or Scotland — they went unbeaten in Group F, drew the Netherlands 2-2, crushed Tunisia 4-0, drew Sweden 1-1. They scored 7 goals in the group stage and showed genuine attacking intent against elite opposition. Moriyasu's team doesn't park the bus — they exploit space behind aggressive defensive lines, which is exactly what Brazil will provide.
              <br /><br />
              <span style={{ color: GOLD, fontWeight: 600 }}>The injury context changes the game script.</span> Japan is missing Kubo, Endo, Mitoma, and Minamino — all key players. That forces them to take more risks and opens up transition moments — exactly where Brazil have been conceding. Three of their 6 goals allowed came on the counter. Brazil hasn't been involved in a quiet knockout game since 2006. Even a 2-1 Brazil win cashes the over.
            </span>
          )}
          <div style={{ marginTop: 10, padding: "8px 12px", background: "#0a2010", border: "0.5px solid #2ecc7140", borderRadius: 8, color: GREEN, fontSize: 12, fontWeight: 600, lineHeight: 1.5 }}>
            ✓ Over 2.5 Goals at +125. Sharp line movement, both teams' attacking form, and Brazil's knockout history all point the same direction. Prediction: Brazil 3-1 Japan.
          </div>
          <button onClick={() => setHunterOpen(!hunterOpen)} style={{ marginTop: 12, background: "none", border: "0.5px solid #f5a62350", color: GOLD, fontSize: 12, fontWeight: 600, padding: "6px 16px", borderRadius: 20, cursor: "pointer" }}>
            {hunterOpen ? "Show less ↑" : "Read full analysis ↓"}
          </button>
        </div>
      </div>
    </div>
  </div>
</section>

      {/* What you get */}
      <section style={{ maxWidth: 700, margin: "0 auto 60px", padding: "0 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 32 }}>
          <div style={{ fontSize: 11, color: GOLD, fontWeight: 700, letterSpacing: 1, textTransform: "uppercase", marginBottom: 8 }}>WHAT'S INSIDE</div>
          <h2 style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 32, fontWeight: 700, color: "#fff" }}>A different level of service</h2>
          <p style={{ color: GRAY, fontSize: 14, marginTop: 8, maxWidth: 500, margin: "8px auto 0" }}>Six years of handicapping knowledge, programmed into an AI that works around the clock.</p>
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
            Your professional handicapper.<br />$24.99/mo — forever.
          </h2>
          <p style={{ color: GRAY, fontSize: 14, marginBottom: 8 }}>3 days free. Full access. No commitment.</p>
          <p style={{ color: GRAY, fontSize: 13, marginBottom: 24 }}>The kind of service that used to cost thousands a month. Built for serious bettors. <strong style={{ color: GOLD }}>Founding price locked for life.</strong></p>
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