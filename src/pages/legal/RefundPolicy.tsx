import { LegalLayout } from "./LegalLayout";

const RefundPolicy = () => (
  <LegalLayout
    title="Refund Policy"
    description="How refunds, Points, and Boosts work at Decks."
    path="/refund-policy"
  >
    <p>
      This policy explains our position on refunds for Points, Boosts, and any future paid features
      on Decks.
    </p>

    <h2>1. Points and Boosts are a virtual item</h2>
    <ul>
      <li>Points and Boosts have no monetary value.</li>
      <li>They are non-refundable, non-transferable, and non-redeemable for cash.</li>
      <li>Boosts are consumed when you apply them to a request.</li>
    </ul>

    <h2>2. What Boosts do (and don't do)</h2>
    <p>
      A Boost <strong>increases the visibility</strong> of your request in the DJ's queue. It does
      not guarantee that the DJ will play your song. <strong>DJs retain full discretion over what
      is played at every event.</strong>
    </p>
    <p>
      Because you have received the service you paid for (increased visibility), the following
      events are <strong>not</strong> eligible for refunds:
    </p>
    <ul>
      <li>The DJ chose not to play your song.</li>
      <li>The DJ skipped or rejected your request.</li>
      <li>The event ended before your song was played.</li>
      <li>You changed your mind after applying a Boost.</li>
      <li>You removed your own request.</li>
    </ul>

    <h2>3. All purchases final</h2>
    <p>
      Where Decks offers paid Points or Boost packages in the future, all purchases are{" "}
      <strong>final</strong>. By completing checkout you will be required to confirm that you
      understand: (a) Boosts increase visibility only, (b) DJs are not required to play your song,
      and (c) the purchase is non-refundable.
    </p>

    <h2>4. Exceptions</h2>
    <p>
      We will consider refunds at our discretion only in the following cases:
    </p>
    <ul>
      <li>A confirmed technical error on Decks's side prevented the Boost from being applied.</li>
      <li>A duplicate charge.</li>
      <li>Where required by law in your jurisdiction.</li>
    </ul>

    <h2>5. Chargebacks</h2>
    <p>
      We take chargebacks seriously. Filing a chargeback for a delivered service (a Boost that was
      applied) may result in suspension of your account. Please contact{" "}
      <a href="mailto:support@linku99.com">support@linku99.com</a> first — we'd much rather sort it
      out directly.
    </p>

    <h2>6. How to request a review</h2>
    <p>
      Email <a href="mailto:support@linku99.com">support@linku99.com</a> within 14 days of the
      charge with your account email, the event code, and a short description of the issue.
    </p>
  </LegalLayout>
);

export default RefundPolicy;
