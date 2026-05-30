import { useEffect, useMemo, useState } from "react";
import { Link, useParams, useNavigate } from "react-router-dom";
import {
  ArrowLeft, BarChart3, Clock, Download, Loader2, Music, Rocket, Sparkles, Trophy, Users, Vote,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { downloadCSV, toCSV } from "@/lib/csv";

interface Event {
  id: string; name: string; venue: string | null; dj_id: string;
  created_at: string; ended_at: string | null; room_code: string;
}
interface Req {
  id: string; title: string; artist: string; album_art_url: string | null;
  upvotes: number; downvotes: number; boost: number; status: string;
  requester_name: string; requested_by: string | null; created_at: string;
}

const Analytics = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isDJ, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<Event | null>(null);
  const [reqs, setReqs] = useState<Req[]>([]);
  const [participants, setParticipants] = useState(0);
  const [voteCount, setVoteCount] = useState(0);
  const [pointsSpent, setPointsSpent] = useState(0);
  const [topGuests, setTopGuests] = useState<{ user_id: string | null; nickname: string; points: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || !isDJ)) navigate("/auth", { replace: true });
  }, [user, isDJ, authLoading, navigate]);

  useEffect(() => {
    if (!id || !user) return;
    (async () => {
      const { data: ev } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
      if (!ev || ev.dj_id !== user.id) {
        toast.error("Event not found");
        navigate("/dj", { replace: true });
        return;
      }
      setEvent(ev as Event);

      const [{ data: requestRows }, { count: pCount }, { data: tx }] = await Promise.all([
        supabase.from("song_requests").select("id, title, artist, album_art_url, upvotes, downvotes, boost, status, requester_name, requested_by, created_at").eq("event_id", id),
        supabase.from("event_participants").select("id", { count: "exact", head: true }).eq("event_id", id),
        supabase.from("points_transactions").select("amount, type, user_id").eq("event_id", id),
      ]);

      const list = (requestRows ?? []) as Req[];
      setReqs(list);
      setParticipants(pCount ?? 0);

      // Vote count
      const ids = list.map((r) => r.id);
      if (ids.length) {
        const { count: vc } = await supabase
          .from("votes").select("id", { count: "exact", head: true })
          .in("song_request_id", ids);
        setVoteCount(vc ?? 0);
      }

      // Points spent + top guests by net earned
      const txs = tx ?? [];
      setPointsSpent(txs.filter((t) => t.type === "spent").reduce((s, t) => s + Math.abs(t.amount), 0));

      const earned = new Map<string, number>();
      for (const t of txs) {
        if (t.type === "earned" || t.type === "manual_adjustment") {
          earned.set(t.user_id, (earned.get(t.user_id) ?? 0) + t.amount);
        }
      }
      const topIds = [...earned.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10);
      if (topIds.length) {
        const { data: profs } = await supabase.from("profiles").select("id, nickname").in("id", topIds.map(([uid]) => uid));
        const nameMap = new Map((profs ?? []).map((p) => [p.id, p.nickname ?? "Guest"]));
        setTopGuests(topIds.map(([uid, pts]) => ({ user_id: uid, nickname: nameMap.get(uid) ?? "Guest", points: pts })));
      }

      setLoading(false);
    })();
  }, [id, user, navigate]);

  const totalBoosts = useMemo(() => reqs.reduce((s, r) => s + r.boost, 0), [reqs]);

  const topRequested = useMemo(
    () => [...reqs].map((r) => ({ ...r, score: r.upvotes - r.downvotes + r.boost })).sort((a, b) => b.score - a.score).slice(0, 10),
    [reqs],
  );
  const topBoosted = useMemo(
    () => [...reqs].filter((r) => r.boost > 0).sort((a, b) => b.boost - a.boost).slice(0, 10),
    [reqs],
  );
  const topArtist = useMemo(() => {
    const c = new Map<string, number>();
    reqs.forEach((r) => c.set(r.artist, (c.get(r.artist) ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [reqs]);
  const mostActive = useMemo(() => {
    const c = new Map<string, number>();
    reqs.forEach((r) => c.set(r.requester_name || "Guest", (c.get(r.requester_name || "Guest") ?? 0) + 1));
    return [...c.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [reqs]);
  const peakHour = useMemo(() => {
    if (!reqs.length) return null;
    const buckets = new Map<string, number>();
    reqs.forEach((r) => {
      const d = new Date(r.created_at);
      const k = `${d.getHours().toString().padStart(2, "0")}:00`;
      buckets.set(k, (buckets.get(k) ?? 0) + 1);
    });
    return [...buckets.entries()].sort((a, b) => b[1] - a[1])[0];
  }, [reqs]);

  const exportRequests = () => {
    if (!event) return;
    const rows = reqs.map((r) => ({
      title: r.title, artist: r.artist, status: r.status,
      upvotes: r.upvotes, downvotes: r.downvotes, boost: r.boost,
      score: r.upvotes - r.downvotes + r.boost,
      requested_by: r.requester_name, requested_at: r.created_at,
    }));
    downloadCSV(`${event.room_code}-requests.csv`, toCSV(rows));
  };

  const exportLeaderboard = () => {
    if (!event) return;
    downloadCSV(`${event.room_code}-leaderboard.csv`, toCSV(topGuests));
  };

  const exportSummary = () => {
    if (!event) return;
    const rows = [
      { metric: "Event", value: event.name },
      { metric: "Venue", value: event.venue ?? "" },
      { metric: "Started", value: event.created_at },
      { metric: "Ended", value: event.ended_at ?? "" },
      { metric: "Total guests", value: participants },
      { metric: "Total requests", value: reqs.length },
      { metric: "Total votes", value: voteCount },
      { metric: "Total boosts (pts)", value: totalBoosts },
      { metric: "Total points spent", value: pointsSpent },
      { metric: "Top requested", value: topRequested[0] ? `${topRequested[0].title} — ${topRequested[0].artist}` : "" },
      { metric: "Top boosted", value: topBoosted[0] ? `${topBoosted[0].title} — ${topBoosted[0].artist}` : "" },
      { metric: "Most active guest", value: mostActive ? `${mostActive[0]} (${mostActive[1]})` : "" },
      { metric: "Most played artist", value: topArtist ? `${topArtist[0]} (${topArtist[1]})` : "" },
      { metric: "Peak hour", value: peakHour ? `${peakHour[0]} (${peakHour[1]} requests)` : "" },
    ];
    downloadCSV(`${event.room_code}-summary.csv`, toCSV(rows));
  };

  if (authLoading || loading || !event) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="container py-20 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container max-w-5xl py-8 space-y-6">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2 -ml-3">
              <Link to={`/dj/${event.id}`}><ArrowLeft className="h-4 w-4 mr-1" />Back to event</Link>
            </Button>
            <h1 className="text-3xl font-bold flex items-center gap-2">
              <BarChart3 className="h-7 w-7 text-primary" /> Event analytics
            </h1>
            <p className="text-muted-foreground text-sm mt-1">{event.name}{event.venue ? ` · ${event.venue}` : ""}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" size="sm" onClick={exportRequests}><Download className="mr-1.5 h-4 w-4" />Requests CSV</Button>
            <Button variant="outline" size="sm" onClick={exportLeaderboard}><Download className="mr-1.5 h-4 w-4" />Top guests CSV</Button>
            <Button variant="outline" size="sm" onClick={exportSummary}><Download className="mr-1.5 h-4 w-4" />Summary CSV</Button>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat icon={<Users className="h-4 w-4" />} label="Guests" value={participants} />
          <Stat icon={<Music className="h-4 w-4" />} label="Requests" value={reqs.length} />
          <Stat icon={<Vote className="h-4 w-4" />} label="Votes" value={voteCount} />
          <Stat icon={<Rocket className="h-4 w-4" />} label="Boosts (pts)" value={totalBoosts} />
          <Stat icon={<Sparkles className="h-4 w-4" />} label="Points spent" value={pointsSpent} />
          <Stat icon={<Trophy className="h-4 w-4" />} label="Most played artist" value={topArtist?.[0] ?? "—"} small />
          <Stat icon={<Users className="h-4 w-4" />} label="Most active guest" value={mostActive?.[0] ?? "—"} small />
          <Stat icon={<Clock className="h-4 w-4" />} label="Peak hour" value={peakHour?.[0] ?? "—"} small />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <ListCard title="Top 10 requested">
            {topRequested.length === 0 && <Empty />}
            {topRequested.map((r, i) => (
              <ListRow key={r.id} index={i + 1} title={r.title} sub={r.artist} value={`${r.score} pts`} />
            ))}
          </ListCard>
          <ListCard title="Top 10 boosted">
            {topBoosted.length === 0 && <Empty />}
            {topBoosted.map((r, i) => (
              <ListRow key={r.id} index={i + 1} title={r.title} sub={r.artist} value={`+${r.boost}`} />
            ))}
          </ListCard>
          <ListCard title="Top 10 guests by points">
            {topGuests.length === 0 && <Empty />}
            {topGuests.map((g, i) => (
              <ListRow key={(g.user_id ?? "") + i} index={i + 1} title={g.nickname} sub="" value={`${g.points} pts`} />
            ))}
          </ListCard>
          <Card className="bg-card/60">
            <CardContent className="py-4 text-sm space-y-1.5 text-muted-foreground">
              <div className="font-semibold text-foreground mb-2 flex items-center gap-1.5"><Clock className="h-4 w-4" />Timeline</div>
              <div>Started: {new Date(event.created_at).toLocaleString()}</div>
              <div>Ended: {event.ended_at ? new Date(event.ended_at).toLocaleString() : "—"}</div>
              {event.ended_at && (
                <div>Duration: {Math.round((+new Date(event.ended_at) - +new Date(event.created_at)) / 60000)} min</div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  );
};

function Stat({ icon, label, value, small }: { icon: React.ReactNode; label: string; value: string | number; small?: boolean }) {
  return (
    <Card className="bg-card/60">
      <CardContent className="py-4">
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground uppercase tracking-wider">{icon}{label}</div>
        <div className={small ? "text-base font-semibold mt-1 truncate" : "text-2xl font-bold mt-1 tabular-nums"}>{value}</div>
      </CardContent>
    </Card>
  );
}

function ListCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-card/60">
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">{title}</div>
        <div className="space-y-1.5">{children}</div>
      </CardContent>
    </Card>
  );
}
function ListRow({ index, title, sub, value }: { index: number; title: string; sub: string; value: string }) {
  return (
    <div className="flex items-center gap-3 p-2 rounded-md bg-background/40">
      <div className="w-6 text-center text-sm font-bold tabular-nums text-muted-foreground">{index}</div>
      <div className="flex-1 min-w-0">
        <div className="font-medium truncate text-sm">{title}</div>
        {sub && <div className="text-xs text-muted-foreground truncate">{sub}</div>}
      </div>
      <Badge variant="secondary" className="tabular-nums">{value}</Badge>
    </div>
  );
}
function Empty() { return <p className="text-sm text-muted-foreground py-2">No data yet.</p>; }

export default Analytics;
