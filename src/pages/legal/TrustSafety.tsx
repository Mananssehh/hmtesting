import { LegalLayout } from "./LegalLayout";

const TrustSafety = () => (
  <LegalLayout
    title="Trust & Safety"
    description="Community rules, reporting, and enforcement at Decks."
    path="/trust-safety"
  >
    <p>
      Decks is a shared dancefloor. These rules keep events fun and safe for everyone — guests and
      DJs alike.
    </p>

    <h2>Community rules</h2>
    <ul>
      <li><strong>No harassment or hate speech</strong> — including slurs, threats, or targeting people based on identity.</li>
      <li><strong>No offensive nicknames</strong> — nicknames must be appropriate for a public venue. We filter and may rename violators.</li>
      <li><strong>No sexual content or grooming</strong> — directed at anyone, especially minors.</li>
      <li><strong>No spam or flooding</strong> — rate limits apply to requests and boosts.</li>
      <li><strong>No queue manipulation</strong> — botting, multi-accounting, or coordinated abuse will result in a ban.</li>
      <li><strong>No illegal activity</strong> — including doxxing, fraud, or sharing illegal content.</li>
    </ul>

    <h2>How to report</h2>
    <p>To report a request, nickname, or user, email{" "}
      <a href="mailto:safety@linku99.com">safety@linku99.com</a> with:
    </p>
    <ul>
      <li>The event room code.</li>
      <li>The nickname or request title.</li>
      <li>A screenshot if possible.</li>
      <li>A short description of what happened.</li>
    </ul>
    <p>
      DJs can also block guests and remove requests directly from their event dashboard. In an
      emergency or imminent harm situation, contact local authorities first.
    </p>

    <h2>Enforcement</h2>
    <p>Depending on severity and history, we may:</p>
    <ul>
      <li>Hide or delete the offending content.</li>
      <li>Rename a violating nickname.</li>
      <li>Issue a warning.</li>
      <li>Suspend the account temporarily.</li>
      <li>Permanently ban the account and device.</li>
      <li>Report to law enforcement when legally required.</li>
    </ul>

    <h2>Appeals</h2>
    <p>
      If you believe an action was taken in error, reply to the enforcement email or contact{" "}
      <a href="mailto:safety@linku99.com">safety@linku99.com</a>. We aim to review appeals within 5
      business days.
    </p>

    <h2>For DJs</h2>
    <p>
      You are responsible for content played at your event. Decks provides moderation tools
      (blocklist, profanity filter, remove request, ban guest) — please use them. Repeated reports
      against an event may result in the event being suspended.
    </p>
  </LegalLayout>
);

export default TrustSafety;
