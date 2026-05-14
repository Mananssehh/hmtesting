import { Link } from "react-router-dom";
import {
  Disc3, Headphones, Radio, Sparkles, Trophy, Vote,
  QrCode, Zap, Users, Building2, Music4, ArrowRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";

const features = [
  { icon: Vote, title: "Reddit-style voting", desc: "Upvote bangers, downvote skips. The crowd shapes the night." },
  { icon: Trophy, title: "Live leaderboard", desc: "Earn points for requests and upvotes. Top requesters get bragging rights." },
  { icon: Radio, title: "Realtime DJ queue", desc: "DJs see top requests update instantly. No more shouting at the booth." },
  { icon: Sparkles, title: "Boost requests", desc: "Spend points to push your song to the top of the queue." },
];

const audiences = [
  {
    icon: Disc3, title: "For DJs",
    points: ["Live queue ranked by the crowd", "Approve, play, skip in one tap", "Stay in control — never auto-played"],
    cta: { to: "/auth?role=dj", label: "Start as DJ" },
  },
  {
    icon: Building2, title: "For Clubs",
    points: ["Print one QR for the night", "Reward top fans with points", "Real engagement data per event"],
    cta: { to: "/auth?role=dj", label: "Set up your venue" },
  },
  {
    icon: Users, title: "For Guests",
    points: ["No app store, just a code", "Vote songs up or down", "Boost your favorite to the top"],
    cta: { to: "/join", label: "Join an event" },
  },
];

const Landing = () => {
  return (
    <div className="min-h-screen">
      <AppHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-60" style={{ backgroundImage: "var(--gradient-glow)" }} />
        <div className="container py-16 sm:py-28 text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6 animate-pulse-glow">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Live song requests for clubs &amp; DJs
          </div>
          <h1 className="text-4xl sm:text-7xl font-bold tracking-tight leading-[1.05]">
            Let the crowd <br className="hidden sm:block" />
            <span className="text-gradient">pick the next track.</span>
          </h1>
          <p className="mt-6 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto px-2">
            Decks turns any club, lounge, or party into a live song request battleground.
            Guests vote, DJs deliver, the dancefloor decides.
          </p>
          <div className="mt-8 sm:mt-10 flex flex-col sm:flex-row gap-3 justify-center px-4">
            <Button asChild size="lg" variant="premium" size="lg">
              <Link to="/auth?role=dj">
                <Disc3 className="mr-2 h-5 w-5" />
                Start as DJ
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
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
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
            { n: "03", t: "Top tracks rise live", d: "Highest-voted songs hit the DJ queue in realtime.", icon: Zap },
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

      {/* Audiences */}
      <section className="container py-12 sm:py-16">
        <div className="text-center mb-10 sm:mb-12">
          <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Built for the night</p>
          <h2 className="text-3xl sm:text-4xl font-bold">One app, three sides of the booth</h2>
        </div>
        <div className="grid md:grid-cols-3 gap-4 sm:gap-6">
          {audiences.map(({ icon: Icon, title, points, cta }) => (
            <div key={title} className="p-6 rounded-2xl glass flex flex-col">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="text-lg font-semibold mb-3">{title}</h3>
              <ul className="space-y-2 mb-5 flex-1">
                {points.map((p) => (
                  <li key={p} className="flex items-start gap-2 text-sm text-muted-foreground">
                    <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary shrink-0" />
                    {p}
                  </li>
                ))}
              </ul>
              <Button asChild variant="outline" className="border-primary/30 hover:bg-primary/10">
                <Link to={cta.to}>
                  {cta.label} <ArrowRight className="ml-1 h-4 w-4" />
                </Link>
              </Button>
            </div>
          ))}
        </div>
      </section>

      {/* Points explainer */}
      <section className="container py-12 sm:py-16 max-w-5xl">
        <div className="rounded-3xl p-6 sm:p-10 glass-strong">
          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-primary mb-2">Points &amp; rewards</p>
              <h2 className="text-2xl sm:text-3xl font-bold mb-3">Earn points. Push your song to #1.</h2>
              <p className="text-muted-foreground mb-6">
                Guests earn points for requesting songs, getting upvotes, and joining events.
                Spend them to <span className="text-primary font-medium">boost</span> a track straight to the top
                of the DJ&rsquo;s queue.
              </p>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button asChild variant="premium">
                  <Link to="/auth?role=dj">Start as DJ</Link>
                </Button>
                <Button asChild variant="outline">
                  <Link to="/leaderboard">See the leaderboard</Link>
                </Button>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[
                { v: "+5", l: "Song requested" },
                { v: "+1", l: "Per upvote" },
                { v: "+5", l: "Track played" },
                { v: "−10", l: "Boost spend" },
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
        <h2 className="text-3xl sm:text-4xl font-bold mb-3">Ready to read the room?</h2>
        <p className="text-muted-foreground mb-8">Spin up a live event in 30 seconds.</p>
        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <Button asChild size="lg" variant="premium" size="lg">
            <Link to="/auth?role=dj">Start as DJ</Link>
          </Button>
          <Button asChild size="lg" variant="outline" className="h-12 px-8 border-primary/30 hover:bg-primary/10">
            <Link to="/join">Join an event</Link>
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
