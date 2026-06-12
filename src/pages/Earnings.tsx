import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { Loader2, Zap, Users, Music, TrendingUp, Sparkles, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

interface SongRow {
  id: string;
  event_id: string;
  title: string;
  artist: string;
  album_art: string | null;
  album_art_url: string | null;
  boost: number;
  status: string;
  played_at: string | null;
  created_at: string;
  requester_name: string;
  requested_by: string | null;
}

interface ParticipantRow {
  event_id: string;
  user_id: string;
  nickname: string;
}

const startOf = (period: "day" | "week" | "month") => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  if (period === "week") d.setDate(d.getDate() - 6);
  if (period === "month") d.setDate(d.getDate() - 29);
  return d.getTime();
};

export default function Earnings() {
  const { user, isDJ, loading: authLoading, profile } = useAuth();
  const [loading, setLoading] = useState(true);
  const [eventIds, setEventIds] = useState<string[]>([]);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [participants, setParticipants] = useState<ParticipantRow[]>([]);

  useEffect(() => {
    if (!user || !isDJ) return;
    let cancelled = false;
    (async () => {
      const { data: events } = await supabase.from("events").select("id").eq("dj_id", user.id);
      const ids = (events ?? []).map((e) => e.id);
      if (cancelled) return;
      setEventIds(ids);
      if (ids.length === 0) {
        setLoading(false);
        return;
      }
      const [{ data: s }, { data: p }] = await Promise.all([
        supabase
          .from("song_requests")
          .select("id,event_id,title,artist,album_art,album_art_url,boost,status,played_at,created_at,requester_name,requested_by")
          .in("event_id", ids)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("event_participants").select("event_id,user_id,nickname").in("event_id", ids).limit(1000),
      ]);
      if (cancelled) return;
      setSongs((s ?? []) as SongRow[]);
      setParticipants((p ?? []) as ParticipantRow[]);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isDJ]);

  const stats = useMemo(() => {
    const totalBoosts = songs.reduce((sum, r) => sum + (r.boost || 0), 0);
    const totalRequests = songs.length;
    const uniqueGuests = new Set(participants.map((p) => p.user_id)).size;
    const today = startOf("day");
    const week = startOf("week");
    const month = startOf("month");
    const sumSince = (ts: number) =>
      songs.filter((r) => new Date(r.created_at).getTime() >= ts).reduce((sum, r) => sum + (r.boost || 0), 0);
    const boostsToday = sumSince(today);
    const boostsWeek = sumSince(week);
    const boostsMonth = sumSince(month);
    const avgPerGuest = uniqueGuests > 0 ? totalBoosts / uniqueGuests : 0;

    // Daily bars (last 7 days)
    const days: { label: string; value: number }[] = [];
    const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const start = d.getTime();
      const end = start + 86400000;
      const value = songs
        .filter((r) => {
          const t = new Date(r.created_at).getTime();
          return t >= start && t < end;
        })
        .reduce((sum, r) => sum + (r.boost || 0), 0);
      days.push({ label: dayNames[d.getDay()], value });
    }

    // Top songs
    const byKey = (rs: SongRow[]) => {
      const map = new Map<string, { title: string; artist: string; art: string | null; count: number; boost: number; played: number }>();
      for (const r of rs) {
        const key = `${r.title}__${r.artist}`.toLowerCase();
        const cur = map.get(key) ?? { title: r.title, artist: r.artist, art: r.album_art ?? r.album_art_url, count: 0, boost: 0, played: 0 };
        cur.count += 1;
        cur.boost += r.boost || 0;
        if (r.status === "played" || r.played_at) cur.played += 1;
        if (!cur.art) cur.art = r.album_art ?? r.album_art_url;
        map.set(key, cur);
      }
      return [...map.values()];
    };
    const aggregated = byKey(songs);
    const mostBoosted = [...aggregated].sort((a, b) => b.boost - a.boost).slice(0, 5).filter((s) => s.boost > 0);
    const mostRequested = [...aggregated].sort((a, b) => b.count - a.count).slice(0, 5);
    const mostPlayed = [...aggregated].sort((a, b) => b.played - a.played).slice(0, 5).filter((s) => s.played > 0);

    // Top guests
    const guestMap = new Map<string, { name: string; boost: number; requests: number }>();
    for (const r of songs) {
      const key = r.requested_by ?? r.requester_name;
      if (!key) continue;
      const cur = guestMap.get(key) ?? { name: r.requester_name || "Guest", boost: 0, requests: 0 };
      cur.boost += r.boost || 0;
      cur.requests += 1;
      guestMap.set(key, cur);
    }
    const topGuests = [...guestMap.values()].sort((a, b) => b.boost - a.boost || b.requests - a.requests).slice(0, 5);

    return {
      totalBoosts,
      totalRequests,
      uniqueGuests,
      avgPerGuest,
      boostsToday,
      boostsWeek,
      boostsMonth,
      days,
      mostBoosted,
      mostRequested,
      mostPlayed,
      topGuests,
    };
  }, [songs, participants]);

  if (authLoading) return null;
  if (!user) return <Navigate to="/auth?role=dj" replace />;
  if (!isDJ) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container max-w-5xl py-6 sm:py-8 space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2 -ml-2">
              <Link to="/dj"><ArrowLeft className="h-4 w-4 mr-1" /> Dashboard</Link>
            </Button>
            <h1 className="text-3xl sm:text-4xl font-bold tracking-tight">Tip earnings</h1>
            <p className="text-muted-foreground mt-1">
              Tip activity across your events{profile?.nickname ? `, ${profile.nickname}` : ""}.
            </p>
          </div>
          <Badge variant="outline" className="border-primary/40 text-primary">
            <Sparkles className="h-3 w-3 mr-1" /> Pre-payouts
          </Badge>
        </div>

        {/* Headline */}
        <Card className="bg-card/60 border-primary/20 overflow-hidden">
          <CardContent className="p-5 sm:p-7">
            <div className="grid sm:grid-cols-2 gap-6 items-center">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Tip Activity</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-5xl sm:text-6xl font-bold tabular-nums text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
                    {loading ? "—" : stats.totalBoosts.toLocaleString()}
                  </span>
                  <span className="text-muted-foreground text-sm">tip points</span>
                </div>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  Cash payouts unlock when Stripe Connect is enabled. Tips do not affect song placement —
                  they're a way for guests to thank you for the set.
                </p>
              </div>
              {/* Mini bar chart */}
              <div className="flex items-end justify-end gap-2 h-32">
                {loading
                  ? null
                  : stats.days.map((d, i) => {
                      const max = Math.max(1, ...stats.days.map((x) => x.value));
                      const h = (d.value / max) * 100;
                      return (
                        <div key={i} className="flex flex-col items-center gap-1 flex-1 max-w-[36px]">
                          <div
                            className="w-full rounded-t-md bg-gradient-to-t from-primary to-primary/60 shadow-glow-sm transition-all"
                            style={{ height: `${Math.max(h, 4)}%`, minHeight: 4 }}
                          />
                          <span className="text-[10px] text-muted-foreground">{d.label}</span>
                        </div>
                      );
                    })}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Time windows */}
        <div className="grid grid-cols-3 gap-3">
          <Mini label="Today" value={stats.boostsToday} suffix="tips" loading={loading} />
          <Mini label="Last 7 days" value={stats.boostsWeek} suffix="tips" loading={loading} />
          <Mini label="Last 30 days" value={stats.boostsMonth} suffix="tips" loading={loading} />
        </div>

        {/* Engagement */}
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Engagement</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={<Music className="h-4 w-4" />} label="Requests" value={stats.totalRequests} loading={loading} />
            <Stat icon={<Zap className="h-4 w-4" />} label="Tips" value={stats.totalBoosts} loading={loading} />
            <Stat icon={<Users className="h-4 w-4" />} label="Guests" value={stats.uniqueGuests} loading={loading} />
            <Stat
              icon={<TrendingUp className="h-4 w-4" />}
              label="Avg / guest"
              value={Number(stats.avgPerGuest.toFixed(1))}
              loading={loading}
            />
          </div>
        </section>

        {/* Top songs */}
        <section className="grid lg:grid-cols-3 gap-4">
          <SongList title="Most tipped" rows={stats.mostBoosted} metric="boost" loading={loading} />
          <SongList title="Most requested" rows={stats.mostRequested} metric="count" loading={loading} />
          <SongList title="Most played" rows={stats.mostPlayed} metric="played" loading={loading} />
        </section>

        {/* Top guests */}
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Top guests</h2>
          <Card className="bg-card/60">
            <CardContent className="p-0 divide-y divide-border/40">
              {loading ? (
                <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
              ) : stats.topGuests.length === 0 ? (
                <div className="p-6 text-sm text-muted-foreground text-center">No guest activity yet.</div>
              ) : (
                stats.topGuests.map((g, i) => (
                  <div key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="h-8 w-8 rounded-full bg-primary/15 text-primary text-xs font-bold flex items-center justify-center shrink-0">
                        #{i + 1}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate">{g.name}</div>
                        <div className="text-xs text-muted-foreground">{g.requests} request{g.requests === 1 ? "" : "s"}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold tabular-nums text-primary">{g.boost}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">tips</div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        {/* Phase 2 disclosure */}
        <Card className="bg-card/40 border-dashed">
          <CardContent className="p-5 text-sm text-muted-foreground space-y-1">
            <div className="font-semibold text-foreground">Cash payouts — coming soon</div>
            <p>
              Once Stripe Connect is enabled, this page will show gross revenue, platform fees, your share,
              and payout schedule. Until then, everything here is engagement-based.
            </p>
          </CardContent>
        </Card>

        {eventIds.length === 0 && !loading && (
          <div className="text-center py-10 text-muted-foreground">
            No events yet. <Link to="/dj" className="text-primary underline">Create one</Link> to start seeing activity.
          </div>
        )}
      </main>
    </div>
  );
}

function Mini({ label, value, suffix, loading }: { label: string; value: number; suffix: string; loading: boolean }) {
  return (
    <Card className="bg-card/60">
      <CardContent className="py-4">
        <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl sm:text-2xl font-bold tabular-nums">{loading ? "—" : value.toLocaleString()}</span>
          <span className="text-[10px] sm:text-xs text-muted-foreground">{suffix}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: number; loading: boolean }) {
  return (
    <Card className="bg-card/60">
      <CardContent className="py-4">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          <span className="text-primary">{icon}</span>
          {label}
        </div>
        <div className="text-2xl font-bold tabular-nums mt-1">{loading ? "—" : value.toLocaleString()}</div>
      </CardContent>
    </Card>
  );
}

function SongList({
  title,
  rows,
  metric,
  loading,
}: {
  title: string;
  rows: { title: string; artist: string; art: string | null; count: number; boost: number; played: number }[];
  metric: "boost" | "count" | "played";
  loading: boolean;
}) {
  const metricLabel = metric === "boost" ? "tips" : metric === "count" ? "requests" : "plays";
  return (
    <Card className="bg-card/60">
      <CardContent className="p-4">
        <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">{title}</h3>
        {loading ? (
          <div className="py-6 flex justify-center"><Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /></div>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground text-center py-4">No data yet.</p>
        ) : (
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-md bg-muted/40 overflow-hidden shrink-0 flex items-center justify-center">
                  {r.art ? (
                    <img src={r.art} alt="" className="h-full w-full object-cover" loading="lazy" />
                  ) : (
                    <Music className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">{r.title}</div>
                  <div className="text-xs text-muted-foreground truncate">{r.artist}</div>
                </div>
                <div className="text-right shrink-0">
                  <div className="text-sm font-bold tabular-nums text-primary">{r[metric]}</div>
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{metricLabel}</div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
