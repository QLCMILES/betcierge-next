"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "../../../lib/supabase";

// Client-side OAuth / email-confirmation callback.
//
// This is intentionally a CLIENT page, not a server route. The app currently
// uses Supabase's IMPLICIT flow (supabase.js has detectSessionInUrl: true and
// the default client). In implicit flow the tokens come back in the URL
// *fragment* (#access_token=...), which browsers never send to the server —
// so a server-side exchangeCodeForSession handler would never see them.
// detectSessionInUrl catches the fragment on mount and establishes the session.
//
// A future migration to PKCE + a server callback is tracked in
// BETC_ONBOARDING_ARCHITECTURE_DECISION.md (gated to the native-app work).
// When that happens, this file becomes a server route.js instead.
//
// Routing logic after the session resolves:
//   - no session / error        -> show an error with a link back to start
//   - session, onboarding done  -> into the app (/)
//   - session, onboarding open  -> into onboarding at the resume point
export default function AuthCallback() {
  const router = useRouter();
  const [status, setStatus] = useState("Finishing sign-in...");
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;

    const resolve = async () => {
      // Give detectSessionInUrl a moment to process the fragment, then read
      // the session. We poll briefly rather than assuming it's instant.
      let session = null;
      for (let attempt = 0; attempt < 10; attempt++) {
        const { data } = await supabase.auth.getSession();
        if (data?.session) { session = data.session; break; }
        await new Promise(r => setTimeout(r, 300));
      }

      if (cancelled) return;

      if (!session) {
        setError("We couldn't complete your sign-in. Please try again.");
        return;
      }

      // Read onboarding progress from the DB — the source of truth, not any
      // URL param or in-memory state (which the OAuth redirect wipes).
      const { data: profile, error: profileError } = await supabase
        .from("user_profiles")
        .select("onboarding_completed_at, onboarding_step")
        .eq("user_id", session.user.id)
        .maybeSingle();

      if (cancelled) return;

      if (profileError) {
        console.error("Callback profile read error:", profileError);
        // Don't hard-fail on a read error — send them into onboarding, which
        // resolves its own state on load rather than trusting this read.
        router.replace("/onboarding");
        return;
      }

      if (profile?.onboarding_completed_at) {
        router.replace("/");
      } else {
        // New or mid-flow user (including brand-new Google users with no
        // profile row yet). Onboarding owns resuming from the correct step,
        // including capturing the 21+ affirmation for Google users who never
        // passed through Screen 1's audit write.
        router.replace("/onboarding");
      }
    };

    resolve();
    return () => { cancelled = true; };
  }, [router]);

  const S = {
    wrap: { minHeight: "100vh", background: "#050507", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", fontFamily: "'Outfit', sans-serif", padding: 20, textAlign: "center" },
    logo: { fontFamily: "'Cormorant Garamond', serif", fontWeight: 700, color: "#f5a623", letterSpacing: 2, fontSize: 22, marginBottom: 16 },
    text: { color: "#888", fontSize: 14 },
    errorText: { color: "#e07a7a", fontSize: 14, marginBottom: 16 },
    link: { color: "#f5a623", fontSize: 13, cursor: "pointer", fontWeight: 600, background: "none", border: "none", fontFamily: "'Outfit', sans-serif" },
  };

  return (
    <div style={S.wrap}>
      <link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@600;700&family=Outfit:wght@400;500;600;700&display=swap" rel="stylesheet" />
      <div style={S.logo}>BETCIERGE</div>
      {error ? (
        <>
          <div style={S.errorText}>{error}</div>
          <button style={S.link} onClick={() => router.replace("/")}>Back to start</button>
        </>
      ) : (
        <div style={S.text}>{status}</div>
      )}
    </div>
  );
}