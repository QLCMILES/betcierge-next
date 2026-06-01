"use client";
import { useState } from "react";
import { signInWithEmail, signUpWithEmail, signInWithGoogle } from "./supabase";

export default function LoginScreen({ onAuth }) {
  const [mode, setMode] = useState("signin"); // "signin" | "signup"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState("");

  const handleSubmit = async () => {
    setError("");
    setConfirmMsg("");
    if (!email.trim() || !password.trim()) {
      setError("Please enter your email and password.");
      return;
    }
    setLoading(true);
    if (mode === "signup") {
      const { data, error: err } = await signUpWithEmail(email.trim(), password);
      if (err) { setError(err.message); setLoading(false); return; }
      // Supabase may require email confirmation depending on project settings
      if (data?.user && !data.session) {
        setConfirmMsg("Check your email to confirm your account, then sign in.");
        setLoading(false);
        return;
      }
      if (data?.session) onAuth(data.session);
    } else {
      const { data, error: err } = await signInWithEmail(email.trim(), password);
      if (err) { setError(err.message); setLoading(false); return; }
      if (data?.session) onAuth(data.session);
    }
    setLoading(false);
  };

  const handleGoogle = async () => {
    setError("");
    await signInWithGoogle();
    // Google OAuth redirects away — onAuth fires via onAuthStateChange after redirect
  };

  const S = {
    wrap: {
      minHeight: "100vh",
      background: "#0a0a0a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      fontFamily: "'Outfit', sans-serif",
      padding: 20,
    },
    card: {
      background: "#111",
      border: "1px solid #222",
      borderRadius: 16,
      padding: "40px 36px",
      width: "100%",
      maxWidth: 420,
    },
    logo: {
      fontSize: 28,
      fontWeight: 700,
      color: "#fff",
      letterSpacing: 2,
      marginBottom: 4,
      fontFamily: "'Cormorant Garamond', serif",
    },
    tagline: {
      fontSize: 13,
      color: "#666",
      marginBottom: 32,
    },
    tabs: {
      display: "flex",
      marginBottom: 28,
      background: "#1a1a1a",
      borderRadius: 10,
      padding: 4,
    },
    tab: (active) => ({
      flex: 1,
      padding: "8px 0",
      border: "none",
      borderRadius: 8,
      cursor: "pointer",
      fontSize: 14,
      fontWeight: 500,
      background: active ? "#222" : "transparent",
      color: active ? "#fff" : "#555",
      transition: "all 0.15s",
    }),
    input: {
      width: "100%",
      background: "#1a1a1a",
      border: "1px solid #2a2a2a",
      borderRadius: 10,
      padding: "12px 14px",
      color: "#fff",
      fontSize: 14,
      marginBottom: 12,
      outline: "none",
      boxSizing: "border-box",
    },
    btn: {
      width: "100%",
      padding: "13px 0",
      borderRadius: 10,
      border: "none",
      cursor: "pointer",
      fontSize: 15,
      fontWeight: 600,
      marginBottom: 12,
      transition: "opacity 0.15s",
    },
    primaryBtn: {
      background: "#e8c97a",
      color: "#000",
    },
    googleBtn: {
      background: "#1a1a1a",
      color: "#fff",
      border: "1px solid #2a2a2a",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 10,
    },
    divider: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      margin: "4px 0 12px",
      color: "#444",
      fontSize: 12,
    },
    line: { flex: 1, height: 1, background: "#2a2a2a" },
    error: {
      background: "#2a1a1a",
      border: "1px solid #5a2a2a",
      borderRadius: 8,
      padding: "10px 12px",
      color: "#e07a7a",
      fontSize: 13,
      marginBottom: 12,
    },
    confirm: {
      background: "#1a2a1a",
      border: "1px solid #2a5a2a",
      borderRadius: 8,
      padding: "10px 12px",
      color: "#7ae07a",
      fontSize: 13,
      marginBottom: 12,
    },
  };

  return (
    <div style={S.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={S.card}>
        <div style={S.logo}>BETCIERGE</div>
        <div style={S.tagline}>Your Personal Betting Concierge</div>

        <div style={S.tabs}>
          <button style={S.tab(mode === "signin")} onClick={() => { setMode("signin"); setError(""); setConfirmMsg(""); }}>
            Sign In
          </button>
          <button style={S.tab(mode === "signup")} onClick={() => { setMode("signup"); setError(""); setConfirmMsg(""); }}>
            Sign Up
          </button>
        </div>

        {error && <div style={S.error}>{error}</div>}
        {confirmMsg && <div style={S.confirm}>{confirmMsg}</div>}

        <input
          style={S.input}
          type="email"
          placeholder="Email address"
          value={email}
          onChange={e => setEmail(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
        />
        <input
          style={S.input}
          type="password"
          placeholder="Password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && handleSubmit()}
        />

        <button
          style={{ ...S.btn, ...S.primaryBtn, opacity: loading ? 0.6 : 1 }}
          onClick={handleSubmit}
          disabled={loading}
        >
          {loading ? "..." : mode === "signin" ? "Sign In" : "Create Account"}
        </button>

        <div style={S.divider}>
          <div style={S.line} /> or <div style={S.line} />
        </div>

        <button style={{ ...S.btn, ...S.googleBtn }} onClick={handleGoogle}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.3-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4c-7.6 0-14.2 4.1-17.7 10.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.5 35.5 26.9 36.5 24 36.5c-5.2 0-9.7-3.5-11.3-8.3l-6.5 5C9.6 40 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.2 5.2C40.9 35.4 44 30.1 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          Continue with Google
        </button>
      </div>
    </div>
  );
}
