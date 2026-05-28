"use client";
import { useState, useEffect, useRef } from "react";

// ── Constants ──────────────────────────────────────────────────────────────
const SPORTS = [
  { id: "mlb", label: "MLB", emoji: "⚾" },
  { id: "nba", label: "NBA", emoji: "🏀" },
  { id: "nfl", label: "NFL", emoji: "🏈" },
  { id: "nhl", label: "NHL", emoji: "🏒" },
  { id: "soccer", label: "Soccer", emoji: "⚽" },
  { id: "ufc", label: "UFC/MMA", emoji: "🥊" },
  { id: "ncaab", label: "NCAAB", emoji: "🏀" },
  { id: "ncaaf", label: "NCAAF", emoji: "🏈" },
  { id: "golf", label: "Golf", emoji: "⛳" },
  { id: "tennis", label: "Tennis", emoji: "🎾" },
];
const BET_TYPES = ["Moneyline", "Spread", "Total (O/U)", "Parlay", "Prop", "Live Bet", "Team Total"];
const SPORT_OPTIONS = ["MLB", "NBA", "NFL", "NHL", "Soccer", "UFC/MMA", "NCAAB", "NCAAF", "Golf", "Tennis"];
const LIVE_GAMES = [
  { id: 1, sport: "NBA", home: "OKC Thunder", away: "Spurs", homeScore: 62, awayScore: 58, status: "Q3 2:14" },
  { id: 2, sport: "MLB", home: "Pirates", away: "Phillies", homeScore: 1, awayScore: 2, status: "B6" },
  { id: 3, sport: "MLB", home: "Rays", away: "Marlins", homeScore: 4, awayScore: 2, status: "T7" },
];

// ── Helpers ────────────────────────────────────────────────────────────────
const calcProfit = (amount, odds) => {
  const o = parseFloat(odds), a = parseFloat(amount);
  if (!o || !a) return null;
  return o > 0 ? (o / 100) * a : (100 / Math.abs(o)) * a;
};
const fmt = (n) => `$${Math.abs(n || 0).toFixed(2)}`;
const today = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

// ── API Call Helper ────────────────────────────────────────────────────────
const callClaude = async (messages, system, useSearch = false, imageBase64 = null, maxTokens = 1500) => {
  const body = {
    model: "claude-sonnet-4-5",
    max_tokens: maxTokens,
    system,
    messages,
  };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];

  const response = await fetch("/api/claude", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  // Extract all text blocks regardless of tool use interleaving
  const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  return { text, raw: data };
};

// ── Onboarding ─────────────────────────────────────────────────────────────
function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", phone: "", username: "", password: "", bankroll: "", goal: "", selectedSports: [] });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleSport = (id) => set("selectedSports", form.selectedSports.includes(id) ? form.selectedSports.filter(s => s !== id) : [...form.selectedSports, id]);
  const roi = form.bankroll && form.goal ? (parseFloat(form.goal) / parseFloat(form.bankroll)) * 100 : 0;

  const canNext = [
    () => form.name && form.email && form.phone,
    () => form.username && form.password,
    () => form.bankroll && form.goal && parseFloat(form.bankroll) > 0 && parseFloat(form.goal) > 0,
    () => form.selectedSports.length > 0,
    () => true,
  ];
  const stepLabels = ["Your Info", "Account", "Goals", "Sports", "Let's Go"];

  return (
    <div style={S.ob.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={S.ob.card}>
        <div style={S.ob.logo}>BETCIERGE</div>
        <div style={S.ob.tagline}>Your Personal Betting Concierge</div>
        <div style={S.ob.stepRow}>{stepLabels.map((_, i) => <div key={i} style={{ ...S.ob.dot, ...(i === step ? S.ob.dotActive : i < step ? S.ob.dotDone : {}) }} />)}</div>
        <div style={S.ob.stepLbl}>{stepLabels[step]}</div>

        {step === 0 && <>
          <h2 style={S.ob.title}>Welcome. Let's get started.</h2>
          <p style={S.ob.sub}>We'll personalize your experience and keep your data secure.</p>
          <input style={S.input} placeholder="Full Name" value={form.name} onChange={e => set("name", e.target.value)} />
          <input style={S.input} placeholder="Email Address" type="email" value={form.email} onChange={e => set("email", e.target.value)} />
          <input style={S.input} placeholder="Phone Number" type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} />
        </>}

        {step === 1 && <>
          <h2 style={S.ob.title}>Create your account.</h2>
          <p style={S.ob.sub}>You'll use these to log in every time.</p>
          <input style={S.input} placeholder="Choose a Username" value={form.username} onChange={e => set("username", e.target.value)} />
          <input style={S.input} placeholder="Create a Password" type="password" value={form.password} onChange={e => set("password", e.target.value)} />
        </>}

        {step === 2 && <>
          <h2 style={S.ob.title}>Set your weekly targets, {form.name.split(" ")[0]}.</h2>
          <p style={S.ob.sub}>Discipline starts with knowing your numbers.</p>
          <label style={S.label}>Weekly Bankroll ($)</label>
          <input style={S.input} placeholder="e.g. 2500" type="number" value={form.bankroll} onChange={e => set("bankroll", e.target.value)} />
          <label style={S.label}>Weekly Profit Goal ($)</label>
          <input style={S.input} placeholder="e.g. 250" type="number" value={form.goal} onChange={e => set("goal", e.target.value)} />
          {roi > 0 && (
            <div style={{ ...S.ob.roiBox, borderColor: roi > 20 ? "#e74c3c" : "#f5a623" }}>
              <div style={{ display: "flex", justifyContent: "space-between" }}>
                <span style={{ color: "#888", fontSize: 13 }}>Target ROI</span>
                <span style={{ color: roi > 20 ? "#e74c3c" : "#f5a623", fontWeight: 700, fontSize: 16, fontFamily: "'Cormorant Garamond',serif" }}>{roi.toFixed(1)}% / week</span>
              </div>
              {roi > 20 && <div style={S.ob.roiWarn}>⚠️ The world's sharpest bettors average 5–10% ROI weekly. Targeting over 20% typically leads to overbetting and chasing. Consistency beats home runs every time.</div>}
            </div>
          )}
        </>}

        {step === 3 && <>
          <h2 style={S.ob.title}>What do you bet on?</h2>
          <p style={S.ob.sub}>We'll tailor your daily card — but we'll always surface the best spots regardless.</p>
          <div style={S.ob.sportsGrid}>{SPORTS.map(s => (
            <button key={s.id} onClick={() => toggleSport(s.id)} style={{ ...S.ob.sportBtn, ...(form.selectedSports.includes(s.id) ? S.ob.sportOn : {}) }}>
              <span style={{ fontSize: 22 }}>{s.emoji}</span>
              <span style={{ color: "#aaa", fontSize: 12, fontWeight: 600, fontFamily: "'Outfit',sans-serif" }}>{s.label}</span>
            </button>
          ))}</div>
        </>}

        {step === 4 && (
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 52, marginBottom: 12 }}>🎉</div>
            <h2 style={S.ob.title}>You're all set, {form.name.split(" ")[0]}!</h2>
            <div style={S.ob.trialBox}>
              <div style={{ color: "#f5a623", fontSize: 20, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, marginBottom: 4 }}>First Month FREE</div>
              <div style={{ color: "#888", fontSize: 13, marginBottom: 16 }}>Then $9.99/month. Cancel anytime.</div>
              {["Daily AI picks from Hunter", "📸 Snap to Log — photo bet logging", "Live bankroll & P&L tracking", "Discipline alerts & guardrails", "Full history & betting analytics"].map((f, i) => (
                <div key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, textAlign: "left" }}>✅ {f}</div>
              ))}
            </div>
            <div style={{ color: "#555", fontSize: 12, marginTop: 8 }}>No charge today. Auto-renews after 30 days at $9.99/mo.</div>
          </div>
        )}

        <button style={{ ...S.ob.nextBtn, ...(canNext[step]() ? {} : { opacity: 0.3, cursor: "not-allowed" }) }}
          onClick={() => canNext[step]() && (step < 4 ? setStep(step + 1) : onComplete({ ...form, bankroll: parseFloat(form.bankroll), goal: parseFloat(form.goal) }))}
          disabled={!canNext[step]()}>
          {step === 4 ? "Start My Free Month →" : step < 3 ? "Continue →" : "Meet Hunter →"}
        </button>
      </div>
    </div>
  );
}

// ── Alert ──────────────────────────────────────────────────────────────────
function Alert({ msg, type }) {
  const colors = { warning: ["#2a1f00", "#f5a623"], danger: ["#2a0000", "#e74c3c"], success: ["#002a0d", "#2ecc71"], info: ["#001a2a", "#3498db"] };
  const [bg, clr] = colors[type] || colors.info;
  return (
    <div style={{ background: bg, border: `1px solid ${clr}`, borderRadius: 10, padding: "12px 16px", marginBottom: 10, display: "flex", gap: 10, alignItems: "flex-start" }}>
      <span style={{ fontSize: 16 }}>😇</span>
      <span style={{ color: clr, fontSize: 13, fontFamily: "'Outfit',sans-serif", fontWeight: 500, lineHeight: 1.5 }}>{msg}</span>
    </div>
  );
}

// ── Snap to Log ────────────────────────────────────────────────────────────
function SnapToLog({ onConfirm, onCancel }) {
  const [stage, setStage] = useState("upload"); // upload | reading | confirm | error
  const [extractedBet, setExtractedBet] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const fileRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    setStage("reading");

    // Convert to base64
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = () => rej(new Error("Read failed"));
      r.readAsDataURL(file);
    });

    // Show preview
    setImagePreview(URL.createObjectURL(file));

    try {
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1000,
          system: `You are Hunter, an expert at reading sports betting slip screenshots from any sportsbook (FanDuel, DraftKings, BetMGM, Caesars, offshore books, etc).

Extract the bet details and return ONLY raw JSON with no markdown, no backticks, no explanation:
{
  "sport": "MLB|NBA|NFL|NHL|Soccer|UFC/MMA|NCAAB|NCAAF|Golf|Tennis",
  "game": "Team A vs Team B",
  "betType": "Moneyline|Spread|Total (O/U)|Parlay|Prop|Live Bet|Team Total",
  "pick": "full pick description e.g. Spurs +3.5 1H",
  "odds": "-110 or +150 format",
  "amount": 220.00,
  "toWin": 200.00,
  "confidence": 95
}

If it's a parlay, set betType to Parlay and pick to all legs joined with " + ".
confidence = how sure you are about the extraction (0-100).
If you cannot read the slip clearly, return: {"error": "reason"}`,
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
              { type: "text", text: "Read this bet slip and extract all the betting details." }
            ]
          }]
        })
      });

      const data = await response.json();
      const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
      const clean = text.replace(/```json|```/g, "").trim();
      const parsed = JSON.parse(clean);

      if (parsed.error) {
        setErrorMsg(parsed.error);
        setStage("error");
      } else {
        setExtractedBet(parsed);
        setStage("confirm");
      }
    } catch (e) {
      setErrorMsg("Couldn't read the bet slip. Try a clearer screenshot or log manually.");
      setStage("error");
    }
  };

  const handleConfirm = () => {
    onConfirm({
      sport: extractedBet.sport,
      game: extractedBet.game,
      betType: extractedBet.betType,
      pick: extractedBet.pick,
      odds: extractedBet.odds,
      amount: extractedBet.amount,
      type: "Planned",
      result: "Pending",
      profit: 0,
      isToday: true,
      id: Date.now(),
    });
  };

  return (
    <div style={S.snap.wrap}>
      <div style={S.snap.header}>
        <div style={S.snap.title}>📸 Snap to Log</div>
        <button onClick={onCancel} style={S.snap.closeBtn}>×</button>
      </div>

      {stage === "upload" && (
        <div style={S.snap.uploadZone} onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
          <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
          <div style={S.snap.uploadTitle}>Upload your bet slip</div>
          <div style={S.snap.uploadSub}>Screenshot from any sportsbook — FanDuel, DraftKings, BetMGM, offshore books</div>
          <div style={S.snap.uploadBtn}>Choose Photo</div>
        </div>
      )}

      {stage === "reading" && (
        <div style={S.snap.reading}>
          {imagePreview && <img src={imagePreview} alt="slip" style={S.snap.preview} />}
          <div style={S.snap.readingOverlay}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>🔍</div>
            <div style={{ color: "#f5a623", fontWeight: 700, fontSize: 16, marginBottom: 8 }}>Hunter is reading your slip...</div>
            <div style={{ color: "#888", fontSize: 13 }}>Extracting game, pick, odds and amount</div>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width: 32, height: 32, border: "3px solid #2a2a38", borderTopColor: "#f5a623", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "16px auto 0" }} />
          </div>
        </div>
      )}

      {stage === "confirm" && extractedBet && (
        <div style={S.snap.confirm}>
          <div style={S.snap.confirmTitle}>✅ Hunter read your slip</div>
          <div style={S.snap.confirmSub}>Confirm the details are correct:</div>

          {imagePreview && <img src={imagePreview} alt="slip" style={{ ...S.snap.preview, marginBottom: 16 }} />}

          <div style={S.snap.detailsCard}>
            {[
              { label: "Sport", value: extractedBet.sport },
              { label: "Game", value: extractedBet.game },
              { label: "Bet Type", value: extractedBet.betType },
              { label: "Pick", value: extractedBet.pick },
              { label: "Odds", value: extractedBet.odds },
              { label: "Wager", value: `$${extractedBet.amount}` },
              { label: "To Win", value: `$${extractedBet.toWin}` },
            ].map((d, i) => (
              <div key={i} style={S.snap.detailRow}>
                <span style={S.snap.detailLabel}>{d.label}</span>
                <span style={S.snap.detailValue}>{d.value}</span>
              </div>
            ))}
          </div>

          {extractedBet.confidence < 90 && (
            <Alert msg={`Hunter is ${extractedBet.confidence}% confident in this read. Double-check the details before confirming.`} type="warning" />
          )}

          <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
            <button onClick={onCancel} style={S.snap.editBtn}>Edit Manually</button>
            <button onClick={handleConfirm} style={S.snap.confirmBtn}>✅ Log This Bet</button>
          </div>
        </div>
      )}

      {stage === "error" && (
        <div style={{ padding: 20, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>😕</div>
          <div style={{ color: "#e74c3c", fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Couldn't read the slip</div>
          <div style={{ color: "#888", fontSize: 13, marginBottom: 20 }}>{errorMsg}</div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setStage("upload")} style={S.snap.editBtn}>Try Again</button>
            <button onClick={onCancel} style={S.snap.confirmBtn}>Log Manually</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Hunter AI ──────────────────────────────────────────────────────────────
function Hunter({ user, bets }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [picksLoading, setPicksLoading] = useState(false);
  const [dailyPicks, setDailyPicks] = useState(null);
  const bottomRef = useRef(null);

  const netPL = bets.reduce((s, b) => {
    if (b.result === "Win") return s + (calcProfit(b.amount, b.odds) || 0);
    if (b.result === "Loss") return s - b.amount;
    return s;
  }, 0);

  useEffect(() => { loadDailyPicks(); }, []);
  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

const loadDailyPicks = async (retryCount = 0) => {
  setPicksLoading(true);
  setDailyPicks(null);
  try {
    // Check Supabase for today's picks first
    const checkRes = await fetch('/api/claude', { method: 'GET' });
    const checkData = await checkRes.json();

    if (checkData.picks && checkData.picks.length >= 3) {
      setDailyPicks({ picks: checkData.picks, summary: checkData.picks[0]?.summary || "Hunter's top plays for today." });
      setPicksLoading(false);
      return;
    }

    // Fetch real odds data
    const oddsRes = await fetch('/api/odds');
    const oddsData = await oddsRes.json();
    const todayStr = new Date().toISOString().split('T')[0];
    const tomorrowStr = new Date(Date.now() + 24*60*60*1000).toISOString().split('T')[0];
    const slimGames = (oddsData.games || [])
      .filter(g => new Date(g.commence_time) > new Date())
      .slice(0, 10)
      .map(g => {
        const bm = g.bookmakers?.[0];
        const h2h = bm?.markets?.find(m => m.key === 'h2h');
        const spread = bm?.markets?.find(m => m.key === 'spreads');
        const total = bm?.markets?.find(m => m.key === 'totals');
        return {
          sport: g.sport_title,
          game: `${g.away_team} @ ${g.home_team}`,
          time: g.commence_time,
          moneyline: h2h?.outcomes?.map(o => `${o.name}: ${o.price}`).join(', '),
          spread: spread?.outcomes?.map(o => `${o.name} ${o.point}: ${o.price}`).join(', '),
          total: total?.outcomes?.map(o => `${o.name} ${o.point}: ${o.price}`).join(', '),
        };
      });
    const gamesContext = JSON.stringify(slimGames);

    // Generate picks with web search enabled for real research
    const result = await callClaude(
  [{ role: "user", content: `Today is ${today()}. Here are today's games and lines: ${gamesContext}.

For each of the 3 games you want to pick, you MUST web search:
1. "[Team1] vs [Team2] prediction today"
2. "[Starting pitcher name] stats 2025" for MLB games
3. "[Team] injury report today"
4. "[Team] last 10 games results"

Use what you find to build a sharp, specific case — name the pitchers, cite the ERA and WHIP, mention recent trends, head-to-head records, any injuries. Reference where you found the info.

Return ONLY raw JSON:
{"picks":[{"sport":"...","game":"...","pick":"...","odds":"...","confidence":"High|Medium|Low","insight":"3-4 sentences with SPECIFIC stats, pitcher names, injury info, and trends you found via search. No generic odds reasoning.","units":1,"game_time":"7:05 PM ET"}],"summary":"1 sharp sentence about today's card"}` }],
  `You are Hunter, an elite sports betting analyst. Today is ${today()}. You have web search — USE IT aggressively before making any pick. Your insights must reference specific players, stats, and trends found via search. Generic odds-based reasoning is not acceptable. Return ONLY raw JSON.`,
  true,
  null,
  4000
);

    const clean = result.text.replace(/```json|```/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("No JSON");
    const parsed = JSON.parse(jsonMatch[0]);
    if (!parsed.picks) throw new Error("Invalid format");

    // Save to Supabase
    await fetch('/api/claude', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ picks: parsed.picks, date: todayStr })
    });

    setDailyPicks(parsed);
  } catch {
    if (retryCount < 2) {
      setPicksLoading(false);
      setTimeout(() => loadDailyPicks(retryCount + 1), 2000);
    } else {
      setDailyPicks({ picks: [{ sport: "⚠️", game: "Couldn't load picks", pick: "Tap ↻ to retry", odds: "--", confidence: "Low", insight: "Hunter hit a snag. Tap refresh to try again.", units: 1 }], summary: "Tap ↻ to reload." });
      setPicksLoading(false);
    }
  }
};
  
  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    setMessages(m => [...m, { role: "user", text: userMsg }]);
    setLoading(true);
    try {
      const result = await callClaude(
        [
          ...messages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })),
          { role: "user", content: userMsg }
        ],
       `You are Hunter, the AI sports betting concierge inside Betcierge. Today is ${today()}.
The user is ${user.name.split(" ")[0]}. Weekly bankroll: $${user.bankroll}. Weekly goal: $${user.goal}. Current P&L: ${netPL >= 0 ? "+" : ""}$${netPL.toFixed(2)}. Bets logged: ${bets.length}.
Use web search ONLY when the user asks about a specific game, team, player, or line. Do not search for general advice or bankroll questions.
Be direct, warm, sharp. 2-5 sentences unless detailed analysis is requested. Never encourage reckless betting.`,
true
      );
      setMessages(m => [...m, { role: "assistant", text: result.text }]);
    } catch {
      setMessages(m => [...m, { role: "assistant", text: "Having a connection issue. Try again in a second." }]);
    }
    setLoading(false);
  };

  const confColor = (c) => ({ High: "#2ecc71", Medium: "#f5a623", Low: "#888" })[c] || "#888";
  const confBg = (c) => ({ High: "#1a2e1a", Medium: "#2a1f00", Low: "#1a1a1a" })[c] || "#1a1a1a";

  return (
    <div style={S.hunter.wrap}>
      <div style={S.hunter.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={S.hunter.avatar}>H</div>
          <div>
            <div style={S.hunter.name}>Hunter — Your Betcierge</div>
            <div style={S.hunter.sub}>AI-powered · Always in your corner</div>
          </div>
        </div>
        <button onClick={loadDailyPicks} style={S.hunter.refreshBtn} title="Refresh picks">↻</button>
      </div>

      {/* Daily Picks Section */}
      <div style={{ padding: "14px 14px 0" }}>
        <div style={{ color: "#fff", fontFamily: "'Cormorant Garamond',serif", fontSize: 17, fontWeight: 700, marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
          🎯 Today's Top Plays
          {picksLoading && <span style={{ color: "#555", fontSize: 12, fontWeight: 400 }}>Searching today's slate...</span>}
        </div>

        {picksLoading && (
          <div style={{ padding: "20px 0", textAlign: "center" }}>
            <style>{`@keyframes spin2{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width: 28, height: 28, border: "3px solid #2a2a38", borderTopColor: "#f5a623", borderRadius: "50%", animation: "spin2 0.8s linear infinite", margin: "0 auto 12px" }} />
            <div style={{ color: "#555", fontSize: 13 }}>Hunter is researching today's slate...</div>
          </div>
        )}

        {!picksLoading && dailyPicks && (
          <>
            {dailyPicks.note && <div style={{ background: "#1a1500", border: "1px solid #f5a62340", borderRadius: 8, padding: "8px 12px", color: "#888", fontSize: 12, marginBottom: 10 }}>ℹ️ {dailyPicks.note}</div>}
            {dailyPicks.summary && <div style={{ color: "#888", fontSize: 13, marginBottom: 14, background: "#0f0f18", borderRadius: 10, padding: "10px 12px", lineHeight: 1.5 }}>💬 {dailyPicks.summary}</div>}
            {dailyPicks.picks?.map((pick, i) => (
              <div key={i} style={{ background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 14, padding: 14, marginBottom: 10 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ background: "#1a1a00", color: "#f5a623", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>{pick.sport}</span>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ color: "#666", fontSize: 12 }}>{pick.units}U</span>
                    <span style={{ background: confBg(pick.confidence), color: confColor(pick.confidence), border: `1px solid ${confColor(pick.confidence)}`, fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>{pick.confidence}</span>
                  </div>
                </div>
                <div style={{ color: "#fff", fontSize: 15, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, marginBottom: 8 }}>{pick.game}</div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
                  <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>{pick.pick}</span>
                  <span style={{ color: "#f5a623", fontSize: 14, fontWeight: 600 }}>{pick.odds}</span>
                </div>
                <div style={{ color: "#888", fontSize: 13, lineHeight: 1.5, background: "#13131a", borderRadius: 8, padding: "8px 10px" }}>💡 {pick.insight}</div>
              </div>
            ))}
          </>
        )}
      </div>

      {/* Chat */}
      {messages.length > 0 && (
        <div style={{ padding: "10px 14px", maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8, borderTop: "1px solid #1e1e2e" }}>
          {messages.map((m, i) => (
            <div key={i} style={{ maxWidth: "88%", padding: "10px 14px", borderRadius: 16, fontSize: 13, lineHeight: 1.5, fontFamily: "'Outfit',sans-serif", ...(m.role === "user" ? { background: "#1a1500", color: "#f5a623", alignSelf: "flex-end", borderBottomRightRadius: 4 } : { background: "#1e1e2e", color: "#ccc", alignSelf: "flex-start", borderBottomLeftRadius: 4 }) }}>
              {m.text}
            </div>
          ))}
          {loading && <div style={{ maxWidth: "88%", padding: "10px 14px", borderRadius: 16, fontSize: 13, background: "#1e1e2e", color: "#555", fontStyle: "italic", alignSelf: "flex-start" }}>Hunter is thinking...</div>}
          <div ref={bottomRef} />
        </div>
      )}

      {/* Input */}
      <div style={{ display: "flex", gap: 8, padding: "12px 14px", borderTop: "1px solid #1e1e2e" }}>
        <input style={{ flex: 1, background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 12, padding: "10px 14px", color: "#fff", fontSize: 14, fontFamily: "'Outfit',sans-serif", outline: "none" }}
          placeholder="Ask Hunter about any game, your reads, anything..."
          value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} />
        <button style={{ background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", border: "none", borderRadius: 12, width: 44, fontWeight: 700, fontSize: 18, cursor: "pointer" }} onClick={sendMessage}>→</button>
      </div>
    </div>
  );
}

// ── Gamecast ───────────────────────────────────────────────────────────────
function Gamecast({ bets }) {
  const [active, setActive] = useState(0);
  const g = LIVE_GAMES[active];
  const myBet = bets.find(b => b.game?.toLowerCase().includes(g.home.toLowerCase()) || b.game?.toLowerCase().includes(g.away.toLowerCase()));
  const total = g.homeScore + g.awayScore;
  const homePct = total > 0 ? (g.homeScore / total) * 100 : 50;

  return (
    <div style={{ marginBottom: 20 }}>
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 10 }}>
        {LIVE_GAMES.map((gm, i) => (
          <button key={i} onClick={() => setActive(i)} style={{ background: i === active ? "#1a1500" : "#13131a", border: `1px solid ${i === active ? "#f5a623" : "#222"}`, borderRadius: 20, padding: "6px 12px", color: i === active ? "#f5a623" : "#666", fontSize: 11, fontWeight: 600, cursor: "pointer", whiteSpace: "nowrap", fontFamily: "'Outfit',sans-serif" }}>
            {gm.away} @ {gm.home}
          </button>
        ))}
      </div>
      <div style={{ background: "#13131a", border: "1px solid #222", borderRadius: 16, padding: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
          <span style={{ color: "#e74c3c", fontSize: 12, fontWeight: 700 }}>● LIVE</span>
          <span style={{ color: "#888", fontSize: 13 }}>{g.status}</span>
          <span style={{ color: "#f5a623", fontSize: 11, fontWeight: 700 }}>{g.sport}</span>
        </div>
        <div style={{ display: "flex", justifyContent: "space-around", alignItems: "center", marginBottom: 14 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#aaa", fontSize: 13, marginBottom: 4 }}>{g.away}</div>
            <div style={{ color: "#fff", fontSize: 40, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700 }}>{g.awayScore}</div>
          </div>
          <div style={{ color: "#333", fontSize: 20 }}>@</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ color: "#aaa", fontSize: 13, marginBottom: 4 }}>{g.home}</div>
            <div style={{ color: "#f5a623", fontSize: 40, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700 }}>{g.homeScore}</div>
          </div>
        </div>
        {myBet && (
          <div style={{ background: "#0f0f18", borderRadius: 10, padding: "8px 12px", marginBottom: 10, fontSize: 13 }}>
            <span style={{ color: "#888" }}>Your bet: </span>
            <span style={{ color: "#f5a623", fontWeight: 700 }}>{myBet.pick} ({myBet.odds})</span>
            <span style={{ color: "#555" }}> · ${myBet.amount} to win {fmt(calcProfit(myBet.amount, myBet.odds))}</span>
          </div>
        )}
        <div style={{ background: "#1e1e2e", borderRadius: 4, height: 6, overflow: "hidden" }}>
          <div style={{ width: `${homePct}%`, height: "100%", background: "linear-gradient(90deg,#f5a623,#f7c948)", borderRadius: 4, transition: "width 1s ease" }} />
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ user, bets, onNav }) {
  const hour = new Date().getHours();
  const wins = bets.filter(b => b.result === "Win");
  const losses = bets.filter(b => b.result === "Loss");
  const pending = bets.filter(b => b.result === "Pending");
  const netPL = wins.reduce((s, b) => s + (calcProfit(b.amount, b.odds) || 0), 0) - losses.reduce((s, b) => s + b.amount, 0);
  const currentBankroll = user.bankroll + netPL;
  const goalPct = user.goal > 0 ? (netPL / user.goal) * 100 : 0;
  const sliderPct = Math.min(98, Math.max(2, 50 + (netPL / (user.goal * 2)) * 50));
  const atRisk = pending.reduce((s, b) => s + b.amount, 0);
  const todayBets = bets.filter(b => b.isToday).length;
  const impulseBets = bets.filter(b => b.type === "Impulse").length;

  const alerts = [];
  if (todayBets >= 5) alerts.push({ msg: `${todayBets} bets today. Your edge drops after bet 4. Take a breath — tomorrow's slate is loaded.`, type: "warning" });
  if (netPL < -(user.goal * 0.5) && bets.length > 0) alerts.push({ msg: "Down over 50% of your weekly goal. Protect the bankroll. Great spots coming tomorrow.", type: "danger" });
  if (impulseBets > 2) alerts.push({ msg: `${impulseBets} impulse bets this week. Your planned plays are outperforming. Trust the card.`, type: "warning" });
  if (netPL >= user.goal) alerts.push({ msg: `🎉 Weekly goal hit! Consider locking in the profit. The books will always be there next week.`, type: "success" });

  return (
    <div style={S.screen}>
      <div style={S.hdr}>
        <div>
          <div style={S.greeting}>{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, {user.name.split(" ")[0]} 👋</div>
          <div style={{ color: "#555", fontSize: 13, marginTop: 2 }}>Week of May 19, 2026</div>
        </div>
        <div style={S.logo}>BETCIERGE</div>
      </div>

      {alerts.map((a, i) => <Alert key={i} {...a} />)}

      {/* Bankroll Card */}
      <div style={S.card}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
          <div>
            <div style={S.cardLbl}>Current Bankroll</div>
            <div style={{ ...S.bigNum, color: netPL >= 0 ? "#f5a623" : "#e74c3c" }}>${currentBankroll.toFixed(0)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={S.cardLbl}>Weekly Goal</div>
            <div style={S.bigNum}>+${user.goal}</div>
          </div>
        </div>

        {/* P&L Slider */}
        <div style={{ margin: "14px 0 16px" }}>
          <div style={{ background: "#1e1e2e", borderRadius: 8, height: 8, position: "relative", overflow: "visible", marginBottom: 10 }}>
            <div style={{ position: "absolute", left: "50%", top: -3, width: 2, height: 14, background: "#333", borderRadius: 1 }} />
            <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 8, left: netPL >= 0 ? "50%" : `${sliderPct}%`, width: `${Math.abs(sliderPct - 50)}%`, background: netPL >= 0 ? "linear-gradient(90deg,#f5a623,#f7c948)" : "linear-gradient(90deg,#e74c3c,#c0392b)", transition: "all 0.5s ease" }} />
            <div style={{ position: "absolute", top: -6, width: 20, height: 20, borderRadius: "50%", left: `calc(${sliderPct}% - 10px)`, background: netPL >= 0 ? "#f5a623" : "#e74c3c", border: "2px solid #0a0a0f", boxShadow: `0 0 10px ${netPL >= 0 ? "rgba(245,166,35,0.6)" : "rgba(231,76,60,0.6)"}`, transition: "all 0.5s ease" }} />
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <span style={{ color: "#e74c3c", fontSize: 11 }}>-${user.goal}</span>
            <span style={{ color: netPL >= 0 ? "#f5a623" : "#e74c3c", fontWeight: 700, fontSize: 16 }}>
              {netPL >= 0 ? "+" : ""}{netPL.toFixed(0)}
              <span style={{ fontSize: 12, opacity: 0.7, marginLeft: 4 }}>({goalPct.toFixed(0)}% of goal)</span>
            </span>
            <span style={{ color: "#2ecc71", fontSize: 11 }}>+${user.goal}</span>
          </div>
        </div>

        <div style={S.statsRow}>
          {[
            { val: wins.length, lbl: "Wins", color: "#2ecc71" },
            { val: losses.length, lbl: "Losses", color: "#e74c3c" },
            { val: atRisk > 0 ? `$${atRisk}` : "—", lbl: "At Risk", color: "#f5a623" },
            { val: `$${bets.reduce((s, b) => s + b.amount, 0)}`, lbl: "Wagered", color: "#f5a623" },
          ].map((s, i) => (
            <div key={i} style={S.statBox}>
              <div style={{ ...S.statVal, color: s.color }}>{s.val}</div>
              <div style={S.statLbl}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Quick Nav */}
      <div style={S.actionRow}>
        {[{ id: "logger", icon: "📝", lbl: "Log a Bet" }, { id: "card", icon: "🎯", lbl: "Today's Card" }, { id: "history", icon: "📊", lbl: "History" }].map(a => (
          <button key={a.id} style={S.actionBtn} onClick={() => onNav(a.id)}>
            <span style={{ fontSize: 22 }}>{a.icon}</span>
            <span style={{ fontSize: 12, color: "#ccc", fontWeight: 600 }}>{a.lbl}</span>
          </button>
        ))}
      </div>

      <div style={S.secTitle}>{hour < 14 ? "Today's Picks & Slate 🎯" : "Tomorrow's Slate 📅"}</div>
      <Hunter user={user} bets={bets} />
    </div>
  );
}

// ── Today's Card ───────────────────────────────────────────────────────────
function TodayCard({ bets, onNav }) {
  return (
    <div style={S.screen}>
      <div style={S.backRow}><button style={S.backBtn} onClick={() => onNav("dashboard")}>← Back</button><div style={S.logo}>BETCIERGE</div></div>
      <div style={S.secTitle}>Today's Card 🎯</div>
      <p style={{ color: "#666", fontSize: 14, margin: "0 0 16px" }}>Your locked bets. Live scores below.</p>
      <Gamecast bets={bets} />
      {bets.filter(b => b.isToday).length === 0 ? (
        <div style={S.empty}>No bets locked in yet today. Hit Log to add your first bet.</div>
      ) : bets.filter(b => b.isToday).map(bet => (
        <div key={bet.id} style={S.betCard}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={S.betSport}>{bet.sport}</span>
            <span style={{ ...S.tag, background: bet.type === "Planned" ? "#1a2e1a" : "#2a1a00", color: bet.type === "Planned" ? "#2ecc71" : "#f5a623" }}>
              {bet.type === "Planned" ? "✅ Planned" : "⚡ Impulse"}
            </span>
          </div>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{bet.game}</div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div><span style={{ color: "#f5a623", fontWeight: 700 }}>{bet.pick}</span><span style={{ color: "#888", fontSize: 13, marginLeft: 8 }}>{bet.odds}</span></div>
            <div style={{ color: "#ccc", fontSize: 13 }}>${bet.amount} → <span style={{ color: "#f5a623" }}>{fmt(calcProfit(bet.amount, bet.odds))}</span></div>
          </div>
          <div style={{ marginTop: 8, display: "inline-block", background: bet.result === "Win" ? "#1a2e1a" : bet.result === "Loss" ? "#2a0f0f" : "#1a1500", color: bet.result === "Win" ? "#2ecc71" : bet.result === "Loss" ? "#e74c3c" : "#f5a623", fontSize: 11, fontWeight: 700, padding: "4px 12px", borderRadius: 20 }}>
            {bet.result === "Win" ? "✅ WIN" : bet.result === "Loss" ? "❌ LOSS" : "⏳ PENDING"}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Bet Logger ─────────────────────────────────────────────────────────────
function BetLogger({ onSave, onNav }) {
  const [mode, setMode] = useState("choose"); // choose | snap | manual
  const [sport, setSport] = useState("NBA");
  const [betType, setBetType] = useState("Spread");
  const [game, setGame] = useState("");
  const [pick, setPick] = useState("");
  const [line, setLine] = useState("");
  const [odds, setOdds] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("Planned");
  const [legs, setLegs] = useState([{ pick: "", odds: "" }, { pick: "", odds: "" }]);
  const [errors, setErrors] = useState({});
  const [saved, setSaved] = useState(false);

  const isParlay = betType === "Parlay";
  const needsLine = ["Total (O/U)", "Spread", "Team Total"].includes(betType);

  const parlayOdds = () => {
    let dec = 1;
    legs.forEach(l => { const o = parseFloat(l.odds); if (!o) return; dec *= o > 0 ? (1 + o / 100) : (1 + 100 / Math.abs(o)); });
    if (dec <= 1) return null;
    const am = dec >= 2 ? Math.round((dec - 1) * 100) : Math.round(-100 / (dec - 1));
    return am > 0 ? `+${am}` : `${am}`;
  };

  const potWin = isParlay ? calcProfit(amount, parlayOdds()) : calcProfit(amount, odds);

  const validate = () => {
    const e = {};
    if (!game) e.game = "Please enter the game/matchup";
    if (!isParlay && !pick) e.pick = "Please enter your pick";
    if (needsLine && !line) e.line = `Enter the ${betType === "Spread" ? "spread (e.g. -1.5)" : "total (e.g. 7.5)"}`;
    if (!isParlay && !odds) e.odds = "Please enter the odds";
    if (!amount) e.amount = "Please enter your bet amount";
    if (isParlay && legs.some(l => !l.pick || !l.odds)) e.legs = "Please complete all parlay legs";
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const handleSave = () => {
    if (!validate()) return;
    const finalOdds = isParlay ? parlayOdds() : odds;
    const finalPick = isParlay ? legs.map(l => l.pick).join(" + ") : needsLine ? `${pick} ${line}` : pick;
    onSave({ sport, game, betType, pick: finalPick, odds: finalOdds, amount: parseFloat(amount), type: category, result: "Pending", profit: 0, isToday: true, id: Date.now() });
    setSaved(true);
    setTimeout(() => { setSaved(false); setGame(""); setPick(""); setLine(""); setOdds(""); setAmount(""); setLegs([{ pick: "", odds: "" }, { pick: "", odds: "" }]); setErrors({}); setMode("choose"); }, 1500);
  };

  if (mode === "snap") return (
    <div style={S.screen}>
      <div style={S.backRow}><button style={S.backBtn} onClick={() => onNav("dashboard")}>← Back</button><div style={S.logo}>BETCIERGE</div></div>
      <SnapToLog
        onConfirm={(bet) => { onSave(bet); setMode("choose"); onNav("card"); }}
        onCancel={() => setMode("manual")}
      />
    </div>
  );

  if (mode === "choose") return (
    <div style={S.screen}>
      <div style={S.backRow}><button style={S.backBtn} onClick={() => onNav("dashboard")}>← Back</button><div style={S.logo}>BETCIERGE</div></div>
      <div style={S.secTitle}>Log a Bet 📝</div>
      <p style={{ color: "#666", fontSize: 14, margin: "0 0 20px" }}>How do you want to log this bet?</p>

      {/* Snap to Log */}
      <button onClick={() => setMode("snap")} style={S.logChoice.snap}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
        <div style={S.logChoice.snapTitle}>Snap to Log</div>
        <div style={S.logChoice.snapSub}>Upload a screenshot of your bet slip. Hunter reads it and logs everything automatically.</div>
        <div style={S.logChoice.snapBadge}>RECOMMENDED</div>
      </button>

      {/* Manual */}
      <button onClick={() => setMode("manual")} style={S.logChoice.manual}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✏️</div>
        <div style={S.logChoice.manualTitle}>Log Manually</div>
        <div style={S.logChoice.manualSub}>Enter your bet details by hand.</div>
      </button>
    </div>
  );

  // Manual mode
  return (
    <div style={S.screen}>
      <div style={S.backRow}><button style={S.backBtn} onClick={() => setMode("choose")}>← Back</button><div style={S.logo}>BETCIERGE</div></div>
      <div style={S.secTitle}>Log Manually ✏️</div>
      <div style={S.card}>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}><label style={S.label}>Sport</label><select style={S.select} value={sport} onChange={e => setSport(e.target.value)}>{SPORT_OPTIONS.map(s => <option key={s}>{s}</option>)}</select></div>
          <div style={{ flex: 1 }}><label style={S.label}>Bet Type</label><select style={S.select} value={betType} onChange={e => { setBetType(e.target.value); setErrors({}); }}>{BET_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
        </div>

        <label style={S.label}>Game / Matchup</label>
        <input style={{ ...S.input, ...(errors.game ? { borderColor: "#e74c3c" } : {}) }} placeholder="e.g. Spurs vs OKC Thunder" value={game} onChange={e => setGame(e.target.value)} />
        {errors.game && <div style={S.err}>{errors.game}</div>}

        {!isParlay && <>
          <label style={S.label}>Your Pick</label>
          <input style={{ ...S.input, ...(errors.pick ? { borderColor: "#e74c3c" } : {}) }}
            placeholder={betType === "Total (O/U)" ? "Over or Under" : betType === "Spread" ? "e.g. Spurs" : betType === "Team Total" ? "e.g. Spurs Over" : "e.g. Spurs ML"}
            value={pick} onChange={e => setPick(e.target.value)} />
          {errors.pick && <div style={S.err}>{errors.pick}</div>}
        </>}

        {needsLine && <>
          <label style={S.label}>{betType === "Spread" ? "Spread Line" : "Total Line"}</label>
          <input style={{ ...S.input, ...(errors.line ? { borderColor: "#e74c3c" } : {}) }}
            placeholder={betType === "Spread" ? "e.g. +3.5" : "e.g. 7.5"} value={line} onChange={e => setLine(e.target.value)} />
          {errors.line && <div style={S.err}>{errors.line}</div>}
          {pick && line && <div style={S.hint}>Will log as: <span style={{ color: "#f5a623" }}>{pick} {line}</span></div>}
        </>}

        {isParlay && <>
          <label style={S.label}>Parlay Legs</label>
          {legs.map((leg, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8 }}>
              <input style={{ ...S.input, flex: 2, marginBottom: 0 }} placeholder={`Leg ${i + 1}`} value={leg.pick} onChange={e => setLegs(ls => ls.map((l, j) => j === i ? { ...l, pick: e.target.value } : l))} />
              <input style={{ ...S.input, flex: 1, marginBottom: 0 }} placeholder="Odds" value={leg.odds} onChange={e => setLegs(ls => ls.map((l, j) => j === i ? { ...l, odds: e.target.value } : l))} />
              {legs.length > 2 && <button onClick={() => setLegs(ls => ls.filter((_, j) => j !== i))} style={{ background: "#2a0f0f", border: "1px solid #e74c3c", color: "#e74c3c", borderRadius: 8, padding: "0 10px", cursor: "pointer" }}>×</button>}
            </div>
          ))}
          {errors.legs && <div style={S.err}>{errors.legs}</div>}
          <button onClick={() => setLegs(ls => [...ls, { pick: "", odds: "" }])} style={{ background: "#1a1a24", border: "1px dashed #444", color: "#888", borderRadius: 10, padding: 10, width: "100%", cursor: "pointer", fontSize: 14, fontFamily: "'Outfit',sans-serif", marginBottom: 8 }}>+ Add Leg</button>
          {parlayOdds() && <div style={S.hint}>Combined odds: <span style={{ color: "#f5a623", fontWeight: 700 }}>{parlayOdds()}</span></div>}
        </>}

        <div style={{ display: "flex", gap: 10 }}>
          {!isParlay && <div style={{ flex: 1 }}>
            <label style={S.label}>Odds</label>
            <input style={{ ...S.input, ...(errors.odds ? { borderColor: "#e74c3c" } : {}) }} placeholder="-110" value={odds} onChange={e => setOdds(e.target.value)} />
            {errors.odds && <div style={S.err}>{errors.odds}</div>}
          </div>}
          <div style={{ flex: 1 }}>
            <label style={S.label}>Amount ($)</label>
            <input style={{ ...S.input, ...(errors.amount ? { borderColor: "#e74c3c" } : {}) }} placeholder="125" type="number" value={amount} onChange={e => setAmount(e.target.value)} />
            {errors.amount && <div style={S.err}>{errors.amount}</div>}
          </div>
        </div>

        {potWin !== null && amount && <div style={{ color: "#888", fontSize: 14, margin: "8px 0" }}>Risk <span style={{ color: "#fff" }}>${amount}</span> → Win <span style={{ color: "#f5a623", fontWeight: 700 }}>{fmt(potWin)}</span></div>}

        <label style={S.label}>Bet Category</label>
        <div style={{ display: "flex", gap: 10, marginBottom: 12 }}>
          {["Planned", "Impulse"].map(c => (
            <button key={c} onClick={() => setCategory(c)} style={{ flex: 1, background: category === c ? (c === "Planned" ? "#1a2e1a" : "#2a1500") : "#0f0f18", border: `1px solid ${category === c ? (c === "Planned" ? "#2ecc71" : "#f5a623") : "#2a2a38"}`, borderRadius: 10, padding: 12, color: category === c ? (c === "Planned" ? "#2ecc71" : "#f5a623") : "#666", fontWeight: 600, cursor: "pointer", fontFamily: "'Outfit',sans-serif", fontSize: 14 }}>
              {c === "Planned" ? "✅ Planned" : "⚡ Impulse"}
            </button>
          ))}
        </div>
        {category === "Impulse" && <Alert msg="Impulse bets historically underperform planned plays. Are you sure?" type="warning" />}
        <button style={{ ...S.saveBtn, ...(saved ? { background: "linear-gradient(135deg,#2ecc71,#27ae60)" } : {}) }} onClick={handleSave}>
          {saved ? "✅ Bet Logged!" : "Log This Bet"}
        </button>
      </div>
    </div>
  );
}

// ── History ────────────────────────────────────────────────────────────────
function History({ bets, onUpdate, onNav }) {
  const [view, setView] = useState("week");
  const [filterSport, setFilterSport] = useState("All");

  const filtered = bets.filter(b => filterSport === "All" || b.sport === filterSport);
  const settled = filtered.filter(b => b.result !== "Pending");
  const wins = filtered.filter(b => b.result === "Win");
  const losses = filtered.filter(b => b.result === "Loss");
  const netPL = wins.reduce((s, b) => s + (calcProfit(b.amount, b.odds) || 0), 0) - losses.reduce((s, b) => s + b.amount, 0);
  const winRate = settled.length > 0 ? ((wins.length / settled.length) * 100).toFixed(0) : 0;
  const plannedSettled = settled.filter(b => b.type === "Planned");
  const impulseSettled = settled.filter(b => b.type === "Impulse");
  const plannedWR = plannedSettled.length > 0 ? ((plannedSettled.filter(b => b.result === "Win").length / plannedSettled.length) * 100).toFixed(0) : 0;
  const impulseWR = impulseSettled.length > 0 ? ((impulseSettled.filter(b => b.result === "Win").length / impulseSettled.length) * 100).toFixed(0) : 0;

  const sportMap = {};
  SPORT_OPTIONS.forEach(sp => {
    const sb = bets.filter(b => b.sport === sp && b.result !== "Pending");
    if (sb.length > 0) sportMap[sp] = { wins: sb.filter(b => b.result === "Win").length, total: sb.length };
  });
  const bestSport = Object.entries(sportMap).sort((a, b) => (b[1].wins / b[1].total) - (a[1].wins / a[1].total))[0];

  return (
    <div style={S.screen}>
      <div style={S.backRow}><button style={S.backBtn} onClick={() => onNav("dashboard")}>← Back</button><div style={S.logo}>BETCIERGE</div></div>
      <div style={S.secTitle}>Bet History 📊</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        {[["week", "Current Week"], ["alltime", "All-Time"]].map(([v, lbl]) => (
          <button key={v} onClick={() => setView(v)} style={{ flex: 1, background: view === v ? "#1a1500" : "#13131a", border: `1px solid ${view === v ? "#f5a623" : "#222"}`, color: view === v ? "#f5a623" : "#666", borderRadius: 10, padding: 10, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit',sans-serif", fontSize: 14 }}>
            {lbl}
          </button>
        ))}
      </div>

      {settled.length > 0 && (
        <div style={{ background: "#13131a", border: "1px solid #f5a62320", borderRadius: 16, padding: 16, marginBottom: 16 }}>
          <div style={{ color: "#f5a623", fontSize: 14, fontWeight: 700, marginBottom: 12 }}>📈 Your Betting Profile</div>
          <div style={{ display: "flex", gap: 12, marginBottom: 10 }}>
            {bestSport && <div style={{ flex: 1, background: "#0f0f18", borderRadius: 10, padding: 10 }}>
              <div style={{ color: "#2ecc71", fontSize: 11, marginBottom: 4 }}>BEST SPORT</div>
              <div style={{ color: "#fff", fontWeight: 700 }}>{bestSport[0]}</div>
              <div style={{ color: "#888", fontSize: 12 }}>{((bestSport[1].wins / bestSport[1].total) * 100).toFixed(0)}% win rate</div>
            </div>}
            <div style={{ flex: 1, background: "#0f0f18", borderRadius: 10, padding: 10 }}>
              <div style={{ color: "#f5a623", fontSize: 11, marginBottom: 4 }}>OVERALL</div>
              <div style={{ color: "#fff", fontWeight: 700 }}>{wins.length}W - {losses.length}L</div>
              <div style={{ color: "#888", fontSize: 12 }}>{winRate}% win rate</div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <div style={{ flex: 1, background: "#1a2e1a", border: "1px solid #2ecc71", borderRadius: 10, padding: 10, textAlign: "center" }}>
              <div style={{ color: "#2ecc71", fontSize: 18, fontWeight: 700 }}>{plannedWR}%</div>
              <div style={{ color: "#888", fontSize: 11 }}>Planned W%</div>
            </div>
            <div style={{ flex: 1, background: impulseWR < 50 ? "#2a0f0f" : "#1a2e1a", border: `1px solid ${impulseWR < 50 ? "#e74c3c" : "#2ecc71"}`, borderRadius: 10, padding: 10, textAlign: "center" }}>
              <div style={{ color: impulseWR < 50 ? "#e74c3c" : "#2ecc71", fontSize: 18, fontWeight: 700 }}>{impulseWR}%</div>
              <div style={{ color: "#888", fontSize: 11 }}>Impulse W%</div>
            </div>
          </div>
        </div>
      )}

      <div style={S.statsRow}>
        {[
          { val: `${winRate}%`, lbl: "Win Rate", color: "#f5a623" },
          { val: `${wins.length}W-${losses.length}L`, lbl: "Record", color: "#fff" },
          { val: `${netPL >= 0 ? "+" : ""}$${netPL.toFixed(0)}`, lbl: "Net P&L", color: netPL >= 0 ? "#2ecc71" : "#e74c3c" },
        ].map((s, i) => (
          <div key={i} style={{ ...S.statBox, flex: 1 }}>
            <div style={{ ...S.statVal, color: s.color, fontSize: 16 }}>{s.val}</div>
            <div style={S.statLbl}>{s.lbl}</div>
          </div>
        ))}
      </div>

      {Object.keys(sportMap).length > 0 && (
        <div style={{ marginBottom: 14 }}>
          <div style={{ color: "#666", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>By Sport</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {Object.entries(sportMap).map(([sp, d]) => (
              <div key={sp} style={{ background: "#13131a", border: "1px solid #222", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                <div style={{ color: "#f5a623", fontSize: 15, fontWeight: 700 }}>{((d.wins / d.total) * 100).toFixed(0)}%</div>
                <div style={{ color: "#888", fontSize: 11 }}>{sp} ({d.total})</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14 }}>
        {["All", ...SPORT_OPTIONS.filter(s => bets.some(b => b.sport === s))].map(s => (
          <button key={s} onClick={() => setFilterSport(s)} style={{ background: filterSport === s ? "#1a1500" : "#13131a", border: `1px solid ${filterSport === s ? "#f5a623" : "#222"}`, color: filterSport === s ? "#f5a623" : "#666", borderRadius: 20, padding: "6px 14px", cursor: "pointer", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600, fontFamily: "'Outfit',sans-serif" }}>
            {s}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? <div style={S.empty}>No bets yet. Start logging to see your patterns.</div> : filtered.map(bet => (
        <div key={bet.id} style={S.betCard}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={S.betSport}>{bet.sport}</span>
              <span style={{ ...S.tag, background: bet.type === "Planned" ? "#1a2e1a" : "#2a1a00", color: bet.type === "Planned" ? "#2ecc71" : "#f5a623" }}>{bet.type === "Planned" ? "✅" : "⚡"} {bet.type}</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["Win", "Loss", "Pending"].map(r => (
                <button key={r} onClick={() => onUpdate(bet.id, r)} style={{ background: bet.result === r ? (r === "Win" ? "#1a2e1a" : r === "Loss" ? "#2a0f0f" : "#1a1500") : "#0f0f18", border: `1px solid ${bet.result === r ? (r === "Win" ? "#2ecc71" : r === "Loss" ? "#e74c3c" : "#f5a623") : "#2a2a38"}`, borderRadius: 6, width: 28, height: 28, color: bet.result === r ? (r === "Win" ? "#2ecc71" : r === "Loss" ? "#e74c3c" : "#f5a623") : "#555", fontSize: 12, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit',sans-serif" }}>
                  {r === "Win" ? "W" : r === "Loss" ? "L" : "P"}
                </button>
              ))}
            </div>
          </div>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, marginBottom: 6 }}>{bet.game}</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <span style={{ color: "#f5a623", fontWeight: 700 }}>{bet.pick} <span style={{ color: "#888", fontWeight: 400 }}>{bet.odds}</span></span>
            <span style={{ color: "#ccc", fontSize: 13 }}>${bet.amount} → <span style={{ color: "#f5a623" }}>{fmt(calcProfit(bet.amount, bet.odds))}</span></span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Betcierge() {
  const [user, setUser] = useState(null);
  const [screen, setScreen] = useState("dashboard");
  const [bets, setBets] = useState([]);

  const addBet = (bet) => setBets(p => [bet, ...p]);
  const updateBet = (id, result) => setBets(p => p.map(b => b.id === id ? { ...b, result, profit: result === "Win" ? (calcProfit(b.amount, b.odds) || 0) : 0 } : b));

  if (!user) return <Onboarding onComplete={setUser} />;

  return (
    <div style={{ background: "#0a0a0f", minHeight: "100vh", maxWidth: 430, margin: "0 auto", fontFamily: "'Outfit',sans-serif", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {screen === "dashboard" && <Dashboard user={user} bets={bets} onNav={setScreen} />}
      {screen === "card" && <TodayCard bets={bets} onNav={setScreen} />}
      {screen === "logger" && <BetLogger onSave={addBet} onNav={setScreen} />}
      {screen === "history" && <History bets={bets} onUpdate={updateBet} onNav={setScreen} />}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#0d0d14", borderTop: "1px solid #1e1e2e", display: "flex", padding: "8px 0 12px" }}>
        {[{ id: "dashboard", icon: "🏠", lbl: "Home" }, { id: "card", icon: "🎯", lbl: "Card" }, { id: "logger", icon: "📝", lbl: "Log" }, { id: "history", icon: "📊", lbl: "History" }].map(n => (
          <button key={n.id} onClick={() => setScreen(n.id)} style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", padding: "6px 0", opacity: screen === n.id ? 1 : 0.4 }}>
            <span style={{ fontSize: 20 }}>{n.icon}</span>
            <span style={{ color: screen === n.id ? "#f5a623" : "#555", fontSize: 11, fontFamily: "'Outfit',sans-serif", fontWeight: screen === n.id ? 700 : 400 }}>{n.lbl}</span>
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────
const S = {
  screen: { padding: "20px 16px 16px" },
  hdr: { display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 16 },
  greeting: { color: "#fff", fontSize: 20, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700 },
  logo: { fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 700, color: "#f5a623", letterSpacing: 2 },
  backRow: { display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 },
  backBtn: { background: "none", border: "1px solid #333", color: "#888", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 14, fontFamily: "'Outfit',sans-serif" },
  card: { background: "linear-gradient(135deg,#13131a,#1a1a24)", border: "1px solid #f5a62320", borderRadius: 20, padding: 18, marginBottom: 14 },
  cardLbl: { color: "#666", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  bigNum: { color: "#fff", fontSize: 28, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700 },
  secTitle: { color: "#fff", fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 700, marginBottom: 12 },
  statsRow: { display: "flex", gap: 8, marginTop: 14 },
  statBox: { flex: 1, background: "#0f0f18", borderRadius: 10, padding: "10px 8px", textAlign: "center" },
  statVal: { color: "#f5a623", fontSize: 16, fontWeight: 700, fontFamily: "'Cormorant Garamond',serif" },
  statLbl: { color: "#555", fontSize: 10, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  actionRow: { display: "flex", gap: 10, marginBottom: 20 },
  actionBtn: { flex: 1, background: "#13131a", border: "1px solid #222", borderRadius: 14, padding: "14px 8px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" },
  betCard: { background: "#13131a", border: "1px solid #1e1e2e", borderRadius: 14, padding: 14, marginBottom: 10 },
  betSport: { background: "#1a1a00", color: "#f5a623", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6 },
  tag: { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 },
  empty: { color: "#555", textAlign: "center", padding: 40, fontSize: 14 },
  input: { width: "100%", background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, fontFamily: "'Outfit',sans-serif", boxSizing: "border-box", outline: "none", marginBottom: 4 },
  select: { width: "100%", background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, fontFamily: "'Outfit',sans-serif", boxSizing: "border-box", outline: "none", marginBottom: 4 },
  label: { display: "block", color: "#666", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, marginTop: 12 },
  err: { color: "#e74c3c", fontSize: 12, marginBottom: 6 },
  hint: { background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 8, padding: "8px 12px", color: "#888", fontSize: 13, marginBottom: 8 },
  saveBtn: { width: "100%", background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", border: "none", borderRadius: 12, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit',sans-serif", marginTop: 8 },
  hunter: {
    wrap: { background: "#13131a", border: "1px solid #222", borderRadius: 20, overflow: "hidden", marginBottom: 16 },
    header: { background: "#1a1500", borderBottom: "1px solid #2a2000", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    avatar: { width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", fontWeight: 900, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cormorant Garamond',serif" },
    name: { color: "#f5a623", fontSize: 14, fontWeight: 700 },
    sub: { color: "#888", fontSize: 11, marginTop: 2 },
    refreshBtn: { background: "#2a2000", border: "1px solid #f5a623", color: "#f5a623", borderRadius: 8, width: 34, height: 34, cursor: "pointer", fontSize: 18, fontFamily: "'Outfit',sans-serif" },
  },
  snap: {
    wrap: { background: "#13131a", border: "1px solid #222", borderRadius: 20, overflow: "hidden" },
    header: { background: "#1a1500", borderBottom: "1px solid #2a2000", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    title: { color: "#f5a623", fontSize: 16, fontWeight: 700, fontFamily: "'Cormorant Garamond',serif" },
    closeBtn: { background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer" },
    uploadZone: { padding: 32, textAlign: "center", cursor: "pointer", borderBottom: "1px solid #1e1e2e" },
    uploadTitle: { color: "#fff", fontSize: 18, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, marginBottom: 8 },
    uploadSub: { color: "#666", fontSize: 13, lineHeight: 1.5, marginBottom: 20 },
    uploadBtn: { display: "inline-block", background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", fontWeight: 700, fontSize: 14, padding: "12px 28px", borderRadius: 12, fontFamily: "'Outfit',sans-serif" },
    reading: { position: "relative" },
    readingOverlay: { position: "absolute", inset: 0, background: "rgba(10,10,15,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", padding: 24, textAlign: "center" },
    preview: { width: "100%", maxHeight: 200, objectFit: "contain", background: "#0f0f18" },
    confirm: { padding: 16 },
    confirmTitle: { color: "#2ecc71", fontSize: 17, fontWeight: 700, fontFamily: "'Cormorant Garamond',serif", marginBottom: 4 },
    confirmSub: { color: "#888", fontSize: 13, marginBottom: 14 },
    detailsCard: { background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 14, padding: 16, marginBottom: 14 },
    detailRow: { display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a1a24" },
    detailLabel: { color: "#666", fontSize: 13 },
    detailValue: { color: "#fff", fontSize: 13, fontWeight: 600, textAlign: "right", maxWidth: "60%" },
    editBtn: { flex: 1, background: "#1a1a24", border: "1px solid #333", color: "#888", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 600, cursor: "pointer", fontFamily: "'Outfit',sans-serif" },
    confirmBtn: { flex: 1, background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", border: "none", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit',sans-serif" },
  },
  logChoice: {
    snap: { width: "100%", background: "linear-gradient(135deg,#1a1500,#2a2000)", border: "2px solid #f5a623", borderRadius: 20, padding: 24, textAlign: "center", cursor: "pointer", marginBottom: 14, position: "relative" },
    snapTitle: { color: "#fff", fontSize: 20, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, marginBottom: 8 },
    snapSub: { color: "#888", fontSize: 13, lineHeight: 1.5 },
    snapBadge: { position: "absolute", top: 14, right: 14, background: "#f5a623", color: "#000", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 20 },
    manual: { width: "100%", background: "#13131a", border: "1px solid #333", borderRadius: 20, padding: 20, textAlign: "center", cursor: "pointer" },
    manualTitle: { color: "#ccc", fontSize: 16, fontWeight: 700, marginBottom: 6, fontFamily: "'Cormorant Garamond',serif" },
    manualSub: { color: "#555", fontSize: 13 },
  },
  ob: {
    wrap: { background: "#0a0a0f", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
    card: { background: "#13131a", border: "1px solid #222", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400 },
    logo: { textAlign: "center", fontFamily: "'Cormorant Garamond',serif", fontSize: 36, fontWeight: 700, color: "#f5a623", letterSpacing: 3, marginBottom: 4 },
    tagline: { textAlign: "center", color: "#555", fontSize: 13, marginBottom: 24 },
    stepRow: { display: "flex", gap: 6, justifyContent: "center", marginBottom: 6 },
    dot: { width: 8, height: 8, borderRadius: "50%", background: "#333" },
    dotActive: { background: "#f5a623", width: 24, borderRadius: 4 },
    dotDone: { background: "#f5a623", opacity: 0.5 },
    stepLbl: { textAlign: "center", color: "#555", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 20 },
    title: { color: "#fff", fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 700, margin: "0 0 8px" },
    sub: { color: "#666", fontSize: 14, margin: "0 0 16px" },
    sportsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 },
    sportBtn: { background: "#1a1a24", border: "1px solid #2a2a38", borderRadius: 12, padding: "14px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" },
    sportOn: { background: "#1f1a00", border: "1px solid #f5a623" },
    roiBox: { background: "#1a1a00", border: "1px solid", borderRadius: 10, padding: "12px 14px", marginTop: 12 },
    roiWarn: { color: "#e74c3c", fontSize: 12, marginTop: 10, lineHeight: 1.5, borderTop: "1px solid #2a0000", paddingTop: 10 },
    trialBox: { background: "#1a1500", border: "1px solid #f5a62340", borderRadius: 16, padding: 20, marginBottom: 8, textAlign: "left" },
    nextBtn: { width: "100%", background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", fontFamily: "'Outfit',sans-serif", marginTop: 12 },
  },
};
