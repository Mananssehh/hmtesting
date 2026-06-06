import { Link } from "react-router-dom";
import {
  Disc3, Headphones, Radio, Sparkles, Vote,
  QrCode, Zap, Users, Music4, ArrowRight, Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { StartAsDjCta } from "@/components/StartAsDjCta";

const features = [
  { icon: Vote, title: "Reddit-style voting", desc: "Upvote bangers, downvote skips. The crowd shapes the night." },
  { icon: Radio, title: "Realtime DJ queue", desc: "DJs see top requests update instantly. No more shouting at the booth." },
  { icon: Sparkles, title: "Boost requests", desc: "Spend points to push a song up the queue — the DJ still picks what plays." },
];

const sides = [
  {
    icon: Disc3,
    title: "For DJs",
    tagline: "See what the crowd wants in real time.",
    points: [
      "Live song requests ranked by demand",
      "Approve, skip, or play requests instantly",
      "Track what’s getting the biggest reaction",
      "Stay in complete control of the music",
    ],
    cta: { to: "/auth?role=dj", label: "Start as a DJ", icon: Disc3 },
  },
  {
    icon: Users,
    title: "For Guests",
    tagline: "Help shape the soundtrack of the night.",
    points: [
      "Join with a simple event code",
      "Request your favorite songs",
      "Vote songs up or down",
      "Boost requests to get the DJ’s attention",
      "See what’s playing live",
    ],
    cta: { to: "/join", label: "Join an Event", icon: Headphones },
  },
];

const Landing = () => {
  return (
    <div className="min-h-screen">
      <SEO
        title="Decks — The Crowd Picks. The DJ Decides."
        description="Decks is a live interaction platform between DJs and their crowd. Guests request and vote on songs in real time. DJs decide what plays."
        path="/"
      />
      <AppHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-60" style={{ backgroundImage: "var(--gradient-glow)" }} />
        <div className="container py-16 sm:py-28 text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6 animate-pulse-glow">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Live song requests between DJs &amp; their crowd
          </div>
          <h1 className="text-4xl sm:text-7xl font-bold tracking-tight leading-[1.05]">
            The crowd picks. <br className="hidden sm:block" />
            <span className="text-gradient">The DJ decides.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto px-2">
            Decks is the live link between DJs and the dancefloor. Guests request and vote on songs in real time.
            Boosts raise visibility — the DJ still chooses what actually plays.
          </p>
          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 justify-center px-4">
            <Button asChild size="lg" variant="premium">
              <Link to="/auth?role=dj">
                <Disc3 className="mr-2 h-5 w-5" />
                Start as a DJ
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base border-primary/30 hover:bg-primary/10">
              <Link to="/join">
                <Headphones className="mr-2 h-5 w-5" />
                Join an Event
              </Link>
            </Button>
          </div>
          <p className="mt-4 text-xs text-muted-foreground">No app to download. Free to try.</p>
        </div>
      </section>

      {/* Features grid */}
      <section className="container pb-12 sm:pb-16">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-4 sm:p-6 rounded-2xl bg-card/60 border border-border/60 hover:border-primary/40 hover:-translate-y-1 transition-all">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold mb-1 text-sm sm:text-base">{title}</h3>
              <p className="text-xs sm:text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="container py-12 sm:py-16 max-w-5xl">
        <div className="text-center mb-10 sm:mb-12">
          <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">How it works</p>
          <h2 className="text-3xl sm:text-4xl font-bold">From booth to dancefloor</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
          {[
            { n: "01", t: "DJ creates a session", d: "Get a 6-character room code & QR for the night.", icon: QrCode },
            { n: "02", t: "Guests join & request", d: "No app store. Just scan, type a nickname, and start voting.", icon: Headphones },
            { n: "03", t: "Top tracks rise live", d: "Highest-voted requests rise up the DJ’s live queue.", icon: Zap },
          ].map(({ n, t, d, icon: Icon }) => (
            <div key={n} className="relative p-5 sm:p-6 rounded-2xl glass">
              <div className="flex items-center justify-between mb-3">
                <div className="text-4xl sm:text-5xl font-bold text-primary/20">{n}</div>
                <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <h3 className="text-lg font-semibold mb-1">{t}</h3>
              <p className="text-sm text-muted-foreground">{d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* One App. One Crowd. One DJ. */}
      <section className="container py-12 sm:py-16">
        <div className="text-center mb-10 sm:mb-12">
          <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Built for the dancefloor</p>
          <h2 className="text-3xl sm:text-4xl font-bold">One App. One Crowd. One DJ.</h2>
        </div>
        <div className="grid md:grid-cols-2 gap-4 sm:gap-6 max-w-5xl mx-auto">
          {sides.map(({ icon: Icon, title, tagline, points, cta }) => {
            const CtaIcon = cta.icon;
            return (
              <div key={title} className="p-6 sm:p-8 rounded-2xl glass flex flex-col">
                <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                  <Icon className="h-5 w-5" />
                </div>
                <h3 className="text-xl font-semibold mb-1">{title}</h3>
                <p className="text-sm text-muted-foreground mb-4">{tagline}</p>
                <ul className="space-y-2 mb-6 flex-1">
                  {points.map((p) => (
                    <li key={p} className="flex items-start gap-2 text-sm">
                      <Check className="h-4 w-4 text-primary mt-0.5 shrink-0" />
                      <span className="text-foreground/90">{p}</span>
                    </li>
                  ))}
                </ul>
                <Button asChild variant="outline" className="border-primary/30 hover:bg-primary/10">
                  <Link to={cta.to}>
                    <CtaIcon className="mr-2 h-4 w-4" />
                    {cta.label} <ArrowRight className="ml-1 h-4 w-4" />
                  </Link>
                </Button>
              </div>
            );
          })}
        </div>
      </section>

      {/* Points explainer — verified backend values */}
      <section className="container py-12 sm:py-16 max-w-5xl">
        <div className="rounded-3xl p-6 sm:p-10 glass-strong">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Points &amp; boosts</p>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3">Earn points. Boost your song’s visibility.</h2>
              <p className="text-muted-foreground mb-6">
                Every new guest starts with <span className="text-primary font-medium">15 points</span>.
                Earn more by joining events and requesting songs.
                Spend points to <span className="text-primary font-medium">boost</span> a request higher in the queue —
                the DJ still decides what actually plays.
              </p>
...
              {[
                { v: "+15", l: "Starter points" },
                { v: "+1", l: "Join an event" },
                { v: "+1", l: "Request a song" },
                { v: "1:1", l: "Points → boost" },
              ].map((s) => (
                <div key={s.l} className="p-4 rounded-2xl bg-background/60 border border-border/60 text-center">
                  <div className="text-2xl font-bold text-gradient">{s.v}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Final CTA */}
      <section className="container py-16 text-center max-w-3xl">
        <Music4 className="h-10 w-10 text-primary mx-auto mb-4" />
        <h2 className="text-3xl sm:text-4xl font-bold mb-3">The crowd picks. The DJ decides.</h2>
        <p className="text-muted-foreground mb-8">Spin up a live event in 30 seconds.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg" variant="premium">
            <Link to="/auth?role=dj">Start as a DJ</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 px-8 border-primary/30 hover:bg-primary/10">
            <Link to="/join">Join an Event</Link>
          </Button>
        </div>
      </section>

      <footer className="container py-10 border-t border-border/40 text-center text-sm text-muted-foreground">
        Built for the dancefloor. <span className="text-primary">♪</span>
      </footer>
    </div>
  );
};

export default Landing;
