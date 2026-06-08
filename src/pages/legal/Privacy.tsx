import { LegalLayout } from "./LegalLayout";

const Privacy = () => (
  <LegalLayout
    title="Privacy Policy"
    description="How Decks collects, uses, and protects your data."
    path="/privacy"
  >
    <p>
      This policy explains what data Decks collects, why we collect it, and the choices you have.
    </p>

    <h2>1. Data we collect</h2>
    <ul>
      <li><strong>Account data:</strong> email address, nickname, and password hash (managed by our authentication provider).</li>
      <li><strong>Activity data:</strong> song requests, votes, boosts, points balance, reports you submit, and events you participate in.</li>
      <li><strong>Technical data:</strong> IP address, browser type, and timestamps — used for abuse prevention and debugging.</li>
      <li><strong>Guest sessions:</strong> if you join an event without signing up, we create an anonymous session linked to your nickname.</li>
    </ul>

    <h2>2. How we use it</h2>
    <ul>
      <li>Operate the Service (show requests to DJs, rank queues, track points, handle reports).</li>
      <li>Prevent abuse, spam, and fraud.</li>
      <li>Communicate about your account (password resets, important changes).</li>
      <li>Improve the product through aggregated analytics.</li>
    </ul>
    <p>We do not sell your personal data.</p>

    <h2>3. Service providers</h2>
    <ul>
      <li><strong>Supabase / Lovable Cloud</strong> — application hosting, database, authentication.</li>
      <li><strong>Spotify</strong> — song metadata lookups.</li>
      <li><strong>Apple / iTunes Search</strong> — song metadata and artwork lookups.</li>
      <li><strong>Stripe</strong> — payment processing (only when paid Boost purchases are enabled).</li>
    </ul>

    <h2>4. Data retention</h2>
    <ul>
      <li>Account data: kept while your account is active.</li>
      <li>Event &amp; request data: kept for as long as the event archive exists.</li>
      <li>Abuse logs (IP, error logs): rotated after 90 days.</li>
    </ul>

    <h2>5. Account deletion &amp; your rights</h2>
    <p>
      You can request deletion of your account at any time by emailing{" "}
      <a href="mailto:support@linku99.com">support@linku99.com</a> from the email associated with
      your account. We will confirm your identity and delete your account, personal data, and
      associated activity within 30 days, except where we are legally required to retain certain
      records (e.g. payment receipts).
    </p>
    <p>
      Depending on your jurisdiction (EU/UK/California and others) you may also have the right to
      access, correct, or export your personal data. Email the same address and we will respond
      within 30 days.
    </p>

    <h2>6. Children</h2>
    <p>
      Decks is not intended for users under 13 (or 16 in the EEA). If we learn we have collected
      data from a child under that age, we will delete it.
    </p>

    <h2>7. Cookies</h2>
    <p>
      We use essential cookies and local storage to keep you signed in and remember your session.
      We do not use third-party advertising cookies.
    </p>

    <h2>8. Security</h2>
    <p>
      We use industry-standard encryption in transit and at rest. No service is 100% secure, but
      we work hard to protect your data.
    </p>

    <h2>9. Changes</h2>
    <p>
      We may update this Policy. Material changes will be announced in-app or by email.
    </p>

    <h2>10. Contact</h2>
    <p>
      Privacy questions or account deletion requests? Email{" "}
      <a href="mailto:support@linku99.com">support@linku99.com</a>.
    </p>
  </LegalLayout>
);

export default Privacy;
