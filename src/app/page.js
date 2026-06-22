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
  { id: "tennis", label: "Tennis", emoji: "🎾" }
];
const BET_TYPES = ["Moneyline", "Spread", "Total (O/U)", "Parlay", "Prop", "Live Bet", "Team Total"];
const SPORT_OPTIONS = ["MLB", "NBA", "NFL", "NHL", "Soccer", "UFC/MMA", "NCAAB", "NCAAF", "Golf", "Tennis"];

// ── Supabase + Auth ────────────────────────────────────────────────────────
import { supabase } from "../lib/supabase";
import LoginScreen from "../lib/LoginScreen";
import Landing from "./landing/page";

// ── Helpers ────────────────────────────────────────────────────────────────
const calcProfit = (amount, odds) => {
  if (!odds || !amount) return null;
  const oddsStr = String(odds).trim().toLowerCase();
  if (oddsStr === 'even' || oddsStr === '+100') return parseFloat(amount);
  const o = parseFloat(odds);
  const a = parseFloat(amount);
  if (isNaN(o) || isNaN(a)) return null;
  return o > 0 ? (o / 100) * a : (100 / Math.abs(o)) * a;
};
const fmt = (n) => `$${Math.abs(n || 0).toFixed(2)}`;
const todayDisplay = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

// ── API Call Helper ────────────────────────────────────────────────────────
const callClaude = async (messages, system, useSearch = false, imageBase64 = null, maxTokens = 4000) => {
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
  const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  return { text, raw: data };
};

// ── Auth handled by Supabase ───────────────────────────────────────────────

// ── Onboarding ─────────────────────────────────────────────────────────────
function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState({ name: "", email: "", phone: "", username: "", password: "", bankroll: "", goal: "", selectedSports: [] });
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const toggleSport = (id) => set("selectedSports", form.selectedSports.includes(id) ? form.selectedSports.filter(s => s !== id) : [...form.selectedSports, id]);
  const roi = form.bankroll && form.goal ? (parseFloat(form.goal) / parseFloat(form.bankroll)) * 100 : 0;

  const canNext = [
    () => form.name && form.email && form.phone,
    () => form.username,
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
          <p style={S.ob.sub}>We'll personalize your experience.</p>
          <input style={S.input} placeholder="Full Name" value={form.name} onChange={e => set("name", e.target.value)} />
          <input style={S.input} placeholder="Email Address" type="email" value={form.email} onChange={e => set("email", e.target.value)} />
          <input style={S.input} placeholder="Phone Number" type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} />
        </>}

        {step === 1 && <>
          <h2 style={S.ob.title}>Create your account.</h2>
          <input style={S.input} placeholder="Choose a Username" value={form.username} onChange={e => set("username", e.target.value)} />
        </>}

        {step === 2 && <>
          <h2 style={S.ob.title}>Set your weekly targets.</h2>
          <label style={S.label}>Weekly Bankroll ($)</label>
          <input style={S.input} placeholder="e.g. 2500" type="number" value={form.bankroll} onChange={e => set("bankroll", e.target.value)} />
          <label style={S.label}>Weekly Profit Goal ($)</label>
          <input style={S.input} placeholder="e.g. 250" type="number" value={form.goal} onChange={e => set("goal", e.target.value)} />
          {roi > 0 && roi > 20 && <div style={{ color: "#e74c3c", fontSize: 12, marginTop: 8 }}>⚠️ Targeting {roi.toFixed(1)}% ROI weekly is aggressive. Sharpest bettors average 5–10%.</div>}
        </>}

        {step === 3 && <>
          <h2 style={S.ob.title}>What do you bet on?</h2>
          <div style={S.ob.sportsGrid}>{SPORTS.map(s => (
            <button key={s.id} onClick={() => toggleSport(s.id)} style={{ ...S.ob.sportBtn, ...(form.selectedSports.includes(s.id) ? S.ob.sportOn : {}) }}>
              <span style={{ fontSize: 22 }}>{s.emoji}</span>
              <span style={{ color: "#aaa", fontSize: 12, fontWeight: 600 }}>{s.label}</span>
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
              {["Daily AI picks at 11 AM", "📸 Snap to Log", "Persistent AI memory", "Bankroll tracking", "Full history & analytics"].map((f, i) => (
                <div key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, textAlign: "left" }}>✅ {f}</div>
              ))}
            </div>
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
      <span style={{ color: clr, fontSize: 13, fontWeight: 500, lineHeight: 1.5 }}>{msg}</span>
    </div>
  );
}

// ── Snap to Log ────────────────────────────────────────────────────────────
function SnapToLog({ onConfirm, onCancel, onDone }) {
  const [stage, setStage] = useState("upload");
  const [extractedBet, setExtractedBet] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const [slips, setSlips] = useState([]); // queue of parsed bets
  const [currentSlip, setCurrentSlip] = useState(0); // index in queue
  const [totalSlips, setTotalSlips] = useState(0);
  const [processingIndex, setProcessingIndex] = useState(0);
  const fileRef = useRef(null);
  const [logging, setLogging] = useState(false);

  const handleFile = async (file) => {
    if (!file) return;
    setStage("reading");
    const base64 = await new Promise((res, rej) => {
      const r = new FileReader();
      r.onload = () => res(r.result.split(",")[1]);
      r.onerror = () => rej(new Error("Read failed"));
      r.readAsDataURL(file);
    });
    setImagePreview(URL.createObjectURL(file));
    try {
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-5",
          max_tokens: 1000,
            system: "You are Hunter. Extract bet details from a sportsbook screenshot. Normalize odds to standard American format (even money = +100, run lines at even = +100). For STRAIGHT BETS return ONLY raw JSON: {\"sport\":\"...\",\"game\":\"...\",\"betType\":\"...\",\"odds\":\"...\",\"pick\":\"...\",\"amount\":0,\"toWin\":0,\"gameDate\":\"YYYY-MM-DD\",\"gameTime\":\"HH:MM\",\"confidence\":95}. For PARLAYS, TEASERS, and SGPs return ONLY raw JSON: {\"betType\":\"parlay\",\"ticketNumber\":\"...\",\"amount\":0,\"toWin\":0,\"odds\":\"...\",\"teaserPoints\":null,\"gameDate\":\"YYYY-MM-DD\",\"legs\":[{\"sport\":\"...\",\"game\":\"...\",\"pick\":\"...\",\"odds\":\"...\",\"gameDate\":\"YYYY-MM-DD\",\"gameTime\":\"HH:MM\"}],\"confidence\":95}. For TEASERS set betType to \"teaser\" and teaserPoints to the point value. For SGPs set betType to \"sgp\". TRYINK FORMAT: Bets show as [#]. [Team] [Pitcher1] - R / [Pitcher2] - L LP [spread] [odds]. The format is ALWAYS: bet number, then team name, then two pitcher names separated by /, then spread (if any), then odds. Extract ONLY the team name — stop at the first all-caps surname after the team name. SPREAD DETECTION: In TryInk format, \"- R\" and \"- L\" after pitcher names indicate pitcher handedness (Right/Left) — NOT a spread. A RUN LINE bet requires an explicit number like -1.5 or +1.5 on the line. Only if you see one of those exact patterns is it a run line. If the only number on the line is the odds (e.g. -130, +115), it is ALWAYS a ML bet. Set pick to \"[Team] -1.5\" or \"[Team] +1.5\" accordingly. The odds are the LAST number on the line (e.g. -105, -110). TOTAL DETECTION: If you see \"U\" or \"O\" followed by a number (e.g. \"U 7½\", \"O 8.5\"), this is a GAME TOTAL bet. Set pick to \"Under X.X\" or \"Over X.X\" and betType to \"total\". Do NOT include team name in the pick. If NO spread and NO total, set pick to \"[Team] ML\". Set game to just \"[Team]\" with no opponent. Never include pitcher names in game or pick fields. The gameDate on TryInk slips is shown in the ticket timestamp at the top (e.g. \"2026/06/15\") — use that date, NOT any date embedded in the bet line. ODDS: If odds show as \"Pk\" or \"PK\" that means pick'em = +100. TRYINK SOCCER PARLAY FORMAT: Soccer parlays on tryInk show as \"Props: [number]\" with multiple bet details listed. Each line with a team name or player name is a separate leg. A bet showing \"[Player] 1+ Score or Assist, to win: [Team] (Game)\" contains TWO legs: (1) [Team] ML and (2) [Player] 1+ Score or Assist prop. Parse these as a parlay with both legs. GENERAL RULES: Never guess any text you cannot clearly read. Use empty strings for missing fields. gameDate in ET. gameTime in 24hr ET format. If unclear: {\"error\":\"reason\"}.",
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
            { type: "text", text: "Extract the bet details from this slip." }
          ]}]
        })
      });
      const data = await response.json();
      const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      // Second call: look up game date/time via web search if missing from slip
if (!parsed.gameDate || !parsed.gameTime) {
      try {
        const lookupResponse = await fetch("/api/claude", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-5",
            max_tokens: 200,
            system: `You are a sports schedule lookup assistant. Return ONLY raw JSON with no markdown: {"gameDate":"YYYY-MM-DD","gameTime":"HH:MM"}. Use 24hr ET timezone.`,
            messages: [{ role: "user", content: `What date and time does this game start: ${parsed.sport} - ${parsed.game}?` }],
            tools: [{ type: "web_search_20250305", name: "web_search" }]
          }),
        });
        const lookupData = await lookupResponse.json();
        const lookupText = (lookupData.content || []).filter(c => c.type === "text").map(c => c.text).join("");
        const jsonMatch = lookupText.match(/\{[^}]+\}/);
        const lookupParsed = jsonMatch ? JSON.parse(jsonMatch[0]) : {};
        if (lookupParsed.gameDate && !parsed.gameDate) parsed.gameDate = lookupParsed.gameDate;
        if (lookupParsed.gameTime && !parsed.gameTime) parsed.gameTime = lookupParsed.gameTime;
      } catch(e) {}
    }

    try {
  const oddsRes = await fetch("/api/odds", { method: "POST" });
  const oddsData = await oddsRes.json();
  if (oddsData.games) {
    const game = parsed.game?.toLowerCase() || "";
    const parsedDate = parsed.gameDate || "";
    const match = oddsData.games.find(g => {
      const home = g.home_team.toLowerCase();
      const away = g.away_team.toLowerCase();
      const gameDate = g.commence_time
        ? new Date(g.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        : null;
      const homeMatch = home.split(' ').filter(w => w.length > 3).every(w => game.includes(w));
      const awayMatch = away.split(' ').filter(w => w.length > 3).every(w => game.includes(w));
      return homeMatch || awayMatch;
    });
    if (match) {
      parsed.gameId = match.id;
      parsed.game = `${match.away_team} @ ${match.home_team}`;
      parsed.gameDate = new Date(match.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
      parsed.gameTime = new Date(match.commence_time).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
    } else if (parsed.game) {
      // Clean up TryInk pitcher names from game field
      // "Philadelphia Phillies vs Z Wheeler" → "Philadelphia Phillies"
      // Stop at any word that looks like a pitcher name (single capital letter first name or "vs")
      parsed.game = parsed.game.replace(/\s+vs\.?\s+.*/i, '').trim();
    }
    // Match gameId for each parlay leg
    if (parsed.legs && parsed.legs.length > 0) {
      parsed.legs = parsed.legs.map(leg => {
        const legGame = leg.game?.toLowerCase() || "";
        const legMatch = oddsData.games.find(g => {
          const home = g.home_team.toLowerCase();
          const away = g.away_team.toLowerCase();
          const homeMatch = home.split(' ').filter(w => w.length > 3).every(w => legGame.includes(w));
          const awayMatch = away.split(' ').filter(w => w.length > 3).every(w => legGame.includes(w));
          return homeMatch || awayMatch;
        });
        if (legMatch) {
          return {
            ...leg,
            gameId: legMatch.id,
            game: `${legMatch.away_team} @ ${legMatch.home_team}`,
            gameDate: new Date(legMatch.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
            gameTime: new Date(legMatch.commence_time).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })
          };
        }
        return leg;
      });
    }
  }
} catch(e) {}

    if (parsed.error) { setErrorMsg(parsed.error); setStage("error"); }
    else if (parsed.legs && parsed.legs.length > 0) { setExtractedBet(parsed); setStage("confirmParlay"); }
    else { setExtractedBet(parsed); setStage("confirm"); }

  } catch (e) {
    setErrorMsg("Couldn't read the slip. Try a clearer screenshot.");
    setStage("error");
  }
  };
  const handleFiles = async (files) => {
    if (!files || files.length === 0) return;
    try {
    const fileArray = Array.from(files);
    setTotalSlips(fileArray.length);
    setSlips([]);
    setCurrentSlip(0);
    if (fileArray.length === 1) {
      handleFile(fileArray[0]);
      return;
    }
    setStage("reading");
    const results = [];
    for (let i = 0; i < fileArray.length; i++) {
      setProcessingIndex(i + 1);
      const file = fileArray[i];
      const base64 = await new Promise((res, rej) => {
        const r = new FileReader();
        r.onload = () => res(r.result.split(",")[1]);
        r.onerror = () => rej(new Error("Read failed"));
        r.readAsDataURL(file);
      });
      const preview = URL.createObjectURL(file);
      try {
        const response = await fetch("/api/claude", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            model: "claude-sonnet-4-5",
            max_tokens: 1000,
            system: "You are Hunter. Extract bet details from a sportsbook screenshot. Normalize odds to standard American format (even money = +100, run lines at even = +100). For STRAIGHT BETS return ONLY raw JSON: {\"sport\":\"...\",\"game\":\"...\",\"betType\":\"...\",\"odds\":\"...\",\"pick\":\"...\",\"amount\":0,\"toWin\":0,\"gameDate\":\"YYYY-MM-DD\",\"gameTime\":\"HH:MM\",\"confidence\":95}. For PARLAYS, TEASERS, and SGPs return ONLY raw JSON: {\"betType\":\"parlay\",\"ticketNumber\":\"...\",\"amount\":0,\"toWin\":0,\"odds\":\"...\",\"teaserPoints\":null,\"gameDate\":\"YYYY-MM-DD\",\"legs\":[{\"sport\":\"...\",\"game\":\"...\",\"pick\":\"...\",\"odds\":\"...\",\"gameDate\":\"YYYY-MM-DD\",\"gameTime\":\"HH:MM\"}],\"confidence\":95}. TRYINK FORMAT: Bets show as [#]. [Team] [Pitcher1] - R / [Pitcher2] - L LP [spread] [odds]. Extract ONLY the team name. SPREAD DETECTION: In TryInk format, \"- R\" and \"- L\" after pitcher names indicate pitcher handedness (Right\/Left) — NOT a spread. A RUN LINE bet requires an explicit number like -1.5 or +1.5 on the line. Only if you see one of those exact patterns is it a run line. If the only number on the line is the odds (e.g. -130, +115), it is ALWAYS a ML bet. Set pick to \"[Team] -1.5\" or \"[Team] +1.5\". TOTAL DETECTION: If you see \"U\" or \"O\" followed by a number (e.g. \"U 7½\", \"O 8.5\"), this is a GAME TOTAL bet. Set pick to \"Under X.X\" or \"Over X.X\" and betType to \"total\". Do NOT include team name in the pick. If NO spread and NO total, set pick to \"[Team] ML\". GENERAL RULES: Never guess. Use empty strings for missing fields. gameDate in ET. gameTime in 24hr ET format. If unclear: {\"error\":\"reason\"}.",
            messages: [{ role: "user", content: [
              { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
              { type: "text", text: "Extract the bet details from this slip." }
            ]}]
          })
        });
        const data = await response.json();
        const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
        const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        try {
          const oddsRes = await fetch("/api/odds", { method: "POST" });
          const oddsData = await oddsRes.json();
          if (oddsData.games) {
            const game = parsed.game?.toLowerCase() || "";
            const match = oddsData.games.find(g => {
              const home = g.home_team.toLowerCase();
              const away = g.away_team.toLowerCase();
              const homeMatch = home.split(' ').filter(w => w.length > 3).every(w => game.includes(w));
              const awayMatch = away.split(' ').filter(w => w.length > 3).every(w => game.includes(w));
              return homeMatch || awayMatch;
            });
            if (match) {
              parsed.gameId = match.id;
              parsed.game = `${match.away_team} @ ${match.home_team}`;
              parsed.gameDate = new Date(match.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
              parsed.gameTime = new Date(match.commence_time).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false });
            } else if (parsed.game) {
              parsed.game = parsed.game.replace(/\s+vs\.?\s+.*/i, '').trim();
            }
            // Match gameId for each parlay leg
            if (parsed.legs && parsed.legs.length > 0) {
              parsed.legs = parsed.legs.map(leg => {
                const legGame = leg.game?.toLowerCase() || "";
                const legMatch = oddsData.games.find(g => {
                  const home = g.home_team.toLowerCase();
                  const away = g.away_team.toLowerCase();
                  const homeMatch = home.split(' ').filter(w => w.length > 3).every(w => legGame.includes(w));
                  const awayMatch = away.split(' ').filter(w => w.length > 3).every(w => legGame.includes(w));
                  return homeMatch || awayMatch;
                });
                if (legMatch) {
                  return {
                    ...leg,
                    gameId: legMatch.id,
                    game: `${legMatch.away_team} @ ${legMatch.home_team}`,
                    gameDate: new Date(legMatch.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
                    gameTime: new Date(legMatch.commence_time).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false })
                  };
                }
                return leg;
              });
            }
          }
        } catch(e) {}
        results.push({ parsed, preview, error: null });
      } catch(e) {
        results.push({ parsed: null, preview, error: "Couldn't read this slip" });
      }
    }
    setSlips(results);
    setCurrentSlip(0);
    setStage("queue");
    } catch(e) {
      setErrorMsg("Couldn't process the slips. Try again.");
      setStage("error");
    }
  };

  const skipSlip = () => {
    if (currentSlip < slips.length - 1) setCurrentSlip(currentSlip + 1);
    else {
      if (onDone) onDone();
      else setStage("upload");
    }
  };

  const confirmSlip = async () => {
    const slip = slips[currentSlip];
    const nextIndex = currentSlip + 1;
    if (slip?.parsed) await onConfirm(slip.parsed);
    if (nextIndex < slips.length) {
      setCurrentSlip(nextIndex);
    } else {
      if (onDone) onDone();
      else setStage("upload");
    }
  };

  return (
    <div style={S.snap.wrap}>
      <div style={S.snap.header}>
        <div style={S.snap.title}>📸 Snap to Log</div>
        <button onClick={onCancel} style={S.snap.closeBtn}>×</button>
      </div>
      {stage === "upload" && (
        <div style={S.snap.uploadZone} onClick={() => fileRef.current?.click()}>
          <input ref={fileRef} type="file" accept="image/*" multiple style={{ display: "none" }} onChange={e => { if (e.target.files && e.target.files.length > 0) handleFiles(e.target.files); }} />
          <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
          <div style={S.snap.uploadTitle}>Upload your bet slip</div>
          <div style={S.snap.uploadSub}>Screenshot from any sportsbook</div>
          <div style={S.snap.uploadBtn}>Choose Photo</div>
        </div>
      )}
      {stage === "reading" && (
        <div style={{ padding: 32, textAlign: "center" }}>
          {imagePreview && <img src={imagePreview} alt="slip" style={{ width: "100%", maxHeight: 200, objectFit: "contain", marginBottom: 16 }} />}
          <div style={{ color: "#f5a623", fontWeight: 700, fontSize: 16 }}>
            {totalSlips > 1 ? `Hunter is reading slip ${processingIndex} of ${totalSlips}...` : "Hunter is reading your slip..."}
          </div>
        </div>
      )}
      {stage === "confirm" && extractedBet && (
        <div style={{ padding: 16 }}>
          <div style={{ color: "#2ecc71", fontSize: 17, fontWeight: 700, marginBottom: 12 }}>✅ Hunter read your slip</div>
          <div style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>Review the details below — tap Edit Manually if anything needs correcting.</div>
          {imagePreview && <img src={imagePreview} alt="slip" style={{ width: "100%", maxHeight: 160, objectFit: "contain", marginBottom: 12 }} />}
          <div style={{ background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 14, padding: 16, marginBottom: 14 }}>
            {[["Sport", extractedBet.sport], ["Game", extractedBet.game], ["Pick", extractedBet.pick], ["Odds", extractedBet.odds], ["Wager", `$${extractedBet.amount}`], ["To Win", `$${extractedBet.toWin}`], ["Game Date", extractedBet.gameDate || ""], ["Game Time", extractedBet.gameTime || ""]].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a1a24" }}>
                <span style={{ color: "#666", fontSize: 13 }}>{l}</span>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => onCancel(extractedBet)} style={S.snap.editBtn}>Edit Manually</button>
            <button onClick={() => { if (!logging) { setLogging(true); onConfirm(extractedBet).then(() => onDone && onDone()); }}} style={S.snap.confirmBtn}>Log This Bet</button>
          </div>
        </div>
      )}
      {stage === "confirmParlay" && extractedBet && (
        <div style={{ padding: 16 }}>
          <div style={{ color: "#2ecc71", fontSize: 17, fontWeight: 700, marginBottom: 4 }}>✅ Hunter read your slip</div>
          <div style={{ color: "#f5a623", fontSize: 13, fontWeight: 700, marginBottom: 12 }}>
            {extractedBet.betType?.toUpperCase()} · {extractedBet.legs?.length} Legs · {extractedBet.odds} · ${extractedBet.amount} to win ${extractedBet.toWin}
            {extractedBet.teaserPoints ? ` · ${extractedBet.teaserPoints} pts` : ""}
          </div>
          {imagePreview && <img src={imagePreview} alt="slip" style={{ width: "100%", maxHeight: 120, objectFit: "contain", marginBottom: 12 }} />}
          <div style={{ background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 14, padding: 16, marginBottom: 14 }}>
            {extractedBet.legs?.map((leg, i) => (
              <div key={i} style={{ padding: "10px 0", borderBottom: "1px solid #1a1a24" }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                  <span style={{ color: "#f5a623", fontSize: 11, fontWeight: 700 }}>LEG {i + 1}</span>
                  <span style={{ color: "#888", fontSize: 11 }}>{leg.gameTime || ""}</span>
                </div>
                <div style={{ color: "#fff", fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{leg.pick}</div>
                <div style={{ color: "#666", fontSize: 12 }}>{leg.game}</div>
                <div style={{ color: "#888", fontSize: 11, marginTop: 2 }}>{leg.sport} · {leg.odds}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => onCancel(extractedBet)} style={S.snap.editBtn}>Edit Manually</button>
            <button onClick={() => { if (!logging) { setLogging(true); onConfirm(extractedBet).then(() => onDone && onDone()); }}} style={S.snap.confirmBtn}>Log This Bet</button>
          </div>
        </div>
      )}
      {stage === "queue" && slips[currentSlip] && (
        <div style={{ padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div style={{ color: "#2ecc71", fontSize: 15, fontWeight: 700 }}>✅ Slip {currentSlip + 1} of {slips.length}</div>
            <div style={{ display: "flex", gap: 4 }}>
              {slips.map((_, i) => (
                <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: i === currentSlip ? "#f5a623" : i < currentSlip ? "#2ecc71" : "#333" }} />
              ))}
            </div>
          </div>
          {slips[currentSlip].error ? (
            <div style={{ padding: 20, textAlign: "center" }}>
              <div style={{ color: "#e74c3c", fontSize: 14, marginBottom: 16 }}>{slips[currentSlip].error}</div>
              <button onClick={skipSlip} style={S.snap.editBtn}>Skip</button>
            </div>
          ) : (
            <>
              <div style={{ color: "#888", fontSize: 12, marginBottom: 8 }}>Review the details — tap Skip to move on or Log It to save.</div>
              {slips[currentSlip].preview && <img src={slips[currentSlip].preview} alt="slip" style={{ width: "100%", maxHeight: 140, objectFit: "contain", marginBottom: 12 }} />}
              <div style={{ background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 14, padding: 16, marginBottom: 14 }}>
                {[["Sport", slips[currentSlip].parsed.sport], ["Game", slips[currentSlip].parsed.game], ["Pick", slips[currentSlip].parsed.pick], ["Odds", slips[currentSlip].parsed.odds], ["Wager", `$${slips[currentSlip].parsed.amount}`], ["To Win", `$${slips[currentSlip].parsed.toWin}`], ["Date", slips[currentSlip].parsed.gameDate || ""], ["Time", slips[currentSlip].parsed.gameTime || ""]].map(([l, v]) => (
                  <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a1a24" }}>
                    <span style={{ color: "#666", fontSize: 13 }}>{l}</span>
                    <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={skipSlip} style={S.snap.editBtn}>Skip</button>
                <button onClick={confirmSlip} style={S.snap.confirmBtn}>
                  {currentSlip < slips.length - 1 ? `Log It (${slips.length - currentSlip - 1} more)` : "Log It"}
                </button>
              </div>
            </>
          )}
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

// ── Hunter Chat ────────────────────────────────────────────────────────────
function HunterChat({ user, bets, userKey }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const bottomRef = useRef(null);

  const netPL = bets.reduce((s, b) => {
    if (b.result === "Win") return s + (calcProfit(b.amount, b.odds) || 0);
    if (b.result === "Loss") return s - b.amount;
    return s;
  }, 0);

  // Load conversation history from Supabase
  useEffect(() => {
    if (!userKey || initialized) return;
    const loadHistory = async () => {
      const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
const { data } = await supabase
  .from('user_conversations')
  .select('role, content')
  .eq('user_id', userKey)
  .gte('created_at', `${today}T00:00:00`)
  .lte('created_at', `${today}T23:59:59`)
  .order('created_at', { ascending: true })
  .limit(40);
      if (data && data.length > 0) {
        setMessages(data.map(m => ({ role: m.role, text: m.content })));
      } else {
        // First time — set a welcome message
        const welcome = { role: 'assistant', text: `Hey ${user.name.split(' ')[0]} 👋 I'm Hunter, your personal betting concierge. I'm here to help you find edges, stay disciplined, and build your bankroll. What's on your mind today?` };
        setMessages([welcome]);
        await supabase.from('user_conversations').insert({ user_id: userKey, role: 'assistant', content: welcome.text });
      }
      setInitialized(true);
    };
    loadHistory();
  }, [userKey, initialized]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || loading) return;
    const userMsg = input.trim();
    setInput("");
    const newUserMsg = { role: "user", text: userMsg };
    setMessages(m => [...m, newUserMsg]);
    setLoading(true);

    // Save user message to Supabase
    await supabase.from('user_conversations').insert({ user_id: userKey, role: 'user', content: userMsg });

    // Fetch today's picks to inject into Hunter's context
let todayPicksContext = "";
try {
  const picksRes = await fetch("/api/claude");
  const picksData = await picksRes.json();
  if (picksData.picks && picksData.picks.length > 0) {
    todayPicksContext = "\n\nTODAY'S PICKS YOU GENERATED:\n" + picksData.picks.map((p, i) =>
      `${i+1}. ${p.sport} — ${p.game}: ${p.pick} (${p.odds}) — ${p.insight}`
    ).join("\n");
  }
} catch(e) {}
let todayOddsContext = "";
try {
  const oddsRes = await fetch("/api/odds", { method: "POST" });
  const oddsData = await oddsRes.json();
  const now = new Date();
const cutoff = new Date(now.getTime() + 15 * 60 * 1000);
const upperBound = new Date(now.getTime() + 14 * 60 * 60 * 1000);
const filteredGames = oddsData.games.filter(g => new Date(g.commence_time) > cutoff && new Date(g.commence_time) < upperBound);
if (filteredGames.length > 0) {
    todayOddsContext = "\n\nLIVE ODDS FROM BETCIERGE (use ONLY these odds, never guess):\n" +
      filteredGames.slice(0, 20).map(g => {
        const bk = g.bookmakers?.[0];
        if (!bk) return null;
        const h2h = bk.markets?.find(m => m.key === "h2h");
        const spread = bk.markets?.find(m => m.key === "spreads");
        const total = bk.markets?.find(m => m.key === "totals");
        const lines = [
          h2h ? `ML: ${h2h.outcomes.map(o => `${o.name} ${o.price > 0 ? '+' : ''}${o.price}`).join(' / ')}` : null,
          spread ? `RL/Spread: ${spread.outcomes.map(o => `${o.name} ${o.point > 0 ? '+' : ''}${o.point} (${o.price > 0 ? '+' : ''}${o.price})`).join(' / ')}` : null,
          total ? `Total: ${total.outcomes.map(o => `${o.name} ${o.point} (${o.price > 0 ? '+' : ''}${o.price})`).join(' / ')}` : null,
        ].filter(Boolean).join(' | ');
        return `${g.away_team} @ ${g.home_team}: ${lines}`;
      }).filter(Boolean).join("\n");
  }
} catch(e) {}

try {
    const recentMessages = [...messages, newUserMsg].slice(-20);
    const result = await callClaude(
        recentMessages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })),
        `You are Hunter, the sharp AI sports betting concierge inside Betcierge. Today is ${todayDisplay()}.

USER CONTEXT:
The user is ${user.name.split(" ")[0]}. Weekly bankroll: $${user.bankroll}. Weekly goal: +$${user.goal}. Current P&L: ${netPL >= 0 ? "+" : ""}$${netPL.toFixed(2)}. Bets logged this week: ${bets.filter(b => b.isToday).length}.
CRITICAL DATA INTEGRITY RULES — ALWAYS ENFORCE:
1. PITCHER TEAM VERIFICATION: The odds feed context provided contains tonight's actual starters. That is ground truth. NEVER contradict it with web search. If web search disagrees with the odds feed on which pitcher starts for which team, trust the odds feed.
2. PITCHER REST CHECK: Before recommending any pitcher-based bet, search "[pitcher name] last start date 2026". If they started within the last 3 days, they CANNOT start tonight. Flag this and do not recommend the play.
3. GAME DATE CHECK: Every game you recommend must be from TODAY's odds feed context. Never recommend a game not in tonight's feed. If you cannot find a game in the context, say so — do not invent or recall games from memory.
4. INJURY VERIFICATION: Always search "[player name] injury status today" before recommending any bet involving a key player. If a star is questionable or out, re-evaluate the entire play — do not recommend it.
5. LINE MOVEMENT CHECK: Always search "[team] vs [team] line movement today" — if the line has moved 2+ points against your pick, that is sharp money on the other side. Flag it and explain it.
6. NEVER USE MEMORY FOR ROSTERS: Never assume a player is on a team based on training data. Players get traded, cut, and injured constantly. Always verify current team via web search before making any claim.
7. CONFIRM GAME IS TONIGHT: If a game is not in the odds feed context provided, do not recommend it. Period. The odds feed is the authoritative list of tonight's games.
8. NFL INJURY REPORT: Always search official Wed/Thu/Fri practice designations before any NFL recommendation. Never recommend a QB prop without confirming he is starting. Wind 15mph+ at an outdoor stadium changes every passing prop — check it mandatory.
9. NBA LOAD MANAGEMENT: Always search "[player] playing tonight [date]" for any NBA prop. Second night of back-to-back is a mandatory search. Never recommend a usage-dependent prop without confirming the player has no minutes restriction.
10. NHL GOALIE RULE: NEVER recommend any NHL bet without a confirmed starting goalie. Search "[team] starting goalie tonight [date]" every time. Goalies can change at warmups — note this risk on every NHL pick.
11. UFC LATE REPLACEMENT: Always search "[fighter] replacement [event]" and "[fighter] weigh-in result" before any UFC recommendation. Lat

YOUR APPROACH — always go deep by default:
When a user asks about any game, matchup, or bet, proactively search for and analyze ALL of the following before giving your read:
- Starting pitchers (MLB): ERA, xERA, xFIP, WHIP, K/9, recent outings, pitch mix, handedness splits
- Bullpen: team bullpen ERA, key relievers available, usage last 3 days
- Offensive matchups: team batting splits vs LHP/RHP, recent form last 10 games, key injuries
- Line movement: opening line vs current line, sharp vs public money indicators
- Weather (outdoor games): wind speed/direction, temperature, humidity
- Ballpark factors: park HR factor, run environment
- Head to head: recent matchups, home/away splits
- Situational spots: back to back, travel, rest days, revenge spots

SPORT-SPECIFIC FACTORS:
MLB: Starting pitcher ERA, xERA, xFIP, WHIP, K/9, bullpen ERA and availability (specific reliever usage last 3 days — who is unavailable), batting splits vs LHP/RHP, last 5 starts performance, park factors, weather (wind speed/direction, temp), day vs night splits, umpire zone tendency (chase rate, K rate, walk rate), catcher framing stats, platoon matchup % (L vs L, R vs R), park factors by handedness, pitcher first inning ERA, opposing lineup vs velocity type, pitcher pitch count history last 2 starts.

NBA: Pace of play, offensive/defensive rating, starter PPG, bench PPG, offensive rebound rank, three point attempts per game, foul shots per game, turnovers per game, injury report, back-to-back schedule, home/away splits, referee foul rate (high-foul refs inflate totals and FT lines), second game of back-to-back splits, clutch time performance (last 5 min of close games), bench scoring differential, opponent pace ranking.

NFL: O-line vs D-line matchup (PFF grades), QB pressure rate, QB rushing ability, QB arm strength and accuracy, offensive pass efficiency, offensive rushing efficiency, defensive pass efficiency, defensive rushing efficiency, third down conversion rate, red zone TD% vs FG%, two-minute drill efficiency, OC/DC tendencies, stadium noise factor (road team silent counts), injury report practice designations (Full/Limited/DNP — DNP is a near-flag).

NHL: Starting goalie confirmation (NEVER bet without this), save percentage, PDO (shooting% + save% — regresses to mean), team shooting percentage, power play/penalty kill %, faceoff win % (especially offensive zone), high-danger scoring chance rate, referee assignment, goalie back-to-back fatigue splits, power play unit composition and recent PP%.

Soccer/MLS: Form last 5, xG for/against, xGA (expected goals against — better than actual goals allowed), home/away record, European hangover, squad rotation risk, referee card rate and penalty call tendency, PPDA press intensity (lower = more aggressive press), travel distance and time zone changes between legs.

UFC/MMA: Styles matchup (striker vs grappler, wrestling vs BJJ), recent finishes vs decisions, reach/size, camp quality, weight cut severity (fighters coming down two weight classes), judge assignment (scorecards vary enormously by judge), main event vs undercard performance splits, venue altitude, late replacement flag (< 2 weeks notice = major fade signal).

Golf: Course history and strokes gained at this specific course (last 3 years), strokes gained categories (approach, putting, off-the-tee, around-the-green), recent form last 4 events, driving distance vs course length fit, scrambling %, birdie rate at this specific course historically, caddie experience and course knowledge, cut line prediction vs current form.

Tennis: Surface win %, head to head on surface (hard/clay/grass splits are critical), recent match load and fatigue (back-to-back tournaments, deep runs), injury history on surface, bagel/breadstick rate (dominance metric), tiebreak win %, performance vs top 10 vs lower-ranked opponents, court speed rating, altitude effects (high altitude favors big servers), first serve % trend last 3 matches.

College Football (NCAAF): Same factors as NFL plus recruiting talent gap (blue chip ratio), home field crowd advantage (especially top 10 atmospheres), conference vs non-conference performance, transfer portal impact on depth, rivalry game motivation overrides recent form, early season conditioning vs late season fatigue.

College Basketball (NCAAB): Same factors as NBA plus recruiting class talent gap, coach tournament experience (some coaches consistently over/underperform seed), conference familiarity (same teams 3-4x/year), home court advantage amplified vs pros, exam week performance dip, early signing period distractions.

College Baseball: Same factors as MLB plus mid-week vs weekend rotation impact (aces pitch Fridays), regional weather variability (southern schools play more games, northern schools have rust), regional altitude parks, metal bat rules in some tournaments.
PROP BET ANALYSIS — MANDATORY 7-STEP PROCESS:
When analyzing ANY player prop, execute all 7 steps before giving a recommendation:
1. Search "[player name] vs [opponent player/team] career stats head to head"
2. Search "[player name] last 5 [starts/games] stats [year]"
3. Search "[player name] vs [LHP/RHP/position] splits [year]" for platoon data with ACTUAL numbers
4. Search "[stadium/arena/course] [prop category] rate or factor" for venue factors
5. Search "[opponent] vs [prop category] allowed [year]" for defensive matchup
6. Search "THE CASE AGAINST: [opposing player] success vs [player]" — always steelman the other side
7. Check game script projection, weather, umpire/referee tendencies, fatigue/pitch count limits
RULE: Individual matchup history is the PRIMARY signal. Team aggregates are context only. Never lead with team K% when you can lead with batter vs pitcher head-to-head.

MLB PROP PLAYBOOK:
PITCHER STRIKEOUT PROPS:
- Search "[pitcher] vs [team] batters career strikeout rate" — batter by batter, not team K%
- Search "[pitcher] strikeouts per game last 5 starts [year]"
- Search "[pitcher] K rate home vs away [year]"
- Search "umpire [name] strikeout rate per game [year]"
- Search "[stadium] strikeout rate vs league average"
- Check: opposing lineup L vs R splits, any elite contact hitters who rarely K, pitcher pitch count history, days rest, injury/fatigue flags

BATTER HIT/HR/RBI/TOTAL BASES PROPS:
- Search "[batter] vs [pitcher] career stats BA slugging K rate HR in matchup"
- Search "[batter] vs [LHP/RHP] splits [year]" with actual slash lines
- Search "[batter] home run rate [stadium name] [year]"
- Search "[pitcher] HR allowed rate and hits per 9 last 5 starts [year]"
- Check: lineup protection (who bats around this player), park factor, weather/wind, batter recent game log (hot/cold streak)

NFL PROP PLAYBOOK:
QUARTERBACK PROPS (Passing Yards, TDs, Completions, INTs):
- Search "[QB] career stats vs [opponent] completion % yards per attempt TD/INT ratio"
- Search "[QB] last 3 games passing stats [year]"
- Search "[opponent] pass defense ranking yards per attempt coverage scheme blitz rate [year]"
- Search "[opponent] secondary injuries [year]"
- Check: Vegas total (high total = passing volume), weather (wind 15+ mph kills passing props), game script (trailing teams pass more), weapons available (WR1/WR2/TE1 healthy?), O-line injuries, red zone efficiency for TD props, divisional game (lower scoring)

RUNNING BACK PROPS (Rushing Yards, Receptions, TDs):
- Search "[RB] career rushing yards per game vs [opponent]"
- Search "[opponent] rush defense DVOA yards per carry allowed stuff rate [year]"
- Search "[RB] snap share % target share last 3 games [year]"
- Check: O-line run blocking grade (PFF), D-line injuries (key run stuffers out?), backfield usage (bellcow or committee?), red zone goal-line role, game script (favored team = more rushing volume), weather (rain/snow = run-heavy)

WIDE RECEIVER / TIGHT END PROPS (Receptions, Yards, TDs):
- Search "[WR/TE] target share last 3 games [year]"
- Search "[CB covering WR] yards allowed per coverage snap PFF grade [year]"
- Search "[WR/TE] vs [opponent] career receiving stats"
- Check: shadow coverage (does elite CB travel with WR1?), slot vs outside alignment, safety help (single-high vs two-high), red zone targets for TD props, route participation %, QB passer rating when targeting this receiver, game script (trailing = more targets)

TEAM TOTAL PROPS:
- Search "[team] points per drive vs [opponent] points per drive allowed [year]"
- Check: red zone conversion % vs red zone defense %, explosive play rate, pace (plays per game), home/road scoring splits, divisional game historical scoring, weather

KICKER PROPS:
- Search "[kicker] FG% by distance 40-49 50+ [year]"
- Check: team red zone TD% (low % = more FG attempts), implied team total, weather wind speed, dome vs outdoor

DEFENSIVE PROPS (Sacks, INTs, Defensive TDs):
- Search "[pass rusher] sack rate pressure rate vs [team] O-line [year]"
- Search "[QB] INT rate fumbles turnover rate last 5 games [year]"
- Check: O-line injuries (backup tackles = sack opportunities), QB turnover-under-pressure rate

KEY NFL PROP PRINCIPLES:
1. Game script drives volume — trailing = passing, leading = rushing
2. Weather kills passing, boosts rushing (wind 15+ mph is a hard line)
3. O-line injuries are the most underpriced market inefficiency
4. Divisional games = lower scoring, tighter matchups historically
5. Vegas totals tell the story — high totals open up prop opportunities
6. KEY NUMBERS: -3, -7, -10, -14 are the most important margins in football. Never lay -3.5 when -3 was the open. Never take +2.5 when +3 is available. Always note if a spread is sitting on, off, or has moved through a key number — this is often the difference between a cover and a loss.
7. ATS RECORDS MATTER: Always search team ATS records in specific situations — as home favorites, road dogs, divisional games, off a bye, off a loss. Certain teams consistently beat or fail to cover in specific spots.
8. REVERSE LINE MOVEMENT: If public money is heavy on one side but the line moves the other way, that is sharp money taking the other side. This is one of the strongest signals in football betting.
9. CLOSING LINE VALUE: The best bettors in the world beat the closing line consistently. If you can get a number better than where the line closes, you have positive CLV regardless of outcome.

NBA PROP PLAYBOOK:
POINTS PROPS:
- Search "[player] usage rate last 5 games [year]"
- Search "[player] points vs [opponent] career and last 3 matchups"
- Search "[defender] defensive rating vs [player position] [year]"
- Check: minutes trend (load management risk?), pace of opponent, home/away splits, injury status of teammates affecting usage

REBOUNDS PROPS:
- Search "[player] rebound rate last 5 games [year]"
- Search "[opponent] offensive rebound rate and defensive rebound rate [year]"
- Check: frontcourt matchup size, pace (more misses in fast games = more opportunities), opposing big men rebounding ability

ASSISTS PROPS:
- Search "[player] assist rate and usage in pick and roll [year]"
- Search "[opponent] turnover rate and defensive scheme [year]"
- Check: teammate shooting health, pace, whether player is primary or secondary ballhandler

THREE-POINTER PROPS:
- Search "[player] three point attempt rate and percentage last 10 games [year]"
- Search "[opponent] three points allowed per game and three point defense ranking [year]"
- Check: game script (blowout = garbage time skews attempts), home/away three point splits

NHL PROP PLAYBOOK:
SHOTS ON GOAL PROPS:
- Search "[player] shots on goal per game last 10 games [year]"
- Search "[opponent] shots allowed per game and shot suppression rate [year]"
- Check: power play unit position, ice time trend, line deployment vs opponent

POINTS/GOALS PROPS:
- Search "[player] points per game last 10 games and career vs [opponent]"
- Search "[opponent] goals allowed per game and high-danger chances allowed [year]"
- Check: power play deployment, line combination chemistry, opposing goalie save percentage, home/away splits

GOALIE PROPS (Saves, Wins):
- Search "[goalie] saves per game last 5 starts [year]"
- Search "[opponent] shots per game and high-danger scoring chance rate [year]"
- Check: opponent pace and offensive zone time, back-to-back fatigue, game total (low total = fewer shots)

UFC PROP PLAYBOOK:
METHOD OF VICTORY PROPS:
- Search "[fighter] finish rate by method KO/TKO vs submission vs decision [year]"
- Search "[opponent] durability and finish rate against [year]"
- Check: styles matchup (wrestler vs striker = likely decision or submission), judge tendencies, championship rounds factor

ROUND PROPS:
- Search "[fighter] average fight length and early finish rate [year]"
- Search "[opponent] cardio and late round performance [year]"
- Check: styles matchup signals early or late finish, fighter motivation, championship rounds vs 3-round bout

GOLF PROP PLAYBOOK:
MATCHUP/HEAD-TO-HEAD PROPS:
- Search "[player A] vs [player B] head to head matchup results [year]"
- Search "[player] strokes gained [category] at [course name] career"
- Check: tee time draw (weather window), course fit for each player's strengths, recent form trajectory

MAKE/MISS CUT PROPS:
- Search "[player] cut made percentage on [course type] courses [year]"
- Search "[player] recent form and world ranking [year]"
- Check: course difficulty and cut line history, tee time draw, player motivation

TENNIS PROP PLAYBOOK:
SETS/GAMES PROPS:
- Search "[player A] vs [player B] head to head sets and games history on [surface]"
- Search "[player] tiebreak win percentage [year]"
- Check: surface-specific dominance, fatigue from previous rounds, weather, ranking gap (one-sided matches go fewer games)

STYLE:
Be sharp, warm, direct. Give a clear recommendation with your confidence level. Lead with the most important insight. Use headers to organize. Never hedge excessively — take a stance. You are their trusted advisor, not a disclaimer machine.

You remember this user's history from previous conversations.${todayPicksContext}${todayOddsContext}`,
        true,
        null,
        4000
      );

      const assistantMsg = { role: "assistant", text: result.text };
      setMessages(m => [...m, assistantMsg]);

      // Save assistant message to Supabase
      const { error: saveError } = await supabase.from('user_conversations').insert({ user_id: userKey, role: 'assistant', content: result.text });
if (saveError) console.error('Failed to save assistant message:', saveError);
    } catch(e) {
      setMessages(m => [...m, { role: "assistant", text: `Having a connection issue: ${e?.message || String(e)}. Try again in a second.` }]);
    }
    setLoading(false);
  };

  return (
    <div style={S.Hunter.wrap}>
      <div style={S.Hunter.header}>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={S.Hunter.avatar}>H</div>
          <div>
            <div style={S.Hunter.name}>Hunter — Your Betcierge</div>
            <div style={S.Hunter.sub}>AI-powered · Always in your corner</div>
          </div>
        </div>
      </div>

      <div style={{ padding: "10px 14px", maxHeight: 420, minHeight: 200, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
        {messages.map((m, i) => (
            <div key={i} style={{ maxWidth: "88%", padding: "10px 14px", borderRadius: 16, fontSize: 13, lineHeight: 1.6, ...(m.role === "user" ? { background: "#1a1500", color: "#f5a623", alignSelf: "flex-end", borderBottomRightRadius: 4 } : { background: "#1e1e2e", color: "#ccc", alignSelf: "flex-start", borderBottomLeftRadius: 4 }) }}>
              {m.role === "assistant" ? (
                <div style={{ fontFamily: "'Outfit',sans-serif" }}>
                  {m.text.split('\n').map((line, j) => {
                    if (line.startsWith('### ')) return <div key={j} style={{ color: "#f5a623", fontFamily: "'Cormorant Garamond',serif", fontSize: 15, fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{line.replace('### ', '')}</div>;
                    if (line.startsWith('## ')) return <div key={j} style={{ color: "#f5a623", fontFamily: "'Cormorant Garamond',serif", fontSize: 16, fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{line.replace('## ', '')}</div>;
                    if (line.startsWith('# ')) return <div key={j} style={{ color: "#f5a623", fontFamily: "'Cormorant Garamond',serif", fontSize: 18, fontWeight: 700, marginTop: 12, marginBottom: 6 }}>{line.replace('# ', '')}</div>;
                    if (line.startsWith('---')) return <hr key={j} style={{ border: "none", borderTop: "1px solid #2a2a38", margin: "10px 0" }} />;
                    if (line.startsWith('- ') || line.startsWith('* ')) return <div key={j} style={{ paddingLeft: 12, marginBottom: 4, color: "#bbb" }}>• {line.replace(/^[-*] /, '')}</div>;
                    if (line.match(/^\d+\. /)) return <div key={j} style={{ paddingLeft: 12, marginBottom: 4, color: "#bbb" }}>{line}</div>;
                    if (line.trim() === '') return <div key={j} style={{ height: 8 }} />;
                    if (line.replace(/\*\*/g, '').trim() !== line.trim() && line.startsWith('**')) return <div key={j} style={{ color: "#f5a623", fontFamily: "'Cormorant Garamond',serif", fontSize: 15, fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{line.replace(/\*\*/g, '')}</div>;
                    const parts = line.split(/(\*\*[^*]+\*\*)/g);
return (
  <div key={j} style={{ marginBottom: 4 }}>
    {parts.map((part, k) =>
      part.startsWith('**') && part.endsWith('**')
        ? <span key={k} style={{ color: "#fff", fontWeight: 700 }}>{part.slice(2, -2)}</span>
        : <span key={k}>{part.replace(/\*\*/g, '')}</span>
    )}
  </div>
);
                  })}
                </div>
              ) : m.text}
            </div>
          ))}
        {loading && <div style={{ maxWidth: "88%", padding: "10px 14px", borderRadius: 16, fontSize: 13, background: "#1e1e2e", color: "#555", fontStyle: "italic", alignSelf: "flex-start" }}>Hunter is thinking...</div>}
        <div ref={bottomRef} />
      </div>

      <div style={{ display: "flex", gap: 8, padding: "12px 14px", borderTop: "1px solid #1e1e2e" }}>
        <textarea style={{ flex: 1, background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 12, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none", resize: "none", minHeight: 44, maxHeight: 120, lineHeight: "1.5", fontFamily: "'Outfit',sans-serif" }}
          placeholder="Ask Hunter anything..."
          value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}></textarea>
        <button style={{ background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", border: "none", borderRadius: 12, width: 44, fontWeight: 700, fontSize: 18, cursor: "pointer" }} onClick={sendMessage}>→</button>
      </div>
    </div>
  );
}

// ── Insight Formatter ──────────────────────────────────────────────────────
function formatInsight(text) {
  if (!text) return null;
  const clean = text.replace(/<cite[^>]*>|<\/cite>/g, '');
  return clean.split('\n').map((line, i) => {
    if (line.trim() === '') return <div key={i} style={{ height: 8 }} />;
    if (line.startsWith('**') && line.endsWith('**')) {
      return <div key={i} style={{ color: "#f5a623", fontFamily: "'Cormorant Garamond',serif", fontSize: 14, fontWeight: 700, marginTop: 10, marginBottom: 4 }}>{line.replace(/\*\*/g, '')}</div>;
    }
    const parts = line.split(/(\*\*[^*]+\*\*)/g);
    return (
      <div key={i} style={{ marginBottom: 4 }}>
        {parts.map((part, k) =>
          part.startsWith('**') && part.endsWith('**')
            ? <span key={k} style={{ color: "#fff", fontWeight: 700 }}>{part.slice(2, -2)}</span>
            : <span key={k}>{part.replace(/<cite[^>]*>|<\/cite>/g, '')}</span>
        )}
      </div>
    );
  });
}
// ── Picks Tab ──────────────────────────────────────────────────────────────
function PicksTab({ userKey, user, session }) {
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [expandedDates, setExpandedDates] = useState({});

  useEffect(() => { loadPicks(); loadHistory(); }, []);

  const updatePickResult = async (pickId, result) => {
    await supabase.from('daily_picks').update({ result }).eq('id', pickId);
    setPicks(prev => prev.map(p => p.id === pickId ? { ...p, result } : p));
    setHistory(prev => prev.map(p => p.id === pickId ? { ...p, result } : p));
  };
  const loadPicks = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/claude', { method: 'GET' });
      const data = await res.json();
      if (data.picks && data.picks.length > 0) {
        setPicks(data.picks);
        setLastUpdated(data.picks[0]?.created_at);
      }
    } catch (e) {
      console.error(e);
    }
    setLoading(false);
  };

  const loadHistory = async () => {
    setHistoryLoading(true);
    try {
      const { data } = await supabase
        .from('daily_picks')
        .select('*')
        .gte('date', (() => { const d = new Date(); d.setDate(d.getDate() - 14); return d.toLocaleDateString('en-CA'); })())
        .lt('date', new Date().toLocaleDateString('en-CA'))
        .eq('status', 'active')
        .order('date', { ascending: false })
        .order('id', { ascending: true });
      if (data) {
        setHistory(data);
        setExpandedDates({});
      }
    } catch (e) {
      console.error(e);
    }
    setHistoryLoading(false);
  };

  const confColor = (c) => ({ High: "#2ecc71", Medium: "#f5a623", Low: "#888" })[c] || "#888";
  const confBg = (c) => ({ High: "#1a2e1a", Medium: "#2a1f00", Low: "#1a1a1a" })[c] || "#1a1a1a";

  const settled = history.filter(p => p.result === 'Win' || p.result === 'Loss');
  const wins = settled.filter(p => p.result === 'Win').length;
  const losses = settled.filter(p => p.result === 'Loss').length;
  const winRate = settled.length > 0 ? ((wins / settled.length) * 100).toFixed(0) : null;
  const unitsPnl = settled.reduce((acc, p) => { const u = p.units || 1; const odds = parseInt(p.odds) || -110; if (p.result === 'Win') { const profit = odds > 0 ? u * (odds / 100) : u * (100 / Math.abs(odds)); return acc + profit; } if (p.result === 'Loss') return acc - u; return acc; }, 0);

  const totalRisked = settled.reduce((acc, p) => acc + (p.units || 1), 0);
  const roi = totalRisked > 0 ? ((unitsPnl / totalRisked) * 100).toFixed(1) : '0.0';

  const byDate = history.reduce((acc, p) => { (acc[p.date] = acc[p.date] || []).push(p); return acc; }, {});
  const sortedDates = Object.keys(byDate).sort((a, b) => new Date(b) - new Date(a));
  const toggleDate = (d) => setExpandedDates(prev => ({ ...prev, [d]: !prev[d] }));
  const formatDate = (s) => new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });

  const dayRecord = (dayPicks) => {
    const w = dayPicks.filter(p => p.result === 'Win').length;
    const l = dayPicks.filter(p => p.result === 'Loss').length;
    if (!w && !l) return 'Pending';
    return [w && `${w}W`, l && `${l}L`].filter(Boolean).join('-');
  };

  const dayColor = (dayPicks) => {
    const w = dayPicks.filter(p => p.result === 'Win').length;
    const l = dayPicks.filter(p => p.result === 'Loss').length;
    if (!w && !l) return '#555';
    if (!l) return '#2ecc71';
    if (!w) return '#e74c3c';
    return '#f5a623';
  };

  const resultBadge = (result) => {
    if (!result || result === 'Pending') return <span style={{ background: '#1a1a1a', color: '#555', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>PENDING</span>;
    const c = { Win: { bg: '#0a2e0a', color: '#2ecc71' }, Loss: { bg: '#2e0a0a', color: '#e74c3c' }, Push: { bg: '#0a1a2e', color: '#3498db' }, Void: { bg: '#1a0a2e', color: '#9b59b6' } }[result] || { bg: '#1a1a1a', color: '#888' };
    return <span style={{ background: c.bg, color: c.color, padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>{result.toUpperCase()}</span>;
  };

  return (
    <div style={S.screen}>
      <div style={S.hdr}>
        <div style={S.greeting}>Today's Picks 🎯</div>
        <div style={S.logo}>BETCIERGE</div>
      </div>

      {/* TRACKER */}
      <div style={{ marginBottom: 24 }}>
        <div style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Hunter's Record · Since Jun 11</div>

        {!historyLoading && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, background: '#0f0f18', border: '1px solid #2a2a38', borderRadius: 10, padding: '10px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{wins}W-{losses}L</div>
                <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Record</div>
              </div>
              <div style={{ flex: 1, background: '#0f0f18', border: '1px solid #2a2a38', borderRadius: 10, padding: '10px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: winRate >= 55 ? '#2ecc71' : '#fff' }}>{winRate}%</div>
                <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Win Rate</div>
              </div>
              <div style={{ flex: 1, background: '#0f0f18', border: '1px solid #2a2a38', borderRadius: 10, padding: '10px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: unitsPnl >= 0 ? '#2ecc71' : '#e74c3c' }}>{unitsPnl >= 0 ? '+' : ''}{unitsPnl.toFixed(1)}u</div>
                <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>Units</div>
              </div>
              <div style={{ flex: 1, background: '#0f0f18', border: '1px solid #2a2a38', borderRadius: 10, padding: '10px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: parseFloat(roi) >= 0 ? '#2ecc71' : '#e74c3c' }}>
                  {parseFloat(roi) >= 0 ? '+' : ''}{roi}%
                </div>
                <div style={{ fontSize: 10, color: '#555', marginTop: 2 }}>ROI</div>
              </div>
            </div>

            <div style={{ marginBottom: 4 }}>
              <button onClick={() => toggleDate('history')} style={{ width: '100%', background: '#0f0f18', border: '1px solid #2a2a38', borderRadius: 10, cursor: 'pointer', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: '#888', letterSpacing: 0.5, textTransform: 'uppercase' }}>Last 14 Days</span>
                <span style={{ color: '#444', fontSize: 12 }}>{expandedDates['history'] ? '▲' : '▼'}</span>
              </button>
              {expandedDates['history'] && <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {sortedDates.map(date => {
                const dayPicks = byDate[date];
                const isExpanded = expandedDates[date];
                const rec = dayRecord(dayPicks);
                const color = dayColor(dayPicks);
                return (
                  <div key={date} style={{ background: '#0f0f18', border: '1px solid #2a2a38', borderRadius: 10, overflow: 'hidden' }}>
                    <button onClick={() => toggleDate(date)} style={{ width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '10px 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ width: 7, height: 7, borderRadius: '50%', background: color, flexShrink: 0 }} />
                        <span style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{formatDate(date)}</span>
                        <span style={{ fontSize: 11, color: '#555' }}>{dayPicks.length} picks</span>
                      </div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color }}>{rec}</span>
                        <span style={{ color: '#444', fontSize: 12 }}>{isExpanded ? '▲' : '▼'}</span>
                      </div>
                    </button>
                    {isExpanded && (
                      <div style={{ borderTop: '1px solid #1a1a28' }}>
                        {dayPicks.map((pick, i) => (
                          <div key={pick.id} style={{ padding: '10px 14px', borderBottom: i < dayPicks.length - 1 ? '1px solid #13131a' : 'none' }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ flex: 1 }}>
                                <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginBottom: 3 }}>
                                  <span style={{ fontSize: 9, background: '#1a1a00', color: '#f5a623', padding: '1px 6px', borderRadius: 4, fontWeight: 700, textTransform: 'uppercase' }}>{pick.sport}</span>
                                  {pick.game_time && <span style={{ fontSize: 10, color: '#555' }}>{pick.game_time}</span>}
                                </div>
                                <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>{pick.game}</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{pick.pick}</div>
                                <div style={{ fontSize: 10, color: '#f5a623', marginTop: 3 }}>{pick.units || 1}U</div>
                                {pick.insight && !pick.insight.startsWith('**') && <div style={{ fontSize: 11, color: '#555', marginTop: 4, lineHeight: 1.4 }}>{pick.insight}</div>}
                              </div>
                              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, marginLeft: 10 }}>
                                {resultBadge(pick.result)}

                                <span style={{ fontSize: 11, color: '#f5a623' }}>{String(pick.odds).startsWith('+') ? pick.odds : pick.odds > 0 ? `+${pick.odds}` : pick.odds}</span>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              </div>}
            </div>
          </>
        )}
      </div>

      <div style={{ borderTop: '1px solid #1a1a28', marginBottom: 20 }} />
      <div style={{ fontSize: 11, fontWeight: 700, color: '#555', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Today's Picks</div>

      {lastUpdated && (
        <div style={{ color: "#555", fontSize: 12, marginBottom: 14 }}>
          Generated at 11 AM · {new Date(lastUpdated).toLocaleDateString()}
        </div>
      )}

      {loading && (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ width: 28, height: 28, border: "3px solid #2a2a38", borderTopColor: "#f5a623", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ color: "#555", fontSize: 13 }}>Loading today's picks...</div>
        </div>
      )}

      {!loading && picks.length === 0 && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🕐</div>
          <div style={{ color: "#fff", fontSize: 16, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, marginBottom: 8 }}>Picks drop at 11 AM</div>
          <div style={{ color: "#555", fontSize: 13 }}>Hunter researches every morning and posts his top plays for the day.</div>
        </div>
      )}

      {!loading && picks.map((pick, i) => (
        <div key={i} style={{ background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 14, padding: 16, marginBottom: 12 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <span style={{ background: "#1a1a00", color: "#f5a623", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6 }}>{pick.sport}</span>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              {pick.game_time && <span style={{ color: "#f5a623", fontSize: 12, fontWeight: 600, background: "#2a1a00", padding: "2px 8px", borderRadius: 4 }}>🕐 {pick.game_time}</span>}
              <span style={{ background: '#1a1a00', color: '#f5a623', border: '1px solid #f5a623', fontSize: 11, fontWeight: 700, padding: "3px 10px", borderRadius: 20 }}>{pick.units}U</span>
            </div>
          </div>
          <div style={{ color: "#fff", fontSize: 15, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, marginBottom: 8 }}>{pick.game}</div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10 }}>
            <span style={{ color: "#fff", fontSize: 16, fontWeight: 700 }}>{pick.pick}</span>
            <span style={{ color: "#f5a623", fontSize: 14, fontWeight: 600 }}>{String(pick.odds).startsWith('+') ? pick.odds : pick.odds > 0 ? `+${pick.odds}` : pick.odds}</span>
          </div>
          <div style={{ color: "#888", fontSize: 13, lineHeight: 1.6, background: "#13131a", borderRadius: 8, padding: "12px 14px" }}>
            {formatInsight(pick.insight)}
          </div>
        </div>
      ))}
    </div>
  );
}
// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ user, bets, onNav, userKey, unreadCount, showNotifs, setShowNotifs, markAllRead }) {
  const hour = new Date().getHours();

  // Weekly window: Monday through Sunday
  const nowET = new Date(new Date().toLocaleString('en-US', { timeZone: 'America/New_York' }));
  const dayOfWeek = nowET.getDay();
  const daysFromMonday = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
  const weekStart = new Date(nowET);
  weekStart.setDate(nowET.getDate() - daysFromMonday);
  weekStart.setHours(0, 0, 0, 0);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  weekEnd.setHours(23, 59, 59, 999);
  const weekStartStr = weekStart.toLocaleDateString('en-CA');
  const weekEndStr = weekEnd.toLocaleDateString('en-CA');
  const weekBets = bets.filter(b => b.gameDate >= weekStartStr && b.gameDate <= weekEndStr);
  const weekLabel = `${weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${weekEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;

  const wins = weekBets.filter(b => b.result === "Win");
  const losses = weekBets.filter(b => b.result === "Loss");
  const pending = weekBets.filter(b => b.result === "Pending");
  const netPL = wins.reduce((s, b) => s + (calcProfit(b.amount, b.odds) || 0), 0) - losses.reduce((s, b) => s + b.amount, 0);
  const currentBankroll = user.bankroll + netPL;
  const goalPct = user.goal > 0 ? (netPL / user.goal) * 100 : 0;
  const sliderPct = Math.min(98, Math.max(2, 50 + (netPL / (user.goal * 2)) * 50));
  const atRisk = pending.reduce((s, b) => s + b.amount, 0);
  const alerts = [];
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const todayBets = bets.filter(b => b.gameDate === today).length;
  if (todayBets >= 5) alerts.push({ msg: `${todayBets} bets today. Your edge drops after bet 4.`, type: "warning" });
  if (netPL < -(user.goal * 0.5) && bets.length > 0) alerts.push({ msg: "Down over 50% of your weekly goal. Protect the bankroll.", type: "danger" });
  if (netPL >= user.goal) alerts.push({ msg: `🎉 Weekly goal hit! Consider locking in the profit.`, type: "success" });

  return (
    <div style={S.screen}>
      <div style={S.hdr}>
        <div>
          <div style={S.greeting}>{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, {user.name.split(" ")[0]} 👋</div>
          <div style={{ color: "#555", fontSize: 13, marginTop: 2 }}>{todayDisplay()}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={S.logo}>BETCIERGE</div>
    <button onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) markAllRead(); }} style={{ background: "none", border: "none", cursor: "pointer", position: "relative", padding: 0, marginTop: 2 }}>
      <span style={{ fontSize: 16 }}>🔔</span>
      {unreadCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#e74c3c", color: "#fff", borderRadius: "50%", fontSize: 9, fontWeight: 700, width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadCount}</span>}
    </button>
  </div>
  <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "none", color: "#555", fontSize: 11, cursor: "pointer", padding: 0 }}>Sign out</button>
</div>
      </div>

      {alerts.map((a, i) => <Alert key={i} {...a} />)}

      {/* Compact Weekly Card */}
      <div style={{ background: "#0f0f18", border: "1px solid #1e1e2e", borderRadius: 14, padding: "14px 16px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Bankroll</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: "#f5a623", letterSpacing: -0.5 }}>${currentBankroll.toFixed(0)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#555", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>This Week · {weekLabel}</div>
            <div style={{ fontSize: 26, fontWeight: 800, color: netPL >= 0 ? "#2ecc71" : "#e74c3c" }}>{netPL >= 0 ? "+$" : "-$"}{Math.abs(netPL).toFixed(0)}</div>
            <div style={{ fontSize: 11, color: "#555", marginTop: 2 }}>Week P&L · {goalPct.toFixed(0)}% of ${user.goal} goal</div>
          </div>
        </div>
        <div style={{ display: "flex", gap: 8 }}>
          {[
            { val: wins.length, lbl: "W", color: "#2ecc71" },
            { val: losses.length, lbl: "L", color: "#e74c3c" },
            { val: atRisk > 0 ? `$${atRisk}` : "—", lbl: "At Risk", color: "#f5a623" },
            { val: `$${weekBets.reduce((s, b) => s + b.amount, 0)}`, lbl: "Wagered", color: "#888" },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, background: "#13131a", borderRadius: 8, padding: "8px 0", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 10, color: "#555", marginTop: 1 }}>{s.lbl}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Hunter Chat — Front and Center */}
      <div style={{ marginBottom: 8 }}>
        <div style={S.secTitle}>Talk to Hunter 🤖</div>
        <HunterChat user={user} bets={bets} userKey={userKey} />
      </div>
    </div>
  );
}

// ── Today's Card ───────────────────────────────────────────────────────────
function TodayCard({ bets, onNav }) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  return (
    <div style={S.screen}>
      <div style={S.backRow}><button style={S.backBtn} onClick={() => onNav("dashboard")}>← Back</button><div style={S.logo}>BETCIERGE</div></div>
      <div style={S.secTitle}>Today's Card 🎯</div>
      {bets.filter(b => b.gameDate === today).length === 0 ? (
        <div style={S.empty}>No bets locked in yet today.</div>
      ) : bets.filter(b => b.gameDate === today).map(bet => (
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
            {bet.result === "Win" ? "✅ WIN" : bet.result === "Loss" ? "❌ LOSS" : bet.result === "Push" ? "🔵 PUSH" : bet.result === "Void" ? "🟣 VOID" : "⏳ PENDING"}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Bet Logger ─────────────────────────────────────────────────────────────
function BetLogger({ onSave, onNav }) {
  const [mode, setMode] = useState("choose");
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
  const [gameDate, setGameDate] = useState(new Date().toISOString().split('T')[0]);
  const [gameTime, setGameTime] = useState("");
  const [prefill, setPrefill] = useState({});

  useEffect(() => {
  if (prefill && prefill.sport) {
    setSport(prefill.sport || "NBA");
    setBetType(prefill.betType || "Spread");
    setGame(prefill.game || "");
    setPick(prefill.pick || "");
    setOdds(prefill.odds || "");
    setAmount(prefill.amount ? String(prefill.amount) : "");
    setGameDate(prefill.gameDate || new Date().toISOString().split('T')[0]);
    setGameTime(prefill.gameTime || "");
  }
}, [prefill]);

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
    if (needsLine && !line) e.line = `Enter the ${betType === "Spread" ? "spread" : "total"}`;
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
    onSave({ sport, game, betType, pick: finalPick, odds: finalOdds, amount: parseFloat(amount), type: category, result: "Pending", profit: 0, isToday: true, id: Date.now(), gameDate, gameTime });
    setSaved(true);
    setTimeout(() => { setSaved(false); setGame(""); setPick(""); setLine(""); setOdds(""); setAmount(""); setLegs([{ pick: "", odds: "" }, { pick: "", odds: "" }]); setErrors({}); setMode("choose"); }, 1500);
  };

  if (mode === "snap") return (
    <div style={S.screen}>
      <div style={S.backRow}><button style={S.backBtn} onClick={() => onNav("dashboard")}>← Back</button><div style={S.logo}>BETCIERGE</div></div>
      <SnapToLog onConfirm={async (bet) => { await onSave(bet); }} onDone={() => { setMode("choose"); onNav("gamecast"); }} onCancel={(prefillData) => { setPrefill(prefillData || {}); setMode("manual"); }} />
    </div>
  );

  if (mode === "choose") return (
    <div style={S.screen}>
      <div style={S.backRow}><button style={S.backBtn} onClick={() => onNav("dashboard")}>← Back</button><div style={S.logo}>BETCIERGE</div></div>
      <div style={S.secTitle}>Log a Bet 📝</div>
      <button onClick={() => setMode("snap")} style={S.logChoice.snap}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📸</div>
        <div style={S.logChoice.snapTitle}>Snap to Log</div>
        <div style={S.logChoice.snapSub}>Upload a screenshot. Hunter reads it automatically.</div>
        <div style={S.logChoice.snapBadge}>RECOMMENDED</div>
      </button>
      <button onClick={() => setMode("manual")} style={S.logChoice.manual}>
        <div style={{ fontSize: 32, marginBottom: 8 }}>✏️</div>
        <div style={S.logChoice.manualTitle}>Log Manually</div>
        <div style={S.logChoice.manualSub}>Enter your bet details by hand.</div>
      </button>
    </div>
  );

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
         <label style={S.label}>Game Date</label>
<input style={S.input} type="date" value={gameDate} onChange={e => setGameDate(e.target.value)} />
<label style={S.label}>Game Time (ET)</label>
<input style={S.input} type="time" value={gameTime} onChange={e => setGameTime(e.target.value)} />
        {!isParlay && <>
          <label style={S.label}>Your Pick</label>
          <input style={{ ...S.input, ...(errors.pick ? { borderColor: "#e74c3c" } : {}) }} placeholder={betType === "Total (O/U)" ? "Over or Under" : "e.g. Spurs ML"} value={pick} onChange={e => setPick(e.target.value)} />
          {errors.pick && <div style={S.err}>{errors.pick}</div>}
        </>}
        {needsLine && <>
          <label style={S.label}>{betType === "Spread" ? "Spread Line" : "Total Line"}</label>
          <input style={{ ...S.input, ...(errors.line ? { borderColor: "#e74c3c" } : {}) }} placeholder={betType === "Spread" ? "e.g. +3.5" : "e.g. 7.5"} value={line} onChange={e => setLine(e.target.value)} />
          {errors.line && <div style={S.err}>{errors.line}</div>}
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
          <button onClick={() => setLegs(ls => [...ls, { pick: "", odds: "" }])} style={{ background: "#1a1a24", border: "1px dashed #444", color: "#888", borderRadius: 10, padding: 10, width: "100%", cursor: "pointer", fontSize: 14, marginBottom: 8 }}>+ Add Leg</button>
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
            <button key={c} onClick={() => setCategory(c)} style={{ flex: 1, background: category === c ? (c === "Planned" ? "#1a2e1a" : "#2a1500") : "#0f0f18", border: `1px solid ${category === c ? (c === "Planned" ? "#2ecc71" : "#f5a623") : "#2a2a38"}`, borderRadius: 10, padding: 12, color: category === c ? (c === "Planned" ? "#2ecc71" : "#f5a623") : "#666", fontWeight: 600, cursor: "pointer", fontSize: 14 }}>
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

// — History ————————————————————————————————————————
function Gamecast({ bets, parlays = [], onNav }) {
  const [scores, setScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const activeBets = bets.filter(b => !b.isParlay && b.gameDate === today && b.gameId);
  const gameIds = [...new Set(activeBets.map(b => b.gameId))];

  const fetchScores = async () => {
    if (!gameIds.length) { setLoading(false); return; }
    try {
      const res = await fetch('/api/live-scores', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameIds })
      });
      const data = await res.json();
      setScores(data.scores || []);
      setLastUpdated(new Date());
    } catch (e) {
      console.error('Gamecast fetch error:', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchScores();
    const interval = setInterval(fetchScores, 60000);
    return () => clearInterval(interval);
  }, []);

  const getSportEmoji = (sport) => {
    if (sport?.includes('baseball')) return '⚾';
    if (sport?.includes('basketball')) return '🏀';
    if (sport?.includes('hockey')) return '🏒';
    return '🎯';
  };

  const getStatusColor = (status) => {
    if (status === 'final') return '#666';
    if (status === 'live') return '#2ecc71';
    return '#f5a623';
  };

  const getStatusLabel = (status) => {
    if (status === 'final') return 'FINAL';
    if (status === 'live') return '● LIVE';
    return 'UPCOMING';
  };

  return (
    <div style={S.screen}>
      <div style={S.backRow}>
        <button onClick={() => onNav('dashboard')} style={S.backBtn}>← Back</button>
        <span style={S.logo}>BETCIERGE</span>
        <button onClick={fetchScores} style={{ background: 'none', border: '1px solid #333', color: '#f5a623', borderRadius: 8, padding: '8px 14px', cursor: 'pointer', fontSize: 13 }}>↻ Refresh</button>
      </div>

      <div style={{ marginBottom: 20 }}>
        <div style={{ color: '#fff', fontFamily: "'Cormorant Garamond',serif", fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Gamecast</div>
        {lastUpdated && <div style={{ color: '#555', fontSize: 11 }}>Updated {lastUpdated.toLocaleTimeString()}</div>}
      </div>

      {loading ? (
        <div style={{ color: '#555', textAlign: 'center', padding: 40 }}>Loading scores...</div>
      ) : activeBets.length === 0 ? (
        <div style={{ color: '#555', textAlign: 'center', padding: 40, fontSize: 14 }}>No active bets today.</div>
      ) : (
        <>
        {/* Parlay Cards — full parlay as one card */}
        {bets.filter(b => b.isParlay && b.gameDate === today).map(parlay => {
          const oddsDisplay = String(parlay.odds).startsWith('+') ? String(parlay.odds) : Number(parlay.odds) > 0 ? `+${parlay.odds}` : `${parlay.odds}`;
          const resultColor = parlay.result === 'Win' ? '#2ecc71' : parlay.result === 'Loss' ? '#e74c3c' : '#f5a623';
          return (
            <div key={parlay.id} style={{ ...S.card, marginBottom: 16, border: '1px solid #2a1f4e' }}>
              {/* Parlay Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <div style={{ color: '#a78bfa', fontSize: 12, fontWeight: 700, letterSpacing: 0.5 }}>🎯 PARLAY · {parlay.numLegs || (parlay.legs || []).length} LEGS</div>
                <div style={{ color: resultColor, fontSize: 11, fontWeight: 700 }}>{parlay.result || 'PENDING'}</div>
              </div>
              {/* All Legs */}
              {(parlay.legs || []).map((leg, i) => {
                const legScore = scores.find(s => s.game_id === leg.gameId);
                const legOdds = String(leg.odds).startsWith('+') ? String(leg.odds) : Number(leg.odds) > 0 ? `+${leg.odds}` : `${leg.odds}`;
                const isWinning = legScore && (
                  (leg.pick?.toLowerCase().includes(legScore.home_team?.toLowerCase()) && legScore.home_score > legScore.away_score) ||
                  (leg.pick?.toLowerCase().includes(legScore.away_team?.toLowerCase()) && legScore.away_score > legScore.home_score)
                );
                const legResultColor = leg.result === 'Win' ? '#2ecc71' : leg.result === 'Loss' ? '#e74c3c' : isWinning ? '#2ecc71' : '#888';
                return (
                  <div key={leg.id} style={{ borderTop: i === 0 ? '1px solid #1e1e2e' : '1px solid #1a1a2e', padding: '10px 0', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{leg.pick}</div>
                      <div style={{ color: '#555', fontSize: 11, marginTop: 2 }}>{leg.game} · {leg.sport}</div>
                      {legScore && (legScore.status === 'live' || legScore.status === 'final') ? (
                        <div style={{ color: '#f5a623', fontSize: 11, marginTop: 2 }}>
                          {legScore.away_team} {legScore.away_score} @ {legScore.home_team} {legScore.home_score}{legScore.status === 'live' ? ' 🔴' : ' · Final'}
                        </div>
                      ) : (
                        <div style={{ color: '#444', fontSize: 11, marginTop: 2 }}>{leg.gameDate} · {leg.gameTime || 'Time TBD'}</div>
                      )}
                    </div>
                    <div style={{ textAlign: 'right', marginLeft: 8 }}>
                      <div style={{ color: '#888', fontSize: 11 }}>{legOdds}</div>
                      <div style={{ color: legResultColor, fontSize: 11, fontWeight: 700, marginTop: 2 }}>{leg.result || (isWinning ? '↑ WIN' : '—')}</div>
                    </div>
                  </div>
                );
              })}
              {/* Parlay Footer */}
              <div style={{ borderTop: '1px solid #1e1e2e', marginTop: 8, paddingTop: 10, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ color: '#555', fontSize: 12 }}>{oddsDisplay} · <span style={{ color: '#fff' }}>${parlay.amount}</span> to win</div>
                <div style={{ color: '#f5a623', fontSize: 16, fontWeight: 700, fontFamily: "'Cormorant Garamond',serif" }}>${parlay.toWin}</div>
              </div>
            </div>
          );
        })}
        {/* Straight Bet Game Cards */}
        {gameIds.map(gameId => {
          const score = scores.find(s => s.game_id === gameId);
          const gameBets = activeBets.filter(b => b.gameId === gameId);
          const firstBet = gameBets[0];

          return (
            <div key={gameId} style={{ ...S.card, marginBottom: 16 }}>
              {/* Game Header */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>{getSportEmoji(score?.sport)}</span>
                <span style={{ color: getStatusColor(score?.status), fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
                  {score ? getStatusLabel(score.status) : 'PENDING'}
                </span>
              </div>

              {/* Score Board */}
              {score ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, background: '#0f0f18', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{score.away_team}</div>
                    <div style={{ color: '#f5a623', fontSize: 32, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700 }}>{score.away_score}</div>
                  </div>
                  <div style={{ color: '#333', fontSize: 18, fontWeight: 700, padding: '0 12px' }}>@</div>
                  <div style={{ textAlign: 'center', flex: 1 }}>
                    <div style={{ color: '#fff', fontSize: 13, fontWeight: 600, marginBottom: 6 }}>{score.home_team}</div>
                    <div style={{ color: '#f5a623', fontSize: 32, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700 }}>{score.home_score}</div>
                  </div>
                </div>
              ) : (
                <div style={{ background: '#0f0f18', borderRadius: 12, padding: '14px 16px', marginBottom: 16, textAlign: 'center' }}>
                  <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{firstBet?.game}</div>
                  <div style={{ color: '#555', fontSize: 12, marginTop: 4 }}>{firstBet?.gameTime || 'Time TBD'}</div>
                </div>
              )}

              {/* Your Bets on this game - straight bets only, parlays shown above */}
              {gameBets.filter(b => !b.isParlayLeg).length > 0 && (
                <div style={{ color: '#666', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Your Bets</div>
              )}
              {gameBets.filter(b => !b.isParlayLeg).map(bet => {
                const isWinning = score && (
                  (bet.pick?.includes(score.home_team) && score.home_score > score.away_score) ||
                  (bet.pick?.includes(score.away_team) && score.away_score > score.home_score)
                );
                const oddsDisplay = String(bet.odds).startsWith('+') ? String(bet.odds) : Number(bet.odds) > 0 ? `+${bet.odds}` : `${bet.odds}`;
                const toWin = bet.toWin || (bet.odds > 0 ? (bet.amount * bet.odds / 100).toFixed(2) : (bet.amount * 100 / Math.abs(bet.odds)).toFixed(2));
                return (
                  <div key={bet.id} style={{ background: '#0a0a0f', borderRadius: 10, padding: '10px 12px', marginBottom: 8, border: `1px solid ${bet.result === 'Win' ? '#2ecc7130' : bet.result === 'Loss' ? '#e74c3c30' : '#1e1e2e'}` }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{bet.pick}</div>
                      <div style={{ color: bet.result === 'Win' ? '#2ecc71' : bet.result === 'Loss' ? '#e74c3c' : isWinning ? '#2ecc71' : '#f5a623', fontSize: 11, fontWeight: 700 }}>
                        {bet.result === 'Win' ? '✓ WIN' : bet.result === 'Loss' ? '✗ LOSS' : isWinning ? '↑ WINNING' : 'PENDING'}
                      </div>
                    </div>
                    <div style={{ color: '#555', fontSize: 11, marginTop: 4 }}>{bet.betType} · {oddsDisplay} · ${bet.amount} to win ${toWin}</div>
                  </div>
                );
              })}
            </div>
          );
        })}
        </>
      )}
    </div>
  );
}
function History({ bets, onUpdate, onNav }) {
  const [filterSport, setFilterSport] = useState("All");
  const [filterResult, setFilterResult] = useState("All");
  const [expandedGroups, setExpandedGroups] = useState({});

  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });

  // Apply filters
  const filtered = bets.filter(b => {
    const sportMatch = filterSport === "All" || b.sport === filterSport;
    const resultMatch = filterResult === "All" || b.result === filterResult;
    return sportMatch && resultMatch;
  });

  // Group bets by game_date
  const groups = {};
  filtered.forEach(bet => {
    const key = bet.gameDate || "Unknown Date";
    if (!groups[key]) groups[key] = [];
    groups[key].push(bet);
  });

  // Sort dates newest first
  const sortedDates = Object.keys(groups).sort((a, b) => b.localeCompare(a));

  // Get current week's Monday
  const now = new Date();
  const dayOfWeek = now.getDay();
  const monday = new Date(now);
  monday.setDate(now.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
  monday.setHours(0, 0, 0, 0);

  const isThisWeek = (dateStr) => {
    if (!dateStr || dateStr === "Unknown Date") return false;
    const d = new Date(dateStr + "T00:00:00");
    return d >= monday;
  };

  const formatDateLabel = (dateStr) => {
    if (!dateStr || dateStr === "Unknown Date") return "Unknown Date";
    const d = new Date(dateStr + "T00:00:00");
    const diffDays = Math.round((new Date(today + "T00:00:00") - d) / 86400000);
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Yesterday";
    return d.toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' });
  };

  const formatMonthLabel = (dateStr) => {
    const d = new Date(dateStr + "T00:00:00");
    return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
  };

  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // Split into this week vs older, then group older by month
  const thisWeekDates = sortedDates.filter(isThisWeek);
  const olderDates = sortedDates.filter(d => !isThisWeek(d));

  const olderByMonth = {};
  olderDates.forEach(dateStr => {
    const monthKey = formatMonthLabel(dateStr);
    if (!olderByMonth[monthKey]) olderByMonth[monthKey] = [];
    olderByMonth[monthKey].push(dateStr);
  });

  // All-time stats
  const settled = filtered.filter(b => b.result !== "Pending");
  const wins = filtered.filter(b => b.result === "Win");
  const losses = filtered.filter(b => b.result === "Loss");
  const netPL = wins.reduce((s, b) => s + (calcProfit(b.amount, b.odds) || 0), 0)
              - losses.reduce((s, b) => s + b.amount, 0);
  const winRate = settled.length > 0 ? ((wins.length / settled.length) * 100).toFixed(0) : 0;

  const BetCard = ({ bet, onUpdate }) => (
    <div key={bet.id} style={S.betCard}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          {bet.isParlay ? (
            <span style={{ ...S.tag, background: "#1a0a2e", color: "#a855f7" }}>
              {bet.betType?.toUpperCase() || 'PARLAY'} · {bet.numLegs} Legs
            </span>
          ) : (
            <>
              <span style={S.betSport}>{bet.sport}</span>
              <span style={{ ...S.tag, background: bet.type === "Planned" ? "#1a2e1a" : "#2a1a00", color: bet.type === "Planned" ? "#2ecc71" : "#f5a623" }}>
                {bet.type === "Planned" ? "✅ Planned" : "⚡ Impulse"}
              </span>
            </>
          )}
        </div>
        <div style={{ display: "flex", gap: 4 }}>
          {["Win", "Loss", "Pending"].map(r => (
            <button key={r} onClick={() => onUpdate(bet.id, r)} style={{ background: bet.result === r ? (r === "Win" ? "#1a2e1a" : r === "Loss" ? "#2a0f0f" : "#1a1500") : "#1a1a1a", color: r === "Win" ? "#2ecc71" : r === "Loss" ? "#e74c3c" : "#f5a623", border: `1px solid ${bet.result === r ? (r === "Win" ? "#2ecc71" : r === "Loss" ? "#e74c3c" : "#f5a623") : "#333"}`, borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>
              {r === "Win" ? "W" : r === "Loss" ? "L" : "P"}
            </button>
          ))}
        </div>
      </div>

      {bet.isParlay ? (
        <div>
          {(bet.legs || []).map((leg, i) => (
            <div key={i} style={{ borderBottom: "1px solid #1a1a24", padding: "8px 0" }}>
              <div style={{ color: "#666", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Leg {leg.legNumber || i + 1} · {leg.sport}</div>
              <div style={{ color: "#f5a623", fontWeight: 700, fontSize: 13 }}>{leg.pick}</div>
              <div style={{ color: "#888", fontSize: 12 }}>{leg.game}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                <span style={{ color: "#555", fontSize: 11 }}>{leg.odds}</span>
                <span style={{ color: leg.result === "Win" ? "#2ecc71" : leg.result === "Loss" ? "#e74c3c" : "#666", fontSize: 11, fontWeight: 700 }}>
                  {leg.result === "Win" ? "✓ WIN" : leg.result === "Loss" ? "✗ LOSS" : leg.result === "Push" ? "PUSH" : "PENDING"}
                </span>
              </div>
            </div>
          ))}
          <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10 }}>
            <span style={{ color: "#fff", fontWeight: 700 }}>{bet.odds}</span>
            <span style={{ color: "#ccc", fontSize: 13 }}>${bet.amount} → <span style={{ color: "#f5a623" }}>${bet.toWin}</span></span>
          </div>
        </div>
      ) : (
        <>
          <div style={{ color: "#fff", fontSize: 14, fontWeight: 600, marginBottom: 8 }}>{bet.game}</div>
          <div style={{ display: "flex", justifyContent: "space-between" }}>
            <div><span style={{ color: "#f5a623", fontWeight: 700 }}>{bet.pick}</span><span style={{ color: "#888", fontSize: 13, marginLeft: 8 }}>{bet.odds}</span></div>
            <span style={{ color: "#ccc", fontSize: 13 }}>{bet.amount} → <span style={{ color: "#f5a623" }}>{fmt(calcProfit(bet.amount, bet.odds))}</span></span>
          </div>
        </>
      )}

      <div style={{ marginTop: 8, display: "inline-block", background: bet.result === "Win" ? "#1a2e1a" : bet.result === "Loss" ? "#2a0f0f" : bet.result === "Push" ? "#0a1a2e" : bet.result === "Void" ? "#1a0a2e" : "#1a1500", color: bet.result === "Win" ? "#2ecc71" : bet.result === "Loss" ? "#e74c3c" : bet.result === "Push" ? "#3498db" : bet.result === "Void" ? "#888" : "#f5a623", borderRadius: 4, padding: "2px 10px", fontSize: 12 }}>
        {bet.result === "Win" ? "✅ WIN" : bet.result === "Loss" ? "❌ LOSS" : bet.result === "Push" ? "🔵 PUSH" : bet.result === "Void" ? "🟣 VOID" : "⏳ PENDING"}
      </div>
    </div>

  );
  const DaySection = ({ dateStr }) => {
    const dayBets = groups[dateStr];
    const isExpanded = expandedGroups[dateStr] === true; // default closed
    const dayWins = dayBets.filter(b => b.result === "Win").length;
    const dayLosses = dayBets.filter(b => b.result === "Loss").length;
    const dayPL = dayBets.filter(b => b.result === "Win").reduce((s, b) => s + (calcProfit(b.amount, b.odds) || 0), 0)
                - dayBets.filter(b => b.result === "Loss").reduce((s, b) => s + b.amount, 0);
    return (
      <div style={{ marginBottom: 12 }}>
        <div onClick={() => toggleGroup(dateStr)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#1a1a1a", borderRadius: 8, cursor: "pointer", marginBottom: isExpanded ? 8 : 0 }}>
          <div>
            <span style={{ color: "#fff", fontWeight: 600, fontSize: 14 }}>{formatDateLabel(dateStr)}</span>
            <span style={{ color: "#555", fontSize: 12, marginLeft: 8 }}>{dayBets.length} bet{dayBets.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#2ecc71", minWidth: 28, textAlign: "right" }}>{dayWins}W</span>
            <span style={{ fontSize: 12, color: "#e74c3c", minWidth: 28, textAlign: "right" }}>{dayLosses}L</span>
            <span style={{ fontSize: 12, color: dayPL >= 0 ? "#2ecc71" : "#e74c3c", minWidth: 60, textAlign: "right" }}>{dayPL >= 0 ? "+" : ""}{fmt(dayPL)}</span>
            <span style={{ color: "#555", fontSize: 12 }}>{isExpanded ? "▲" : "▼"}</span>
          </div>
        </div>
        {isExpanded && dayBets.map(bet => <BetCard key={bet.id} bet={bet} onUpdate={onUpdate} />)}
      </div>
    );
  };

  return (
    <div style={S.screen}>
      <div style={S.backRow}><button style={S.backBtn} onClick={() => onNav("dashboard")}>← Back</button><div style={S.logo}>BETCIERGE</div></div>
      <div style={S.secTitle}>Bet History 📋</div>

      {/* All-time stats */}
      <div style={S.statsRow}>
        {[
          { val: `${winRate}%`, lbl: "Win Rate", color: "#f5a623" },
          { val: `${wins.length}W-${losses.length}L`, lbl: "Record", color: "#fff" },
          { val: `${netPL >= 0 ? "+" : ""}${fmt(netPL)}`, lbl: "Net P&L", color: netPL >= 0 ? "#2ecc71" : "#e74c3c" },
        ].map((s, i) => (
          <div key={i} style={{ ...S.statBox, flex: 1 }}>
            <div style={{ ...S.statVal, color: s.color, fontSize: 16 }}>{s.val}</div>
            <div style={S.statLbl}>{s.lbl}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 8 }}>
        {["All", ...SPORT_OPTIONS.filter(s => bets.some(b => b.sport === s))].map(s => (
          <button key={s} onClick={() => setFilterSport(s)} style={{ background: filterSport === s ? "#1a1500" : "#131313a", border: `1px solid ${filterSport === s ? "#f5a623" : "#333"}`, color: filterSport === s ? "#f5a623" : "#888", borderRadius: 20, padding: "4px 12px", fontSize: 12, cursor: "pointer", whiteSpace: "nowrap" }}>
            {s}
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {["All", "Win", "Loss", "Pending"].map(r => (
          <button key={r} onClick={() => setFilterResult(r)} style={{ background: filterResult === r ? "#1a1500" : "#131313", border: `1px solid ${filterResult === r ? "#f5a623" : "#333"}`, color: filterResult === r ? "#f5a623" : "#888", borderRadius: 20, padding: "4px 12px", fontSize: 12, cursor: "pointer" }}>
            {r}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div style={S.empty}>No bets match this filter.</div>
      ) : (
        <div>
          {/* This week — expanded by default, collapsible by day */}
          {thisWeekDates.length > 0 && (
            <div>
              <div style={{ color: "#555", fontSize: 11, fontWeight: 600, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>This Week</div>
              {thisWeekDates.map(dateStr => <DaySection key={dateStr} dateStr={dateStr} />)}
            </div>
          )}

          {/* Older — grouped by month, collapsed by default */}
          {Object.keys(olderByMonth).map(monthKey => {
            const isMonthExpanded = expandedGroups[monthKey] === true; // default closed
            return (
              <div key={monthKey} style={{ marginBottom: 16 }}>
                <div onClick={() => toggleGroup(monthKey)} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 14px", background: "#111", borderRadius: 8, cursor: "pointer", marginBottom: isMonthExpanded ? 8 : 0, border: "1px solid #222" }}>
                  <span style={{ color: "#888", fontWeight: 600, fontSize: 13 }}>{monthKey}</span>
                  <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    <span style={{ color: "#555", fontSize: 12 }}>{olderByMonth[monthKey].reduce((s, d) => s + groups[d].length, 0)} bets</span>
                    <span style={{ color: "#555", fontSize: 12 }}>{isMonthExpanded ? "▲" : "▼"}</span>
                  </div>
                </div>
                {isMonthExpanded && olderByMonth[monthKey].map(dateStr => <DaySection key={dateStr} dateStr={dateStr} />)}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main ───────────────────────────────────────────────────────────────────
export default function Betcierge() {
  const [user, setUser] = useState(null);
const [screen, setScreen] = useState("dashboard");
const [notifications, setNotifications] = useState([]);
const [showNotifs, setShowNotifs] = useState(false);
const unreadCount = notifications.filter(n => !n.read).length;
const [bets, setBets] = useState([]);
const [session, setSession] = useState(null);
const [authLoading, setAuthLoading] = useState(true);
const [showLogin, setShowLogin] = useState(false);
const userKey = session?.user?.id ?? null;

useEffect(() => {
  supabase.auth.getSession().then(async ({ data: { session } }) => {
    setSession(session);
    if (session?.user?.id) {
      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();
      if (data) setUser(data);
    }
    setAuthLoading(false);
  });
  const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, session) => {
    setSession(session);
    if (session?.user?.id) {
      const { data } = await supabase
        .from('user_profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .single();
      if (data) setUser(data);
    }
    setAuthLoading(false);
  });
  return () => subscription.unsubscribe();
}, []);
  const handleComplete = async (userData) => {
  setUser(userData);
  if (userKey) {
    const { error } = await supabase.from('user_profiles').upsert({
      user_id: userKey,
      name: userData.name,
      bankroll: userData.bankroll,
      goal: userData.goal,
    }, { onConflict: 'user_id' });
    if (error) console.error('Profile save error:', error);
  }
};
  useEffect(() => {
  if (!userKey) return;
  const loadBets = async () => {
    // Load straight bets
    const { data: straightBets } = await supabase
      .from('user_bets')
      .select('*')
      .eq('user_id', userKey)
      .order('created_at', { ascending: false });

    // Load parlays with their legs
    const { data: parlaysData } = await supabase
      .from('parlays')
      .select('*, parlay_legs(*)')
      .eq('user_id', userKey)
      .order('created_at', { ascending: false });

    const mappedStraight = (straightBets || []).map(b => ({
      id: b.id,
      sport: b.sport,
      game: b.game,
      betType: b.bet_type,
      pick: b.pick,
      odds: b.odds,
      amount: b.amount,
      type: b.type,
      result: b.result,
      isToday: b.is_today,
      gameDate: b.game_date,
      gameTime: b.game_time,
      gameId: b.game_id,
      isParlay: false,
    }));

    const mappedParlays = (parlaysData || []).map(p => ({
      id: p.id,
      isParlay: true,
      betType: p.bet_type,
      odds: p.odds,
      amount: p.wager,
      toWin: p.to_win,
      result: p.result,
      gameDate: p.game_date,
      teaserPoints: p.teaser_points,
      ticketNumber: p.ticket_number,
      numLegs: p.num_legs,
      legs: (p.parlay_legs || []).sort((a, b) => a.leg_number - b.leg_number).map(l => ({
        id: l.id,
        sport: l.sport,
        game: l.game,
        pick: l.pick,
        odds: l.odds,
        gameDate: l.game_date,
        gameTime: l.game_time,
        gameId: l.game_id,
        result: l.result,
        legNumber: l.leg_number,
      })),
      // For display purposes
      pick: (p.parlay_legs || []).map(l => l.pick).join(', '),
      game: (p.parlay_legs || []).map(l => l.game).join(' + '),
      sport: p.parlay_legs?.[0]?.sport || 'Parlay',
      createdAt: p.created_at,
    }));

    // Merge and sort by date
    const allBets = [...mappedStraight, ...mappedParlays].sort((a, b) =>
      new Date(b.createdAt || b.gameDate) - new Date(a.createdAt || a.gameDate)
    );

    setBets(allBets);
  };
  loadBets();
  loadNotifications();
}, [userKey]);

  const addParlay = async (bet) => {
    if (!userKey) return;
    try {
      // Insert parlay record
      const { data: parlayData, error: parlayError } = await supabase.from('parlays').insert({
        user_id: userKey,
        ticket_number: bet.ticketNumber || null,
        bet_type: bet.betType || 'parlay',
        wager: bet.amount,
        to_win: bet.toWin,
        odds: bet.odds,
        num_legs: bet.legs?.length || 0,
        result: 'Pending',
        game_date: new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
        teaser_points: bet.teaserPoints ?? null,
      }).select().single();
      if (parlayError) throw parlayError;

      // Insert each leg
      const legRows = (bet.legs || []).map((leg, i) => ({
        parlay_id: parlayData.id,
        user_id: userKey,
        sport: leg.sport,
        game: leg.game,
        pick: leg.pick,
        odds: leg.odds,
        game_date: leg.gameDate ?? bet.gameDate ?? null,
        game_time: leg.gameTime ?? null,
        game_id: leg.gameId ?? null,
        result: 'Pending',
        leg_number: i + 1,
      }));
      await supabase.from('parlay_legs').insert(legRows);

      // Add to local state as a parlay object
      setBets(p => [{ ...bet, id: parlayData.id, isParlay: true, result: 'Pending' }, ...p]);
    } catch(e) {
      console.error('addParlay error:', e);
    }
  };
const loadNotifications = async () => {
  if (!session?.user?.id) return;
  const { data } = await supabase
    .from('user_notifications')
    .select('*, notifications(*)')
    .eq('user_id', session.user.id)
    .order('created_at', { ascending: false })
    .limit(20);
  if (data) setNotifications(data);
};

const markAllRead = async () => {
  if (!session?.user?.id) return;
  await supabase
    .from('user_notifications')
    .update({ read: true })
    .eq('user_id', session.user.id);
  setNotifications(prev => prev.map(n => ({ ...n, read: true })));
};
  const addBet = async (bet) => {
    if (bet.legs && bet.legs.length > 0) { await addParlay(bet); return; }
    if (userKey) {
      await supabase.from('user_bets').insert({
        user_id: userKey,
        sport: bet.sport,
        game: bet.game,
        bet_type: bet.betType,
        pick: bet.pick,
        odds: bet.odds,
        amount: bet.amount,
        type: bet.type,
        result: bet.result,
        is_today: bet.isToday,
        game_date: bet.gameDate ?? null,
        game_time: bet.gameTime ?? null,
        game_id: bet.gameId ?? null,
      });
      // Reload bets from Supabase to ensure consistent state
      const { data: straightBets } = await supabase.from('user_bets').select('*').eq('user_id', userKey).order('created_at', { ascending: false });
      const { data: parlaysData } = await supabase.from('parlays').select('*, parlay_legs(*)').eq('user_id', userKey).order('created_at', { ascending: false });
      const mappedStraight = (straightBets || []).map(b => ({
        id: b.id, sport: b.sport, game: b.game, betType: b.bet_type, pick: b.pick,
        odds: b.odds, amount: b.amount, type: b.type, result: b.result,
        isToday: b.is_today, gameDate: b.game_date, gameTime: b.game_time,
        gameId: b.game_id, isParlay: false, createdAt: b.created_at,
      }));
      const mappedParlays = (parlaysData || []).map(p => ({
        id: p.id, isParlay: true, betType: p.bet_type, odds: p.odds,
        amount: p.wager, toWin: p.to_win, result: p.result, gameDate: p.game_date,
        teaserPoints: p.teaser_points, ticketNumber: p.ticket_number, numLegs: p.num_legs,
        legs: (p.parlay_legs || []).sort((a, b) => a.leg_number - b.leg_number).map(l => ({
          id: l.id, sport: l.sport, game: l.game, pick: l.pick, odds: l.odds,
          gameDate: l.game_date, gameTime: l.game_time, gameId: l.game_id,
          result: l.result, legNumber: l.leg_number,
        })),
        pick: (p.parlay_legs || []).map(l => l.pick).join(', '),
        game: (p.parlay_legs || []).map(l => l.game).join(' + '),
        sport: p.parlay_legs?.[0]?.sport || 'Parlay',
        createdAt: p.created_at,
      }));
      const allBets = [...mappedStraight, ...mappedParlays].sort((a, b) =>
        new Date(b.createdAt || b.gameDate) - new Date(a.createdAt || a.gameDate)
      );
      setBets(allBets);
    }
  };

const updateBet = async (id, result) => {
  setBets(p => p.map(b => b.id === id ? { ...b, result } : b));
  if (userKey) {
    const bet = bets.find(b => b.id === id);
    if (bet?.isParlay) {
      await supabase.from('parlays').update({ result }).eq('id', id);
    } else {
      await supabase.from('user_bets').update({ result }).eq('id', id);
    }
  }
};

 if (authLoading) return (
  <div style={{ minHeight: "100vh", background: "#0a0a0a", display: "flex",
    alignItems: "center", justifyContent: "center", color: "#fff",
    fontFamily: "Outfit, sans-serif", fontSize: 16 }}>
    Loading...
  </div>
);
if (showLogin) return <LoginScreen onAuth={(s) => { setSession(s); setShowLogin(false); }} />;
if (!session) return <Landing onGetStarted={() => setShowLogin(true)} />;
if (!user?.name) return <Onboarding onComplete={handleComplete} />;

  return (
    <div style={{ background: "#0a0a0f", minHeight: "100vh", maxWidth: 430, margin: "0 auto", fontFamily: "'Outfit',sans-serif", paddingBottom: 80 }}>
      
      {/* Notification Drawer */}
      {showNotifs && (
        <div style={{ position: "fixed", top: 0, right: 0, width: "100%", maxWidth: 430, height: "100vh", background: "#0d0d14", zIndex: 998, borderLeft: "1px solid #1e1e2e", overflowY: "auto", padding: 20, boxSizing: "border-box" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
            <div style={{ fontSize: 16, fontWeight: 700, color: "#fff" }}>Notifications</div>
            <button onClick={() => setShowNotifs(false)} style={{ background: "none", border: "none", color: "#888", fontSize: 20, cursor: "pointer" }}>✕</button>
          </div>
          {notifications.length === 0 ? (
            <div style={{ color: "#555", fontSize: 13, textAlign: "center", marginTop: 40 }}>No notifications yet</div>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{ background: n.read ? "#0f0f18" : "#111128", border: `1px solid ${n.read ? "#1e1e2e" : "#3a3a5e"}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: "#fff", lineHeight: 1.5 }}>{n.notifications?.message}</div>
                <div style={{ fontSize: 11, color: "#555", marginTop: 6 }}>{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                {!n.read && <div style={{ width: 6, height: 6, background: "#f5a623", borderRadius: "50%", marginTop: 6 }} />}
              </div>
            ))
          )}
        </div>
      )}
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {screen === "dashboard" && <Dashboard user={user} bets={bets} onNav={setScreen} userKey={userKey} unreadCount={unreadCount} showNotifs={showNotifs} setShowNotifs={setShowNotifs} markAllRead={markAllRead} />}
      {screen === "picks" && <PicksTab userKey={userKey} user={user} session={session} />}
      {screen === "card" && <TodayCard bets={bets} onNav={setScreen} />}
{screen === "gamecast" && <Gamecast bets={bets} onNav={setScreen} />}
      {screen === "logger" && <BetLogger onSave={addBet} onNav={setScreen} />}
      {screen === "history" && <History bets={bets} onUpdate={updateBet} onNav={setScreen} />}

      {/* Nav Bar */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#0d0d14", borderTop: "1px solid #1e1e2e", display: "flex", padding: "8px 0 12px" }}>
        {[
          { id: "dashboard", icon: "🤖", lbl: "Hunter" },
          { id: "picks", icon: "🎯", lbl: "BetC Picks" },
          { id: "logger", icon: "📝", lbl: "Log Bet" },
          { id: "gamecast", icon: "📡", lbl: "My Bets" },
          { id: "history", icon: "📊", lbl: "Bet History" },
        ].map(n => (
          <button key={n.id} onClick={() => setScreen(n.id)} style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", padding: "6px 0", opacity: screen === n.id ? 1 : 0.4 }}>
            <span style={{ fontSize: 20 }}>{n.icon}</span>
            <span style={{ color: screen === n.id ? "#f5a623" : "#555", fontSize: 11, fontWeight: screen === n.id ? 700 : 400 }}>{n.lbl}</span>
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
  backBtn: { background: "none", border: "1px solid #333", color: "#888", borderRadius: 8, padding: "8px 14px", cursor: "pointer", fontSize: 14 },
  card: { background: "linear-gradient(135deg,#13131a,#1a1a24)", border: "1px solid #f5a62320", borderRadius: 20, padding: 18, marginBottom: 14 },
  cardLbl: { color: "#666", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 },
  bigNum: { color: "#fff", fontSize: 28, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700 },
  secTitle: { color: "#fff", fontFamily: "'Cormorant Garamond',serif", fontSize: 20, fontWeight: 700, marginBottom: 12 },
  statsRow: { display: "flex", gap: 8, marginTop: 14 },
  statBox: { flex: 1, background: "#0f0f18", borderRadius: 10, padding: "10px 8px", textAlign: "center" },
  statVal: { color: "#f5a623", fontSize: 16, fontWeight: 700, fontFamily: "'Cormorant Garamond',serif" },
  statLbl: { color: "#555", fontSize: 10, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  betCard: { background: "#13131a", border: "1px solid #1e1e2e", borderRadius: 14, padding: 14, marginBottom: 10 },
  betSport: { background: "#1a1a00", color: "#f5a623", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6 },
  tag: { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 },
  empty: { color: "#555", textAlign: "center", padding: 40, fontSize: 14 },
  input: { width: "100%", background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, boxSizing: "border-box", outline: "none", marginBottom: 4 },
  select: { width: "100%", background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, boxSizing: "border-box", outline: "none", marginBottom: 4 },
  label: { display: "block", color: "#666", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6, marginTop: 12 },
  err: { color: "#e74c3c", fontSize: 12, marginBottom: 6 },
  hint: { background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 8, padding: "8px 12px", color: "#888", fontSize: 13, marginBottom: 8 },
  saveBtn: { width: "100%", background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", border: "none", borderRadius: 12, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 8 },
  Hunter: {
    wrap: { background: "#13131a", border: "1px solid #222", borderRadius: 20, overflow: "hidden", marginBottom: 16 },
    header: { background: "#1a1500", borderBottom: "1px solid #2a2000", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    avatar: { width: 36, height: 36, borderRadius: "50%", background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", fontWeight: 900, fontSize: 18, display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Cormorant Garamond',serif" },
    name: { color: "#f5a623", fontSize: 14, fontWeight: 700 },
    sub: { color: "#888", fontSize: 11, marginTop: 2 },
  },
  snap: {
    wrap: { background: "#13131a", border: "1px solid #222", borderRadius: 20, overflow: "hidden" },
    header: { background: "#1a1500", borderBottom: "1px solid #2a2000", padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" },
    title: { color: "#f5a623", fontSize: 16, fontWeight: 700, fontFamily: "'Cormorant Garamond',serif" },
    closeBtn: { background: "none", border: "none", color: "#888", fontSize: 22, cursor: "pointer" },
    uploadZone: { padding: 32, textAlign: "center", cursor: "pointer" },
    uploadTitle: { color: "#fff", fontSize: 18, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, marginBottom: 8 },
    uploadSub: { color: "#666", fontSize: 13, marginBottom: 20 },
    uploadBtn: { display: "inline-block", background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", fontWeight: 700, fontSize: 14, padding: "12px 28px", borderRadius: 12 },
    editBtn: { flex: 1, background: "#1a1a24", border: "1px solid #333", color: "#888", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 600, cursor: "pointer" },
    confirmBtn: { flex: 1, background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", border: "none", borderRadius: 12, padding: 14, fontSize: 14, fontWeight: 700, cursor: "pointer" },
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
    trialBox: { background: "#1a1500", border: "1px solid #f5a62340", borderRadius: 16, padding: 20, marginBottom: 8, textAlign: "left" },
    nextBtn: { width: "100%", background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 12 },
  },
};



