import { LegalLayout } from "./LegalLayout";

const RefundPolicy = () => (
  <LegalLayout
    title="Refund Policy"
    description="How refunds, Points, and Boosts work at Decks."
    path="/refund-policy"
  >
    <p>
      This policy explains our position on refunds for Points, Boosts, and any future paid
      features on Decks.
    </p>

    <h2>1. Boosts are a digital good</h2>
    <p>
      Boosts are digital platform credits delivered instantly inside Decks. Once a Boost is
      applied to a request, it has been consumed and the service has been rendered.
    </p>

    <h2>2. What Boosts do (and don't do)</h2>
    <p>
      <strong>Boosts increase visibility only. DJs remain in full control of what gets played.
      Boosts do not guarantee playback.</strong> Requesting a song, receiving upvotes, or spending
      Boosts does not entitle anyone to have a song played at any event.
    </p>

    <h2>3. No cash value</h2>
    <p>
      <strong>Points and boosts are digital platform credits. They have no cash value, are
      non-transferable, and cannot be redeemed for money.</strong> We may adjust, expire, or
      revoke them to combat abuse or fraud.
    </p>

    <h2>4. All purchases final</h2>
    <p>
      <strong>Purchases of boost credits, when enabled, are final and non-refundable.</strong> At
      checkout you will be required to confirm that you understand: (a) Boosts increase visibility
      only, (b) DJs are not required to play your song, and (c) the purchase is non-refundable.
    </p>
    <p>The following are <strong>not</strong> eligible for refunds:</p>
    <ul>
      <li>The DJ chose not to play your song.</li>
      <li>The DJ skipped or rejected your request.</li>
      <li>The event ended before your song was played.</li>
      <li>You changed your mind after applying a Boost.</li>
      <li>You removed your own request.</li>
      <li>Any other event outcome — event outcomes are not guaranteed.</li>
    </ul>

    <h2>5. Exceptions</h2>
    <p>We will consider refunds at our discretion only in the following cases:</p>
    <ul>
      <li>A confirmed technical error on Decks's side prevented the Boost from being applied.</li>
      <li>A duplicate charge.</li>
      <li>Where required by law in your jurisdiction.</li>
    </ul>

    <h2>6. Chargebacks</h2>
    <p>
      We take chargebacks seriously. Filing a chargeback for a delivered Boost may result in
      suspension of your account. Please contact{" "}
      <a href="mailto:support@linku99.com">support@linku99.com</a> first — we'd much rather sort
      it out directly.
    </p>

    <h2>7. How to request a review</h2>
    <p>
      Email <a href="mailto:support@linku99.com">support@linku99.com</a> within 14 days of the
      charge with your account email, the event code, and a short description of the issue.
    </p>
  </LegalLayout>
);

export default RefundPolicy;
