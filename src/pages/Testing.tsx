import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { CheckCircle2, Copy, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const DEMO_CODES: { code: "DEMO123" | "EMPTY123" | "PAUSED123" | "ENDED123" | "MOD123"; label: string; desc: string }[] = [
  { code: "DEMO123",   label: "Full Demo",        desc: "Live event with seeded songs, votes, boosts and Now Playing." },
  { code: "EMPTY123",  label: "Empty Event",      desc: "Live event with zero requests — test empty states." },
  { code: "PAUSED123", label: "Paused Event",     desc: "Requests paused — test the disabled-request UI." },
  { code: "ENDED123",  label: "Ended Event",      desc: "Event ended — test the recap / closed state." },
  { code: "MOD123",    label: "Moderation Test",  desc: "Explicit blocked, approval required, blocklist + cooldown." },
];

const CHECKLIST = [
  "Guest join works",
  "Song search works (iTunes)",
  "Request submit works",
  "Duplicate request is blocked",
  "Voting works (live counters)",
  "Boosting works (points deducted)",
  "Leaderboard updates",
  "DJ approve / play / skip / remove works",
  "Pause / resume / end / reopen works",
  "Moderation blocklist blocks matching artist/keyword",
  "Explicit-block rejects explicit songs",
  "Analytics page renders",
];

const Testing = () => {
  const navigate = useNavigate();
  const { user, isDJ, loading } = useAuth();

  useEffect(() => {
    if (!loading && (!user || !isDJ)) {
      toast.error("DJ access required");
      navigate("/", { replace: true });
    }
  }, [user, isDJ, loading, navigate]);

  const copy = (v: string) => {
    navigator.clipboard.writeText(v);
    toast.success("Copied");
  };

  const ensureAndOpen = async (code: string) => {
    const { error } = await supabase.rpc("ensure_demo_event", { _code: code });
    if (error) return toast.error(error.message);
    navigate(`/event/${code}`);
  };

  const resetAll = async () => {
    const { error } = await supabase.rpc("reset_demo_events");
    if (error) return toast.error(error.message);
    toast.success("All demo rooms reset");
  };

  if (loading || !user || !isDJ) return null;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="container max-w-3xl py-8">
        <div className="flex items-start justify-between gap-4 flex-wrap mb-6">
          <div>
            <h1 className="text-3xl font-bold mb-1">Testing & Demo</h1>
            <p className="text-muted-foreground">Preset rooms for QA, demos, and screenshots.</p>
          </div>
          <Button variant="outline" onClick={resetAll}>
            <RefreshCw className="mr-1 h-4 w-4" /> Reset all demo rooms
          </Button>
        </div>

        <div className="grid sm:grid-cols-2 gap-3 mb-6">
          {DEMO_CODES.map((d) => (
            <div key={d.code} className="p-4 rounded-2xl glass">
              <div className="flex items-center justify-between gap-2 mb-2">
                <Sparkles className="h-4 w-4 text-accent" />
                <span className="font-mono text-lg font-bold tracking-[0.2em]">{d.code}</span>
              </div>
              <div className="text-sm font-semibold">{d.label}</div>
              <p className="text-xs text-muted-foreground mt-1 mb-3">{d.desc}</p>
              <div className="flex gap-1.5">
                <Button size="sm" className="flex-1 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground" onClick={() => ensureAndOpen(d.code)}>
                  Open as guest
                </Button>
                <Button size="sm" variant="outline" onClick={() => copy(d.code)} title="Copy code">
                  <Copy className="h-4 w-4" />
                </Button>
                <Button size="sm" variant="outline" onClick={() => copy(`${window.location.origin}/join?code=${d.code}`)} title="Copy join link">
                  <Sparkles className="h-4 w-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>

        <div className="p-5 rounded-2xl glass">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-semibold">QA checklist</h2>
            <Badge variant="secondary">{CHECKLIST.length} checks</Badge>
          </div>
          <ul className="space-y-2">
            {CHECKLIST.map((item, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <CheckCircle2 className="h-4 w-4 text-success mt-0.5 shrink-0" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-4 border-t border-border/40 text-xs text-muted-foreground">
            <Link to="/dj" className="underline hover:text-foreground">← Back to DJ Dashboard</Link>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Testing;
