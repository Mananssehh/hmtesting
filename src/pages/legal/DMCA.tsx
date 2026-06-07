import { LegalLayout } from "./LegalLayout";

const DMCA = () => (
  <LegalLayout
    title="DMCA Policy"
    description="How to submit a copyright takedown notice to Decks."
    path="/dmca"
  >
    <p>
      Decks respects the intellectual property rights of others. <strong>Decks does not host,
      stream, or play any audio recordings.</strong> The Service displays song metadata (titles,
      artists, album artwork) sourced from third-party catalogs (Apple Music, Spotify), and links
      users back to those services for playback.
    </p>

    <h2>Reporting a copyright concern</h2>
    <p>
      If you believe material displayed through Decks infringes your copyright, send a written
      notice to our Designated Agent at:
    </p>
    <p>
      <strong>Email:</strong> <a href="mailto:dmca@linku99.com">dmca@linku99.com</a>
    </p>

    <h2>What to include</h2>
    <ul>
      <li>A physical or electronic signature of the copyright owner or authorized representative.</li>
      <li>Identification of the copyrighted work claimed to be infringed.</li>
      <li>Identification of the material that is claimed to be infringing and where it appears on Decks (event link, request URL, screenshot).</li>
      <li>Your contact information (address, telephone number, email).</li>
      <li>A statement that you have a good-faith belief that the use is not authorized.</li>
      <li>A statement, under penalty of perjury, that the information is accurate and that you are authorized to act on the owner's behalf.</li>
    </ul>

    <h2>Counter-notices</h2>
    <p>
      If you believe content was removed in error, you may submit a counter-notice to the same
      email address with the equivalent information.
    </p>

    <h2>Repeat infringers</h2>
    <p>
      Decks will, in appropriate circumstances, terminate the accounts of users who are repeat
      infringers.
    </p>

    <p className="text-xs text-muted-foreground">
      This summary is not legal advice. Misrepresentations in a DMCA notice may carry legal
      penalties under 17 U.S.C. § 512(f).
    </p>
  </LegalLayout>
);

export default DMCA;
