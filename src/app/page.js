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
import {
  isEntitled,
  CURRENT_PRICE_DISPLAY,
  FOUNDING_TOTAL,
  FOUNDING_SPOTS_LEFT,
  FOUNDING_ACTIVE,
  STRIPE_PRICE_CURRENT,
} from "../lib/pricing";

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
const buildIntroMessage = (user) => {
  const firstName = user.name.split(' ')[0];
  const bankroll = Number(user.bankroll).toFixed(0);
  const goal = Number(user.goal).toFixed(0);
  return `Hey ${firstName}. I'm Hunter.
Before anything else, let's talk about how we're actually going to do this. It's not how most people bet.
You already set the number: $${bankroll}/week, aiming to walk away +$${goal}. That's the whole philosophy here. Hit your goal, lock it in by Sunday night, reset clean Monday morning. Most bettors give back their best weeks by never knowing when to stop. That's not you anymore.
Every pick you get, I've already run the research behind it: every game, every line, any hour, digging deeper than anything a one-man handicapper is going to hand you. This is the part of your game nobody else gets to see.
Beyond that: ask me about any game, any line, any hour. Real research, not recycled takes. Every bet tracked honestly, wins and losses both.
Where do you want to start?`;
};
const currentTimeDisplay = () => {
  const etTime = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: "America/New_York" });
  const ptTime = new Date().toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", timeZoneName: "short", timeZone: "America/Los_Angeles" });
  return `${etTime} / ${ptTime}`;
};

// ── API Call Helper ────────────────────────────────────────────────────────
const callClaude = async (messages, system, useSearch = false, imageBase64 = null, maxTokens = 4000, _onChunk = null, accessToken = null, enforceLimit = false) => {
  const body = {
    model: "claude-sonnet-4-6",
    max_tokens: maxTokens,
    system,
    messages,
  };
  if (useSearch) body.tools = [{ type: "web_search_20250305", name: "web_search" }];
  if (enforceLimit) body.enforceLimit = true;
  const headers = { "Content-Type": "application/json" };
  if (accessToken) headers["Authorization"] = `Bearer ${accessToken}`;
  const response = await fetch("/api/claude", {
    method: "POST",
    headers,
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (data.limitReached) return { limitReached: true };
  // Claude's response can contain multiple separate text blocks when web
  // search is used (interim "let me check X" commentary between searches,
  // then the final answer). Joining with "" ran them together with no
  // space (e.g. "...plus-money spots.Good intel. Now let me check...").
  // Join with a paragraph break instead.
  const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("\n\n");
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
              <div style={{ color: "#f5a623", fontSize: 20, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, marginBottom: 4 }}>3 Days Free</div>
              <div style={{ color: "#888", fontSize: 13, marginBottom: 16 }}>Then {CURRENT_PRICE_DISPLAY}, locked for life as a founding member. Cancel anytime.</div>
              {["Daily AI picks at 11 AM", "📸 Snap to Log", "Persistent AI memory", "Bankroll tracking", "Full history & analytics"].map((f, i) => (
                <div key={i} style={{ color: "#ccc", fontSize: 14, marginBottom: 8, textAlign: "left" }}>✅ {f}</div>
              ))}
            </div>
          </div>
        )}

        <button style={{ ...S.ob.nextBtn, ...(canNext[step]() ? {} : { opacity: 0.3, cursor: "not-allowed" }) }}
          onClick={() => canNext[step]() && (step < 4 ? setStep(step + 1) : onComplete({ ...form, bankroll: parseFloat(form.bankroll), goal: parseFloat(form.goal) }))}
          disabled={!canNext[step]()}>
          {step === 4 ? "Start My Free Trial →" : step < 3 ? "Continue →" : "Meet Hunter →"}
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

// ── Shared verify-and-fix card ────────────────────────────────────────────
// One component for single bets, parlay legs, and batch-queue items. Reads the
// provenance produced by groundBet() and: (1) always shows the read, (2) flags
// only settlement-critical fields that were inferred/ambiguous/unmatched, and
// (3) tells the caller whether the save should be gated. "Always show,
// selectively block" — the three-way-review outcome.
//
// Settlement-critical fields = date, game, bet-type qualifier (F5/1H/team-total).
// Those are the only ones that, if wrong, settle a bet incorrectly. Odds/stake
// are shown but never gate.

// Does this pick carry a partial-game qualifier that must be confirmed?
const pickQualifier = (pick) => {
  const p = (pick || "").toLowerCase();
  if (/\bf5\b|first 5/.test(p)) return "F5 (first 5 innings)";
  if (/\b1h\b|first half/.test(p)) return "1H (first half)";
  if (/\b1q\b|first quarter/.test(p)) return "1Q (first quarter)";
  if (/team total/.test(p)) return "Team Total";
  return null;
};

// Given a grounded bet (single or one leg), return the list of settlement-
// critical problems the user must resolve before this is safe to auto-settle.
const criticalIssues = (bet) => {
  const prov = bet.provenance || {};
  const issues = [];
  if (prov.game === "ambiguous") issues.push({ field: "game", kind: "ambiguous", label: "Which game is this?" });
  else if (prov.game === "unmatched") issues.push({ field: "game", kind: "unmatched", label: "Couldn't match this to a scheduled game" });
  if (prov.date === "inferred" && !["matched", "read", "user_confirmed"].includes(prov.game)) issues.push({ field: "date", kind: "inferred", label: "No date on the slip — confirm the date" });
  return issues;
};

// ── Past-game source registry (built for scale) ───────────────────────────
// The odds feed only carries UPCOMING games — once a game is final it drops
// off. So for a back-dated slip (user logged late), we can't use the odds feed;
// we need each sport's COMPLETED-games source. Rather than hardcode one sport,
// this is a registry: each sport supplies an adapter (date, teamWords) => games
// in ONE normalized shape { gameId, game, gameDate, gameTime }. The resolver
// asks the registry and doesn't care how each sport answers.
//
// Adding a new sport later = write one adapter + add one line here. No changes
// to the resolver, the verify card, or anything downstream. That's the seam.
//
// normalizeSport() (defined in SnapToLog) returns the Odds API sport_key; we
// key adapters on that so it lines up with everything else in the app.
const matchTeamWords = (teamWords, ...names) => {
  const hay = names.filter(Boolean).join(" ").toLowerCase();
  return teamWords.some(w => hay.includes(w));
};

const PAST_GAME_SOURCES = {
  // MLB — MLB Stats API schedule endpoint returns FINAL games for a past date,
  // free, no key. Same source the settlement engine trusts. Fully implemented.
  baseball_mlb: async (date, teamWords) => {
    const res = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${date}&gameType=R`);
    const data = await res.json();
    const games = data?.dates?.[0]?.games || [];
    return games
      .filter(g => matchTeamWords(teamWords, g.teams?.away?.team?.name, g.teams?.home?.team?.name))
      .map(g => {
        const away = g.teams?.away?.team?.name;
        const home = g.teams?.home?.team?.name;
        return {
          // MLB Stats gamePk isn't the Odds API id, but for a completed game we
          // don't need the odds id — the settlement engine's MLB fallback matches
          // by team+date anyway. Store the pk so it's available.
          gameId: null,
          mlbGamePk: g.gamePk,
          game: `${away} @ ${home}`,
          gameDate: new Date(g.gameDate).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
          gameTime: new Date(g.gameDate).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }),
        };
      });
  },
  // Other sports: adapters not built yet. Registering them as null makes the
  // resolver degrade HONESTLY (falls to "log with this date, settle manually")
  // instead of silently failing. When a sport's season arrives, replace null
  // with an adapter and it drops straight in.
  basketball_nba: null,
  americanfootball_nfl: null,
  americanfootball_ncaaf: null,
  basketball_ncaab: null,
  icehockey_nhl: null,
  soccer_epl: null,
  soccer_usa_mls: null,
  mma_mixed_martial_arts: null,
};

// One editable row. Read fields show plain; flagged fields show amber + tappable.
// Smart resolver for a game that couldn't be auto-matched (team name only, no
// date, etc). Flow: confirm/enter a date → search the REAL schedule for that
// team on that date → pick a real matchup (gets a real game_id) → or, if none
// found, confirm as-is and settle manually later. This is the "option 3" the
// founder chose: date-first, search, honest fallback.
// For PAST dates it searches completed-games sources (per-sport registry);
// for today/future it searches the live odds feed.
function GameResolver({ teamText, sport, sportKey, initialDate, onResolve, onCancel }) {
  const [date, setDate] = useState(initialDate || "");
  const [searching, setSearching] = useState(false);
  const [results, setResults] = useState(null); // null=not searched, []=none found
  const [searched, setSearched] = useState(false);

  const teamWords = (teamText || "").toLowerCase().split(/\s+/).filter(w => w.length > 3);

  const runSearch = async () => {
    if (!date) return;
    setSearching(true);
    setSearched(false);
    setResults(null);
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
    const isPast = date < today;
    try {
      if (isPast) {
        // Back-dated slip (logged late). The odds feed doesn't carry finished
        // games — use the per-sport completed-games registry.
        const adapter = sportKey ? PAST_GAME_SOURCES[sportKey] : null;
        if (typeof adapter === "function") {
          const games = await adapter(date, teamWords);
          setResults(games);
        } else {
          // Sport's past-game source not built yet → honest empty → manual path.
          setResults([]);
        }
      } else {
        // Today/future → live odds feed.
        const oddsRes = await fetch("/api/odds", { method: "POST" });
        const oddsData = await oddsRes.json();
        const games = (oddsData.games || []).filter(g => {
          const gDate = g.commence_time ? new Date(g.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null;
          if (gDate !== date) return false;
          const home = (g.home_team || "").toLowerCase();
          const away = (g.away_team || "").toLowerCase();
          return teamWords.some(w => home.includes(w) || away.includes(w));
        }).map(g => ({
          gameId: g.id,
          game: `${g.away_team} @ ${g.home_team}`,
          gameDate: new Date(g.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
          gameTime: new Date(g.commence_time).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }),
        }));
        setResults(games);
      }
    } catch (e) {
      setResults([]);
    }
    setSearching(false);
    setSearched(true);
  };

  return (
    <div>
      <div style={{ color: "#888", fontSize: 12, marginBottom: 10 }}>
        Hunter couldn't match "{teamText}" to a scheduled game. Set the date and we'll find the real matchup.
      </div>
      <label style={{ color: "#666", fontSize: 11, fontWeight: 700, letterSpacing: 0.5 }}>GAME DATE</label>
      <input
        type="date" value={date}
        onChange={e => { setDate(e.target.value); setSearched(false); setResults(null); }}
        style={{ width: "100%", boxSizing: "border-box", background: "#0f0f18", border: "1px solid #3a3a48", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, margin: "6px 0 12px" }}
      />
      {!searched && (
        <button onClick={runSearch} disabled={!date || searching}
          style={{ width: "100%", background: date ? "#f5a623" : "#3a3a2a", border: "none", borderRadius: 10, padding: "12px 0", color: "#0a0a0f", fontSize: 14, fontWeight: 700, cursor: date ? "pointer" : "not-allowed", marginBottom: 10 }}>
          {searching ? "Searching schedule…" : "Find the game"}
        </button>
      )}
      {searched && results && results.length > 0 && (
        <>
          <div style={{ color: "#2ecc71", fontSize: 12, marginBottom: 8 }}>Found {results.length === 1 ? "the game" : `${results.length} possible games`} — tap to confirm:</div>
          {results.map((c, k) => (
            <button key={k} onClick={() => onResolve({ game: c.game, gameId: c.gameId, mlbGamePk: c.mlbGamePk, gameDate: c.gameDate, gameTime: c.gameTime, grounded: true })}
              style={{ width: "100%", textAlign: "left", background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 10, padding: "12px 14px", marginBottom: 8, color: "#fff", fontSize: 14, cursor: "pointer" }}>
              <div style={{ fontWeight: 600 }}>{c.game}</div>
              <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>{c.gameDate}{c.gameTime ? ` · ${c.gameTime}` : ""}</div>
            </button>
          ))}
        </>
      )}
      {searched && results && results.length === 0 && (
        <div style={{ color: "#f5a623", fontSize: 12, marginBottom: 10, lineHeight: 1.5 }}>
          No game found for "{teamText}" on {date}. You can still log it with this date — you'll settle it yourself from Bet History.
        </div>
      )}
      <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "#1a1a24", border: "1px solid #2a2a38", borderRadius: 10, padding: "12px 0", color: "#888", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
        {searched && results && results.length === 0 && date && (
          <button onClick={() => onResolve({ gameDate: date, grounded: false })}
            style={{ flex: 1, background: "#f5a623", border: "none", borderRadius: 10, padding: "12px 0", color: "#0a0a0f", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>
            Log with this date
          </button>
        )}
      </div>
    </div>
  );
}

// Small controlled input for the inline editor (text / date / number).
function EditField({ initial, type, onSave, onCancel }) {
  const [val, setVal] = useState(initial ?? "");
  return (
    <div>
      <input
        autoFocus
        type={type || "text"}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === "Enter") onSave(val); }}
        style={{ width: "100%", boxSizing: "border-box", background: "#0f0f18", border: "1px solid #3a3a48", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 15, marginBottom: 12 }}
      />
      <div style={{ display: "flex", gap: 10 }}>
        <button onClick={onCancel} style={{ flex: 1, background: "#1a1a24", border: "1px solid #2a2a38", borderRadius: 10, padding: "12px 0", color: "#888", fontSize: 14, fontWeight: 600, cursor: "pointer" }}>Cancel</button>
        <button onClick={() => onSave(val)} style={{ flex: 1, background: "#f5a623", border: "none", borderRadius: 10, padding: "12px 0", color: "#0a0a0f", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Save</button>
      </div>
    </div>
  );
}

function VerifyRow({ label, value, flagged, onEdit }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "9px 0", borderBottom: "1px solid #1a1a24" }}>
      <span style={{ color: "#666", fontSize: 13 }}>{label}</span>
      <button
        onClick={onEdit}
        style={{
          background: "none", border: "none", padding: 0, cursor: "pointer",
          color: flagged ? "#f5a623" : "#fff", fontSize: 13, fontWeight: 600,
          textAlign: "right", maxWidth: "62%", display: "flex", alignItems: "center", gap: 6,
        }}
      >
        {flagged && <span style={{ fontSize: 12 }}>⚠️</span>}
        <span style={{ textDecoration: onEdit ? "underline dotted" : "none", textUnderlineOffset: 3 }}>
          {value || "—"}
        </span>
      </button>
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
  // Inline field-edit state for the verify card. editing = { target, field } where
  // target is 'single' | 'queue' | a leg index; field is 'game'|'date'|'pick'|etc.
  const [editing, setEditing] = useState(null);

  // Shared by both handleFile (single slip) and handleFiles (multi slip) —
  // previously duplicated-but-missing in handleFiles, which silently broke
  // all game/sport matching for every multi-slip upload (undefined-function
  // error swallowed by the surrounding try/catch). Keep this as the one
  // source of truth for both flows.
  const normalizeSport = (sport) => {
    if (!sport) return null;
    const s = sport.toLowerCase().trim();
    if (s.includes('world cup') || s.includes('fifa')) return 'soccer_fifa_world_cup';
    if (s.includes('champions league')) return 'soccer_uefa_champs_league';
    if (s.includes('europa league')) return 'soccer_uefa_europa_league';
    if (s.includes('libertadores')) return 'soccer_conmebol_copa_libertadores';
    if (s.includes('premier league') || s.includes('epl')) return 'soccer_epl';
    if (s.includes('la liga')) return 'soccer_spain_la_liga';
    if (s.includes('bundesliga')) return 'soccer_germany_bundesliga';
    if (s.includes('serie a')) return 'soccer_italy_serie_a';
    if (s.includes('ligue')) return 'soccer_france_ligue_one';
    if (s.includes('mls') || s.includes('major league soccer')) return 'soccer_usa_mls';
    if (s.includes('soccer')) return 'soccer_usa_mls';
    if (s.includes('mlb') || s.includes('baseball')) return 'baseball_mlb';
    if (s.includes('nba') || s.includes('basketball')) return 'basketball_nba';
    if (s.includes('nhl') || s.includes('hockey')) return 'icehockey_nhl';
    if (s.includes('nfl') || (s.includes('football') && !s.includes('soccer'))) return 'americanfootball_nfl';
    if (s.includes('mma') || s.includes('ufc')) return 'mma_mixed_martial_arts';
    return null;
  };
  const FIFA_CODES = {"AFG":"Afghanistan","ALB":"Albania","ALG":"Algeria","AND":"Andorra","ANG":"Angola","ARG":"Argentina","ARM":"Armenia","AUS":"Australia","AUT":"Austria","AZE":"Azerbaijan","BHR":"Bahrain","BAN":"Bangladesh","BLR":"Belarus","BEL":"Belgium","BLZ":"Belize","BEN":"Benin","BOL":"Bolivia","BIH":"Bosnia and Herzegovina","BOT":"Botswana","BRA":"Brazil","BUL":"Bulgaria","BFA":"Burkina Faso","BDI":"Burundi","CMR":"Cameroon","CAN":"Canada","CPV":"Cape Verde","CAF":"Central African Republic","CHI":"Chile","CHN":"China","COL":"Colombia","CRC":"Costa Rica","CRO":"Croatia","CUB":"Cuba","CZE":"Czech Republic","DEN":"Denmark","ECU":"Ecuador","EGY":"Egypt","SLV":"El Salvador","ENG":"England","EST":"Estonia","ETH":"Ethiopia","FIJ":"Fiji","FIN":"Finland","FRA":"France","GAB":"Gabon","GEO":"Georgia","GER":"Germany","GHA":"Ghana","GRE":"Greece","GTM":"Guatemala","GUI":"Guinea","HON":"Honduras","HKG":"Hong Kong","HUN":"Hungary","IND":"India","IDN":"Indonesia","IRN":"Iran","IRQ":"Iraq","IRL":"Ireland","ISR":"Israel","ITA":"Italy","CIV":"Ivory Coast","JAM":"Jamaica","JPN":"Japan","JOR":"Jordan","KAZ":"Kazakhstan","KEN":"Kenya","PRK":"North Korea","KOR":"South Korea","KWT":"Kuwait","LBN":"Lebanon","LBA":"Libya","LIE":"Liechtenstein","LTU":"Lithuania","LUX":"Luxembourg","MKD":"North Macedonia","MLI":"Mali","MLT":"Malta","MTN":"Mauritania","MEX":"Mexico","MDA":"Moldova","MNG":"Mongolia","MAR":"Morocco","MOZ":"Mozambique","NAM":"Namibia","NED":"Netherlands","NZL":"New Zealand","NGA":"Nigeria","NOR":"Norway","OMA":"Oman","PAK":"Pakistan","PAN":"Panama","PRY":"Paraguay","PER":"Peru","PHI":"Philippines","POL":"Poland","PRT":"Portugal","QAT":"Qatar","ROU":"Romania","RUS":"Russia","RWA":"Rwanda","KSA":"Saudi Arabia","SCO":"Scotland","SEN":"Senegal","SRB":"Serbia","SLE":"Sierra Leone","SVK":"Slovakia","SVN":"Slovenia","SOM":"Somalia","RSA":"South Africa","ESP":"Spain","SRI":"Sri Lanka","SDN":"Sudan","SWE":"Sweden","SUI":"Switzerland","SYR":"Syria","TPE":"Chinese Taipei","TJK":"Tajikistan","TAN":"Tanzania","THA":"Thailand","TOG":"Togo","TTO":"Trinidad and Tobago","TUN":"Tunisia","TUR":"Turkey","TKM":"Turkmenistan","UGA":"Uganda","UKR":"Ukraine","UAE":"United Arab Emirates","USA":"United States","URU":"Uruguay","UZB":"Uzbekistan","VEN":"Venezuela","VIE":"Vietnam","WAL":"Wales","ZAM":"Zambia","ZIM":"Zimbabwe","DZA":"Algeria","CHL":"Chile","COG":"Congo"};
  const CLUB_ALIASES = {"man city":"Manchester City","man utd":"Manchester United","man united":"Manchester United","spurs":"Tottenham Hotspur","tottenham":"Tottenham Hotspur","psg":"Paris Saint-Germain","paris sg":"Paris Saint-Germain","paris saint germain":"Paris Saint-Germain","barca":"Barcelona","bayer":"Bayer Leverkusen","leverkusen":"Bayer Leverkusen","atletico":"Atletico Madrid","atletico madrid":"Atletico Madrid","inter":"Inter Milan","inter milan":"Inter Milan","ac milan":"AC Milan","milan":"AC Milan","juve":"Juventus","juventus":"Juventus","dortmund":"Borussia Dortmund","bvb":"Borussia Dortmund","gladbach":"Borussia Monchengladbach","hoffenheim":"TSG Hoffenheim","augsburg":"FC Augsburg","hertha":"Hertha Berlin","werder":"Werder Bremen","freiburg":"SC Freiburg","mainz":"FSV Mainz","frankfurt":"Eintracht Frankfurt","eintracht":"Eintracht Frankfurt","stuttgart":"VfB Stuttgart","wolves":"Wolverhampton Wanderers","wolverhampton":"Wolverhampton Wanderers","west ham":"West Ham United","leicester":"Leicester City","brighton":"Brighton and Hove Albion","newcastle":"Newcastle United","villa":"Aston Villa","aston villa":"Aston Villa","palace":"Crystal Palace","crystal palace":"Crystal Palace","southampton":"Southampton","everton":"Everton","fulham":"Fulham","brentford":"Brentford","bournemouth":"Bournemouth","luton":"Luton Town","sheffield utd":"Sheffield United","forest":"Nottingham Forest","nottingham":"Nottingham Forest","porto":"FC Porto","benfica":"SL Benfica","sporting":"Sporting CP","ajax":"AFC Ajax","psv":"PSV Eindhoven","feyenoord":"Feyenoord","celtic":"Celtic","rangers":"Rangers","sevilla":"Sevilla FC","valencia":"Valencia CF","villarreal":"Villarreal CF","real sociedad":"Real Sociedad","athletic":"Athletic Club","betis":"Real Betis","osasuna":"CA Osasuna","getafe":"Getafe CF","celta":"Celta Vigo","cadiz":"Cadiz CF","almeria":"UD Almeria","napoli":"SSC Napoli","roma":"AS Roma","lazio":"SS Lazio","fiorentina":"ACF Fiorentina","atalanta":"Atalanta","torino":"Torino FC","bologna":"Bologna FC","monza":"AC Monza","lecce":"US Lecce","udinese":"Udinese","empoli":"Empoli FC","sassuolo":"US Sassuolo","salernitana":"US Salernitana","verona":"Hellas Verona","frosinone":"Frosinone Calcio","lyon":"Olympique Lyonnais","marseille":"Olympique de Marseille","monaco":"AS Monaco","lille":"LOSC Lille","lens":"RC Lens","rennes":"Stade Rennais","nice":"OGC Nice","strasbourg":"RC Strasbourg","nantes":"FC Nantes","reims":"Stade de Reims","lorient":"FC Lorient","montpellier":"Montpellier HSC","toulouse":"Toulouse FC","brest":"Stade Brestois","metz":"FC Metz","le havre":"Le Havre AC","galaxy":"LA Galaxy","lafc":"Los Angeles FC","la galaxy":"LA Galaxy","nycfc":"New York City FC","nyrb":"New York Red Bulls","red bulls":"New York Red Bulls","seattle":"Seattle Sounders","portland":"Portland Timbers","atlanta":"Atlanta United","chicago":"Chicago Fire","toronto":"Toronto FC","montreal":"CF Montreal","vancouver":"Vancouver Whitecaps","colorado":"Colorado Rapids","dallas":"FC Dallas","houston":"Houston Dynamo","kansas city":"Sporting Kansas City","sporting kc":"Sporting Kansas City","minnesota":"Minnesota United","nashville":"Nashville SC","austin":"Austin FC","charlotte":"Charlotte FC","cincinnati":"FC Cincinnati","columbus":"Columbus Crew","dc united":"D.C. United","inter miami":"Inter Miami","new england":"New England Revolution","orlando":"Orlando City","philadelphia":"Philadelphia Union","real salt lake":"Real Salt Lake","rsl":"Real Salt Lake","san jose":"San Jose Earthquakes","st louis":"St. Louis City SC"};
  const expandTeamAbbr = (str) => {
    if (!str) return "";
    let result = str.replace(/\b([A-Z]{3})\b/g, (match, code) => FIFA_CODES[code] || match);
    const lower = result.toLowerCase();
    for (const [alias, full] of Object.entries(CLUB_ALIASES)) {
      if (lower.includes(alias)) result = result.toLowerCase().replace(alias, full.toLowerCase());
    }
    return result;
  };

  // ── Grounding shape classifier ────────────────────────────────────────────
  // Every bet type collapses into one of a few "grounding shapes" — what the
  // system must look up to settle it. New bet types a book invents still sort
  // into one of these; we never need to enumerate every bet type.
  //   game        → grounds to one game, settles on final/segment score
  //                 (ML, spread, total, team total, alt lines, F5, 1H, 1Q)
  //   player_prop → grounds to one game + a player + a stat line
  //   futures     → no game to ground; settles weeks/months later
  //   unsupported → a market the odds feed can't carry (some soccer exotics);
  //                 log it, but it can't auto-settle — honest degradation
  const classifyBetShape = (parsed) => {
    const bt = (parsed.betType || "").toLowerCase();
    const pick = (parsed.pick || "").toLowerCase();
    if (bt.includes("future") || /\b(to win|championship|mvp|season|award|division|conference)\b/.test(pick)) return "futures";
    if (bt.includes("prop") || bt.includes("player") || parsed.player) return "player_prop";
    // Soccer exotics the feed (h2h/spreads/totals only) can't settle from score
    if (/\b(both teams to score|btts|correct score|asian handicap|double chance|draw no bet|first goalscorer|anytime scorer)\b/.test(pick)) return "unsupported";
    return "game";
  };

  // ── Unified grounding engine ──────────────────────────────────────────────
  // Given an extracted bet and the live odds feed, match it against the REAL
  // schedule and return the bet enriched with gameId + canonical names + a
  // provenance object. Provenance is the gate signal (read vs. matched vs.
  // inferred vs. ambiguous vs. unmatched) — NOT the model's confidence score.
  // Used by single bets AND each parlay leg, so grounding is identical everywhere.
  //
  // matchStatus (on returned .provenance.game):
  //   read      → team/game text was printed on the slip AND we matched it to
  //               exactly one real fixture (highest trust)
  //   matched   → matched to exactly one real fixture (team read, no slip date)
  //   ambiguous → >1 candidate fixture; user must pick which game (candidates attached)
  //   unmatched → 0 candidate fixtures; nothing to ground against right now
  // provenance.date:
  //   read      → date was printed on the slip
  //   matched   → date came from the single matched fixture (not the slip)
  //   inferred  → we could not establish a date from slip or a unique fixture
  const groundBet = async (parsed, oddsData) => {
    const shape = classifyBetShape(parsed);
    const dateOnSlip = !!parsed.gameDate;
    const provenance = {
      shape,
      date: dateOnSlip ? "read" : "inferred",
      game: "unmatched",
      candidates: [],
    };

    // Futures + unsupported markets don't ground to a single game. Log them,
    // but flag that they can't auto-settle — the settle-time backstop / one-tap
    // outcome handles them. Never guess a game for these.
    if (shape === "futures" || shape === "unsupported") {
      provenance.game = "unmatched";
      provenance.autoSettleable = false;
      return { ...parsed, provenance };
    }

    if (!oddsData || !oddsData.games) return { ...parsed, provenance };

    const parsedSport = normalizeSport(parsed.sport || "");
    const parsedDate = parsed.gameDate || "";
    const gameText = expandTeamAbbr(parsed.game || "").toLowerCase();

    // Highest-confidence path: MLB with a starting pitcher on the slip.
    // Re-derive the exact game from the MLB Stats API (real fixture source),
    // never from the vision read alone.
    if (parsed.pitcher && (parsedSport === "baseball_mlb")) {
      try {
        const pitcherName = parsed.pitcher.toLowerCase();
        const searchDate = parsed.gameDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        const mlbRes = await fetch(`https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${searchDate}&gameType=R&hydrate=probablePitcher`);
        const mlbData = await mlbRes.json();
        const games = mlbData.dates?.[0]?.games || [];
        const pitcherGame = games.find(g => {
          const ap = (g.teams?.away?.probablePitcher?.fullName?.split(' ').pop() || '').toLowerCase();
          const hp = (g.teams?.home?.probablePitcher?.fullName?.split(' ').pop() || '').toLowerCase();
          return (ap && (ap.includes(pitcherName) || pitcherName.includes(ap))) ||
                 (hp && (hp.includes(pitcherName) || pitcherName.includes(hp)));
        });
        if (pitcherGame) {
          const away = pitcherGame.teams?.away?.team?.name;
          const home = pitcherGame.teams?.home?.team?.name;
          const oddsMatch = oddsData.games.find(g => {
            const h = g.home_team.toLowerCase(), a = g.away_team.toLowerCase();
            return home.toLowerCase().split(' ').filter(w => w.length > 3).some(w => h.includes(w)) ||
                   away.toLowerCase().split(' ').filter(w => w.length > 3).some(w => a.includes(w));
          });
          return {
            ...parsed,
            game: `${away} @ ${home}`,
            gameDate: new Date(pitcherGame.gameDate).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
            gameTime: new Date(pitcherGame.gameDate).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }),
            gameId: oddsMatch ? oddsMatch.id : (parsed.gameId || null),
            provenance: { ...provenance, game: "read", date: "read", autoSettleable: !!oddsMatch },
          };
        }
        // pitcher lookup failed → fall through to team-name matching below
      } catch (e) { /* fall through */ }
    }

    // General path: find ALL candidate fixtures matching the team text,
    // scoped by sport and (if we have one) date. Counting candidates is how we
    // tell matched / ambiguous / unmatched apart honestly.
    const candidates = oddsData.games.filter(g => {
      const home = g.home_team.toLowerCase();
      const away = g.away_team.toLowerCase();
      const gDate = g.commence_time
        ? new Date(g.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' })
        : null;
      if (parsedSport && g.sport_key && g.sport_key !== parsedSport) return false;
      if (parsedDate && gDate && gDate !== parsedDate) return false;
      const homeMatch = home.split(' ').filter(w => w.length > 3).every(w => gameText.includes(w));
      const awayMatch = away.split(' ').filter(w => w.length > 3).every(w => gameText.includes(w));
      return homeMatch || awayMatch;
    });

    if (candidates.length === 1) {
      const m = candidates[0];
      return {
        ...parsed,
        game: `${m.away_team} @ ${m.home_team}`,
        gameId: m.id,
        gameDate: parsed.gameDate || new Date(m.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
        gameTime: parsed.gameTime || new Date(m.commence_time).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }),
        provenance: {
          ...provenance,
          game: dateOnSlip ? "read" : "matched",
          date: dateOnSlip ? "read" : "matched",
          autoSettleable: true,
        },
      };
    }

    if (candidates.length > 1) {
      // Can't know which game — this is the "which game?" case. Attach the
      // candidate list for the picker; do NOT guess one.
      return {
        ...parsed,
        provenance: {
          ...provenance,
          game: "ambiguous",
          autoSettleable: false,
          candidates: candidates.map(m => ({
            gameId: m.id,
            game: `${m.away_team} @ ${m.home_team}`,
            gameDate: new Date(m.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }),
            gameTime: new Date(m.commence_time).toLocaleTimeString('en-US', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hour12: false }),
          })),
        },
      };
    }

    // Zero candidates — nothing to ground against. Save flagged; one-tap outcome later.
    return { ...parsed, provenance: { ...provenance, game: "unmatched", autoSettleable: false } };
  };

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
          model: "claude-sonnet-4-6",
          max_tokens: 1000,
            system: "You are Hunter. Extract bet details from a sportsbook screenshot. Normalize odds to standard American format (even money = +100, run lines at even = +100). For STRAIGHT BETS return ONLY raw JSON: {\"sport\":\"...\",\"game\":\"...\",\"betType\":\"...\",\"odds\":\"...\",\"pick\":\"...\",\"amount\":0,\"toWin\":0,\"gameDate\":\"YYYY-MM-DD\",\"gameTime\":\"HH:MM\",\"pitcher\":\"LAST_NAME_ONLY_or_null\",\"confidence\":95}. For baseball bets, set pitcher to the starting pitcher last name visible on the slip (e.g. \"SPROAT\"). For all other sports set pitcher to null. For PARLAYS, TEASERS, and SGPs return ONLY raw JSON: {\"betType\":\"parlay\",\"ticketNumber\":\"...\",\"amount\":0,\"toWin\":0,\"odds\":\"...\",\"teaserPoints\":null,\"gameDate\":\"YYYY-MM-DD\",\"legs\":[{\"sport\":\"...\",\"game\":\"...\",\"pick\":\"...\",\"odds\":\"...\",\"gameDate\":\"YYYY-MM-DD\",\"gameTime\":\"HH:MM\"}],\"confidence\":95}. For TEASERS set betType to \"teaser\" and teaserPoints to the point value. For SGPs set betType to \"sgp\". PARLAY LEG GAME FIELD: If a parlay leg shows only one team with no opponent visible (typical for moneyline-style listings), set that leg's \"game\" to just \"[Team]\" with no opponent — same rule as single bets. NEVER infer, guess, or invent an opponent or matchup for a leg's \"game\" field, even if a plausible-looking matchup (e.g. a promo banner for an unrelated game/sport elsewhere on screen) appears nearby. If genuinely unclear, use an empty string. TRYINK FORMAT: Bets show as [#]. [Team] [Pitcher1] - R / [Pitcher2] - L LP [spread] [odds]. The format is ALWAYS: bet number, then team name, then two pitcher names separated by /, then spread (if any), then odds. Extract ONLY the team name — stop at the first all-caps surname after the team name. SPREAD DETECTION: In TryInk format, \"- R\" and \"- L\" after pitcher names indicate pitcher handedness (Right/Left) — NOT a spread. A RUN LINE bet requires an explicit number like -1.5 or +1.5 on the line AFTER the pitcher names. Preserve the sign exactly — if you see -1½ set pick to \"[Team] -1.5\", if you see +1½ set pick to \"[Team] +1.5\". The odds are the LAST number on the line. FIRST HALF DETECTION: If the bet line starts with \"1H\" (e.g. \"1975. 1H Los Angeles Dodgers...\"), this is a FIRST HALF bet. Set betType to \"1H\" and set pick to \"[Team] 1H ML\" (or \"[Team] 1H -1.5\" if there is a spread). FIRST 5 INNINGS DETECTION: If the bet line contains \"1st 5\", \"F5\", \"First 5\", or \"First 5 Innings\", this is an MLB-ONLY first-5-innings bet — NOT the same thing as FIRST HALF/1H, which does not apply to baseball. Set betType to \"F5\" and ALWAYS include the literal text \"F5\" in the pick, e.g. \"[Team] F5 ML\" or \"[Team] F5 -1.5\". Never label an MLB first-5-innings bet as \"1H\". TEAM TOTAL DETECTION: If you see \"Team Total\" or \"Team total points\" in the bet description, this is a TEAM TOTAL bet — only one team's score counts. Set betType to \"teamtotal\" and set pick to \"[Team Name] Over X.X\" or \"[Team Name] Under X.X\" — always include the team name. Example: \"Milwaukee Brewers Over 4.5\". TOTAL DETECTION: If you see \"U\" or \"O\" followed by a number (e.g. \"U 7½\", \"O 8.5\") and it is NOT a team total, this is a GAME TOTAL bet. Set pick to \"Under X.X\" or \"Over X.X\" and betType to \"total\". Do NOT include team name in the pick. If NO spread and NO total, set pick to \"[Team] ML\". Set game to just \"[Team]\" with no opponent. Never include pitcher names in game or pick fields. The gameDate on TryInk slips is shown in the ticket timestamp at the top (e.g. \"2026/06/15\") — use that date, NOT any date embedded in the bet line. ODDS: If odds show as \"Pk\" or \"PK\" that means pick'em = +100. EXCEPTION: For LIVE bets (when \"Live:\" is present on the slip), \"Pk\" is a status indicator — NOT the odds. For live bets always extract the odds from the bet detail line itself (e.g. \"+128\" or \"-140\"), never use \"Pk\" as the odds. TRYINK SOCCER PARLAY FORMAT: Soccer parlays on tryInk show as \"Props: [number]\" with multiple bet details listed. Each line with a team name or player name is a separate leg. A bet showing \"[Player] 1+ Score or Assist, to win: [Team] (Game)\" contains TWO legs: (1) [Team] ML and (2) [Player] 1+ Score or Assist prop. Parse these as a parlay with both legs. LIVE BET DETECTION: If the slip contains \"Live:\" followed by a number (e.g. \"Live: 302296347\"), this is a LIVE BET placed during an in-progress game. For live bets: (1) set isLive to true in the JSON, (2) use the ticket timestamp date as gameDate — NOT today's date. The ticket timestamp format is \"YYYY/MM/DD HH:MM:SS AM/PM\" — extract YYYY-MM-DD from it. Important: if the ticket time is after midnight ET but the game started the previous calendar day, still use the ticket timestamp date as gameDate. (3) gameTime should be left empty for live bets. SCHEDULED DATE DETECTION: If the slip shows a scheduled date and time (e.g. \"Scheduled: June 24, 2026 9:45 PM EST\"), extract the date directly as gameDate in YYYY-MM-DD format and gameTime in 24hr ET format. Do NOT convert timezones — use the date exactly as written. \"June 24, 2026 9:45 PM EST\" → gameDate: \"2026-06-24\", gameTime: \"21:45\". GENERAL RULES: Never guess any text you cannot clearly read. Use empty strings for missing fields. gameDate in ET. gameTime in 24hr ET format. If unclear: {\"error\":\"reason\"}.",
          messages: [{ role: "user", content: [
            { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
            { type: "text", text: "Extract the bet details from this slip." }
          ]}]
        })
      });
      const data = await response.json();
      const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
      let parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
      // Second call: look up game date/time via web search if missing from slip
    // NOTE: the old web_search date-guess call was removed here. It was a
    // second, silent guessing surface (it once invented a wrong date). Date is
    // now derived by grounding against the real schedule inside groundBet().

    try {
  const oddsRes = await fetch("/api/odds", { method: "POST" });
  const oddsData = await oddsRes.json();

  if (oddsData.games) {
    if (parsed.legs && parsed.legs.length > 0) {
      // Parlay: ground every leg through the same engine. A parlay's grounding
      // trust is the WEAKEST of its legs — if any leg is ambiguous/unmatched,
      // the whole ticket needs attention.
      parsed.legs = await Promise.all(parsed.legs.map(leg => groundBet(leg, oddsData)));
      const legStates = parsed.legs.map(l => l.provenance?.game || "unmatched");
      const worst = legStates.includes("unmatched") ? "unmatched"
                  : legStates.includes("ambiguous") ? "ambiguous"
                  : legStates.every(s => s === "read") ? "read" : "matched";
      parsed.provenance = {
        game: worst,
        autoSettleable: parsed.legs.every(l => l.provenance?.autoSettleable),
      };
    } else if (parsed.isLive) {
      // Live bet — game may already be complete; keep the dedicated scores
      // lookup path. (Live grounding is its own shape; not folded into groundBet.)
      const game = expandTeamAbbr(parsed.game || "").toLowerCase();
      try {
        const sportsToCheck = ['baseball_mlb', 'soccer_fifa_world_cup', 'soccer_usa_mls', 'basketball_nba', 'icehockey_nhl', 'americanfootball_nfl'];
        for (const sport of sportsToCheck) {
          const ticketTime = parsed.ticketTime || new Date().toISOString();
          const scoresRes = await fetch(`/api/live-scores-lookup?sport=${sport}&game=${encodeURIComponent(game)}&ticket_time=${encodeURIComponent(ticketTime)}`);
          if (scoresRes.ok) {
            const scoresData = await scoresRes.json();
            if (scoresData.game_id) {
              parsed.gameId = scoresData.game_id;
              parsed.game = scoresData.game;
              parsed.gameDate = scoresData.game_date;
              break;
            }
          }
        }
      } catch(e) {}
    } else {
      // Single non-live bet: ground it through the unified engine.
      parsed = await groundBet(parsed, oddsData);
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
            model: "claude-sonnet-4-6",
            max_tokens: 1000,
            system: "You are Hunter. Extract bet details from a sportsbook screenshot. Normalize odds to standard American format (even money = +100, run lines at even = +100). For STRAIGHT BETS return ONLY raw JSON: {\"sport\":\"...\",\"game\":\"...\",\"betType\":\"...\",\"odds\":\"...\",\"pick\":\"...\",\"amount\":0,\"toWin\":0,\"gameDate\":\"YYYY-MM-DD\",\"gameTime\":\"HH:MM\",\"pitcher\":\"LAST_NAME_ONLY_or_null\",\"confidence\":95}. For baseball bets, set pitcher to the starting pitcher last name visible on the slip (e.g. \"SPROAT\"). For all other sports set pitcher to null. For PARLAYS, TEASERS, and SGPs return ONLY raw JSON: {\"betType\":\"parlay\",\"ticketNumber\":\"...\",\"amount\":0,\"toWin\":0,\"odds\":\"...\",\"teaserPoints\":null,\"gameDate\":\"YYYY-MM-DD\",\"legs\":[{\"sport\":\"...\",\"game\":\"...\",\"pick\":\"...\",\"odds\":\"...\",\"gameDate\":\"YYYY-MM-DD\",\"gameTime\":\"HH:MM\"}],\"confidence\":95}. For TEASERS set betType to \"teaser\" and teaserPoints to the point value. For SGPs set betType to \"sgp\". PARLAY LEG GAME FIELD: If a parlay leg shows only one team with no opponent visible (typical for moneyline-style listings), set that leg's \"game\" to just \"[Team]\" with no opponent — same rule as single bets. NEVER infer, guess, or invent an opponent or matchup for a leg's \"game\" field, even if a plausible-looking matchup (e.g. a promo banner for an unrelated game/sport elsewhere on screen) appears nearby. If genuinely unclear, use an empty string. TRYINK FORMAT: Bets show as [#]. [Team] [Pitcher1] - R / [Pitcher2] - L LP [spread] [odds]. The format is ALWAYS: bet number, then team name, then two pitcher names separated by /, then spread (if any), then odds. Extract ONLY the team name — stop at the first all-caps surname after the team name. SPREAD DETECTION: In TryInk format, \"- R\" and \"- L\" after pitcher names indicate pitcher handedness (Right/Left) — NOT a spread. A RUN LINE bet requires an explicit number like -1.5 or +1.5 on the line AFTER the pitcher names. Preserve the sign exactly — if you see -1½ set pick to \"[Team] -1.5\", if you see +1½ set pick to \"[Team] +1.5\". The odds are the LAST number on the line. FIRST HALF DETECTION: If the bet line starts with \"1H\" (e.g. \"1975. 1H Los Angeles Dodgers...\"), this is a FIRST HALF bet. Set betType to \"1H\" and set pick to \"[Team] 1H ML\" (or \"[Team] 1H -1.5\" if there is a spread). FIRST 5 INNINGS DETECTION: If the bet line contains \"1st 5\", \"F5\", \"First 5\", or \"First 5 Innings\", this is an MLB-ONLY first-5-innings bet — NOT the same thing as FIRST HALF/1H, which does not apply to baseball. Set betType to \"F5\" and ALWAYS include the literal text \"F5\" in the pick, e.g. \"[Team] F5 ML\" or \"[Team] F5 -1.5\". Never label an MLB first-5-innings bet as \"1H\". TEAM TOTAL DETECTION: If you see \"Team Total\" or \"Team total points\" in the bet description, this is a TEAM TOTAL bet — only one team's score counts. Set betType to \"teamtotal\" and set pick to \"[Team Name] Over X.X\" or \"[Team Name] Under X.X\" — always include the team name. Example: \"Milwaukee Brewers Over 4.5\". TOTAL DETECTION: If you see \"U\" or \"O\" followed by a number (e.g. \"U 7½\", \"O 8.5\") and it is NOT a team total, this is a GAME TOTAL bet. Set pick to \"Under X.X\" or \"Over X.X\" and betType to \"total\". Do NOT include team name in the pick. If NO spread and NO total, set pick to \"[Team] ML\". Set game to just \"[Team]\" with no opponent. Never include pitcher names in game or pick fields. The gameDate on TryInk slips is shown in the ticket timestamp at the top (e.g. \"2026/06/15\") — use that date, NOT any date embedded in the bet line. ODDS: If odds show as \"Pk\" or \"PK\" that means pick'em = +100. EXCEPTION: For LIVE bets (when \"Live:\" is present on the slip), \"Pk\" is a status indicator — NOT the odds. For live bets always extract the odds from the bet detail line itself (e.g. \"+128\" or \"-140\"), never use \"Pk\" as the odds. TRYINK SOCCER PARLAY FORMAT: Soccer parlays on tryInk show as \"Props: [number]\" with multiple bet details listed. Each line with a team name or player name is a separate leg. A bet showing \"[Player] 1+ Score or Assist, to win: [Team] (Game)\" contains TWO legs: (1) [Team] ML and (2) [Player] 1+ Score or Assist prop. Parse these as a parlay with both legs. LIVE BET DETECTION: If the slip contains \"Live:\" followed by a number (e.g. \"Live: 302296347\"), this is a LIVE BET placed during an in-progress game. For live bets: (1) set isLive to true in the JSON, (2) use the ticket timestamp date as gameDate — NOT today's date. The ticket timestamp format is \"YYYY/MM/DD HH:MM:SS AM/PM\" — extract YYYY-MM-DD from it. Important: if the ticket time is after midnight ET but the game started the previous calendar day, still use the ticket timestamp date as gameDate. (3) gameTime should be left empty for live bets. SCHEDULED DATE DETECTION: If the slip shows a scheduled date and time (e.g. \"Scheduled: June 24, 2026 9:45 PM EST\"), extract the date directly as gameDate in YYYY-MM-DD format and gameTime in 24hr ET format. Do NOT convert timezones — use the date exactly as written. \"June 24, 2026 9:45 PM EST\" → gameDate: \"2026-06-24\", gameTime: \"21:45\". GENERAL RULES: Never guess any text you cannot clearly read. Use empty strings for missing fields. gameDate in ET. gameTime in 24hr ET format. If unclear: {\"error\":\"reason\"}.",
            messages: [{ role: "user", content: [
              { type: "image", source: { type: "base64", media_type: file.type || "image/jpeg", data: base64 } },
              { type: "text", text: "Extract the bet details from this slip." }
            ]}]
          })
        });
        const data = await response.json();
        const text = (data.content || []).filter(c => c.type === "text").map(c => c.text).join("");
        let parsed = JSON.parse(text.replace(/```json|```/g, "").trim());
        try {
          const oddsRes = await fetch("/api/odds", { method: "POST" });
          const oddsData = await oddsRes.json();
          if (oddsData.games) {
            // Same unified grounding as handleFile — one engine, both paths.
            if (parsed.legs && parsed.legs.length > 0) {
              parsed.legs = await Promise.all(parsed.legs.map(leg => groundBet(leg, oddsData)));
              const legStates = parsed.legs.map(l => l.provenance?.game || "unmatched");
              const worst = legStates.includes("unmatched") ? "unmatched"
                          : legStates.includes("ambiguous") ? "ambiguous"
                          : legStates.every(s => s === "read") ? "read" : "matched";
              parsed.provenance = {
                game: worst,
                autoSettleable: parsed.legs.every(l => l.provenance?.autoSettleable),
              };
            } else if (!parsed.isLive) {
              parsed = await groundBet(parsed, oddsData);
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

  // Apply an inline edit. `patch` merges into the target bet/leg, and any field
  // the user sets by hand gets provenance 'user_confirmed' so it stops gating.
  const applyFieldEdit = (patch, meta) => {
    const withProv = (bet) => {
      const prov = { ...(bet.provenance || {}) };
      if (meta?.confirmField) prov[meta.confirmField] = "user_confirmed";
      if (meta?.markGame) prov.game = "user_confirmed";
      if (meta?.autoSettleable !== undefined) prov.autoSettleable = meta.autoSettleable;
      return { ...bet, ...patch, provenance: prov };
    };
    if (editing?.target === "single") {
      setExtractedBet(prev => withProv(prev));
    } else if (editing?.target === "queue") {
      setSlips(prev => prev.map((s, i) => i === currentSlip ? { ...s, parsed: withProv(s.parsed) } : s));
    } else if (typeof editing?.target === "number") {
      const legIdx = editing.target;
      const upd = (bet) => ({ ...bet, legs: bet.legs.map((l, i) => i === legIdx ? withProv(l) : l) });
      setExtractedBet(prev => upd(prev));
    }
    setEditing(null);
  };

  // A bet is safe to log without gating when it has no unresolved critical
  // issues. Parlays: every leg must be clear.
  const betIsClear = (bet) => {
    if (!bet) return true;
    if (bet.legs && bet.legs.length) return bet.legs.every(l => criticalIssues(l).length === 0);
    return criticalIssues(bet).length === 0;
  };

  // Resolve the bet/leg currently being edited and its live value.
  const editingTarget = () => {
    if (!editing) return null;
    if (editing.target === "single") return extractedBet;
    if (editing.target === "queue") return slips[currentSlip]?.parsed;
    if (typeof editing.target === "number") return extractedBet?.legs?.[editing.target];
    return null;
  };

  return (
    <div style={S.snap.wrap}>
      {editing && (() => {
        const tgt = editingTarget();
        const field = editing.field;
        const isGame = field === "game";
        const gameIssue = isGame && criticalIssues(tgt || {}).some(i => i.field === "game");
        const candidates = isGame ? (tgt?.provenance?.candidates || []) : [];
        const curVal = field === "gameDate" ? (tgt?.gameDate || "") : (tgt?.[field] ?? "");
        const labelMap = { game: "Game", gameDate: "Date", gameTime: "Time", pick: "Pick", odds: "Odds", amount: "Wager", toWin: "To Win", sport: "Sport" };
        // A resolved game edit patches game fields and marks provenance so the
        // gate clears — grounded:true means we attached a real game_id.
        const resolveGame = (r) => {
          const patch = {};
          if (r.game) patch.game = r.game;
          if (r.gameId) patch.gameId = r.gameId;
          if (r.mlbGamePk) patch.mlbGamePk = r.mlbGamePk;
          if (r.gameDate) patch.gameDate = r.gameDate;
          if (r.gameTime) patch.gameTime = r.gameTime;
          applyFieldEdit(patch, { markGame: true, confirmField: "date", autoSettleable: !!r.grounded });
        };
        return (
          <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 50, display: "flex", alignItems: "flex-end", justifyContent: "center" }} onClick={() => setEditing(null)}>
            <div onClick={e => e.stopPropagation()} style={{ background: "#12121a", border: "1px solid #2a2a38", borderRadius: "16px 16px 0 0", padding: 18, width: "100%", maxWidth: 480 }}>
              <div style={{ color: "#f5a623", fontWeight: 700, fontSize: 15, marginBottom: 12 }}>Edit {labelMap[field] || field}</div>
              {isGame && candidates.length > 0 ? (
                <>
                  <div style={{ color: "#888", fontSize: 12, marginBottom: 10 }}>Which game did you bet? Hunter found more than one match.</div>
                  {candidates.map((c, k) => (
                    <button key={k}
                      onClick={() => resolveGame({ ...c, grounded: true })}
                      style={{ width: "100%", textAlign: "left", background: "#0f0f18", border: "1px solid #2a2a38", borderRadius: 10, padding: "12px 14px", marginBottom: 8, color: "#fff", fontSize: 14, cursor: "pointer" }}
                    >
                      <div style={{ fontWeight: 600 }}>{c.game}</div>
                      <div style={{ color: "#888", fontSize: 12, marginTop: 2 }}>{c.gameDate}{c.gameTime ? ` · ${c.gameTime}` : ""}</div>
                    </button>
                  ))}
                </>
              ) : isGame && gameIssue ? (
                <GameResolver
                  teamText={tgt?.game}
                  sport={tgt?.sport}
                  sportKey={normalizeSport(tgt?.sport || "")}
                  initialDate={tgt?.gameDate || ""}
                  onResolve={resolveGame}
                  onCancel={() => setEditing(null)}
                />
              ) : (
                <EditField
                  initial={curVal}
                  type={field === "gameDate" ? "date" : (field === "amount" || field === "toWin" ? "number" : "text")}
                  onSave={(val) => {
                    const patch = field === "amount" ? { amount: parseFloat(val) || 0 }
                                : field === "toWin" ? { toWin: parseFloat(val) || 0 }
                                : { [field]: val };
                    const meta = field === "gameDate" ? { confirmField: "date" }
                               : field === "game" ? { markGame: true }
                               : {};
                    applyFieldEdit(patch, meta);
                  }}
                  onCancel={() => setEditing(null)}
                />
              )}
            </div>
          </div>
        );
      })()}
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
      {stage === "confirm" && extractedBet && (() => {
        const issues = criticalIssues(extractedBet);
        const clear = issues.length === 0;
        const q = pickQualifier(extractedBet.pick);
        return (
        <div style={{ padding: 16 }}>
          <div style={{ color: "#2ecc71", fontSize: 17, fontWeight: 700, marginBottom: 6 }}>✅ Hunter read your slip</div>
          <div style={{ color: clear ? "#888" : "#f5a623", fontSize: 12, marginBottom: 10 }}>
            {clear
              ? "Everything checks out — tap any field to change it, or log the bet."
              : "Hunter needs you to confirm a detail before this can settle automatically. Tap the highlighted field."}
          </div>
          {imagePreview && <img src={imagePreview} alt="slip" style={{ width: "100%", maxHeight: 150, objectFit: "contain", marginBottom: 12 }} />}
          <div style={{ background: "#0f0f18", border: `1px solid ${clear ? "#2a2a38" : "#5a4a1e"}`, borderRadius: 14, padding: "6px 16px", marginBottom: 14 }}>
            <VerifyRow label="Sport" value={extractedBet.sport} onEdit={() => setEditing({ target: "single", field: "sport" })} />
            <VerifyRow label="Game" value={extractedBet.game} flagged={issues.some(i => i.field === "game")} onEdit={() => setEditing({ target: "single", field: "game" })} />
            <VerifyRow label="Pick" value={extractedBet.pick} onEdit={() => setEditing({ target: "single", field: "pick" })} />
            {q && <VerifyRow label="Bet type" value={q} onEdit={() => setEditing({ target: "single", field: "pick" })} />}
            <VerifyRow label="Odds" value={extractedBet.odds} onEdit={() => setEditing({ target: "single", field: "odds" })} />
            <VerifyRow label="Wager" value={`$${extractedBet.amount}`} onEdit={() => setEditing({ target: "single", field: "amount" })} />
            <VerifyRow label="To Win" value={`$${extractedBet.toWin}`} onEdit={() => setEditing({ target: "single", field: "toWin" })} />
            <VerifyRow label="Date" value={extractedBet.gameDate} flagged={issues.some(i => i.field === "date")} onEdit={() => setEditing({ target: "single", field: "gameDate" })} />
            <VerifyRow label="Time" value={extractedBet.gameTime} onEdit={() => setEditing({ target: "single", field: "gameTime" })} />
          </div>
          {!clear && (
            <div style={{ color: "#f5a623", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>
              {issues.map((iss, k) => <div key={k}>⚠️ {iss.label}</div>)}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => onCancel(extractedBet)} style={S.snap.editBtn}>Edit Manually</button>
            <button
              disabled={!clear || logging}
              onClick={() => { if (clear && !logging) { setLogging(true); onConfirm(extractedBet).then(() => onDone && onDone()); }}}
              style={{ ...S.snap.confirmBtn, opacity: clear ? 1 : 0.4, cursor: clear ? "pointer" : "not-allowed" }}
            >
              {clear ? "Log This Bet" : "Confirm to Log"}
            </button>
          </div>
        </div>
        );
      })()}
      {stage === "confirmParlay" && extractedBet && (() => {
        const legIssues = (extractedBet.legs || []).map(l => criticalIssues(l));
        const clear = legIssues.every(li => li.length === 0);
        return (
        <div style={{ padding: 16 }}>
          <div style={{ color: "#2ecc71", fontSize: 17, fontWeight: 700, marginBottom: 4 }}>✅ Hunter read your slip</div>
          <div style={{ color: "#f5a623", fontSize: 13, fontWeight: 700, marginBottom: 8 }}>
            {extractedBet.betType?.toUpperCase()} · {extractedBet.legs?.length} Legs · {extractedBet.odds} · ${extractedBet.amount} to win ${extractedBet.toWin}
            {extractedBet.teaserPoints ? ` · ${extractedBet.teaserPoints} pts` : ""}
          </div>
          <div style={{ color: clear ? "#888" : "#f5a623", fontSize: 12, marginBottom: 10 }}>
            {clear ? "All legs check out — tap any field to change it, or log the bet." : "One or more legs need a detail confirmed before this can settle automatically."}
          </div>
          {imagePreview && <img src={imagePreview} alt="slip" style={{ width: "100%", maxHeight: 110, objectFit: "contain", marginBottom: 12 }} />}
          <div style={{ marginBottom: 14, display: "flex", flexDirection: "column", gap: 10 }}>
            {extractedBet.legs?.map((leg, i) => {
              const li = legIssues[i];
              const legClear = li.length === 0;
              const q = pickQualifier(leg.pick);
              return (
                <div key={i} style={{ background: "#0f0f18", border: `1px solid ${legClear ? "#2a2a38" : "#5a4a1e"}`, borderRadius: 12, padding: "4px 14px" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 0" }}>
                    <span style={{ color: legClear ? "#2ecc71" : "#f5a623", fontSize: 11, fontWeight: 700 }}>LEG {i + 1} {legClear ? "✓" : "⚠️"}</span>
                    <span style={{ color: "#888", fontSize: 11 }}>{leg.sport} · {leg.odds}</span>
                  </div>
                  <VerifyRow label="Pick" value={leg.pick} onEdit={() => setEditing({ target: i, field: "pick" })} />
                  {q && <VerifyRow label="Bet type" value={q} onEdit={() => setEditing({ target: i, field: "pick" })} />}
                  <VerifyRow label="Game" value={leg.game} flagged={li.some(x => x.field === "game")} onEdit={() => setEditing({ target: i, field: "game" })} />
                  <VerifyRow label="Date" value={leg.gameDate} flagged={li.some(x => x.field === "date")} onEdit={() => setEditing({ target: i, field: "gameDate" })} />
                  {!legClear && <div style={{ color: "#f5a623", fontSize: 11, padding: "4px 0 8px", lineHeight: 1.5 }}>{li.map((x, k) => <div key={k}>⚠️ {x.label}</div>)}</div>}
                </div>
              );
            })}
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => onCancel(extractedBet)} style={S.snap.editBtn}>Edit Manually</button>
            <button
              disabled={!clear || logging}
              onClick={() => { if (clear && !logging) { setLogging(true); onConfirm(extractedBet).then(() => onDone && onDone()); }}}
              style={{ ...S.snap.confirmBtn, opacity: clear ? 1 : 0.4, cursor: clear ? "pointer" : "not-allowed" }}
            >
              {clear ? "Log This Bet" : "Confirm to Log"}
            </button>
          </div>
        </div>
        );
      })()}
      {stage === "queue" && slips[currentSlip] && (() => {
        const p = slips[currentSlip].parsed;
        const issues = p ? criticalIssues(p) : [];
        const clear = !p || issues.length === 0;
        const q = p ? pickQualifier(p.pick) : null;
        return (
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
              <div style={{ color: clear ? "#888" : "#f5a623", fontSize: 12, marginBottom: 8 }}>
                {clear ? "Tap any field to change it, then Log It — or Skip." : "Confirm the highlighted detail before this slip can settle automatically."}
              </div>
              {slips[currentSlip].preview && <img src={slips[currentSlip].preview} alt="slip" style={{ width: "100%", maxHeight: 130, objectFit: "contain", marginBottom: 12 }} />}
              <div style={{ background: "#0f0f18", border: `1px solid ${clear ? "#2a2a38" : "#5a4a1e"}`, borderRadius: 14, padding: "6px 16px", marginBottom: 14 }}>
                <VerifyRow label="Sport" value={p.sport} onEdit={() => setEditing({ target: "queue", field: "sport" })} />
                <VerifyRow label="Game" value={p.game} flagged={issues.some(i => i.field === "game")} onEdit={() => setEditing({ target: "queue", field: "game" })} />
                <VerifyRow label="Pick" value={p.pick} onEdit={() => setEditing({ target: "queue", field: "pick" })} />
                {q && <VerifyRow label="Bet type" value={q} onEdit={() => setEditing({ target: "queue", field: "pick" })} />}
                <VerifyRow label="Odds" value={p.odds} onEdit={() => setEditing({ target: "queue", field: "odds" })} />
                <VerifyRow label="Wager" value={`$${p.amount}`} onEdit={() => setEditing({ target: "queue", field: "amount" })} />
                <VerifyRow label="Date" value={p.gameDate} flagged={issues.some(i => i.field === "date")} onEdit={() => setEditing({ target: "queue", field: "gameDate" })} />
                <VerifyRow label="Time" value={p.gameTime} onEdit={() => setEditing({ target: "queue", field: "gameTime" })} />
              </div>
              {!clear && <div style={{ color: "#f5a623", fontSize: 12, marginBottom: 12, lineHeight: 1.5 }}>{issues.map((iss, k) => <div key={k}>⚠️ {iss.label}</div>)}</div>}
              <div style={{ display: "flex", gap: 10 }}>
                <button onClick={skipSlip} style={S.snap.editBtn}>Skip</button>
                <button
                  disabled={!clear}
                  onClick={confirmSlip}
                  style={{ ...S.snap.confirmBtn, opacity: clear ? 1 : 0.4, cursor: clear ? "pointer" : "not-allowed" }}
                >
                  {!clear ? "Confirm to Log" : currentSlip < slips.length - 1 ? `Log It (${slips.length - currentSlip - 1} more)` : "Log It"}
                </button>
              </div>
            </>
          )}
        </div>
        );
      })()}
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

// ── Hunter Chat: sport-specific research library ──────────────────────────
// Kept as data, not inline in the prompt string, so a given message only
// pulls in the sport section(s) and prop playbook(s) it actually needs
// instead of all eleven sports + seven prop playbooks every single turn.

// Maps The Odds API's sport_key (as returned by /api/odds) to our internal
// sport ids, so tonight's REAL slate can tell us which sport a mentioned
// team belongs to.
const ODDS_SPORT_KEY_MAP = {
  baseball_mlb: "mlb",
  basketball_nba: "nba",
  americanfootball_nfl: "nfl",
  icehockey_nhl: "nhl",
  basketball_ncaab: "ncaab",
  americanfootball_ncaaf: "ncaaf",
  mma_mixed_martial_arts: "ufc",
  soccer_usa_mls: "soccer",
  soccer_epl: "soccer",
  soccer_spain_la_liga: "soccer",
  soccer_germany_bundesliga: "soccer",
  soccer_italy_serie_a: "soccer",
  soccer_france_ligue_one: "soccer",
  soccer_uefa_champs_league: "soccer",
  soccer_uefa_europa_league: "soccer",
  soccer_conmebol_copa_libertadores: "soccer",
  soccer_fifa_world_cup: "soccer",
};

// Fallback keyword signals for sports the odds feed doesn't carry (golf,
// tennis) or when the user names a sport/league directly instead of a team.
const SPORT_KEYWORDS = {
  mlb: ["mlb", "baseball"],
  nba: ["nba", "basketball"],
  nfl: ["nfl", "football"],
  nhl: ["nhl", "hockey"],
  soccer: ["soccer", "premier league", "la liga", "bundesliga", "serie a", "champions league", "mls"],
  ufc: ["ufc", "mma", "fight card", "octagon"],
  golf: ["golf", "pga", "masters", "strokes gained", "tee time"],
  tennis: ["tennis", "atp", "wta", "wimbledon", "roland garros"],
  ncaaf: ["college football", "ncaaf", "cfb"],
  ncaab: ["college basketball", "ncaab", "cbb", "march madness"],
  collegebaseball: ["college baseball", "ncaa baseball"],
};

// Words/phrases signaling the user is asking about a player prop rather
// than a straight game outcome — gates the (large) prop playbooks so they
// don't ride along on every ordinary game question.
const PROP_SIGNAL_WORDS = [
  "prop", "props", "points", "rebounds", "assists", "strikeouts", "receptions",
  "receiving yards", "rushing yards", "passing yards", "touchdown", " td ",
  "home run", " hr ", "hits", "rbi", "goals", "shots on goal", "saves",
  "sacks", "over/under for", "o/u for", "anytime scorer",
];

function hasPropSignal(text) {
  const lower = ` ${(text || "").toLowerCase()} `;
  return PROP_SIGNAL_WORDS.some((w) => lower.includes(w));
}

// Scans recent chat text for (a) a real team name from tonight's actual
// odds feed — the same ground-truth source Hunter's data-integrity rules
// already trust — or (b) a direct sport/league mention, and returns the
// set of sports genuinely relevant to this message. Errs toward including
// a sport when in doubt (substring match), never toward guessing one in.
function detectRelevantSports(text, oddsGames) {
  const lower = (text || "").toLowerCase();
  const sports = new Set();

  for (const g of oddsGames || []) {
    const sportId = ODDS_SPORT_KEY_MAP[g.sport_key];
    if (!sportId) continue;
    for (const name of [g.home_team, g.away_team].filter(Boolean)) {
      const last = name.split(" ").pop().toLowerCase();
      if (lower.includes(name.toLowerCase()) || (last.length > 3 && lower.includes(last))) {
        sports.add(sportId);
      }
    }
  }

  for (const [sportId, words] of Object.entries(SPORT_KEYWORDS)) {
    if (words.some((w) => lower.includes(w))) sports.add(sportId);
  }

  return sports;
}

const SPORT_FACTOR_BLOCKS = {
  mlb: `MLB: Starting pitcher ERA, xERA, xFIP, WHIP, K/9, bullpen ERA and availability (specific reliever usage last 3 days — who is unavailable), batting splits vs LHP/RHP, last 5 starts performance, park factors, weather (wind speed/direction, temp), day vs night splits, umpire zone tendency (chase rate, K rate, walk rate), catcher framing stats, platoon matchup % (L vs L, R vs R), park factors by handedness, pitcher first inning ERA, opposing lineup vs velocity type, pitcher pitch count history last 2 starts.`,
  nba: `NBA: Pace of play, offensive/defensive rating, starter PPG, bench PPG, offensive rebound rank, three point attempts per game, foul shots per game, turnovers per game, injury report, back-to-back schedule, home/away splits, referee foul rate (high-foul refs inflate totals and FT lines), second game of back-to-back splits, clutch time performance (last 5 min of close games), bench scoring differential, opponent pace ranking.`,
  nfl: `NFL: O-line vs D-line matchup (PFF grades), QB pressure rate, QB rushing ability, QB arm strength and accuracy, offensive pass efficiency, offensive rushing efficiency, defensive pass efficiency, defensive rushing efficiency, third down conversion rate, red zone TD% vs FG%, two-minute drill efficiency, OC/DC tendencies, stadium noise factor (road team silent counts), injury report practice designations (Full/Limited/DNP — DNP is a near-flag).`,
  nhl: `NHL: Starting goalie confirmation (NEVER bet without this), save percentage, PDO (shooting% + save% — regresses to mean), team shooting percentage, power play/penalty kill %, faceoff win % (especially offensive zone), high-danger scoring chance rate, referee assignment, goalie back-to-back fatigue splits, power play unit composition and recent PP%.`,
  soccer: `Soccer/MLS: Form last 5, xG for/against, xGA (expected goals against — better than actual goals allowed), home/away record, European hangover, squad rotation risk, referee card rate and penalty call tendency, PPDA press intensity (lower = more aggressive press), travel distance and time zone changes between legs.`,
  ufc: `UFC/MMA: Styles matchup (striker vs grappler, wrestling vs BJJ), recent finishes vs decisions, reach/size, camp quality, weight cut severity (fighters coming down two weight classes), judge assignment (scorecards vary enormously by judge), main event vs undercard performance splits, venue altitude, late replacement flag (< 2 weeks notice = major fade signal).`,
  golf: `Golf: Course history and strokes gained at this specific course (last 3 years), strokes gained categories (approach, putting, off-the-tee, around-the-green), recent form last 4 events, driving distance vs course length fit, scrambling %, birdie rate at this specific course historically, caddie experience and course knowledge, cut line prediction vs current form.`,
  tennis: `Tennis: Surface win %, head to head on surface (hard/clay/grass splits are critical), recent match load and fatigue (back-to-back tournaments, deep runs), injury history on surface, bagel/breadstick rate (dominance metric), tiebreak win %, performance vs top 10 vs lower-ranked opponents, court speed rating, altitude effects (high altitude favors big servers), first serve % trend last 3 matches.`,
  ncaaf: `College Football (NCAAF): Same factors as NFL plus recruiting talent gap (blue chip ratio), home field crowd advantage (especially top 10 atmospheres), conference vs non-conference performance, transfer portal impact on depth, rivalry game motivation overrides recent form, early season conditioning vs late season fatigue.`,
  ncaab: `College Basketball (NCAAB): Same factors as NBA plus recruiting class talent gap, coach tournament experience (some coaches consistently over/underperform seed), conference familiarity (same teams 3-4x/year), home court advantage amplified vs pros, exam week performance dip, early signing period distractions.`,
  collegebaseball: `College Baseball: Same factors as MLB plus mid-week vs weekend rotation impact (aces pitch Fridays), regional weather variability (southern schools play more games, northern schools have rust), regional altitude parks, metal bat rules in some tournaments.`,
};

const PROP_ANALYSIS_PREAMBLE = `PROP BET ANALYSIS — MANDATORY 7-STEP PROCESS:
When analyzing ANY player prop, execute all 7 steps before giving a recommendation:
1. Search "[player name] vs [opponent player/team] career stats head to head"
2. Search "[player name] last 5 [starts/games] stats [year]"
3. Search "[player name] vs [LHP/RHP/position] splits [year]" for platoon data with ACTUAL numbers
4. Search "[stadium/arena/course] [prop category] rate or factor" for venue factors
5. Search "[opponent] vs [prop category] allowed [year]" for defensive matchup
6. Search "THE CASE AGAINST: [opposing player] success vs [player]" — always steelman the other side
7. Check game script projection, weather, umpire/referee tendencies, fatigue/pitch count limits
RULE: Individual matchup history is the PRIMARY signal. Team aggregates are context only. Never lead with team K% when you can lead with batter vs pitcher head-to-head.`;

const PROP_PLAYBOOKS = {
  mlb: `MLB PROP PLAYBOOK:
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
- Check: lineup protection (who bats around this player), park factor, weather/wind, batter recent game log (hot/cold streak)`,
  nfl: `NFL PROP PLAYBOOK:
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
9. CLOSING LINE VALUE: The best bettors in the world beat the closing line consistently. If you can get a number better than where the line closes, you have positive CLV regardless of outcome.`,
  nba: `NBA PROP PLAYBOOK:
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
- Check: game script (blowout = garbage time skews attempts), home/away three point splits`,
  nhl: `NHL PROP PLAYBOOK:
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
- Check: opponent pace and offensive zone time, back-to-back fatigue, game total (low total = fewer shots)`,
  ufc: `UFC PROP PLAYBOOK:
METHOD OF VICTORY PROPS:
- Search "[fighter] finish rate by method KO/TKO vs submission vs decision [year]"
- Search "[opponent] durability and finish rate against [year]"
- Check: styles matchup (wrestler vs striker = likely decision or submission), judge tendencies, championship rounds factor

ROUND PROPS:
- Search "[fighter] average fight length and early finish rate [year]"
- Search "[opponent] cardio and late round performance [year]"
- Check: styles matchup signals early or late finish, fighter motivation, championship rounds vs 3-round bout`,
  golf: `GOLF PROP PLAYBOOK:
MATCHUP/HEAD-TO-HEAD PROPS:
- Search "[player A] vs [player B] head to head matchup results [year]"
- Search "[player] strokes gained [category] at [course name] career"
- Check: tee time draw (weather window), course fit for each player's strengths, recent form trajectory

MAKE/MISS CUT PROPS:
- Search "[player] cut made percentage on [course type] courses [year]"
- Search "[player] recent form and world ranking [year]"
- Check: course difficulty and cut line history, tee time draw, player motivation`,
  tennis: `TENNIS PROP PLAYBOOK:
SETS/GAMES PROPS:
- Search "[player A] vs [player B] head to head sets and games history on [surface]"
- Search "[player] tiebreak win percentage [year]"
- Check: surface-specific dominance, fatigue from previous rounds, weather, ranking gap (one-sided matches go fewer games)`,
};

// ── Hunter Chat ────────────────────────────────────────────────────────────
function HunterChat({ user, bets, userKey, onNav }) {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);
  const bottomRef = useRef(null);
  const initStarted = useRef(false);

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
  const netPL = weekBets.reduce((s, b) => {
    if (b.result === "Win") return s + (calcProfit(b.amount, b.odds) || 0);
    if (b.result === "Loss") return s - b.amount;
    return s;
  }, 0);

  // Same behavioral signals the dashboard's alert banners already compute
  // (5+ bets today, down 50%+ of goal, goal hit) — mirrored here so Hunter
  // actually knows them too, instead of only seeing the raw P&L total and
  // bet count and having to infer everything else on its own.
  const todayET = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
  const todayBetsCount = bets.filter(b => b.gameDate === todayET).length;
  const isDownOver50 = netPL < -(user.goal * 0.5) && bets.length > 0;
  const hasHitGoal = netPL >= user.goal;

  // Load conversation history from Supabase
  useEffect(() => {
    if (!userKey || initStarted.current) return;
    initStarted.current = true;
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
        // Already chatted today — just load it, regardless of intro status
        setMessages(data.map(m => ({ role: m.role, text: m.content })));
      } else if (!user.hunter_intro_shown_at) {
        // Genuinely first-ever session (hunter_intro_shown_at is null).
        // Fires exactly once per user, ever.
        const welcome = { role: 'assistant', text: buildIntroMessage(user) };
        setMessages([welcome]);
        const { error: introInsertError } = await supabase.from('user_conversations').insert({ user_id: userKey, role: 'assistant', content: welcome.text });
        if (introInsertError) {
          // Don't stamp hunter_intro_shown_at if the message never saved —
          // otherwise this user permanently loses the real welcome. It still
          // rendered on screen; next load will correctly retry.
          console.error('Failed to save Hunter intro message, not marking as shown:', introInsertError);
        } else {
          await supabase.from('user_profiles').update({ hunter_intro_shown_at: new Date().toISOString() }).eq('user_id', userKey);
        }
      } else {
        // Returning user, fresh day — personalized to this week's real numbers
        // AND how far into the week it is (weekday / Saturday / Sunday), since
        // the same dollar gap means something different on Wednesday vs Sunday.
        // Order matters: goal-hit is checked first (can only be true once real
        // bets exist), then nothing-logged, then the up/down split on what's left.
        const isSaturday = dayOfWeek === 6;
        const isSunday = dayOfWeek === 0;
        const goalAmt = user.goal;
        const upAmt = netPL.toFixed(0);
        const downAmt = Math.abs(netPL).toFixed(0);
        let welcomeText;

        if (hasHitGoal) {
          if (isSunday) {
            welcomeText = `Last day of the week. You're up $${upAmt} and the week's already a win. Nothing to prove today, lock in those profits. If something worth betting shows up, we'll find it. What's caught your eye?`;
          } else if (isSaturday) {
            welcomeText = `Saturday slate. You're up $${upAmt} this week — goal's hit, and we're playing with a lead into the weekend. Protect it, or add to it if the right spot shows up. What are you looking at today?`;
          } else {
            welcomeText = `New day. New slate. You're up $${upAmt} this week — goal's hit, and we're playing with a lead now. Protect it, or keep building if the right spot shows up. What's on your radar today?`;
          }
        } else if (weekBets.length === 0) {
          if (isSunday) {
            welcomeText = `Last day of the week. Nothing logged yet. If something real shows up today, great. If not, we're not forcing a bet just to chase the goal. Anything you want me to dig into?`;
          } else if (isSaturday) {
            welcomeText = `Saturday slate. Nothing logged yet, with $${goalAmt} still the goal. Plenty of weekend ahead — let's see what's actually worth betting. What are you looking at today?`;
          } else {
            welcomeText = `New day. New slate. $${goalAmt} is the goal this week. We've got all week to get there — no need to force the first move. What's on your radar today?`;
          }
        } else if (netPL > 0) {
          if (isSunday) {
            welcomeText = `Last day of the week. You're up $${upAmt} with a $${goalAmt} goal. If the right plays are there, let's find them. If they're not, we take the winning week. What's caught your eye?`;
          } else if (isSaturday) {
            welcomeText = `Saturday slate. You're up $${upAmt} this week with $${goalAmt} still the goal. Plenty of opportunity left — but we're not forcing anything to get there. What are you looking at today?`;
          } else {
            welcomeText = `New day. New slate. You're up $${upAmt} this week, working toward that $${goalAmt} goal. Nice spot to be in. Let's see what's worth a look today. What's on your radar?`;
          }
        } else {
          if (isSunday) {
            welcomeText = `Last day of the week. We're down $${downAmt}. That doesn't mean we need to make it all back today. Let's find the right bets, not force a comeback. What do you want me to dig into?`;
          } else if (isSaturday) {
            welcomeText = `Saturday slate. We're down $${downAmt} this week with the weekend ahead. No chasing — let's see what's actually worth betting today. What are you looking at?`;
          } else {
            welcomeText = `New day. New slate. We're down $${downAmt} this week — no need to win it back today. Let's just find something worth betting. What's on your radar?`;
          }
        }

        const welcome = { role: 'assistant', text: welcomeText };
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
let todayOddsGames = [];
try {
  const oddsRes = await fetch("/api/odds", { method: "POST" });
  const oddsData = await oddsRes.json();
  const now = new Date();
const cutoff = new Date(now.getTime() + 15 * 60 * 1000);
const upperBound = new Date(now.getTime() + 14 * 60 * 60 * 1000);
const filteredGames = oddsData.games.filter(g => new Date(g.commence_time) > cutoff && new Date(g.commence_time) < upperBound);
todayOddsGames = filteredGames;
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

// Decide which sport section(s) and prop playbook(s) this specific message
// actually needs, instead of sending all eleven sports + seven prop
// playbooks on every single turn. Scans the last few messages (not just
// this one) so a follow-up like "what about his props" still carries the
// sport context from the message before it.
const recentMessagesForDetection = [...messages, newUserMsg].slice(-6).map(m => m.text).join(" \n ");
const relevantSports = detectRelevantSports(recentMessagesForDetection, todayOddsGames);
const propSignal = hasPropSignal(recentMessagesForDetection);
const sportFactorSection = relevantSports.size > 0
  ? "SPORT-SPECIFIC FACTORS:\n" + [...relevantSports].map(id => SPORT_FACTOR_BLOCKS[id]).filter(Boolean).join("\n\n")
  : "";
const propPlaybookText = [...relevantSports].map(id => PROP_PLAYBOOKS[id]).filter(Boolean).join("\n\n");
// Always include the sport-agnostic 7-step process when a prop signal is
// present, even in the rare case no specific sport was identified in the
// recent window — otherwise a cold "give me a good strikeout prop" would
// get no prop discipline at all rather than just missing the sport-specific
// extras.
const propSection = propSignal ? `${PROP_ANALYSIS_PREAMBLE}${propPlaybookText ? "\n\n" + propPlaybookText : ""}` : "";

try {
    const recentMessages = [...messages, newUserMsg].slice(-20);
    const result = await callClaude(
        recentMessages.map(m => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.text })),
        `You are Hunter, the sharp AI sports betting concierge inside Betcierge. Today is ${todayDisplay()}. The current real time right now is ${currentTimeDisplay()} — this is the ONLY current time you know. NEVER estimate, guess, or state a different current time than this, even if a different time would seem more plausible for the conversation. When determining whether a game has started, is in progress, or has already finished, you MUST use this exact time as your reference point — never assume or invent one.

USER CONTEXT:
The user is ${user.name.split(" ")[0]}. Weekly bankroll: $${user.bankroll}. Weekly goal: +$${user.goal}. Current P&L: ${netPL >= 0 ? "+" : ""}$${netPL.toFixed(2)}. Bets logged this week: ${weekBets.length}. Bets logged today: ${todayBetsCount}.${hasHitGoal ? " STATUS: weekly goal already hit." : ""}${isDownOver50 ? " STATUS: down more than 50% of the weekly goal." : ""}${todayBetsCount >= 5 ? " STATUS: 5+ bets already logged today." : ""}

THE WEEK-TO-WEEK PHILOSOPHY — this is not a one-time line, it's the throughline of every conversation:
You and this user set the deal on day one: a $${user.bankroll} weekly bankroll, a +$${user.goal} weekly goal, hit it, lock it in, reset clean Monday. Most bettors give back their best weeks by never knowing when to stop — that discipline is the actual product, not a footnote to it. Right now they're at ${netPL >= 0 ? "+" : ""}$${netPL.toFixed(2)} against that +$${user.goal} goal.

You have two jobs, and when they conflict, protecting the bankroll wins — but the default posture is not caution, it's actively helping them get to that number:
- Goal already hit (see STATUS above): proactively point it out and push to lock it in rather than pressing for more. This is the clean win condition — don't undersell it.
- Down more than half the weekly goal (see STATUS above): this is exactly when the discipline matters most. Don't just answer the bet question — name what's happening, and steer toward a smaller, higher-conviction play or sitting this one out rather than chasing the loss back in one shot.
- 5+ bets already logged today (see STATUS above): say so directly, unprompted. Edge erodes with volume — flag the pace even if they don't ask about it.
- Otherwise — no goal hit, no danger signal, normal pace: your job is straightforwardly to help them find real, well-researched value toward that +$${user.goal} number. Don't manufacture caution that isn't there; being protected into inaction all week isn't a win either.
You are their betting coach first, their research analyst second.

NOTICE ESCALATION, DON'T GATE IT:
Sometimes a user asks for more picks — "more," "what else," "give me another" — not because new information came in, but because they want more action. That's fine, and if there's a real, well-researched play out there, go find it. But keep a running sense, within this conversation, of the total dollars you've already put in front of them today across every play you've recommended — whether or not they've said yes to any of it yet. If that running total is already a meaningful chunk of the $${user.bankroll} weekly bankroll (a rough marker: a quarter or more of it) and the newest ask isn't backed by anything new — no fresh angle, no game you hadn't covered, just "more" — say so plainly before handing over another play: name the running total out loud, note that it's climbing on enthusiasm rather than on new data, and let them decide whether to keep going. Don't refuse and don't lecture — same "name it, don't gate it" posture as everything else here. If the additional plays ARE backed by something real you found, this doesn't apply — that's just good work, keep it coming.

COLLABORATION, NOT AUTHORITY — a standing posture, not a one-time line:
Sports bettors have their own instincts, and most think they're right — sometimes they are. Your research is a strong, data-backed read, not the final word, and that should come through naturally as you get to know this user over time — not just as a closing line tacked onto a formal plan. Stay genuinely open to what they bring: a game they're watching, a play they like, an angle you didn't cover. When they push back or bring their own pick, don't just defer to their confidence, and don't just wave it off either — actually dig into it with real research. If the data backs them up, say so plainly and build on it together. If it doesn't, say that honestly too, explain why, and treat it as a real conversation between two people who know the game, not a correction. When you do deliver a full plan or picks, it's natural to invite that in explicitly — something like "these are my recommendations based on the data, let me know if you've got your eyes on anything and let's dig in" — put it in your own words every time, but don't treat that moment as the only place the door is open. This audience generally already knows how to bet — keep it at that level, no need to explain the basics unless asked.

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
11. UFC LATE REPLACEMENT: Always search "[fighter] replacement [event]" and "[fighter] weigh-in result" before any UFC recommendation. Late replacement < 2 weeks = major fade signal.
12. STATS MUST MATCH THE GAME: Every stat, record, or trend you cite MUST be about one of the two teams/players actually in the game being discussed. If a search result surfaces a stat about a different team or player, ignore it entirely — never let it bleed into the answer. Before including any stat, confirm it belongs to this specific matchup.
13. SPREAD/RUN LINE DIRECTION SELF-CHECK: Before finalizing any spread or run line take, re-read your own reasoning and ask: does this argue the team wins outright by multiple points/runs/goals, or just stays close? If outright, the pick is the negative spread. If just staying close/covering as a dog, the pick is the positive spread. Never let the sign contradict the argument.
14. JUICE THRESHOLD: Never recommend a moneyline at -200 or worse. The implied probability at -200 is 67% — you'd need to be right 2 out of 3 times just to break even, which is not value betting. Point them to the run line/puck line/spread instead, or say the game isn't a good spot.

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

${sportFactorSection}${propSection}
STYLE:
Be sharp, warm, direct. Give a clear recommendation with your confidence level. Lead with the most important insight. Use headers to organize. Never hedge excessively — take a stance. You are their trusted advisor, not a disclaimer machine.

You remember this user's history from previous conversations.${todayPicksContext}${todayOddsContext}`,
        true,
        null,
        4000,
        (chunk) => {
          setMessages(m => {
            const updated = [...m];
            updated[updated.length - 1] = { role: "assistant", text: updated[updated.length - 1].text + chunk };
            return updated;
          });
        },
        (await supabase.auth.getSession()).data.session?.access_token || null,
        true
      );

      if (result.limitReached) {
        const wallText = `That's your three for today, ${user.name.split(' ')[0]}. I'm just getting warmed up though. Unlock unlimited and I'm on call every hour: every game, every line, whenever you need me. Ready to go all in?`;
        setMessages(m => [...m, { role: "assistant", text: wallText, isUpgradeWall: true }]);
        setLoading(false);
        return;
      }
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
              {m.isUpgradeWall && (
                <button onClick={() => onNav('upgrade')} style={{ marginTop: 12, width: '100%', background: '#f5a623', color: '#000', fontWeight: 700, fontSize: 14, padding: '12px', borderRadius: 10, border: 'none', cursor: 'pointer' }}>
                  Unlock Unlimited Hunter →
                </button>
              )}
            </div>
          ))}
        {loading && <div style={{ maxWidth: "88%", padding: "10px 14px", borderRadius: 16, fontSize: 13, background: "#1e1e2e", color: "#888", fontStyle: "italic", alignSelf: "flex-start" }}>Hunter is thinking...</div>}
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
function PicksTab({ userKey, user, session, onNav }) {
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
        .gte('date', '2026-06-11')
.lte('date', new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' }))
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
    if (!w && !l) return '#888';
    if (w > l) return '#2ecc71';
    if (l > w) return '#f5a623';
    return '#f5a623';
  };

  const resultBadge = (result) => {
    if (!result || result === 'Pending') return <span style={{ background: '#1a1a1a', color: '#888', padding: '2px 7px', borderRadius: 4, fontSize: 10, fontWeight: 700 }}>PENDING</span>;
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
        <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 10 }}>Hunter's Record · Since Jun 11</div>

        {!historyLoading && (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1, background: '#0f0f18', border: '1px solid #2a2a38', borderRadius: 10, padding: '10px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#fff' }}>{wins}W-{losses}L</div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Record</div>
              </div>
              <div style={{ flex: 1, background: '#0f0f18', border: '1px solid #2a2a38', borderRadius: 10, padding: '10px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: winRate >= 55 ? '#2ecc71' : '#fff' }}>{winRate}%</div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Win Rate</div>
              </div>
              <div style={{ flex: 1, background: '#0f0f18', border: '1px solid #2a2a38', borderRadius: 10, padding: '10px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: unitsPnl >= 0 ? '#2ecc71' : '#e74c3c' }}>{unitsPnl >= 0 ? '+' : ''}{unitsPnl.toFixed(1)}u</div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>Units</div>
              </div>
              <div style={{ flex: 1, background: '#0f0f18', border: '1px solid #2a2a38', borderRadius: 10, padding: '10px 0', textAlign: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 800, color: parseFloat(roi) >= 0 ? '#2ecc71' : '#e74c3c' }}>
                  {parseFloat(roi) >= 0 ? '+' : ''}{roi}%
                </div>
                <div style={{ fontSize: 10, color: '#888', marginTop: 2 }}>ROI</div>
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
                        <span style={{ fontSize: 11, color: '#888' }}>{dayPicks.length} picks</span>
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
                                  {pick.game_time && <span style={{ fontSize: 10, color: '#888' }}>{pick.game_time}</span>}
                                </div>
                                <div style={{ fontSize: 11, color: '#666', marginBottom: 2 }}>{pick.game}</div>
                                <div style={{ fontSize: 13, fontWeight: 700, color: '#fff' }}>{pick.pick}</div>
                                <div style={{ fontSize: 10, color: '#f5a623', marginTop: 3 }}>{pick.units || 1}U</div>
                                {pick.insight && !pick.insight.startsWith('**') && <div style={{ fontSize: 11, color: '#888', marginTop: 4, lineHeight: 1.4 }}>{pick.insight}</div>}
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
      <div style={{ fontSize: 11, fontWeight: 700, color: '#888', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 12 }}>Today's Picks</div>

      {lastUpdated && (
        <div style={{ color: "#888", fontSize: 12, marginBottom: 14 }}>
          Updated {new Date(lastUpdated).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York' })} ET · {new Date(lastUpdated).toLocaleDateString()}
        </div>
      )}

      {loading && (
        <div style={{ padding: "40px 0", textAlign: "center" }}>
          <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
          <div style={{ width: 28, height: 28, border: "3px solid #2a2a38", borderTopColor: "#f5a623", borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 12px" }} />
          <div style={{ color: "#888", fontSize: 13 }}>Loading today's picks...</div>
        </div>
      )}

      {!loading && picks.length === 0 && (
        <div style={{ textAlign: "center", padding: 40 }}>
          <div style={{ fontSize: 40, marginBottom: 12 }}>🕐</div>
          <div style={{ color: "#fff", fontSize: 16, fontFamily: "'Cormorant Garamond',serif", fontWeight: 700, marginBottom: 8 }}>Still hunting</div>
          <div style={{ color: "#888", fontSize: 13 }}>Lineups aren't locked yet — Hunter won't call a play until they are.</div>
        </div>
      )}

      {!loading && picks.map((pick, i) => {
        const locked = i > 0 && !isPaid(user);
        return (
        <div key={i} style={{ background: "#0f0f18", border: `1px solid ${locked ? '#1e1e2e' : '#2a2a38'}`, borderRadius: 14, padding: 16, marginBottom: 12, position: 'relative', opacity: 1 }}>
          {locked && <div style={{ position: 'absolute', inset: 0, borderRadius: 14, backdropFilter: 'blur(6px)', WebkitBackdropFilter: 'blur(6px)', zIndex: 1 }} />}
          {locked && (
            <div style={{ position: 'absolute', inset: 0, borderRadius: 14, background: 'rgba(10,10,15,0.85)', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', zIndex: 2, gap: 8 }}>
              <div style={{ fontSize: 28 }}>🔒</div>
              <div style={{ color: '#fff', fontSize: 14, fontWeight: 700, fontFamily: "'Cormorant Garamond',serif" }}>Team Members Only</div>
              <div style={{ color: '#888', fontSize: 12, marginBottom: 8 }}>Start your 3-day free trial</div>
              <button onClick={() => onNav('upgrade')} style={{ background: '#f5a623', color: '#000', fontWeight: 700, fontSize: 13, padding: '8px 20px', borderRadius: 8, border: 'none', cursor: 'pointer' }}>
                Upgrade →
              </button>
            </div>
          )}
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
        );
      })}
    </div>
  );
}
// ── Access Control ────────────────────────────────────────────────────────
// Tier-agnostic — delegates to isEntitled() in lib/pricing.js, which only
// asks "is this user a paying subscriber," never compares against a
// specific tier name string.
function isPaid(user) {
  return isEntitled(user);
}

function isOnTrial(user) {
  if (!user?.trial_ends_at) return false;
  return new Date(user.trial_ends_at) > new Date();
}
// ── Dashboard ──────────────────────────────────────────────────────────────
function Dashboard({ user, bets, onNav, userKey, unreadCount, showNotifs, setShowNotifs, markAllRead, onAddBet }) {
  const hour = new Date().getHours();
  const [editingPL, setEditingPL] = useState(false);
  const [plInput, setPlInput] = useState("");
  const [savingPL, setSavingPL] = useState(false);

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

  // Lifetime record (all settled bets, no date filter)
  const settledLifetime = bets.filter(b => b.result === "Win" || b.result === "Loss");
  const lifetimeWins = settledLifetime.filter(b => b.result === "Win").length;
  const lifetimeLosses = settledLifetime.filter(b => b.result === "Loss").length;
  const lifetimePL = settledLifetime.reduce((s, b) => {
    if (b.result === "Win") return s + (calcProfit(b.amount, b.odds) || 0);
    return s - b.amount;
  }, 0);
  const lifetimeRisked = settledLifetime.reduce((s, b) => s + (b.amount || 0), 0);
  const lifetimeRoi = lifetimeRisked > 0 ? (lifetimePL / lifetimeRisked) * 100 : 0;

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
          <div style={S.greeting}>{hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening"}, {user.name.split(" ")[0]}</div>
          <div style={{ color: "#888", fontSize: 13, marginTop: 2 }}>{todayDisplay()}</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 4 }}>
  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
    <div style={S.logo}>BETCIERGE</div>
    <button onClick={() => { setShowNotifs(!showNotifs); if (!showNotifs) markAllRead(); }} style={{ background: "none", border: "none", cursor: "pointer", position: "relative", padding: 0, marginTop: 2 }}>
      <span style={{ fontSize: 16 }}>🔔</span>
      {unreadCount > 0 && <span style={{ position: "absolute", top: -4, right: -4, background: "#e74c3c", color: "#fff", borderRadius: "50%", fontSize: 9, fontWeight: 700, width: 14, height: 14, display: "flex", alignItems: "center", justifyContent: "center" }}>{unreadCount}</span>}
    </button>
  </div>
  <button onClick={() => supabase.auth.signOut()} style={{ background: "none", border: "none", color: "#888", fontSize: 11, cursor: "pointer", padding: 0 }}>Sign out</button>
</div>
      </div>

      {alerts.map((a, i) => <Alert key={i} {...a} />)}

      {/* Upgrade Banner — show for free users */}
      {!isPaid(user) && (
        <div onClick={() => onNav('upgrade')} style={{ background: 'linear-gradient(135deg, #1a1020, #0f0f18)', border: '1px solid #f5a623', borderRadius: 14, padding: '14px 16px', marginBottom: 16, cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ color: '#f5a623', fontSize: 13, fontWeight: 700, marginBottom: 3 }}>🎯 Start Your Free Trial</div>
            <div style={{ color: '#888', fontSize: 12 }}>3 days free · Full access · Cancel anytime</div>
          </div>
          <div style={{ color: '#f5a623', fontSize: 20 }}>→</div>
        </div>
      )}

      {/* This Week + Lifetime Record — one bordered section */}
      <div style={{ background: "#0f0f18", border: "1px solid #333", borderRadius: 14, padding: "12px 14px", marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
          <div>
            <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>Bankroll</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#f5a623", letterSpacing: -0.5 }}>${currentBankroll.toFixed(0)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 3 }}>This Week · {weekLabel}</div>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "flex-end", gap: 6 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: netPL >= 0 ? "#2ecc71" : "#e74c3c" }}>{netPL >= 0 ? "+$" :"-$"}{Math.abs(netPL).toFixed(0)}</div>
              <button
                onClick={() => { setPlInput(netPL.toFixed(0)); setEditingPL(true); }}
                style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, padding: 0, color: "#888" }}
                aria-label="Edit weekly P&L"
              >✏️</button>
            </div>
            <div style={{ fontSize: 11, color: "#888", marginTop: 2 }}>Week P&L · {goalPct.toFixed(0)}% of ${user.goal} goal</div>
            {editingPL && (
              <div style={{ marginTop: 8, display: "flex", gap: 6, justifyContent: "flex-end", alignItems: "center" }}>
                <input
                  type="number"
                  value={plInput}
                  onChange={(e) => setPlInput(e.target.value)}
                  placeholder="Set total week P&L"
                  style={{ width: 110, background: "#13131a", border: "1px solid #2a2a3a", borderRadius: 6, color: "#fff", fontSize: 13, padding: "6px 8px", textAlign: "right" }}
                />
                <button
                  disabled={savingPL || plInput === ""}
                  onClick={async () => {
                    const target = parseFloat(plInput);
                    if (isNaN(target)) return;
                    const diff = target - netPL;
                    if (Math.abs(diff) < 0.01) { setEditingPL(false); return; }
                    setSavingPL(true);
                    const todayStr = new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
                    await onAddBet({
                      sport: "Other",
                      game: "Manual Adjustment",
                      betType: "manual_adjustment",
                      pick: "Manual P&L Adjustment",
                      odds: "+100",
                      amount: Math.abs(diff),
                      type: "Planned",
                      result: diff >= 0 ? "Win" : "Loss",
                      isToday: true,
                      gameDate: todayStr,
                      gameTime: null,
                      gameId: null,
                      toWin: diff >= 0 ? diff : null,
                    });
                    setSavingPL(false);
                    setEditingPL(false);
                  }}
                  style={{ background: "#f5a623", border: "none", borderRadius: 6, color: "#0a0a0f", fontSize: 12, fontWeight: 700, padding: "6px 10px", cursor: "pointer", opacity: savingPL ? 0.6 : 1 }}
                >{savingPL ? "..." : "Save"}</button>
                <button
                  onClick={() => setEditingPL(false)}
                  style={{ background: "none", border: "none", color: "#888", fontSize: 12, cursor: "pointer" }}
                >Cancel</button>
              </div>
            )}
          </div>
        </div>
        <div style={{ display: "flex", gap: 6 }}>
          {[
            { val: wins.length, lbl: "W", color: "#2ecc71" },
            { val: losses.length, lbl: "L", color: "#e74c3c" },
            { val: atRisk > 0 ? `$${atRisk}` : "—", lbl: "At Risk", color: "#f5a623" },
            { val: `$${weekBets.reduce((s, b) => s + b.amount, 0)}`, lbl: "Wagered", color: "#888" },
          ].map((s, i) => (
            <div key={i} style={{ flex: 1, background: "#13131a", borderRadius: 8, padding: "6px 0", textAlign: "center" }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: s.color }}>{s.val}</div>
              <div style={{ fontSize: 10, color: "#888", marginTop: 1 }}>{s.lbl}</div>
            </div>
          ))}
        </div>

        <div style={{ display: "flex", alignItems: "center", margin: "14px 0 12px" }}>
          <div style={{ flex: 1, borderTop: "1px solid #2a2a3a" }} />
          <button
            onClick={() => onNav('logger')}
            style={{ background: "#1a1500", border: "1px solid #f5a623", borderRadius: 6, padding: "3px 10px", margin: "0 10px", color: "#f5a623", fontSize: 10.5, fontWeight: 700, whiteSpace: "nowrap", cursor: "pointer" }}
          >📸 Log your bets</button>
          <div style={{ flex: 1, borderTop: "1px solid #2a2a3a" }} />
        </div>

        <div style={{ fontSize: 11, color: "#888", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Lifetime Record</div>
        <div style={{ display: "flex", gap: 6 }}>
          <div style={{ flex: 1, background: "#13131a", borderRadius: 8, padding: "8px 0", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>{lifetimeWins}W-{lifetimeLosses}L</div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>Record</div>
          </div>
          <div style={{ flex: 1, background: "#13131a", borderRadius: 8, padding: "8px 0", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: lifetimePL >= 0 ? "#2ecc71" : "#e74c3c" }}>{lifetimePL >= 0 ? "+$" : "-$"}{Math.abs(lifetimePL).toFixed(0)}</div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>P&L</div>
          </div>
          <div style={{ flex: 1, background: "#13131a", borderRadius: 8, padding: "8px 0", textAlign: "center" }}>
            <div style={{ fontSize: 16, fontWeight: 800, color: lifetimeRoi >= 0 ? "#2ecc71" : "#e74c3c" }}>{lifetimeRoi >= 0 ? "+" : ""}{lifetimeRoi.toFixed(1)}%</div>
            <div style={{ fontSize: 10, color: "#888", marginTop: 2 }}>ROI</div>
          </div>
        </div>
      </div>

      {/* Hunter Chat — Front and Center */}
      <div style={{ marginBottom: 8 }}>
        <div style={S.secTitle}>Talk to Hunter 🤖</div>
        <HunterChat user={user} bets={bets} userKey={userKey} onNav={onNav} />
      </div>
    </div>
  );
}

// ── Upgrade Screen (single tier) ───────────────────────────────────────────
function UpgradeScreen({ user, userKey, onNav }) {
  const [loading, setLoading] = useState(null);

  const checkout = async (priceKey) => {
    setLoading(priceKey);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch('/api/stripe/create-checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          priceId: priceKey,
          userId: userKey,
          email: session?.user?.email,
        }),
      });
      const data = await res.json();
      if (data.url) window.location.href = data.url;
      else alert('Something went wrong. Please try again.');
    } catch (e) {
      alert('Something went wrong. Please try again.');
    } finally {
      setLoading(null);
    }
  };

  return (
    <div style={S.screen}>
      <div style={S.backRow}>
        <button style={S.backBtn} onClick={() => onNav('dashboard')}>← Back</button>
        <div style={S.logo}>BETCIERGE</div>
      </div>

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: 28 }}>
        <div style={{ fontFamily: "'Cormorant Garamond',serif", fontSize: 30, fontWeight: 700, color: '#fff', marginBottom: 8 }}>
          {FOUNDING_ACTIVE ? 'Founding Member Pricing' : 'Start Your Free Trial'}
        </div>
        {FOUNDING_ACTIVE ? (
          <>
            <div style={{ background: '#f5a62320', border: '1px solid #f5a623', borderRadius: 8, padding: '8px 16px', display: 'inline-block', marginBottom: 8 }}>
              <span style={{ color: '#f5a623', fontWeight: 700, fontSize: 14 }}>⚡ {FOUNDING_SPOTS_LEFT} of {FOUNDING_TOTAL} founding spots remaining</span>
            </div>
            <div style={{ color: '#aaa', fontSize: 13, marginBottom: 4 }}>Lock in this price forever — it never goes up</div>
            <div style={{ color: '#888', fontSize: 12 }}>3-day free trial · Cancel anytime</div>
          </>
        ) : (
          <>
            <div style={{ color: '#f5a623', fontSize: 14, marginBottom: 4 }}>3-day free trial</div>
            <div style={{ color: '#888', fontSize: 13 }}>Cancel anytime. No commitment.</div>
          </>
        )}
      </div>

      {/* Single price card — everything, one price. Lean Machine is included
          here, not an upsell — it's part of the same pipeline as Official
          picks (see July 22/24 handoffs). */}
      <div style={{ background: '#0f0f18', border: '1px solid #f5a623', borderRadius: 16, padding: 20, marginBottom: 24, position: 'relative' }}>
        {FOUNDING_ACTIVE && (
          <div style={{ position: 'absolute', top: -10, right: 16, background: '#f5a623', color: '#000', fontSize: 10, fontWeight: 800, padding: '3px 10px', borderRadius: 20, letterSpacing: 1 }}>
            FOUNDING PRICE
          </div>
        )}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <div>
            <div style={{ color: '#f5a623', fontSize: 12, fontWeight: 700, letterSpacing: 1, marginBottom: 4 }}>BETCIERGE</div>
            {FOUNDING_ACTIVE ? (
              <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                <div style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>$24.99<span style={{ fontSize: 13, color: '#888', fontWeight: 400 }}>/mo</span></div>
                <div style={{ color: '#888', fontSize: 13, textDecoration: 'line-through' }}>$29.99</div>
              </div>
            ) : (
              <div style={{ color: '#fff', fontSize: 22, fontWeight: 800 }}>$29.99<span style={{ fontSize: 13, color: '#888', fontWeight: 400 }}>/mo</span></div>
            )}
            {FOUNDING_ACTIVE ? (
              <div style={{ color: '#2ecc71', fontSize: 12, marginTop: 2 }}>🔒 Locked for life</div>
            ) : (
              <div style={{ color: '#888', fontSize: 12, marginTop: 2 }}>Cancel anytime</div>
            )}
          </div>
          <div style={{ fontSize: 32 }}>🎯</div>
        </div>
        <div style={{ color: '#777', fontSize: 12, marginBottom: 10 }}>Everything, one price. No tiers to choose between.</div>
        {['Daily picks from Hunter', 'Lean Machine — extra plays beyond the daily picks', 'Full Hunter AI chat', 'Snap to Log', 'Live Gamecast', 'Bet history & analytics', 'Bankroll guardrails & tilt protection'].map((f, i) => (
          <div key={i} style={{ color: '#aaa', fontSize: 13, marginBottom: 6 }}>✓ {f}</div>
        ))}
        <div style={{ marginTop: 16 }}>
          <button onClick={() => checkout(STRIPE_PRICE_CURRENT)} disabled={!!loading} style={{ width: '100%', background: '#f5a623', color: '#000', fontWeight: 700, fontSize: 14, padding: '12px 0', borderRadius: 10, border: 'none', cursor: 'pointer' }}>
            {loading === STRIPE_PRICE_CURRENT ? 'Loading...' : FOUNDING_ACTIVE ? 'Claim Founding Price — $24.99/mo' : 'Start Free Trial — $29.99/mo'}
          </button>
        </div>
      </div>

      {/* Price comparison note */}
      {FOUNDING_ACTIVE && (
        <div style={{ textAlign: 'center', color: '#888', fontSize: 12, marginBottom: 32 }}>
          CaptainPicks Discord is $600/mo. Betcierge gives you everything that has plus AI + tracking for {FOUNDING_SPOTS_LEFT} more founding members at $24.99/mo.
        </div>
      )}
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

// Tries to match a manually-typed bet to a real game, so it can get a
// gameId and show a live score in Gamecast — mirrors what Snap to Log
// already does. Manual entries have no photo to extract a precise ticket
// timestamp from, so "now" (the moment of logging) stands in for that.
//
// Three steps, each only tried if the previous one comes up empty:
// 1. Strict pregame match (/api/odds) — same .every() logic Snap to Log
//    already uses, safest, no false positives.
// 2. Loose pregame match (/api/odds) — .some() instead of .every(), for
//    abbreviated manual entries (e.g. "angels" vs "Los Angeles Angels")
//    the strict match would miss. Sport+date filters still apply, keeping
//    false-positive risk narrow.
// 3. Live/in-progress match (/api/live-scores-lookup) — /api/odds only
//    carries upcoming pregame lines, so an already-started game (tonight's
//    real test case) needs this separate endpoint, the same one Snap to
//    Log's live-bet path already relies on. NOTE: this endpoint's own
//    matching is strict-only (.every()) — that's shared code Snap to Log
//    depends on, so it isn't loosened here without a separate decision (see
//    note below). A manual live bet with a heavily abbreviated name can
//    still legitimately come up empty at this step.
const SPORT_KEY_MAP = { 'MLB': 'baseball_mlb', 'NBA': 'basketball_nba', 'NFL': 'americanfootball_nfl', 'NHL': 'icehockey_nhl', 'UFC/MMA': 'mma_mixed_martial_arts', 'NCAAB': 'basketball_ncaab', 'NCAAF': 'americanfootball_ncaaf' };

async function tryMatchGameId(game, sport, gameDate) {
  const parsedSportKey = SPORT_KEY_MAP[sport] || null;
  const gameLower = (game || '').toLowerCase();

  try {
    const oddsRes = await fetch('/api/odds', { method: 'POST' });
    const oddsData = await oddsRes.json();
    if (oddsData.games) {
      const candidates = oddsData.games.filter(g => {
        const gDate = g.commence_time ? new Date(g.commence_time).toLocaleDateString('en-CA', { timeZone: 'America/New_York' }) : null;
        if (parsedSportKey && g.sport_key && g.sport_key !== parsedSportKey) return false;
        if (gameDate && gDate && gDate !== gameDate) return false;
        return true;
      });
      let match = candidates.find(g => {
        const home = g.home_team.toLowerCase();
        const away = g.away_team.toLowerCase();
        const homeMatch = home.split(' ').filter(w => w.length > 3).every(w => gameLower.includes(w));
        const awayMatch = away.split(' ').filter(w => w.length > 3).every(w => gameLower.includes(w));
        return homeMatch || awayMatch;
      });
      if (!match) {
        match = candidates.find(g => {
          const home = g.home_team.toLowerCase();
          const away = g.away_team.toLowerCase();
          const homeMatch = home.split(' ').filter(w => w.length > 3).some(w => gameLower.includes(w));
          const awayMatch = away.split(' ').filter(w => w.length > 3).some(w => gameLower.includes(w));
          return homeMatch || awayMatch;
        });
      }
      if (match) return match.id;
    }
  } catch (e) {}

  if (parsedSportKey) {
    try {
      const nowIso = new Date().toISOString();
      const liveRes = await fetch(`/api/live-scores-lookup?sport=${parsedSportKey}&game=${encodeURIComponent(gameLower)}&ticket_time=${encodeURIComponent(nowIso)}`);
      if (liveRes.ok) {
        const liveData = await liveRes.json();
        if (liveData.game_id) return liveData.game_id;
      }
    } catch (e) {}
  }

  return null;
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

  const handleSave = async () => {
    if (!validate()) return;
    const finalOdds = isParlay ? parlayOdds() : odds;
    const finalPick = isParlay ? legs.map(l => l.pick).join(" + ") : needsLine ? `${pick} ${line}` : pick;
    // Parlays aren't matched — the manual parlay form only captures a
    // pick/odds string per leg, no game/sport/date fields to match against.
    const matchedGameId = isParlay ? null : await tryMatchGameId(game, sport, gameDate);
    onSave({ sport, game, betType, pick: finalPick, odds: finalOdds, amount: parseFloat(amount), type: category, result: "Pending", profit: 0, isToday: true, id: Date.now(), gameDate, gameTime, gameId: matchedGameId });
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
  const activeBets = bets.filter(b => !b.isParlay && b.gameDate === today && b.betType !== 'manual_adjustment');
  const todayParlays = bets.filter(b => b.isParlay && b.gameDate === today);
  const parlayGameIds = todayParlays.flatMap(p => (p.legs || []).map(l => l.gameId).filter(Boolean));
  const gameIds = [...new Set([...activeBets.map(b => b.gameId).filter(Boolean), ...parlayGameIds])];

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
        {lastUpdated && <div style={{ color: '#888', fontSize: 11 }}>Updated {lastUpdated.toLocaleTimeString()}</div>}
      </div>

      {loading ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 40 }}>Loading scores...</div>
      ) : activeBets.length === 0 && todayParlays.length === 0 ? (
        <div style={{ color: '#888', textAlign: 'center', padding: 40, fontSize: 14 }}>No active bets today.</div>
      ) : (
        <>
        {/* Parlay Cards — full parlay as one card */}
        {todayParlays.map(parlay => {
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
                      <div style={{ color: '#888', fontSize: 11, marginTop: 2 }}>{leg.game} · {leg.sport}</div>
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
                <div style={{ color: '#888', fontSize: 12 }}>{oddsDisplay} · <span style={{ color: '#fff' }}>${parlay.amount}</span> to win</div>
                <div style={{ color: '#f5a623', fontSize: 16, fontWeight: 700, fontFamily: "'Cormorant Garamond',serif" }}>${parlay.toWin}</div>
              </div>
            </div>
          );
        })}
        {/* Bets with no matched game (e.g. manually logged bets — manual entry
            never attempts an odds-feed match at all, unlike Snap to Log) still
            deserve to show up here, just without a live score to display. */}
        {activeBets.filter(b => !b.gameId && !b.isParlayLeg).map(bet => {
          const oddsDisplay = String(bet.odds).startsWith('+') ? String(bet.odds) : Number(bet.odds) > 0 ? `+${bet.odds}` : `${bet.odds}`;
          const toWin = bet.toWin || (bet.odds > 0 ? (bet.amount * bet.odds / 100).toFixed(2) : (bet.amount * 100 / Math.abs(bet.odds)).toFixed(2));
          return (
            <div key={bet.id} style={{ ...S.card, marginBottom: 16 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <span style={{ fontSize: 20 }}>{getSportEmoji(bet.sport)}</span>
                <span style={{ color: '#f5a623', fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>PENDING</span>
              </div>
              <div style={{ background: '#0f0f18', borderRadius: 12, padding: '14px 16px', marginBottom: 16, textAlign: 'center' }}>
                <div style={{ color: '#fff', fontSize: 14, fontWeight: 600 }}>{bet.game}</div>
                <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>{bet.gameTime || 'Time TBD'}</div>
              </div>
              <div style={{ color: '#666', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1, marginBottom: 8 }}>Your Bets</div>
              <div style={{ background: '#0a0a0f', borderRadius: 10, padding: '10px 12px', border: `1px solid ${bet.result === 'Win' ? '#2ecc7130' : bet.result === 'Loss' ? '#e74c3c30' : '#1e1e2e'}` }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div style={{ color: '#fff', fontSize: 13, fontWeight: 600 }}>{bet.pick}</div>
                  <div style={{ color: bet.result === 'Win' ? '#2ecc71' : bet.result === 'Loss' ? '#e74c3c' : '#f5a623', fontSize: 11, fontWeight: 700 }}>
                    {bet.result === 'Win' ? '✓ WIN' : bet.result === 'Loss' ? '✗ LOSS' : 'PENDING'}
                  </div>
                </div>
                <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>{bet.betType} · {oddsDisplay} · ${bet.amount} to win ${toWin}</div>
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
                  <div style={{ color: '#888', fontSize: 12, marginTop: 4 }}>{firstBet?.gameTime || 'Time TBD'}</div>
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
                    <div style={{ color: '#888', fontSize: 11, marginTop: 4 }}>{bet.betType} · {oddsDisplay} · ${bet.amount} to win ${toWin}</div>
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
function History({ bets, onUpdate, onDelete, onNav }) {
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

  const BetCard = ({ bet, onUpdate, onDelete }) => (
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
          <button onClick={() => onDelete(bet.id, bet.isParlay)} style={{ background: "#2a0f0f", color: "#e74c3c", border: "1px solid #e74c3c33", borderRadius: 4, padding: "2px 8px", fontSize: 11, cursor: "pointer" }}>🗑️</button>
        </div>
      </div>

      {(() => {
        // Loud-backstop prompt: a bet that's still Pending and whose game date
        // has passed needs the user's call. Show a clear "Settle this bet"
        // banner with one-tap W/L/P (the buttons above already write via
        // onUpdate — this just draws attention to it).
        const gd = bet.gameDate;
        const needsSettle = bet.result === "Pending" && gd && gd < today;
        if (!needsSettle) return null;
        return (
          <div style={{ background: "#1a1500", border: "1px solid #5a4a1e", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ color: "#f5a623", fontSize: 12, fontWeight: 700, marginBottom: 8 }}>⏳ This bet needs settling</div>
            <div style={{ color: "#888", fontSize: 11, marginBottom: 8, lineHeight: 1.4 }}>Hunter couldn't auto-settle this one. Tap the result:</div>
            <div style={{ display: "flex", gap: 8 }}>
              {["Win", "Loss", "Push"].map(r => (
                <button key={r} onClick={() => onUpdate(bet.id, r)} style={{ flex: 1, background: r === "Win" ? "#0a2e0a" : r === "Loss" ? "#2e0a0a" : "#0a1a2e", color: r === "Win" ? "#2ecc71" : r === "Loss" ? "#e74c3c" : "#3498db", border: `1px solid ${r === "Win" ? "#2ecc71" : r === "Loss" ? "#e74c3c" : "#3498db"}`, borderRadius: 8, padding: "8px 0", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>
                  {r === "Win" ? "Won" : r === "Loss" ? "Lost" : "Push"}
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {bet.isParlay ? (
        <div>
          {(bet.legs || []).map((leg, i) => (
            <div key={i} style={{ borderBottom: "1px solid #1a1a24", padding: "8px 0" }}>
              <div style={{ color: "#666", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 2 }}>Leg {leg.legNumber || i + 1} · {leg.sport}</div>
              <div style={{ color: "#f5a623", fontWeight: 700, fontSize: 13 }}>{leg.pick}</div>
              <div style={{ color: "#888", fontSize: 12 }}>{leg.game}</div>
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 2 }}>
                <span style={{ color: "#888", fontSize: 11 }}>{leg.odds}</span>
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
            <span style={{ color: "#888", fontSize: 12, marginLeft: 8 }}>{dayBets.length} bet{dayBets.length !== 1 ? "s" : ""}</span>
          </div>
          <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#2ecc71", minWidth: 28, textAlign: "right" }}>{dayWins}W</span>
            <span style={{ fontSize: 12, color: "#e74c3c", minWidth: 28, textAlign: "right" }}>{dayLosses}L</span>
            <span style={{ fontSize: 12, color: dayPL >= 0 ? "#2ecc71" : "#e74c3c", minWidth: 60, textAlign: "right" }}>{dayPL >= 0 ? "+" : ""}{fmt(dayPL)}</span>
            <span style={{ color: "#888", fontSize: 12 }}>{isExpanded ? "▲" : "▼"}</span>
          </div>
        </div>
        {isExpanded && dayBets.map(bet => <BetCard key={bet.id} bet={bet} onUpdate={onUpdate} onDelete={onDelete} />)}
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
              <div style={{ color: "#888", fontSize: 11, fontWeight: 600, letterSpacing: 1, marginBottom: 8, textTransform: "uppercase" }}>This Week</div>
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
                    <span style={{ color: "#888", fontSize: 12 }}>{olderByMonth[monthKey].reduce((s, d) => s + groups[d].length, 0)} bets</span>
                    <span style={{ color: "#888", fontSize: 12 }}>{isMonthExpanded ? "▲" : "▼"}</span>
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
  // Full-commit to the new onboarding flow: a logged-in user with no name
  // is a new/mid-flow user — send them to /onboarding, whose own resume
  // logic (incl. the backward-compat guard for the 11 existing old-flow
  // users) decides where they land. In a useEffect, never in render, to
  // avoid "update during render". Existing users have names, so this never
  // fires for them — they go straight to the app as before.
  useEffect(() => {
    if (!authLoading && session && !user?.name) {
      window.location.href = "/onboarding";
    }
  }, [authLoading, session, user]);

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
      // Keep email in sync
      if (session.user.email) {
        await supabase.from('user_profiles')
          .update({ email: session.user.email })
          .eq('user_id', session.user.id);
      }
      // Founding-price checkout used to fire from here too, immediately on
      // ANY auth state change — before onboarding ever ran. That was the
      // "Stripe fires before onboarding" bug. Checkout now ONLY fires from
      // handleComplete(), after bankroll/goals/sports are collected. Do not
      // re-add a checkout trigger here without checking with Miles first.
    }
    setAuthLoading(false);
  });
  return () => subscription.unsubscribe();
}, []);
  const handleComplete = async (userData) => {
  setUser(userData);
  if (userKey) {
    const { data: { user: authUser } } = await supabase.auth.getUser();
    const { error } = await supabase.from('user_profiles').upsert({
      user_id: userKey,
      name: userData.name,
      bankroll: userData.bankroll,
      goal: userData.goal,
      email: authUser?.email ?? null,
    }, { onConflict: 'user_id' });
    if (error) console.error('Profile save error:', error);

    // Check if user came from /captain with a founding price selected
    const foundingPriceId = localStorage.getItem('founding_price_id');
    const foundingPlanName = localStorage.getItem('founding_plan_name');
    if (foundingPriceId && authUser?.email) {
      localStorage.removeItem('founding_price_id');
      localStorage.removeItem('founding_plan_name');
      try {
        const res = await fetch('/api/stripe/create-checkout', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            priceId: foundingPriceId,
            userId: userKey,
            email: authUser.email,
          }),
        });
        const data = await res.json();
        if (data.url) window.location.href = data.url;
      } catch(e) {
        console.error('Founding checkout error:', e);
      }
    }
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
      toWin: b.to_win,
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
        // Derive the parlay's date from the earliest leg (not today) so Bet
        // History files it on the day the games actually happen. Falls back to
        // today only if no leg has a date.
        game_date: (() => {
          const legDates = (bet.legs || []).map(l => l.gameDate).filter(Boolean).sort();
          return legDates[0] || bet.gameDate || new Date().toLocaleDateString('en-CA', { timeZone: 'America/New_York' });
        })(),
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
        game_date: (leg.gameDate || bet.gameDate || null),
        game_time: leg.gameTime ?? null,
        game_id: leg.gameId ?? null,
        result: 'Pending',
        leg_number: i + 1,
      }));
      const { error: legsError } = await supabase.from('parlay_legs').insert(legRows);
      if (legsError) console.error('parlay_legs insert error:', legsError);

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
        to_win: bet.toWin ?? null,
      });
      // Reload bets from Supabase to ensure consistent state
      const { data: straightBets } = await supabase.from('user_bets').select('*').eq('user_id', userKey).order('created_at', { ascending: false });
      const { data: parlaysData } = await supabase.from('parlays').select('*, parlay_legs(*)').eq('user_id', userKey).order('created_at', { ascending: false });
      const mappedStraight = (straightBets || []).map(b => ({
        id: b.id, sport: b.sport, game: b.game, betType: b.bet_type, pick: b.pick,
        odds: b.odds, amount: b.amount, type: b.type, result: b.result,
        isToday: b.is_today, gameDate: b.game_date, gameTime: b.game_time,
        gameId: b.game_id, toWin: b.to_win, isParlay: false, createdAt: b.created_at,
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

const deleteBet = async (id, isParlay) => {
  if (!window.confirm('Delete this bet?')) return;
  setBets(p => p.filter(b => b.id !== id));
  if (userKey) {
    if (isParlay) {
      await supabase.from('parlay_legs').delete().eq('parlay_id', id);
      await supabase.from('parlays').delete().eq('id', id);
    } else {
      await supabase.from('user_bets').delete().eq('id', id);
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
if (!session) {
  const hasFoundingPrice = typeof window !== 'undefined' && localStorage.getItem('founding_price_id');
  // Lets /captain's Sign In button (which has no client-side onSignIn
  // callback to call, since Next.js invokes that route with no custom
  // props) force the real login screen deterministically via a hard
  // navigation to /?login=1, instead of depending on hasFoundingPrice
  // happening to already be set from an unrelated prior click.
  const hasLoginParam = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('login') === '1';
  if (showLogin || hasFoundingPrice || hasLoginParam) return <LoginScreen onAuth={(s) => { setSession(s); setShowLogin(false); }} />;
  return <Landing onGetStarted={() => { window.location.href = "/onboarding"; }} onSignIn={() => setShowLogin(true)} />;
}
if (!user?.name) return null; // new users are redirected to /onboarding by the effect above

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
            <div style={{ color: "#888", fontSize: 13, textAlign: "center", marginTop: 40 }}>No notifications yet</div>
          ) : (
            notifications.map(n => (
              <div key={n.id} style={{ background: n.read ? "#0f0f18" : "#111128", border: `1px solid ${n.read ? "#1e1e2e" : "#3a3a5e"}`, borderRadius: 10, padding: 14, marginBottom: 10 }}>
                <div style={{ fontSize: 13, color: "#fff", lineHeight: 1.5 }}>{n.notifications?.message}</div>
                <div style={{ fontSize: 11, color: "#888", marginTop: 6 }}>{new Date(n.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</div>
                {!n.read && <div style={{ width: 6, height: 6, background: "#f5a623", borderRadius: "50%", marginTop: 6 }} />}
              </div>
            ))
          )}
        </div>
      )}
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      {screen === "dashboard" && <Dashboard user={user} bets={bets} onNav={setScreen} userKey={userKey} unreadCount={unreadCount} showNotifs={showNotifs} setShowNotifs={setShowNotifs} markAllRead={markAllRead} onAddBet={addBet} />}
      {screen === "picks" && <PicksTab userKey={userKey} user={user} session={session} onNav={setScreen} />}
      {screen === "card" && <TodayCard bets={bets} onNav={setScreen} />}
{screen === "gamecast" && <Gamecast bets={bets} onNav={setScreen} />}
      {screen === "logger" && <BetLogger onSave={addBet} onNav={setScreen} />}
      {screen === "history" && <History bets={bets} onUpdate={updateBet} onDelete={deleteBet} onNav={setScreen} />}
      {screen === "upgrade" && <UpgradeScreen user={user} userKey={userKey} onNav={setScreen} />}

      {/* Nav Bar */}
      <div style={{ position: "fixed", bottom: 0, left: "50%", transform: "translateX(-50%)", width: "100%", maxWidth: 430, background: "#0d0d14", borderTop: "1px solid #1e1e2e", display: "flex", padding: "8px 0 12px" }}>
        {[
          { id: "dashboard", icon: "🤖", lbl: "Hunter" },
          { id: "picks", icon: "🎯", lbl: "BetC Picks" },
          { id: "logger", icon: "📝", lbl: "Log Bet" },
          { id: "gamecast", icon: "📡", lbl: "My Bets" },
          { id: "history", icon: "📊", lbl: "Bet History" },
        ].map(n => (
          <button key={n.id} onClick={() => setScreen(n.id)} style={{ flex: 1, background: "none", border: "none", display: "flex", flexDirection: "column", alignItems: "center", gap: 4, cursor: "pointer", padding: "6px 0" }}>
            <span style={{ fontSize: 20, opacity: screen === n.id ? 1 : 0.5 }}>{n.icon}</span>
            <span style={{ color: screen === n.id ? "#f5a623" : "#888", fontSize: 11, fontWeight: screen === n.id ? 700 : 400 }}>{n.lbl}</span>
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
  statLbl: { color: "#888", fontSize: 10, marginTop: 2, textTransform: "uppercase", letterSpacing: 0.5 },
  betCard: { background: "#13131a", border: "1px solid #1e1e2e", borderRadius: 14, padding: 14, marginBottom: 10 },
  betSport: { background: "#1a1a00", color: "#f5a623", fontSize: 10, fontWeight: 700, padding: "3px 8px", borderRadius: 6 },
  tag: { fontSize: 11, fontWeight: 700, padding: "3px 8px", borderRadius: 6 },
  empty: { color: "#888", textAlign: "center", padding: 40, fontSize: 14 },
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
    manualSub: { color: "#888", fontSize: 13 },
  },
  ob: {
    wrap: { background: "#0a0a0f", minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20 },
    card: { background: "#13131a", border: "1px solid #222", borderRadius: 24, padding: 28, width: "100%", maxWidth: 400 },
    logo: { textAlign: "center", fontFamily: "'Cormorant Garamond',serif", fontSize: 36, fontWeight: 700, color: "#f5a623", letterSpacing: 3, marginBottom: 4 },
    tagline: { textAlign: "center", color: "#888", fontSize: 13, marginBottom: 24 },
    stepRow: { display: "flex", gap: 6, justifyContent: "center", marginBottom: 6 },
    dot: { width: 8, height: 8, borderRadius: "50%", background: "#333" },
    dotActive: { background: "#f5a623", width: 24, borderRadius: 4 },
    dotDone: { background: "#f5a623", opacity: 0.5 },
    stepLbl: { textAlign: "center", color: "#888", fontSize: 12, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 20 },
    title: { color: "#fff", fontFamily: "'Cormorant Garamond',serif", fontSize: 24, fontWeight: 700, margin: "0 0 8px" },
    sub: { color: "#666", fontSize: 14, margin: "0 0 16px" },
    sportsGrid: { display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 12 },
    sportBtn: { background: "#1a1a24", border: "1px solid #2a2a38", borderRadius: 12, padding: "14px 12px", display: "flex", flexDirection: "column", alignItems: "center", gap: 6, cursor: "pointer" },
    sportOn: { background: "#1f1a00", border: "1px solid #f5a623" },
    trialBox: { background: "#1a1500", border: "1px solid #f5a62340", borderRadius: 16, padding: 20, marginBottom: 8, textAlign: "left" },
    nextBtn: { width: "100%", background: "linear-gradient(135deg,#f5a623,#f7c948)", color: "#000", border: "none", borderRadius: 14, padding: 16, fontSize: 16, fontWeight: 700, cursor: "pointer", marginTop: 12 },
  },
};



