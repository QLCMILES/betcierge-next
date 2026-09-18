"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

// Password-reset landing page — where the email link from
// supabase.auth.resetPasswordForEmail() (triggered from the "Forgot
// password?" link on LoginScreen) actually lands.
//
// Deliberately a SEPARATE page from /auth/callback, not a shared one.
// Supabase's recovery link resolves into a real, valid session the exact
// same way an OAuth or magic-link login does (detectSessionInUrl parses
// the #access_token=...&type=recovery fragment) — so if this reused
// /auth/callback's logic, it would silently log the user straight into the
// app and never actually give them the chance to set a new password. That
// defeats the entire point of "I forgot my password."
//
// Flow:
//   1. Wait for the recovery session to resolve (same short poll
//      /auth/callback uses, since detectSessionInUrl needs a tick to run).
//   2. No session after polling -> the link was invalid/expired -> show an
//      error and send them back to try again.
//   3. Session resolved -> show a real "set a new password" form. On
//      submit, supabase.auth.updateUser() changes the password on the
//      now-authenticated session.
//   4. After a successful change, route into the app using the same
//      onboarding-completion check /auth/callback uses (defensive: a user
//      resetting their password should already have finished onboarding,
//      but this keeps behavior identical/safe either way rather than
//      assuming).
export default function ResetPassword() {
  const router = useRouter();
  const [checking, setChecking] = useState(true);
  const [sessionError, setSessionError] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [formError, setFormError] = useState("");
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    let cancelled = false;

    const waitForSession = async () => {
      let session = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const { data } = await supabase.auth.getSession();
        if (data?.session) { session = data.session; break; }
        await new Promise(r => setTimeout(r, 300));
      }
      if (cancelled) return;
      if (!session) {
        setSessionError("This reset link is invalid or has expired. Request a new one from the sign-in screen.");
      }
      setChecking(false);
    };

    waitForSession();
    return () => { cancelled = true; };
  }, []);

  const handleSave = async () => {
    setFormError("");
    if (!password || password.length < 8) {
      setFormError("Password must be at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setFormError("Passwords don't match.");
      return;
    }
    setSaving(true);
    const { error } = await supabase.auth.updateUser({ password });
    setSaving(false);
    if (error) { setFormError(error.message); return; }
    setDone(true);

    // Same routing logic as /auth/callback: onboarding-completion is the
    // source of truth for where a resolved session goes next, not an
    // assumption that everyone resetting a password already finished it.
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { router.replace("/"); return; }
    const { data: profile, error: profileError } = await supabase
      .from("user_profiles")
      .select("onboarding_completed_at")
      .eq("user_id", session.user.id)
      .maybeSingle();
    if (profileError || !profile?.onboarding_completed_at) {
      router.replace("/onboarding");
    } else {
      router.replace("/");
    }
  };

  const S = {
    wrap: { minHeight: "100vh", background: "#0a0a0a", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit', sans-serif", padding: 20 },
    card: { background: "#111", border: "1px solid #222", borderRadius: 16, padding: "40px 36px", width: "100%", maxWidth: 420 },
    logo: { fontSize: 28, fontWeight: 700, color: "#fff", letterSpacing: 2, marginBottom: 4, fontFamily: "'Cormorant Garamond', serif" },
    heading: { fontSize: 16, fontWeight: 600, color: "#fff", marginBottom: 20 },
    sub: { fontSize: 13, color: "#888", marginBottom: 20, lineHeight: 1.5 },
    text: { color: "#888", fontSize: 14, textAlign: "center" },
    input: { width: "100%", background: "#1a1a1a", border: "1px solid #2a2a2a", borderRadius: 10, padding: "12px 14px", color: "#fff", fontSize: 14, marginBottom: 12, outline: "none", boxSizing: "border-box" },
    btn: { width: "100%", padding: "13px 0", borderRadius: 10, border: "none", cursor: "pointer", fontSize: 15, fontWeight: 600, marginBottom: 12 },
    primaryBtn: { background: "#e8c97a", color: "#000" },
    error: { background: "#2a1a1a", border: "1px solid #5a2a2a", borderRadius: 8, padding: "10px 12px", color: "#e07a7a", fontSize: 13, marginBottom: 12 },
    success: { background: "#1a2a1a", border: "1px solid #2a5a2a", borderRadius: 8, padding: "10px 12px", color: "#7ae0a0", fontSize: 13, marginBottom: 12 },
    link: { color: "#e8c97a", cursor: "pointer", fontWeight: 600, fontSize: 13, background: "none", border: "none", fontFamily: "'Outfit', sans-serif" },
  };

  return (
    <div style={S.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={S.card}>
        <div style={S.logo}>BETCIERGE</div>

        {checking ? (
          <div style={S.text}>Verifying your reset link...</div>
        ) : sessionError ? (
          <>
            <div style={S.heading}>Link expired</div>
            <div style={S.error}>{sessionError}</div>
            <button style={S.link} onClick={() => router.replace("/")}>Back to sign in</button>
          </>
        ) : done ? (
          <>
            <div style={S.heading}>Password updated</div>
            <div style={S.success}>Taking you in...</div>
          </>
        ) : (
          <>
            <div style={S.heading}>Set a new password.</div>
            <div style={S.sub}>Choose a new password for your account.</div>
            {formError && <div style={S.error}>{formError}</div>}
            <input
              style={S.input}
              type="password"
              placeholder="New password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
            />
            <input
              style={S.input}
              type="password"
              placeholder="Confirm new password"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSave()}
            />
            <button
              style={{ ...S.btn, ...S.primaryBtn, opacity: saving ? 0.6 : 1 }}
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving..." : "Set new password"}
            </button>
          </>
        )}
      </div>
    </div>
  );
}
