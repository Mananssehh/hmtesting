import { useEffect, useState } from "react";
import { Loader2, Music, Rocket, Trophy, Sparkles, Vote, Clock } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";

interface Props {
  eventId: string;
  startedAt: string;
  endedAt: string | null;
}

interface Stats {
  totalRequests: number;
  totalVotes: number;
  totalPointsSpent: number;
  topSong: { title: string; artist: string; score: number } | null;
  topBoosted: { title: string; artist: string; boost: number } | null;
  topRequester: { name: string; count: number } | null;
}

export function ArchivedEventSummary({ eventId, startedAt, endedAt }: Props) {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: reqs }, { count: voteCount }, { data: tx }] = await Promise.all([
        supabase.from("song_requests").select("title, artist, upvotes, downvotes, boost, requester_name").eq("event_id", eventId),
        supabase.from("votes").select("id", { count: "exact", head: true })
          .in("song_request_id", (await supabase.from("song_requests").select("id").eq("event_id", eventId)).data?.map(r => r.id) ?? ["00000000-0000-0000-0000-000000000000"]),
        supabase.from("points_transactions").select("amount, type").eq("event_id", eventId).eq("type", "spent"),
      ]);

      const list = reqs ?? [];
      const topSong = [...list]
        .map(s => ({ title: s.title, artist: s.artist, score: s.upvotes - s.downvotes + s.boost }))
        .sort((a, b) => b.score - a.score)[0] ?? null;
      const topBoosted = [...list]
        .filter(s => s.boost > 0)
        .sort((a, b) => b.boost - a.boost)
        .map(s => ({ title: s.title, artist: s.artist, boost: s.boost }))[0] ?? null;
      const counts = new Map<string, number>();
      list.forEach(s => counts.set(s.requester_name, (counts.get(s.requester_name) ?? 0) + 1));
      const topReq = [...counts.entries()].sort((a, b) => b[1] - a[1])[0];

      setStats({
        totalRequests: list.length,
        totalVotes: voteCount ?? 0,
        totalPointsSpent: (tx ?? []).reduce((sum, t) => sum + Math.abs(t.amount), 0),
        topSong,
        topBoosted,
        topRequester: topReq ? { name: topReq[0], count: topReq[1] } : null,
      });
    })();
  }, [eventId]);

  if (!stats) {
    return (
      <Card className="bg-card/60">
        <CardContent className="py-8 flex justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  const fmt = (d: string | null) => d ? new Date(d).toLocaleString() : "—";

  return (
    <div className="grid sm:grid-cols-3 gap-3 mb-6">
      <StatCard icon={<Music className="h-4 w-4" />} label="Total requests" value={stats.totalRequests} />
      <StatCard icon={<Vote className="h-4 w-4" />} label="Total votes" value={stats.totalVotes} />
      <StatCard icon={<Sparkles className="h-4 w-4" />} label="Points spent" value={stats.totalPointsSpent} />
      <HighlightCard
        icon={<Trophy className="h-4 w-4 text-primary" />}
        label="Top requested"
        title={stats.topSong ? `${stats.topSong.title}` : "—"}
        sub={stats.topSong ? `${stats.topSong.artist} · ${stats.topSong.score} pts` : ""}
      />
      <HighlightCard
        icon={<Rocket className="h-4 w-4 text-primary" />}
        label="Top boosted"
        title={stats.topBoosted ? stats.topBoosted.title : "—"}
        sub={stats.topBoosted ? `${stats.topBoosted.artist} · +${stats.topBoosted.boost}` : ""}
      />
      <HighlightCard
        icon={<Trophy className="h-4 w-4 text-accent" />}
        label="Top requester"
        title={stats.topRequester?.name ?? "—"}
        sub={stats.topRequester ? `${stats.topRequester.count} requests` : ""}
      />
      <Card className="sm:col-span-3 bg-card/60">
        <CardContent className="py-4 text-sm flex flex-wrap gap-x-6 gap-y-1 text-muted-foreground">
          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Started {fmt(startedAt)}</span>
          <span className="flex items-center gap-1.5"><Clock className="h-3.5 w-3.5" /> Ended {fmt(endedAt)}</span>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number }) {
  return (
    <Card className="bg-card/60">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">{icon}{label}</div>
        <div className="text-2xl font-bold mt-1 tabular-nums">{value}</div>
      </CardContent>
    </Card>
  );
}

function HighlightCard({ icon, label, title, sub }: { icon: React.ReactNode; label: string; title: string; sub: string }) {
  return (
    <Card className="bg-card/60">
      <CardContent className="py-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground uppercase tracking-wider">{icon}{label}</div>
        <div className="font-semibold mt-1 truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate">{sub}</div>
      </CardContent>
    </Card>
  );
}
