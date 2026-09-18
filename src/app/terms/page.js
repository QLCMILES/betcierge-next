export const metadata = {
  title: "Terms of Service — Betcierge",
  description: "The terms governing your use of Betcierge.",
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

export default function TermsPage() {
  return (
    <main style={wrap}>
      <div style={inner}>
        <div style={header}>
          <a href="/" style={wordmark}>BETCIERGE</a>
          <a href="/" style={backLink}>&larr; Back to app</a>
        </div>

        <h1 style={h1}>Terms of Service</h1>
        <p style={dates}>Effective Date: September 18, 2026 &nbsp;·&nbsp; Last Updated: September 18, 2026</p>

        <p style={p}>
          Welcome to Betcierge. These Terms of Service (&ldquo;<span style={strong}>Terms</span>&rdquo;) are a legal
          agreement between you (&ldquo;<span style={strong}>you</span>&rdquo; or &ldquo;<span style={strong}>User</span>&rdquo;)
          and DBP Corp, a Delaware corporation, doing business as Betcierge (&ldquo;<span style={strong}>Betcierge</span>&rdquo;,
          &ldquo;<span style={strong}>we</span>&rdquo;, &ldquo;<span style={strong}>us</span>&rdquo;, or &ldquo;<span style={strong}>our</span>&rdquo;).
          By creating an account, accessing, or using the Betcierge website, mobile application, or any related service
          (collectively, the &ldquo;<span style={strong}>Service</span>&rdquo;), you agree to be bound by these Terms. If
          you do not agree, do not use the Service.
        </p>

        <h2 style={h2}>1. What Betcierge Is</h2>
        <p style={p}>
          Betcierge provides sports betting <span style={strong}>research, analysis, coaching, and bet-tracking tools</span>,
          including AI-generated commentary and picks (&ldquo;Hunter&rdquo;) and a personal bet log (&ldquo;Snap to Log&rdquo;
          and manual entry). <span style={strong}>Betcierge is an informational and educational tool. Betcierge is not a
          sportsbook, bookmaker, betting exchange, or gambling operator.</span> We do not accept wagers, hold funds for
          betting purposes, place bets on your behalf, or pay out winnings. Any wagering you choose to do happens entirely
          through licensed third-party sportsbooks or platforms of your own choosing, under their own terms and subject to
          the laws of your jurisdiction.
        </p>
        <p style={p}>
          <span style={strong}>It is solely your responsibility to determine whether sports wagering is legal where you
          live, and to comply with all applicable laws.</span> Betcierge&rsquo;s picks, analysis, and any content from
          Hunter are opinions based on available data and are provided for informational and entertainment purposes only.
          <span style={strong}> They are not a guarantee of any outcome, and Betcierge is not responsible for the results
          of any bet you place.</span>
        </p>

        <h2 style={h2}>2. Eligibility</h2>
        <p style={p}>
          You must be at least 21 years old to create a Betcierge account and use the Service. By confirming your age
          during signup, you represent that this is true. We record the time, IP address, and device information associated
          with that confirmation as part of our compliance records. Creating an account under false pretenses, including
          misrepresenting your age, is a violation of these Terms and may result in immediate termination.
        </p>
        <p style={p}>
          You also represent that you are not located in, and are not a resident of, any jurisdiction where use of a
          sports-analysis or bet-tracking service of this kind is prohibited by law.
        </p>

        <h2 style={h2}>3. Your Account</h2>
        <ul>
          <li style={li}>You are responsible for maintaining the confidentiality of your login credentials and for all activity under your account.</li>
          <li style={li}>You must provide accurate information when creating your account and keep it up to date.</li>
          <li style={li}>You may sign up directly or via Google sign-in; if you use Google, you authorize us to receive your name and email from Google as described in our Privacy Policy.</li>
          <li style={li}>Notify us immediately at <a href="mailto:support@thebetcierge.com" style={a}>support@thebetcierge.com</a> if you suspect unauthorized use of your account.</li>
        </ul>

        <h2 style={h2}>4. Subscriptions, Billing, and Free Trial</h2>
        <ul>
          <li style={li}>Betcierge is offered on a subscription basis, billed through Stripe. Current pricing and trial terms are shown at checkout.</li>
          <li style={li}>New subscribers may be offered a free trial (currently 3 days). Trial eligibility is limited to one trial per verified phone number/account; we reserve the right to deny or revoke trial access we reasonably believe is fraudulent or abusive.</li>
          <li style={li}><span style={strong}>Your subscription automatically renews.</span> Unless you cancel before the trial ends or before a renewal date, your subscription will automatically renew and your payment method will be charged at the then-current price. If you are on a free trial, your payment method will be charged automatically when the trial period ends unless you cancel first.</li>
          <li style={li}>You can cancel anytime from your account settings. Cancellation takes effect at the end of the current billing period, and you retain access until then.</li>
          <li style={li}><span style={strong}>All sales are final. Payments are non-refundable, including for partial or unused billing periods, except where required by law.</span> Because the Service delivers time-sensitive research and picks that are consumed immediately, we do not provide refunds for change of mind, dissatisfaction with results, or unused subscription time.</li>
          <li style={li}><span style={strong}>Billing disputes.</span> If you believe you were charged in error, you agree to contact us at <a href="mailto:support@thebetcierge.com" style={a}>support@thebetcierge.com</a> to resolve the issue before initiating a chargeback or payment dispute with your bank or card provider. Initiating a chargeback without first contacting us may result in the immediate suspension or permanent termination of your account, and we reserve the right to pursue any remedies available to us to recover the disputed amount and any associated costs.</li>
          <li style={li}>We may change subscription pricing with notice; continued use after a price change takes effect constitutes acceptance.</li>
        </ul>

        <h2 style={h2}>5. Hunter and AI-Generated Content</h2>
        <p style={p}>
          Hunter is powered by third-party AI technology (including real-time web search) and generates analysis,
          commentary, and picks based on available data at the time of the request. <span style={strong}>AI-generated
          content can be incomplete, outdated, or wrong.</span> Hunter&rsquo;s responses do not constitute professional,
          financial, or legal advice, and you should not treat them as guaranteed outcomes. You are solely responsible for
          any betting or financial decision you make, whether or not it was informed by Hunter or by Betcierge&rsquo;s Daily
          Picks. We continually work to improve accuracy, but we do not warrant that any pick, projection, or piece of
          analysis will be correct.
        </p>

        <h2 style={h2}>6. Your Content (Bet Slips, Photos, and Data You Submit)</h2>
        <p style={p}>
          When you use Snap to Log or manually enter bets, you submit information and images to us (&ldquo;<span style={strong}>User
          Content</span>&rdquo;). You retain ownership of your User Content. By submitting it, you grant Betcierge a
          non-exclusive, worldwide, royalty-free license to use, process, host, and display that content solely to operate
          and improve the Service for you (for example, extracting bet details from a photo, or showing you your own bet
          history). You represent that you have the right to submit any content you upload and that it does not infringe
          anyone else&rsquo;s rights or contain unlawful material.
        </p>

        <h2 style={h2}>7. Acceptable Use</h2>
        <p style={p}>You agree not to:</p>
        <ul>
          <li style={li}>Use the Service for any unlawful purpose, including placing or facilitating wagers where prohibited by law;</li>
          <li style={li}>Attempt to circumvent age verification, trial limits, or subscription paywalls;</li>
          <li style={li}>Scrape, reverse-engineer, or use automated means to extract data or overload the Service (including abusing Hunter&rsquo;s AI endpoints);</li>
          <li style={li}>Share your account or resell access to the Service without our written permission;</li>
          <li style={li}>Upload content that is unlawful, infringing, or harmful to others.</li>
        </ul>
        <p style={p}>We may suspend or terminate accounts that violate this section.</p>

        <h2 style={h2}>8. Responsible Gambling</h2>
        <p style={p}>
          Betcierge is built to help you bet with more discipline and information &mdash; not to encourage betting beyond
          your means. If you or someone you know may have a gambling problem, help is available:
        </p>
        <ul>
          <li style={li}><span style={strong}>National Council on Problem Gambling Helpline:</span> 1-800-522-4700 (call or text, 24/7)</li>
          <li style={li}><a href="https://www.ncpgambling.org" style={a}>ncpgambling.org</a></li>
        </ul>
        <p style={p}>Betcierge is not a substitute for professional help with gambling-related harm.</p>

        <h2 style={h2}>9. Intellectual Property</h2>
        <p style={p}>
          The Service, including its software, design, &ldquo;Hunter&rdquo; branding, and the EI (&ldquo;Enhanced
          Intelligence&rdquo;) concept, is owned by Betcierge or its licensors and protected by intellectual property laws.
          These Terms do not grant you any rights to our trademarks, logos, or brand assets beyond what is needed to use the
          Service normally.
        </p>

        <h2 style={h2}>10. Third-Party Services</h2>
        <p style={p}>
          The Service relies on third-party providers, including payment processing (Stripe), data hosting (Supabase), AI
          processing (Anthropic), sports odds/data (The Odds API, MLB Stats API), and, if enabled, SMS delivery. Your use of
          the Service is also subject to the applicable terms of those providers where relevant. We are not responsible for
          the availability or accuracy of third-party services outside our control.
        </p>

        <h2 style={h2}>11. Disclaimers</h2>
        <p style={p}>
          THE SERVICE, INCLUDING ALL PICKS, ANALYSIS, AND HUNTER CONTENT, IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS
          AVAILABLE,&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF MERCHANTABILITY,
          FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT. WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED,
          ERROR-FREE, OR THAT ANY PICK OR PIECE OF ANALYSIS WILL LEAD TO A PROFITABLE OUTCOME.
        </p>

        <h2 style={h2}>12. Limitation of Liability</h2>
        <p style={p}>
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, BETCIERGE AND ITS OWNERS, EMPLOYEES, AND CONTRACTORS WILL NOT BE LIABLE FOR
          ANY INDIRECT, INCIDENTAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, OR ANY LOSS OF PROFITS, WINNINGS, OR DATA, ARISING
          FROM YOUR USE OF THE SERVICE OR ANY BETTING DECISION YOU MAKE &mdash; INCLUDING DECISIONS INFORMED BY HUNTER OR BY
          DAILY PICKS. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING TO THE SERVICE WILL NOT EXCEED THE AMOUNT YOU PAID US IN
          THE 3 MONTHS BEFORE THE CLAIM AROSE.
        </p>

        <h2 style={h2}>13. Indemnification</h2>
        <p style={p}>
          You agree to indemnify and hold Betcierge harmless from any claim arising from your violation of these Terms, your
          violation of any law (including gambling laws in your jurisdiction), or your User Content.
        </p>

        <h2 style={h2}>14. Dispute Resolution / Arbitration</h2>
        <p style={p}>
          Any dispute arising from these Terms or the Service will be resolved through binding individual arbitration rather
          than in court, except where prohibited by law. You may opt out of this arbitration agreement within 30 days of
          accepting these Terms by sending written notice to: DBP Corp, 6237 1/2 Nita Avenue, Woodland Hills, CA 91367. You
          and Betcierge each waive the right to a jury trial and to participate in a class action.
        </p>
        <p style={p}>
          These Terms are governed by the laws of the State of California, without regard to conflict-of-law principles.
        </p>

        <h2 style={h2}>15. Changes to These Terms</h2>
        <p style={p}>
          We may update these Terms from time to time. If we make material changes, we will notify you (e.g., by email or
          in-app notice) before they take effect. Continued use of the Service after changes take effect means you accept the
          updated Terms.
        </p>

        <h2 style={h2}>16. Termination</h2>
        <p style={p}>
          You may stop using the Service and cancel your subscription at any time. We may suspend or terminate your account
          if you violate these Terms, misuse the Service, or if required by law.
        </p>

        <h2 style={h2}>17. Contact</h2>
        <p style={p}>
          Questions about these Terms? Reach us at <a href="mailto:support@thebetcierge.com" style={a}>support@thebetcierge.com</a>,
          or by mail at DBP Corp, 6237 1/2 Nita Avenue, Woodland Hills, CA 91367.
        </p>

        <div style={foot}>
          &copy; 2026 DBP Corp, d/b/a Betcierge. &nbsp;·&nbsp; <a href="/privacy" style={a}>Privacy Policy</a>
        </div>
      </div>
    </main>
  );
}
