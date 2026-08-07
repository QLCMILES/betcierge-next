"use client";
import { useState } from "react";
import { supabase } from "./supabase";

const S = {
  wrap: { minHeight: "100vh", background: "#050507", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit', sans-serif", padding: 20 },
  card: { background: "#0a0a0f", border: "1px solid #26262f", borderRadius: 24, padding: "36px 32px", width: "100%", maxWidth: 400 },
  logo: { fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, color: "#f5a623", letterSpacing: 2, textAlign: "center", fontSize: 20, marginBottom: 6 },
  title: { fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, color: "#fff", fontSize: 22, textAlign: "center", marginBottom: 6 },
  sub: { color: "#777", fontSize: 13, textAlign: "center", marginBottom: 24 },
  label: { display: "block", color: "#666", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 14, marginBottom: 4 },
  input: { width: "100%", background: "#16161d", border: "1px solid #2a2a38", borderRadius: 8, padding: "11px 12px", color: "#fff", fontSize: 14, fontFamily: "'Outfit', sans-serif", outline: "none", boxSizing: "border-box" },
  ageRow: { display: "flex", gap: 10, alignItems: "flex-start", marginTop: 18, cursor: "pointer" },
  ageText: { color: "#999", fontSize: 12.5, lineHeight: 1.4 },
  legal: { color: "#4a4a52", fontSize: 10.5, textAlign: "center", lineHeight: 1.6, marginTop: 14 },
  btn: { width: "100%", background: "#f5a623", color: "#000", border: "none", borderRadius: 10, padding: "13px 0", fontSize: 14, fontWeight: 700, fontFamily: "'Outfit', sans-serif", cursor: "pointer", marginTop: 18 },
  divider: { display: "flex", alignItems: "center", gap: 12, margin: "18px 0 4px", color: "#444", fontSize: 12 },
  line: { flex: 1, height: 1, background: "#2a2a2a" },
  googleBtn: { width: "100%", background: "#16161d", color: "#fff", border: "1px solid #2a2a38", borderRadius: 10, padding: "12px 0", fontSize: 14, fontWeight: 600, display: "flex", alignItems: "center", justifyContent: "center", gap: 10, cursor: "pointer", marginTop: 4 },
  error: { background: "#2a1a1a", border: "1px solid #5a2a2a", borderRadius: 8, padding: "10px 12px", color: "#e07a7a", fontSize: 13, marginTop: 12 },
  signInLink: { textAlign: "center", color: "#666", fontSize: 12.5, marginTop: 18 },
};

const Checkbox = ({ checked }) => (
  <div style={{
    width: 18, height: 18, borderRadius: 5,
    border: `1.5px solid ${checked ? "#f5a623" : "#444"}`,
    background: checked ? "#f5a623" : "transparent",
    flexShrink: 0, marginTop: 1, display: "flex",
    alignItems: "center", justifyContent: "center",
    fontSize: 11, fontWeight: 700, color: "#000",
  }}>
    {checked ? "✓" : ""}
  </div>
);

// Screen 1 of the redesigned onboarding flow. Collects name + email + password
// + 21+ affirmation in one screen, creates the Supabase auth account, and
// writes the 21+ compliance audit record server-side.
//
// Per BETC_ONBOARDING_ARCHITECTURE_DECISION.md: this branches on whether a
// session exists immediately after signUp() — that branch stays in place even
// while Confirm Email is toggled off, so nothing needs rebuilding if it's
// turned on later.
//
// onAccountCreated() is called once the account + profile write both succeed —
// the caller (OnboardingFlow, not yet built) is responsible for advancing to
// Screen 2. Google OAuth is wired to redirect correctly but /auth/callback
// (which catches the return and writes the 21+ audit record for Google users)
// is not built yet — that's the next piece of work, not this one.
export default function AccountStep({ onAccountCreated, onSwitchToSignIn }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [ageConfirmed, setAgeConfirmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [awaitingConfirmation, setAwaitingConfirmation] = useState(false);

  const canSubmit = name.trim() && email.trim() && password.trim().length >= 6 && ageConfirmed;

  const writeProfileAndAdvance = async (accessToken) => {
    try {
      const res = await fetch("/api/onboarding/create-profile", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ name: name.trim(), is21Confirmed: ageConfirmed }),
      });
      const result = await res.json();
      if (!res.ok) {
        setError(result.error || "Something went wrong saving your profile.");
        setLoading(false);
        return;
      }
      setLoading(false);
      onAccountCreated();
    } catch (e) {
      console.error("Profile save error:", e);
      setError("Something went wrong saving your profile.");
      setLoading(false);
    }
  };

  const handleCreateAccount = async () => {
    setError("");
    if (!name.trim()) { setError("Please enter your name."); return; }
    if (!email.trim() || !password.trim()) { setError("Please enter your email and password."); return; }
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (!ageConfirmed) { setError("You must confirm you are 21 or older to continue."); return; }

    setLoading(true);
    const { data, error: signUpError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
      options: { data: { full_name: name.trim() } },
    });

    if (signUpError) {
      setError(signUpError.message);
      setLoading(false);
      return;
    }

    if (!data.session) {
      // Confirm Email is enabled — no session yet. Currently dormant on
      // production (confirmation is toggled off) but this branch stays in
      // regardless. See architecture decision doc, item 3.
      setAwaitingConfirmation(true);
      setLoading(false);
      return;
    }

    await writeProfileAndAdvance(data.session.access_token);
  };

  const handleGoogle = async () => {
    setError("");
    if (!ageConfirmed) {
      setError("Please confirm you are 21 or older before continuing with Google.");
      return;
    }
    await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback?next=/onboarding` },
    });
  };

  if (awaitingConfirmation) {
    return (
      <div style={S.wrap}>
        <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
        <div style={S.card}>
          <div style={S.logo}>BETCIERGE</div>
          <div style={S.title}>Check your email</div>
          <div style={S.sub}>
            We sent a confirmation link to <b style={{ color: "#ccc" }}>{email}</b>. Click it to continue setting up your account.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div style={S.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={S.card}>
        <div style={S.logo}>BETCIERGE</div>
        <div style={S.title}>Let's get you set up.</div>
        <div style={S.sub}>Takes about 20 seconds.</div>

        {error && <div style={S.error}>{error}</div>}

        <label style={S.label}>Full name</label>
        <input style={S.input} placeholder="Miles Davis" value={name} onChange={e => setName(e.target.value)} />

        <label style={S.label}>Email</label>
        <input style={S.input} type="email" placeholder="you@email.com" value={email} onChange={e => setEmail(e.target.value)} />

        <label style={S.label}>Password</label>
        <input
          style={S.input}
          type="password"
          placeholder="Create a password"
          value={password}
          onChange={e => setPassword(e.target.value)}
          onKeyDown={e => e.key === "Enter" && canSubmit && handleCreateAccount()}
        />

        <div style={S.ageRow} onClick={() => setAgeConfirmed(a => !a)}>
          <Checkbox checked={ageConfirmed} />
          <div style={S.ageText}>I confirm I am 21 years of age or older.</div>
        </div>

        <div style={S.legal}>By continuing, you agree to our Terms of Service and Privacy Policy.</div>

        <button
          style={{ ...S.btn, opacity: loading || !canSubmit ? 0.5 : 1, cursor: loading || !canSubmit ? "not-allowed" : "pointer" }}
          onClick={handleCreateAccount}
          disabled={loading || !canSubmit}
        >
          {loading ? "..." : "Create account →"}
        </button>

        <div style={S.divider}><div style={S.line} /> or <div style={S.line} /></div>

        <button style={S.googleBtn} onClick={handleGoogle}>
          <svg width="18" height="18" viewBox="0 0 48 48">
            <path fill="#FFC107" d="M43.6 20H24v8h11.3C33.6 32.6 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20c11 0 19.7-8 19.7-20 0-1.3-.1-2.7-.3-4z"/>
            <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.5 16 19 13 24 13c3 0 5.8 1.1 7.9 3l5.7-5.7C34.1 6.5 29.3 4 24 4c-7.6 0-14.2 4.1-17.7 10.7z"/>
            <path fill="#4CAF50" d="M24 44c5.2 0 9.9-1.9 13.5-5l-6.2-5.2C29.5 35.5 26.9 36.5 24 36.5c-5.2 0-9.7-3.5-11.3-8.3l-6.5 5C9.6 40 16.3 44 24 44z"/>
            <path fill="#1976D2" d="M43.6 20H24v8h11.3c-.8 2.3-2.3 4.2-4.3 5.6l6.2 5.2C40.9 35.4 44 30.1 44 24c0-1.3-.1-2.7-.4-4z"/>
          </svg>
          Continue with Google
        </button>

        <div style={S.signInLink}>
          Already have an account?{" "}
          <span style={{ color: "#f5a623", cursor: "pointer", fontWeight: 600 }} onClick={onSwitchToSignIn}>
            Sign in
          </span>
        </div>
      </div>
    </div>
  );
}