export const metadata = {
  title: "Privacy Policy — Betcierge",
  description: "How Betcierge collects, uses, and shares your information.",
};

const wrap = {
  minHeight: "100vh",
  background: "#0b0b0d",
  color: "#cfcfd4",
  fontFamily:
    '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  lineHeight: 1.65,
  fontSize: "16px",
  WebkitFontSmoothing: "antialiased",
};
const inner = { maxWidth: "760px", margin: "0 auto", padding: "40px 22px 96px" };
const header = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  paddingBottom: "28px",
  borderBottom: "1px solid #1f1f23",
  marginBottom: "34px",
};
const wordmark = {
  fontFamily: 'Georgia, "Times New Roman", serif',
  fontSize: "22px",
  letterSpacing: "3px",
  color: "#e8c98a",
  textDecoration: "none",
  fontWeight: 600,
};
const backLink = { color: "#8a8a90", textDecoration: "none", fontSize: "14px" };
const h1 = { color: "#f5f5f7", fontSize: "30px", margin: "0 0 6px", fontWeight: 700 };
const dates = { color: "#7d7d84", fontSize: "13px", margin: "0 0 34px" };
const h2 = {
  color: "#f0f0f2",
  fontSize: "19px",
  fontWeight: 650,
  margin: "38px 0 12px",
};
const p = { margin: "0 0 14px" };
const strong = { color: "#eaeaec", fontWeight: 650 };
const li = { margin: "0 0 9px" };
const a = { color: "#e0a94a", textDecoration: "none" };
const foot = {
  marginTop: "56px",
  paddingTop: "24px",
  borderTop: "1px solid #1f1f23",
  color: "#6f6f76",
  fontSize: "13px",
};

export default function PrivacyPage() {
  return (
    <main style={wrap}>
      <div style={inner}>
        <div style={header}>
          <a href="/" style={wordmark}>BETCIERGE</a>
          <a href="/" style={backLink}>&larr; Back to app</a>
        </div>

        <h1 style={h1}>Privacy Policy</h1>
        <p style={dates}>Effective Date: September 18, 2026 &nbsp;·&nbsp; Last Updated: September 18, 2026</p>

        <p style={p}>
          This Privacy Policy explains how DBP Corp, a Delaware corporation, doing business as Betcierge
          (&ldquo;<span style={strong}>Betcierge</span>&rdquo;, &ldquo;<span style={strong}>we</span>&rdquo;,
          &ldquo;<span style={strong}>us</span>&rdquo;) collects, uses, and shares information when you use the Betcierge
          website, app, and related services (the &ldquo;<span style={strong}>Service</span>&rdquo;).
        </p>

        <h2 style={h2}>1. Information We Collect</h2>
        <p style={p}><span style={strong}>Account information:</span> name, email address, password (or Google account info if you sign in with Google), and your age confirmation (21+).</p>
        <p style={p}><span style={strong}>Phone number and SMS preferences:</span> if you choose to provide a phone number for pick alerts, we collect the number and record your consent (including the version of the consent language you agreed to, and the date/time and technical details of that consent) so we have an accurate record of your opt-in. Phone numbers are also used, separately, to enforce one free trial per person. Providing a phone number is optional &mdash; you can use Betcierge without it.</p>
        <p style={p}><span style={strong}>Betting profile:</span> your bankroll amount, weekly profit goal, and sport preferences, which you provide during setup so Hunter and Daily Picks can be tailored to you.</p>
        <p style={p}><span style={strong}>Bet history:</span> bets you log manually or via Snap to Log, including photos of bet slips you choose to upload. We (and our AI processing partner, on our behalf) process these photos to extract bet details like teams, odds, and stake.</p>
        <p style={p}><span style={strong}>Hunter conversations:</span> the messages you send to Hunter and the responses you receive, so we can maintain your chat history within the Service.</p>
        <p style={p}><span style={strong}>Payment information:</span> subscription and billing information is handled directly by our payment processor, Stripe. We do not store your full card number on our own servers.</p>
        <p style={p}><span style={strong}>Usage and device data:</span> basic technical information (like browser/device type, IP address, and how you interact with the Service) collected automatically to keep the Service reliable and secure.</p>
        <p style={p}><span style={strong}>Cookies/analytics:</span> Betcierge does not currently use third-party analytics, advertising, or tracking tools. We use only essential cookies necessary to keep you signed in and to operate the Service securely. If we add an analytics tool in the future, we will update this section before it goes into use.</p>

        <h2 style={h2}>2. How We Use Your Information</h2>
        <p style={p}>We use the information above to:</p>
        <ul>
          <li style={li}>Create and maintain your account, and personalize Hunter and Daily Picks to your bankroll, goals, and sports;</li>
          <li style={li}>Process and auto-settle your logged bets;</li>
          <li style={li}>Process payments and manage your subscription and trial;</li>
          <li style={li}>Send you pick alerts or account messages by text, if you have opted in (reply STOP anytime to opt out);</li>
          <li style={li}>Send transactional email (e.g., account confirmations, receipts) via our email provider;</li>
          <li style={li}>Maintain security, prevent fraud and abuse, and enforce our Terms of Service;</li>
          <li style={li}>Improve the Service, including the accuracy of Hunter and our picks process.</li>
        </ul>
        <p style={p}>We do not sell your personal information.</p>

        <h2 style={h2}>3. AI Processing</h2>
        <p style={p}>
          Hunter&rsquo;s responses, and Betcierge&rsquo;s Daily Picks research, are generated using a third-party AI provider
          (Anthropic&rsquo;s Claude API), which may perform real-time web searches to inform its answers. Your chat messages
          and relevant betting context (like your bankroll and goals) are sent to that provider solely to generate your
          responses, under that provider&rsquo;s own API data-handling terms. If you upload a bet slip photo, that image is
          processed by our AI provider to extract bet details.
        </p>

        <h2 style={h2}>4. Text Messages (SMS)</h2>
        <p style={p}>
          If you opt in to pick alerts, you will receive automated texts with today&rsquo;s picks and related account alerts.
          Message frequency varies. Message and data rates may apply. Reply <span style={strong}>STOP</span> to cancel at any
          time, or <span style={strong}>HELP</span> for help. Opting in to SMS is never required to use Betcierge.
        </p>

        <h2 style={h2}>5. How We Share Information</h2>
        <p style={p}>We share information only with the service providers who help us run Betcierge, and only as needed for them to provide their service to us:</p>
        <ul>
          <li style={li}><span style={strong}>Supabase</span> &mdash; account data and database hosting</li>
          <li style={li}><span style={strong}>Stripe</span> &mdash; payment processing</li>
          <li style={li}><span style={strong}>Anthropic</span> &mdash; AI processing for Hunter and Daily Picks (as described above)</li>
          <li style={li}><span style={strong}>The Odds API / MLB Stats API</span> &mdash; sports odds and results data (we send game/market identifiers, not your personal data, to these providers)</li>
          <li style={li}><span style={strong}>Postmark</span> &mdash; transactional email delivery</li>
          <li style={li}><span style={strong}>SMS provider</span> &mdash; text message delivery, if and when SMS is enabled and you have opted in</li>
          <li style={li}><span style={strong}>Google</span> &mdash; if you choose to sign in with Google</li>
        </ul>
        <p style={p}>We may also share information if required by law, to protect our rights, or in connection with a business transfer (like a merger or acquisition), in which case we would tell you.</p>

        <h2 style={h2}>6. Data Retention</h2>
        <p style={p}>
          We keep your account and bet history for as long as your account is active, so your history and record stay intact.
          If you delete your account, we will delete or de-identify your personal information within a reasonable period,
          except where we are required to retain records (e.g., for tax, fraud-prevention, or legal purposes).
        </p>

        <h2 style={h2}>7. Your Rights and Choices</h2>
        <ul>
          <li style={li}><span style={strong}>Access/update:</span> you can view and update most of your profile information directly in the app.</li>
          <li style={li}><span style={strong}>Delete your account:</span> contact us at <a href="mailto:support@thebetcierge.com" style={a}>support@thebetcierge.com</a> to request deletion.</li>
          <li style={li}><span style={strong}>Opt out of texts:</span> reply STOP to any message, or turn off SMS in your account settings.</li>
          <li style={li}><span style={strong}>California residents:</span> under the California Consumer Privacy Act (CCPA/CPRA), you have the right to know what personal information we collect, request deletion, and opt out of the sale/sharing of personal information. <span style={strong}>We do not sell your personal information.</span> To exercise these rights, contact us at <a href="mailto:support@thebetcierge.com" style={a}>support@thebetcierge.com</a>.</li>
          <li style={li}><span style={strong}>Other states:</span> several other states have similar privacy laws; if you are a resident of one of these, you may have comparable rights. Contact us and we will honor applicable requests.</li>
        </ul>

        <h2 style={h2}>8. Data Security</h2>
        <p style={p}>
          We use reasonable administrative, technical, and physical safeguards (including working with providers like Supabase
          and Stripe, who maintain their own security standards) to protect your information. No system is 100% secure, and we
          cannot guarantee absolute security.
        </p>

        <h2 style={h2}>9. Children&rsquo;s Privacy</h2>
        <p style={p}>
          Betcierge is intended for users 21 and older. We do not knowingly collect information from anyone under 21. If we
          learn we have collected information from someone under 21, we will delete it.
        </p>

        <h2 style={h2}>10. Changes to This Policy</h2>
        <p style={p}>
          We may update this Privacy Policy from time to time. If we make material changes, we will notify you (e.g., by email
          or in-app notice) before they take effect.
        </p>

        <h2 style={h2}>11. Contact Us</h2>
        <p style={p}>
          Questions about this Privacy Policy or your data? Reach us at <a href="mailto:support@thebetcierge.com" style={a}>support@thebetcierge.com</a>,
          or by mail at DBP Corp, 6237 1/2 Nita Avenue, Woodland Hills, CA 91367.
        </p>

        <div style={foot}>
          &copy; 2026 DBP Corp, d/b/a Betcierge. &nbsp;·&nbsp; <a href="/terms" style={a}>Terms of Service</a>
        </div>
      </div>
    </main>
  );
}
