"use client";
import { useState, useEffect } from "react";
import { supabase } from "../../lib/supabase";

const GOLD = "#f5a623";
const DARK = "#0a0a0f";
const GRAY = "#6b7280";

export default function SuccessPage() {
  const [status, setStatus] = useState("checking"); // checking | ready

  useEffect(() => {
    let cancelled = false;
    // Stripe delivers the webhook asynchronously — it can arrive a second or
    // two after this page loads. Poll briefly rather than trusting the DB
    // write happened instantly, but never leave anyone stuck: after
    // MAX_ATTEMPTS we proceed regardless, since the webhook WILL land
    // eventually even if this page can't wait for it.
    const MAX_ATTEMPTS = 8; // ~12s max wait
    let attempts = 0;

    const poll = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user?.id) {
        // No session at all — shouldn't normally happen here, but don't get
        // stuck on a spinner forever if it does.
        if (!cancelled) window.location.href = "/";
        return;
      }

      const { data } = await supabase
        .from("user_profiles")
        .select("subscription_status")
        .eq("user_id", session.user.id)
        .single();

      const confirmed = data?.subscription_status && data.subscription_status !== "inactive";
      attempts += 1;

      if (confirmed || attempts >= MAX_ATTEMPTS) {
        if (!cancelled) setStatus("ready");
      } else if (!cancelled) {
        setTimeout(poll, 1500);
      }
    };

    poll();
    return () => { cancelled = true; };
  }, []);

  const continueToApp = () => { window.location.href = "/"; };

  return (
    <div style={{ background: DARK, minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit', sans-serif", padding: 20 }}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={{ background: "#111118", border: "1px solid #1e1e2e", borderRadius: 20, padding: "40px 32px", maxWidth: 420, width: "100%", textAlign: "center" }}>
        <div style={{ fontFamily: "'Cormorant Garamond', serif", fontSize: 24, fontWeight: 700, color: GOLD, letterSpacing: 2, marginBottom: 24 }}>BETCIERGE</div>

        {status === "checking" && (
          <>
            <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
            <div style={{ width: 32, height: 32, border: "3px solid #2a2a38", borderTopColor: GOLD, borderRadius: "50%", animation: "spin 0.8s linear infinite", margin: "0 auto 20px" }} />
            <div style={{ color: "#fff", fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Setting up your account...</div>
            <div style={{ color: GRAY, fontSize: 13 }}>This only takes a few seconds.</div>
          </>
        )}

        {status === "ready" && (
          <>
            <div style={{ fontSize: 44, marginBottom: 12 }}>🎉</div>
            <div style={{ color: "#fff", fontSize: 20, fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, marginBottom: 8 }}>You're all set!</div>
            <div style={{ color: GRAY, fontSize: 14, lineHeight: 1.6, marginBottom: 24 }}>
              Your 3-day free trial has started. Hunter's ready whenever you are.
            </div>
            <button onClick={continueToApp} style={{ background: GOLD, color: "#000", border: "none", borderRadius: 10, padding: "14px 32px", fontSize: 15, fontWeight: 700, cursor: "pointer", width: "100%" }}>
              Enter Betcierge →
            </button>
          </>
        )}
      </div>
    </div>
  );
}
