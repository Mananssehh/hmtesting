import { useEffect, useMemo, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { Loader2, CircleDollarSign, Users, Music, TrendingUp, ArrowLeft } from "lucide-react";
import { PayoutSummaryCard } from "@/components/PayoutSummaryCard";
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

interface TipRow {
  id: string;
  event_id: string;
  user_id: string;
  gross_amount_cents: number;
  net_amount_cents: number;
  platform_fee_cents: number;
  refunded_amount_cents: number;
  status: string;
  created_at: string;
}

const TIP_STATUS_LABEL: Record<string, { label: string; tone: string }> = {
  succeeded: { label: "Paid", tone: "border-emerald-500/40 text-emerald-300" },
  partially_refunded: { label: "Partially Refunded", tone: "border-amber-500/40 text-amber-300" },
  refunded: { label: "Refunded", tone: "border-muted-foreground/40 text-muted-foreground" },
  disputed: { label: "Disputed", tone: "border-orange-500/40 text-orange-300" },
  failed: { label: "Failed", tone: "border-destructive/40 text-destructive" },
  pending: { label: "Pending", tone: "border-muted-foreground/30 text-muted-foreground" },
};
const ACTIVE_TIP_STATUSES = new Set(["succeeded", "partially_refunded"]);

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
  const [tips, setTips] = useState<TipRow[]>([]);
  const [recentTips, setRecentTips] = useState<TipRow[]>([]);
  const [profileNicknames, setProfileNicknames] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!user || !isDJ) return;
    let cancelled = false;
    (async () => {
      const { data: events } = await supabase.from("events").select("id").eq("dj_id", user.id);
      const ids = (events ?? []).map((e) => e.id);
      if (cancelled) return;
      setEventIds(ids);
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6);
      sevenDaysAgo.setHours(0, 0, 0, 0);
      // Active tips drive totals/chart. Include partially_refunded so we can
      // subtract refunded_amount_cents below; refunded/disputed/failed are
      // intentionally excluded from earnings.
      const tipsQ = supabase
        .from("dj_tips")
        .select("id,event_id,user_id,gross_amount_cents,net_amount_cents,platform_fee_cents,refunded_amount_cents,status,created_at")
        .eq("dj_id", user.id)
        .in("status", ["succeeded", "partially_refunded"])
        .gte("created_at", sevenDaysAgo.toISOString())
        .order("created_at", { ascending: true });

      // Recent tip history: all statuses so refunds/disputes are visible to the DJ.
      const recentQ = supabase
        .from("dj_tips")
        .select("id,event_id,user_id,gross_amount_cents,net_amount_cents,platform_fee_cents,refunded_amount_cents,status,created_at")
        .eq("dj_id", user.id)
        .order("created_at", { ascending: false })
        .limit(20);

      if (ids.length === 0) {
        const [{ data: t }, { data: rt }] = await Promise.all([tipsQ, recentQ]);
        if (cancelled) return;
        setTips((t ?? []) as TipRow[]);
        setRecentTips((rt ?? []) as TipRow[]);
        setLoading(false);
        return;
      }
      const [{ data: s }, { data: p }, { data: t }, { data: rt }] = await Promise.all([
        supabase
          .from("song_requests")
          .select("id,event_id,title,artist,album_art,album_art_url,boost,status,played_at,created_at,requester_name,requested_by")
          .in("event_id", ids)
          .order("created_at", { ascending: false })
          .limit(1000),
        supabase.from("event_participants").select("event_id,user_id,nickname").in("event_id", ids).limit(1000),
        tipsQ,
        recentQ,
      ]);
      if (cancelled) return;
      const songRows = (s ?? []) as SongRow[];
      const partRows = (p ?? []) as ParticipantRow[];
      const tipRows = (t ?? []) as TipRow[];
      const recentRows = (rt ?? []) as TipRow[];
      setSongs(songRows);
      setParticipants(partRows);
      setTips(tipRows);
      setRecentTips(recentRows);

      // Resolve canonical display names from profiles for all referenced user_ids
      const uids = new Set<string>();
      for (const r of songRows) if (r.requested_by) uids.add(r.requested_by);
      for (const tp of tipRows) if (tp.user_id) uids.add(tp.user_id);
      for (const pr of partRows) if (pr.user_id) uids.add(pr.user_id);
      if (uids.size > 0) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id,nickname")
          .in("id", [...uids]);
        if (!cancelled) {
          const map: Record<string, string> = {};
          for (const pr of profs ?? []) if (pr.nickname) map[(pr as any).id] = (pr as any).nickname;
          setProfileNicknames(map);
        }
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [user, isDJ]);

  const stats = useMemo(() => {
    const totalRequests = songs.length;
    const uniqueGuests = new Set(participants.map((p) => p.user_id)).size;
    const today = startOf("day");
    const week = startOf("week");
    const month = startOf("month");

    // --- Tip $$ stats (from dj_tips) ---
    // Only succeeded + partially_refunded count toward earnings; refunded amounts
    // are subtracted (proportionally for net) so a refund reduces totals.
    const activeTips = tips.filter((t) => ACTIVE_TIP_STATUSES.has(t.status));
    const effectiveGross = (t: TipRow) =>
      Math.max(0, (t.gross_amount_cents || 0) - (t.refunded_amount_cents || 0));
    const effectiveNet = (t: TipRow) => {
      const gross = t.gross_amount_cents || 0;
      const refunded = t.refunded_amount_cents || 0;
      if (gross <= 0) return 0;
      const frac = Math.max(0, (gross - refunded) / gross);
      return Math.round((t.net_amount_cents || 0) * frac);
    };
    const tipCount = activeTips.length;
    const tipGrossCents = activeTips.reduce((s, t) => s + effectiveGross(t), 0);
    const tipNetCents = activeTips.reduce((s, t) => s + effectiveNet(t), 0);
    const sumTipsSince = (ts: number) =>
      activeTips
        .filter((t) => new Date(t.created_at).getTime() >= ts)
        .reduce((s, t) => s + effectiveGross(t), 0);
    const tipsTodayCents = sumTipsSince(today);
    const tipsWeekCents = sumTipsSince(week);
    const tipsMonthCents = sumTipsSince(month);
    const avgTipCentsPerGuest = uniqueGuests > 0 ? tipGrossCents / uniqueGuests : 0;

    // Daily bars (last 7 days) — based on tip $$
    const days: { label: string; value: number; isToday: boolean }[] = [];
    const dayNames = ["S", "M", "T", "W", "T", "F", "S"];
    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setHours(0, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const start = d.getTime();
      const end = start + 86400000;
      const value = activeTips
        .filter((t) => {
          const ts = new Date(t.created_at).getTime();
          return ts >= start && ts < end;
        })
        .reduce((s, t) => s + effectiveGross(t), 0);
      days.push({ label: dayNames[d.getDay()], value, isToday: i === 0 });
    }

    // Top songs (request engagement, unchanged)
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

    // Top guests — keyed by auth user_id only so nickname changes don't split rows.
    // Display-name resolution: event_participants.nickname → profiles.nickname → song_requests.requester_name → "Guest".
    // Anonymous guests upgrading keeps the same auth.uid(), so their tips + requests stay merged.
    const participantNickByUser = new Map<string, string>();
    for (const p of participants) {
      if (p.user_id && p.nickname && !participantNickByUser.has(p.user_id)) {
        participantNickByUser.set(p.user_id, p.nickname);
      }
    }
    const requesterNameByUser = new Map<string, string>();
    for (const r of songs) {
      if (r.requested_by && r.requester_name && !requesterNameByUser.has(r.requested_by)) {
        requesterNameByUser.set(r.requested_by, r.requester_name);
      }
    }
    const resolveName = (uid: string): string =>
      participantNickByUser.get(uid) ||
      profileNicknames[uid] ||
      requesterNameByUser.get(uid) ||
      "Guest";

    const guestMap = new Map<string, { name: string; tipCents: number; requests: number }>();
    for (const r of songs) {
      if (!r.requested_by) continue; // skip anonymous/legacy rows with no user id
      const cur = guestMap.get(r.requested_by) ?? { name: resolveName(r.requested_by), tipCents: 0, requests: 0 };
      cur.requests += 1;
      cur.name = resolveName(r.requested_by);
      guestMap.set(r.requested_by, cur);
    }
    for (const t of succeededTips) {
      if (!t.user_id) continue;
      const cur = guestMap.get(t.user_id) ?? { name: resolveName(t.user_id), tipCents: 0, requests: 0 };
      cur.tipCents += t.gross_amount_cents || 0;
      cur.name = resolveName(t.user_id);
      guestMap.set(t.user_id, cur);
    }
    const topGuests = [...guestMap.values()]
      .sort((a, b) => b.tipCents - a.tipCents || b.requests - a.requests)
      .slice(0, 5);


    return {
      totalRequests,
      uniqueGuests,
      tipCount,
      tipGrossCents,
      tipNetCents,
      tipsTodayCents,
      tipsWeekCents,
      tipsMonthCents,
      avgTipCentsPerGuest,
      days,
      mostBoosted,
      mostRequested,
      mostPlayed,
      topGuests,
    };
  }, [songs, participants, tips, profileNicknames]);

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
          <Badge variant="outline" className="border-emerald-500/40 text-emerald-300">
            Live payouts
          </Badge>
        </div>

        {/* Headline */}
        <Card className="bg-card/60 border-primary/20 overflow-hidden">
          <CardContent className="p-5 sm:p-7">
            <div className="grid sm:grid-cols-2 gap-6 items-center">
              <div>
                <div className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">Tips received</div>
                <div className="mt-2 flex items-baseline gap-2">
                  <span className="text-5xl sm:text-6xl font-bold tabular-nums text-primary drop-shadow-[0_0_20px_hsl(var(--primary)/0.4)]">
                    {loading ? "—" : `$${(stats.tipGrossCents / 100).toFixed(2)}`}
                  </span>
                  <span className="text-muted-foreground text-sm">{stats.tipCount} tip{stats.tipCount === 1 ? "" : "s"}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-3 leading-relaxed">
                  Tips do not affect song placement — they're a way for guests to thank you for the set.
                </p>
              </div>
              {/* Mini bar chart */}
              <div className="flex items-end justify-end gap-2 h-32">
                {loading
                  ? null
                  : (() => {
                      const CHART_PX = 104; // 128px container - ~24px reserved for label/gap
                      const max = Math.max(1, ...stats.days.map((x) => x.value));
                      return stats.days.map((d, i) => {
                        const px = d.value > 0 ? Math.max(6, Math.round((d.value / max) * CHART_PX)) : 4;
                        return (
                          <div key={i} className="flex flex-col items-center gap-1 flex-1 max-w-[36px] h-full justify-end">
                            <div
                              className={`w-full rounded-t-md shadow-glow-sm transition-all ${
                                d.isToday
                                  ? "bg-gradient-to-t from-primary to-primary/80 ring-1 ring-primary/40"
                                  : d.value > 0
                                    ? "bg-gradient-to-t from-primary to-primary/60"
                                    : "bg-muted/40"
                              }`}
                              style={{ height: `${px}px` }}
                              title={`$${(d.value / 100).toFixed(2)}`}
                            />
                            <span className={`text-[10px] ${d.isToday ? "text-primary font-semibold" : "text-muted-foreground"}`}>
                              {d.label}
                            </span>
                          </div>
                        );
                      });
                    })()}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Time windows */}
        <div className="grid grid-cols-3 gap-3">
          <Mini label="Today" value={`$${(stats.tipsTodayCents / 100).toFixed(2)}`} suffix="in tips" loading={loading} />
          <Mini label="Last 7 days" value={`$${(stats.tipsWeekCents / 100).toFixed(2)}`} suffix="in tips" loading={loading} />
          <Mini label="Last 30 days" value={`$${(stats.tipsMonthCents / 100).toFixed(2)}`} suffix="in tips" loading={loading} />
        </div>

        {/* Engagement */}
        <section>
          <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">Engagement</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Stat icon={<Music className="h-4 w-4" />} label="Requests" value={stats.totalRequests} loading={loading} />
            <Stat icon={<CircleDollarSign className="h-4 w-4" />} label="Tips" value={stats.tipCount} loading={loading} />
            <Stat icon={<Users className="h-4 w-4" />} label="Guests" value={stats.uniqueGuests} loading={loading} />
            <Stat
              icon={<TrendingUp className="h-4 w-4" />}
              label="Your share (70%)"
              value={`$${(stats.tipNetCents / 100).toFixed(2)}`}
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
                      <div className="font-bold tabular-nums text-primary">${(g.tipCents / 100).toFixed(2)}</div>
                      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">tipped</div>
                    </div>
                  </div>
                ))
              )}
            </CardContent>
          </Card>
        </section>

        {/* Payout summary (live Stripe Connect) */}
        <PayoutSummaryCard />

        {eventIds.length === 0 && !loading && (
          <div className="text-center py-10 text-muted-foreground">
            No events yet. <Link to="/dj" className="text-primary underline">Create one</Link> to start seeing activity.
          </div>
        )}
      </main>
    </div>
  );
}

function Mini({ label, value, suffix, loading }: { label: string; value: number | string; suffix: string; loading: boolean }) {
  return (
    <Card className="bg-card/60">
      <CardContent className="py-4">
        <div className="text-[10px] sm:text-xs uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className="mt-1 flex items-baseline gap-1.5">
          <span className="text-xl sm:text-2xl font-bold tabular-nums">
            {loading ? "—" : typeof value === "number" ? value.toLocaleString() : value}
          </span>
          <span className="text-[10px] sm:text-xs text-muted-foreground">{suffix}</span>
        </div>
      </CardContent>
    </Card>
  );
}

function Stat({ icon, label, value, loading }: { icon: React.ReactNode; label: string; value: number | string; loading: boolean }) {
  return (
    <Card className="bg-card/60">
      <CardContent className="py-4">
        <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
          <span className="text-primary">{icon}</span>
          {label}
        </div>
        <div className="text-2xl font-bold tabular-nums mt-1">
          {loading ? "—" : typeof value === "number" ? value.toLocaleString() : value}
        </div>
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
