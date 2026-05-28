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

// ── Supabase ───────────────────────────────────────────────────────────────
import { createClient } from '@supabase/supabase-js';
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ── Helpers ────────────────────────────────────────────────────────────────
const calcProfit = (amount, odds) => {
  const o = parseFloat(odds), a = parseFloat(amount);
  if (!o || !a) return null;
  return o > 0 ? (o / 100) * a : (100 / Math.abs(o)) * a;
};
const fmt = (n) => `$${Math.abs(n || 0).toFixed(2)}`;
const todayDisplay = () => new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });

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
  const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
  return { text, raw: data };
};

// ── User Key ───────────────────────────────────────────────────────────────
const getUserKey = () => {
  if (typeof window === 'undefined') return null;
  let key = localStorage.getItem('betcierge_user_key');
  if (!key) {
    key = 'user_' + Math.random().toString(36).substr(2, 9) + Date.now();
    localStorage.setItem('betcierge_user_key', key);
  }
  return key;
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
          <p style={S.ob.sub}>We'll personalize your experience.</p>
          <input style={S.input} placeholder="Full Name" value={form.name} onChange={e => set("name", e.target.value)} />
          <input style={S.input} placeholder="Email Address" type="email" value={form.email} onChange={e => set("email", e.target.value)} />
          <input style={S.input} placeholder="Phone Number" type="tel" value={form.phone} onChange={e => set("phone", e.target.value)} />
        </>}

        {step === 1 && <>
          <h2 style={S.ob.title}>Create your account.</h2>
          <input style={S.input} placeholder="Choose a Username" value={form.username} onChange={e => set("username", e.target.value)} />
          <input style={S.input} placeholder="Create a Password" type="password" value={form.password} onChange={e => set("password", e.target.value)} />
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
function SnapToLog({ onConfirm, onCancel }) {
  const [stage, setStage] = useState("upload");
  const [extractedBet, setExtractedBet] = useState(null);
  const [errorMsg, setErrorMsg] = useState("");
  const [imagePreview, setImagePreview] = useState(null);
  const fileRef = useRef(null);

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
          system: `You are Hunter. Extract bet details from a sportsbook screenshot. Return ONLY raw JSON: {"sport":"...","game":"...","betType":"...","pick":"...","odds":"...","amount":0,"toWin":0,"confidence":95}. If unclear: {"error":"reason"}`,
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
            { type: "text", text: "Extract the bet details from this slip." }
          ]}]
        })
      });
      const data = await response.json();
      const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
      const parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      if (parsed.error) { setErrorMsg(parsed.error); setStage("error"); }
      else { setExtractedBet(parsed); setStage("confirm"); }
    } catch (e) {
      setErrorMsg("Couldn't read the slip. Try a clearer screenshot.");
      setStage("error");
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
          <input ref={fileRef} type="file" accept="image/*" style={{ display: "none" }} onChange={e => handleFile(e.target.files[0])} />
          <div style={{ fontSize: 48, marginBottom: 12 }}>📱</div>
          <div style={S.snap.uploadTitle}>Upload your bet slip</div>
          <div style={S.snap.uploadSub}>Screenshot from any sportsbook</div>
          <div style={S.snap.uploadBtn}>Choose Photo</div>
        </div>
      )}
      {stage === "reading" && (
        <div style={{ padding: 32, textAlign: "center" }}>
          {imagePreview && <img src={imagePreview} alt="slip" style={{ width: "100%", maxHeight: 200, objectFit: "contain", marginBottom: 16 }} />}
          <div style={{ color: "#f5a623", fontWeight: 700, fontSize: 16 }}>Hunter is reading your slip...</div>
        </div>
      )}
      {stage === "confirm" && extractedBet && (
        <div style={{ padding: 16 }}>
          <div style={{ color: "#2ecc71", fontSize: 17, fontWeight: 700, marginBottom: 12 }}>✅ Hunter read your slip</div>
          {imagePreview && <img src={imagePreview} alt="slip" style={{ width: "100%", maxHeight: 160, objectFit: "contain", marginBottom: 12 }} />}
          <div style={{ background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 14, padding: 16, marginBottom: 14 }}>
            {[["Sport", extractedBet.sport], ["Game", extractedBet.game], ["Pick", extractedBet.pick], ["Odds", extractedBet.odds], ["Wager", `$${extractedBet.amount}`], ["To Win", `$${extractedBet.toWin}`]].map(([l, v]) => (
              <div key={l} style={{ display: "flex", justifyContent: "space-between", padding: "8px 0", borderBottom: "1px solid #1a1a24" }}>
                <span style={{ color: "#666", fontSize: 13 }}>{l}</span>
                <span style={{ color: "#fff", fontSize: 13, fontWeight: 600 }}>{v}</span>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={onCancel} style={S.snap.editBtn}>Edit Manually</button>
            <button onClick={() => onConfirm({ sport: extractedBet.sport, game: extractedBet.game, betType: extractedBet.betType, pick: extractedBet.pick, odds: extractedBet.odds, amount: extractedBet.amount, type: "Planned", result: "Pending", profit: 0, isToday: true, id: Date.now() })} style={S.snap.confirmBtn}>✅ Log This Bet</button>
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
      const { data } = await supabase
        .from('user_conversations')
        .select('role, content')
        .eq('user_key', userKey)
        .order('created_at', { ascending: true })
        .limit(40);
      if (data && data.length > 0) {
        setMessages(data.map(m => ({ role: m.role, text: m.content })));
      } else {
        // First time — set a welcome message
        const welcome = { role: 'assistant', text: `Hey ${user.name.split(' ')[0]} 👋 I'm Hunter, your personal betting concierge. I'm here to help you find edges, stay disciplined, and build your bankroll. What's on your mind today?` };
        setMessages([welcome]);
        await supabase.from('user_conversations').insert({ user_key: userKey, role: 'assistant', content: welcome.text });
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
    await supabase.from('user_conversations').insert({ user_key: userKey, role: 'user', content: userMsg });

    try {
      const recentMessages = [...messages, newUserMsg].slice(-20);
      const result = await callClaude(
        recentMessages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })),
        `You are Hunter, the AI sports betting concierge inside Betcierge. Today is ${todayDisplay()}.
The user is ${user.name.split(" ")[0]}. Weekly bankroll: $${user.bankroll}. Weekly goal: +$${user.goal}. Current P&L: ${netPL >= 0 ? "+" : ""}$${netPL.toFixed(2)}. Bets logged this week: ${bets.length}. Wins: ${bets.filter(b => b.result === "Win").length}. Losses: ${bets.filter(b => b.result === "Loss").length}.
You remember this user's history from previous conversations. Be their trusted advisor — sharp, warm, direct. Give betting advice, psychological support, discipline coaching, and analysis. Use web search when asked about specific games, players, or lines. Never encourage reckless betting or chasing losses.`,
        true,
        null,
        2000
      );

      const assistantMsg = { role: "assistant", text: result.text };
      setMessages(m => [...m, assistantMsg]);

      // Save assistant message to Supabase
      await supabase.from('user_conversations').insert({ user_key: userKey, role: 'assistant', content: result.text });
    } catch {
      setMessages(m => [...m, { role: "assistant", text: "Having a connection issue. Try again in a second." }]);
    }
    setLoading(false);
  };

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
                    if (line.startsWith('**') && line.endsWith('**') && line.length > 4) return <div key={j} style={{ color: "#f5a623", fontFamily: "'Cormorant Garamond',serif", fontSize: 15, fontWeight: 700, marginTop: 12, marginBottom: 4 }}>{line.slice(2, -2)}</div>;
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
        <input style={{ flex: 1, background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 12, padding: "10px 14px", color: "#fff", fontSize: 14, outline: "none" }}
          placeholder="Ask Hunter anything..."
          value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => e.key === "Enter" && sendMessage()} />
        <button style={{ background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", border: "none", borderRadius: 12, width: 44, fontWeight: 700, fontSize: 18, cursor: "pointer" }} onClick={sendMessage}>→</button>
      </div>
    </div>
  );
}

// ── Picks Tab ──────────────────────────────────────────────────────────────
function PicksTab({ userKey }) {
  const [picks, setPicks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState(null);

  useEffect(() => { loadPicks(); }, []);

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

  const confColor = (c) => ({ High: "#2ecc71", Medium: "#f5a623", Low: "#888" })[c] || "#888";
  const confBg = (c) => ({ High: "#1a2e1a", Medium: "#2a1f00", Low: "#1a1a1a" })[c] || "#1a1a1a";

  return (
    <div style={S.screen}>
      <div style={S.hdr}>
        <div style={S.greeting}>Today's Picks 🎯</div>
        <div style={S.logo}>BETCIERGE</div>
      </div>

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
              {pick.game_time && <span style={{ color: "#555", fontSize: 11 }}>{pick.game_time}</span>}
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
    </div>
  );
}

// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ user, bets, onNav, userKey }) {
  const hour = new Date().getHours();
  const wins = bets.filter(b => b.result === "Win");
  const losses = bets.filter(b => b.result === "Loss");
  const pending = bets.filter(b => b.result === "Pending");
  const netPL = wins.reduce((s, b) => s + (calcProfit(b.amount, b.odds) || 0), 0) - losses.reduce((s, b) => s + b.amount, 0);
  const currentBankroll = user.bankroll + netPL;
  const goalPct = user.goal > 0 ? (netPL / user.goal) * 100 : 0;
  const sliderPct = Math.min(98, Math.max(2, 50 + (netPL / (user.goal * 2)) * 50));
  const atRisk = pending.reduce((s, b) => s + b.amount, 0);

  const alerts = [];
  const todayBets = bets.filter(b => b.isToday).length;
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
        <div style={{ margin: "14px 0 16px" }}>
          <div style={{ background: "#1e1e2e", borderRadius: 8, height: 8, position: "relative", overflow: "visible", marginBottom: 10 }}>
            <div style={{ position: "absolute", left: "50%", top: -3, width: 2, height: 14, background: "#333", borderRadius: 1 }} />
            <div style={{ position: "absolute", top: 0, height: "100%", borderRadius: 8, left: netPL >= 0 ? "50%" : `${sliderPct}%`, width: `${Math.abs(sliderPct - 50)}%`, background: netPL >= 0 ? "linear-gradient(90deg,#f5a623,#f7c948)" : "linear-gradient(90deg,#e74c3c,#c0392b)" }} />
            <div style={{ position: "absolute", top: -6, width: 20, height: 20, borderRadius: "50%", left: `calc(${sliderPct}% - 10px)`, background: netPL >= 0 ? "#f5a623" : "#e74c3c", border: "2px solid #0a0a0f" }} />
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
  return (
    <div style={S.screen}>
      <div style={S.backRow}><button style={S.backBtn} onClick={() => onNav("dashboard")}>← Back</button><div style={S.logo}>BETCIERGE</div></div>
      <div style={S.secTitle}>Today's Card 🎯</div>
      {bets.filter(b => b.isToday).length === 0 ? (
        <div style={S.empty}>No bets locked in yet today.</div>
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
    onSave({ sport, game, betType, pick: finalPick, odds: finalOdds, amount: parseFloat(amount), type: category, result: "Pending", profit: 0, isToday: true, id: Date.now() });
    setSaved(true);
    setTimeout(() => { setSaved(false); setGame(""); setPick(""); setLine(""); setOdds(""); setAmount(""); setLegs([{ pick: "", odds: "" }, { pick: "", odds: "" }]); setErrors({}); setMode("choose"); }, 1500);
  };

  if (mode === "snap") return (
    <div style={S.screen}>
      <div style={S.backRow}><button style={S.backBtn} onClick={() => onNav("dashboard")}>← Back</button><div style={S.logo}>BETCIERGE</div></div>
      <SnapToLog onConfirm={(bet) => { onSave(bet); setMode("choose"); onNav("card"); }} onCancel={() => setMode("manual")} />
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

// ── History ────────────────────────────────────────────────────────────────
function History({ bets, onUpdate, onNav }) {
  const [filterSport, setFilterSport] = useState("All");
  const filtered = bets.filter(b => filterSport === "All" || b.sport === filterSport);
  const settled = filtered.filter(b => b.result !== "Pending");
  const wins = filtered.filter(b => b.result === "Win");
  const losses = filtered.filter(b => b.result === "Loss");
  const netPL = wins.reduce((s, b) => s + (calcProfit(b.amount, b.odds) || 0), 0) - losses.reduce((s, b) => s + b.amount, 0);
  const winRate = settled.length > 0 ? ((wins.length / settled.length) * 100).toFixed(0) : 0;

  return (
    <div style={S.screen}>
      <div style={S.backRow}><button style={S.backBtn} onClick={() => onNav("dashboard")}>← Back</button><div style={S.logo}>BETCIERGE</div></div>
      <div style={S.secTitle}>Bet History 📊</div>
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
      <div style={{ display: "flex", gap: 6, overflowX: "auto", marginBottom: 14 }}>
        {["All", ...SPORT_OPTIONS.filter(s => bets.some(b => b.sport === s))].map(s => (
          <button key={s} onClick={() => setFilterSport(s)} style={{ background: filterSport === s ? "#1a1500" : "#13131a", border: `1px solid ${filterSport === s ? "#f5a623" : "#222"}`, color: filterSport === s ? "#f5a623" : "#666", borderRadius: 20, padding: "6px 14px", cursor: "pointer", whiteSpace: "nowrap", fontSize: 12, fontWeight: 600 }}>
            {s}
          </button>
        ))}
      </div>
      {filtered.length === 0 ? <div style={S.empty}>No bets yet.</div> : filtered.map(bet => (
        <div key={bet.id} style={S.betCard}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <div style={{ display: "flex", gap: 8 }}>
              <span style={S.betSport}>{bet.sport}</span>
              <span style={{ ...S.tag, background: bet.type === "Planned" ? "#1a2e1a" : "#2a1a00", color: bet.type === "Planned" ? "#2ecc71" : "#f5a623" }}>{bet.type === "Planned" ? "✅" : "⚡"} {bet.type}</span>
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              {["Win", "Loss", "Pending"].map(r => (
                <button key={r} onClick={() => onUpdate(bet.id, r)} style={{ background: bet.result === r ? (r === "Win" ? "#1a2e1a" : r === "Loss" ? "#2a0f0f" : "#1a1500") : "#0f0f18", border: `1px solid ${bet.result === r ? (r === "Win" ? "#2ecc71" : r === "Loss" ? "#e74c3c" : "#f5a623") : "#2a2a38"}`, borderRadius: 6, width: 28, height: 28, color: bet.result === r ? (r === "Win" ? "#2ecc71" : r === "Loss" ? "#e74c3c" : "#f5a623") : "#555", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
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
  const [userKey, setUserKey] = useState(null);

  useEffect(() => {
    const key = getUserKey();
    setUserKey(key);
    // Try to restore user from localStorage
    const savedUser = localStorage.getItem('betcierge_user');
    if (savedUser) {
      try { setUser(JSON.parse(savedUser)); } catch (e) {}
    }
  }, []);

  const handleComplete = (userData) => {
    setUser(userData);
    localStorage.setItem('betcierge_user', JSON.stringify(userData));
  };

  const addBet = (bet) => setBets(p => [bet, ...p]);
  const updateBet = (id, result) => setBets(p => p.map(b => b.id === id ? { ...b, result, profit: result === "Win" ? (calcProfit(b.amount, b.odds) || 0) : 0 } : b));

  if (!user) return <Onboarding onComplete={handleComplete} />;

  return (
    <div style={{ background: "#0a0a0f", minHeight: "100vh", maxWidth: 430, margin: "0 auto", fontFamily: "'Outfit',sans-serif", paddingBottom: 80 }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {screen === "dashboard" && <Dashboard user={user} bets={bets} onNav={setScreen} userKey={userKey} />}
      {screen === "picks" && <PicksTab userKey={userKey} />}
      {screen === "card" && <TodayCard bets={bets} onNav={setScreen} />}
      {screen === "logger" && <BetLogger onSave={addBet} onNav={setScreen} />}
      {screen === "history" && <History bets={bets} onUpdate={updateBet} onNav={setScreen} />}

      {/* Nav Bar */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#0d0d14", borderTop: "1px solid #1e1e2e", display: "flex", padding: "8px 0 12px" }}>
        {[
          { id: "dashboard", icon: "🏠", lbl: "Home" },
          { id: "picks", icon: "🎯", lbl: "Picks" },
          { id: "logger", icon: "📝", lbl: "Log" },
          { id: "card", icon: "📋", lbl: "Card" },
          { id: "history", icon: "📊", lbl: "History" },
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
  hunter: {
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
