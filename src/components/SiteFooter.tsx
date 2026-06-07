import { Link } from "react-router-dom";
import { Disc3 } from "lucide-react";

const SUPPORT_EMAIL = "support@linku99.com";

export function SiteFooter() {
  return (
    <footer className="mt-16 border-t border-white/[0.05] bg-background/40">
      <div className="container py-10 grid gap-8 md:grid-cols-4 text-sm">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <Disc3 className="h-5 w-5 text-primary" />
            <span className="font-semibold">Decks</span>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed">
            The crowd picks. The DJ decides.
          </p>
        </div>

        <div>
          <div className="font-medium mb-2 text-xs uppercase tracking-wider text-muted-foreground">Product</div>
          <ul className="space-y-1.5">
            <li><Link to="/" className="hover:text-primary">Home</Link></li>
            <li><Link to="/join" className="hover:text-primary">Join an event</Link></li>
            <li><Link to="/auth?role=dj" className="hover:text-primary">DJ login</Link></li>
          </ul>
        </div>

        <div>
          <div className="font-medium mb-2 text-xs uppercase tracking-wider text-muted-foreground">Legal</div>
          <ul className="space-y-1.5">
            <li><Link to="/terms" className="hover:text-primary">Terms of Service</Link></li>
            <li><Link to="/privacy" className="hover:text-primary">Privacy Policy</Link></li>
            <li><Link to="/refund-policy" className="hover:text-primary">Refund Policy</Link></li>
            <li><Link to="/dmca" className="hover:text-primary">DMCA</Link></li>
          </ul>
        </div>

        <div>
          <div className="font-medium mb-2 text-xs uppercase tracking-wider text-muted-foreground">Support</div>
          <ul className="space-y-1.5">
            <li><Link to="/contact" className="hover:text-primary">Contact</Link></li>
            <li><Link to="/trust-safety" className="hover:text-primary">Trust &amp; Safety</Link></li>
            <li>
              <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-primary">{SUPPORT_EMAIL}</a>
            </li>
          </ul>
        </div>
      </div>
      <div className="border-t border-white/[0.05] py-4 text-center text-xs text-muted-foreground">
        © {new Date().getFullYear()} Decks. Built for the dancefloor. <span className="text-primary">♪</span>
      </div>
    </footer>
  );
}
