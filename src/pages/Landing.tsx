import { Link } from "react-router-dom";
import { Disc3, Headphones, Radio, Sparkles, Trophy, Vote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppHeader } from "@/components/AppHeader";

const features = [
  { icon: Vote, title: "Reddit-style voting", desc: "Upvote bangers, downvote skips. The crowd shapes the night." },
  { icon: Trophy, title: "Live leaderboard", desc: "Earn points for requests and upvotes. Top requesters get bragging rights." },
  { icon: Radio, title: "Realtime DJ queue", desc: "DJs see top requests update instantly. No more shouting at the booth." },
  { icon: Sparkles, title: "Boost requests", desc: "Spend points to push your song to the top of the queue." },
];

const Landing = () => {
  return (
    <div className="min-h-screen">
      <AppHeader />

      {/* Hero */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 -z-10 opacity-60" style={{ backgroundImage: "var(--gradient-glow)" }} />
        <div className="container py-20 sm:py-28 text-center max-w-4xl">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-primary/10 border border-primary/20 text-primary text-xs font-medium mb-6 animate-pulse-glow">
            <span className="h-1.5 w-1.5 rounded-full bg-primary" />
            Live song requests for clubs & DJs
          </div>
          <h1 className="text-5xl sm:text-7xl font-bold tracking-tight leading-[1.05]">
            Let the crowd <br className="hidden sm:block" />
            <span className="text-gradient">pick the next track.</span>
          </h1>
          <p className="mt-6 text-lg text-muted-foreground max-w-2xl mx-auto">
            Decks turns any club, lounge, or party into a live song request battleground.
            Guests vote, DJs deliver, and the dancefloor never stops.
          </p>
          <div className="mt-10 flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg" className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground glow-primary hover:opacity-95 h-12 px-8 text-base">
              <Link to="/join">
                <Headphones className="mr-2 h-5 w-5" />
                Join an Event
              </Link>
            </Button>
            <Button asChild size="lg" variant="outline" className="h-12 px-8 text-base border-primary/30 hover:bg-primary/10">
              <Link to="/auth">
                <Disc3 className="mr-2 h-5 w-5" />
                I'm a DJ
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="container py-16">
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {features.map(({ icon: Icon, title, desc }) => (
            <div key={title} className="p-6 rounded-2xl bg-card/60 border border-border/60 hover:border-primary/40 hover:-translate-y-1 transition-all">
              <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-4">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold mb-1">{title}</h3>
              <p className="text-sm text-muted-foreground">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How it works */}
      <section className="container py-16 max-w-5xl">
        <h2 className="text-3xl sm:text-4xl font-bold text-center mb-12">
          How it works
        </h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            { n: "01", t: "DJ creates a session", d: "Get a 6-character room code & QR for the night." },
            { n: "02", t: "Guests join & request", d: "No app store. Just scan, type a nickname, and start voting." },
            { n: "03", t: "Top tracks rise live", d: "Highest-voted songs hit the DJ queue in realtime." },
          ].map((s) => (
            <div key={s.n} className="relative p-6 rounded-2xl glass">
              <div className="text-5xl font-bold text-primary/20 mb-2">{s.n}</div>
              <h3 className="text-lg font-semibold mb-1">{s.t}</h3>
              <p className="text-sm text-muted-foreground">{s.d}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="container py-10 border-t border-border/40 text-center text-sm text-muted-foreground">
        Built for the dancefloor. <span className="text-primary">♪</span>
      </footer>
    </div>
  );
};

export default Landing;
