import { Mail, ShieldCheck, Copyright } from "lucide-react";
import { LegalLayout } from "./LegalLayout";

const Contact = () => (
  <LegalLayout
    title="Contact Decks"
    description="Get in touch with the Decks team for support, safety, or legal matters."
    path="/contact"
  >
    <p>
      We typically respond to support emails within <strong>2 business days</strong>. For abuse or
      safety issues, please use the channel below so we can prioritize them.
    </p>

    <div className="not-prose grid sm:grid-cols-2 gap-4 my-6">
      <a
        href="mailto:support@linku99.com"
        className="block rounded-2xl border border-border/60 bg-card/40 p-5 hover:border-primary/40 transition-colors"
      >
        <Mail className="h-5 w-5 text-primary mb-2" />
        <div className="font-semibold">General support</div>
        <div className="text-xs text-muted-foreground mt-0.5">support@linku99.com</div>
      </a>
      <a
        href="mailto:safety@linku99.com"
        className="block rounded-2xl border border-border/60 bg-card/40 p-5 hover:border-primary/40 transition-colors"
      >
        <ShieldCheck className="h-5 w-5 text-primary mb-2" />
        <div className="font-semibold">Trust &amp; Safety</div>
        <div className="text-xs text-muted-foreground mt-0.5">safety@linku99.com</div>
      </a>
      <a
        href="mailto:dmca@linku99.com"
        className="block rounded-2xl border border-border/60 bg-card/40 p-5 hover:border-primary/40 transition-colors"
      >
        <Copyright className="h-5 w-5 text-primary mb-2" />
        <div className="font-semibold">Copyright (DMCA)</div>
        <div className="text-xs text-muted-foreground mt-0.5">dmca@linku99.com</div>
      </a>
      <a
        href="mailto:privacy@linku99.com"
        className="block rounded-2xl border border-border/60 bg-card/40 p-5 hover:border-primary/40 transition-colors"
      >
        <Mail className="h-5 w-5 text-primary mb-2" />
        <div className="font-semibold">Privacy &amp; data requests</div>
        <div className="text-xs text-muted-foreground mt-0.5">privacy@linku99.com</div>
      </a>
    </div>

    <h2>Reporting abuse</h2>
    <p>
      To report a user, nickname, or song request that violates our community rules, see{" "}
      <a href="/trust-safety">Trust &amp; Safety</a>. Include the event code and a screenshot if
      possible.
    </p>

    <h2>Press &amp; partnerships</h2>
    <p>
      Drop us a line at <a href="mailto:support@linku99.com">support@linku99.com</a> with "Press"
      or "Partnership" in the subject and we'll route it appropriately.
    </p>
  </LegalLayout>
);

export default Contact;
