import { Link } from "react-router-dom";
import { CheckCircle2, Copy, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const sections: { title: string; steps: string[] }[] = [
  {
    title: "DJ test flow",
    steps: [
      "Sign up with the 'I'm a DJ' toggle, or sign in as an existing DJ.",
      "From the DJ Dashboard, click 'New event' and create a session.",
      "Copy the room code and open it in another tab/incognito as a guest.",
      "Approve, hide, reorder and mark songs as Now Playing from Manage.",
      "Open Focus Mode to verify the high-contrast tablet view.",
    ],
  },
  {
    title: "Guest test flow",
    steps: [
      "Open /join, paste the room code, enter a nickname.",
      "Confirm the event page loads with rules banner and song list.",
      "Search a song (real iTunes results) and submit a request.",
      "Verify the request appears live in the DJ queue.",
    ],
  },
  {
    title: "Voting & boost test",
    steps: [
      "Upvote and downvote a song — counters should update instantly.",
      "Boost a song using points — balance decreases, song rises in queue.",
      "Open in two tabs to confirm realtime sync.",
    ],
  },
  {
    title: "Pause / end / reopen test",
    steps: [
      "From DJ Manage, end the event — guests should see 'event ended'.",
      "From the dashboard, reopen it — guests should be able to rejoin.",
    ],
  },
  {
    title: "Leaderboard test",
    steps: [
      "Request and get upvotes as a guest to earn points.",
      "Open /leaderboard and confirm your nickname appears.",
    ],
  },
  {
    title: "Real music search test",
    steps: [
      "On the request modal, type 'levels' — iTunes results should appear.",
      "Confirm album art, duration and Explicit badges render.",
      "Without Spotify keys configured, fallback should still work.",
    ],
  },
];

const Testing = () => {
  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success("Copied");
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="container max-w-3xl py-8">
        <h1 className="text-3xl font-bold mb-2">Testing & Demo Checklist</h1>
        <p className="text-muted-foreground mb-6">Quick reference for QA-ing every flow.</p>

        <div className="p-5 rounded-2xl glass mb-6 flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Sparkles className="h-5 w-5 text-accent" />
            <div>
              <div className="text-xs text-muted-foreground uppercase tracking-wider">Demo room code</div>
              <div className="font-mono text-2xl font-bold tracking-[0.3em]">DEMO123</div>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => copy("DEMO123")}>
              <Copy className="mr-1 h-4 w-4" /> Copy
            </Button>
            <Button asChild className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground" size="sm">
              <Link to="/join?code=DEMO123">Join demo</Link>
            </Button>
          </div>
        </div>

        <div className="space-y-4">
          {sections.map((s) => (
            <div key={s.title} className="p-5 rounded-2xl glass">
              <div className="flex items-center justify-between mb-3">
                <h2 className="font-semibold">{s.title}</h2>
                <Badge variant="secondary">{s.steps.length} steps</Badge>
              </div>
              <ol className="space-y-2">
                {s.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm">
                    <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                    <span>{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

export default Testing;
