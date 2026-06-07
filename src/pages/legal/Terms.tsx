import { LegalLayout } from "./LegalLayout";

const Terms = () => (
  <LegalLayout
    title="Terms of Service"
    description="The terms that govern your use of Decks."
    path="/terms"
  >
    <p>
      Welcome to Decks ("we", "our", "us"). By accessing or using Decks (the "Service") you agree to
      these Terms of Service. If you don't agree, please don't use the Service.
    </p>

    <h2>1. Who can use Decks</h2>
    <p>
      You must be at least 13 years old (16 in the European Economic Area) to use Decks. By using
      the Service you confirm you meet this requirement.
    </p>

    <h2>2. What Decks does</h2>
    <p>
      Decks lets guests request and vote on songs at live events. DJs see those requests in real
      time and choose what to play. <strong>Decks does not host, stream, or play audio.</strong> All
      music metadata is supplied by third parties (Apple Music, Spotify).
    </p>

    <h2>3. DJ discretion</h2>
    <p>
      <strong>DJs always retain full discretion over what is played.</strong> Requesting a song,
      receiving upvotes, or spending Boosts does not entitle anyone to have a song played. Boosts
      only increase a request's visibility in the DJ's queue.
    </p>

    <h2>4. Points and Boosts (virtual items)</h2>
    <ul>
      <li>Points and Boosts are a virtual item with no monetary value.</li>
      <li>They are non-refundable, non-transferable, and non-redeemable for cash.</li>
      <li>Boosts are consumed when applied to a request and are not returned if the DJ does not play the song, if the event ends, or if your request is removed for any reason.</li>
      <li>We may adjust, expire, or revoke Points and Boosts to combat abuse or fraud.</li>
    </ul>

    <h2>5. Your account</h2>
    <p>
      You are responsible for activity under your account and for keeping your credentials secure.
      Don't impersonate others, use offensive nicknames, or attempt to bypass moderation tools.
    </p>

    <h2>6. Acceptable use</h2>
    <ul>
      <li>No harassment, hate speech, sexual content, threats, or illegal activity.</li>
      <li>No spam, scraping, automated requests, or attempts to overwhelm the Service.</li>
      <li>No attempts to manipulate the queue, reverse-engineer the Service, or interfere with other users.</li>
    </ul>
    <p>
      We may suspend or terminate accounts that violate these rules. See our{" "}
      <a href="/trust-safety">Trust &amp; Safety</a> page for details.
    </p>

    <h2>7. Content and copyright</h2>
    <p>
      Song metadata (titles, artists, artwork) is provided by Apple and Spotify and remains the
      property of their respective owners. Decks complies with the DMCA — see our{" "}
      <a href="/dmca">DMCA Policy</a>.
    </p>

    <h2>8. Disclaimers</h2>
    <p>
      The Service is provided "as is" without warranties of any kind. We do not guarantee
      uninterrupted availability, accuracy of third-party data, or that any particular song will be
      played at any event.
    </p>

    <h2>9. Limitation of liability</h2>
    <p>
      To the maximum extent permitted by law, Decks is not liable for indirect, incidental, or
      consequential damages. Our total liability for any claim is limited to the amount you paid us
      (if any) in the 12 months before the claim arose.
    </p>

    <h2>10. Changes</h2>
    <p>
      We may update these Terms. Material changes will be announced in-app or by email. Continued
      use after changes take effect means you accept them.
    </p>

    <h2>11. Contact</h2>
    <p>
      Questions about these Terms? Email <a href="mailto:support@linku99.com">support@linku99.com</a>.
    </p>
  </LegalLayout>
);

export default Terms;
