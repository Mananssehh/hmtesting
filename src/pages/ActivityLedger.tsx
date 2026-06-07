import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, Trophy, Sparkles, RotateCcw, Award } from "lucide-react";
import { format, formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

type Filter = "all" | "earned" | "spent" | "refunded";

interface LedgerRow {
  id: string;
  amount: number;
  type: "earned" | "spent" | "refunded" | "manual_adjustment";
  reason: string;
  created_at: string;
  event_id: string | null;
  song_request_id: string | null;
  song_title?: string;
  song_artist?: string;
  event_name?: string;
}

const PAGE_SIZE = 50;

export default function ActivityLedger() {
  const { user, profile, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [rows, setRows] = useState<LedgerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    setRows([]);
    setPage(0);
    setHasMore(true);
    void loadPage(0, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, filter]);

  const loadPage = async (p: number, replace = false) => {
    if (!user) return;
    setLoading(true);
    let q = supabase
      .from("points_transactions")
      .select("id, amount, type, reason, created_at, event_id, song_request_id")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .range(p * PAGE_SIZE, p * PAGE_SIZE + PAGE_SIZE - 1);

    if (filter === "earned") q = q.gt("amount", 0).neq("type", "refunded");
    else if (filter === "spent") q = q.lt("amount", 0);
    else if (filter === "refunded") q = q.eq("type", "refunded");

    const { data: txs, error } = await q;
    if (error) {
      setLoading(false);
      return;
    }
    const txList = (txs ?? []) as Omit<LedgerRow, "song_title" | "song_artist" | "event_name">[];

    // Hydrate song + event info
    const songIds = Array.from(new Set(txList.map((t) => t.song_request_id).filter(Boolean) as string[]));
    const eventIds = Array.from(new Set(txList.map((t) => t.event_id).filter(Boolean) as string[]));
    const [songsRes, eventsRes] = await Promise.all([
      songIds.length
        ? supabase.from("song_requests").select("id, title, artist").in("id", songIds)
        : Promise.resolve({ data: [] as { id: string; title: string; artist: string }[] }),
      eventIds.length
        ? supabase.from("events").select("id, name").in("id", eventIds)
        : Promise.resolve({ data: [] as { id: string; name: string }[] }),
    ]);
    const songMap = new Map((songsRes.data ?? []).map((s) => [s.id, s]));
    const eventMap = new Map((eventsRes.data ?? []).map((e) => [e.id, e]));

    const hydrated: LedgerRow[] = txList.map((t) => ({
      ...t,
      song_title: t.song_request_id ? songMap.get(t.song_request_id)?.title : undefined,
      song_artist: t.song_request_id ? songMap.get(t.song_request_id)?.artist : undefined,
      event_name: t.event_id ? eventMap.get(t.event_id)?.name : undefined,
    }));

    setRows((prev) => (replace ? hydrated : [...prev, ...hydrated]));
    setHasMore(txList.length === PAGE_SIZE);
    setPage(p);
    setLoading(false);
  };

  const summary = useMemo(() => {
    let earned = 0;
    let spent = 0;
    for (const r of rows) {
      if (r.amount > 0) earned += r.amount;
      else spent += r.amount;
    }
    return { earned, spent };
  }, [rows]);

  if (authLoading || !user || !profile) {
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
      <main className="container max-w-3xl py-8 space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-3">
            <Link to="/profile"><ArrowLeft className="h-4 w-4 mr-1" />Back to profile</Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Award className="h-7 w-7 text-primary" /> Activity
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Every point earned, spent, and refunded on your account.
          </p>
        </div>

        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="p-4 flex items-center justify-between gap-4 flex-wrap">
            <div>
              <div className="text-xs text-primary uppercase tracking-wider">Current balance</div>
              <div className="text-3xl font-bold tabular-nums text-primary">{profile.points}</div>
            </div>
            <div className="text-right text-xs text-muted-foreground space-y-1">
              <div>Shown below: <span className="text-success font-semibold tabular-nums">+{summary.earned}</span> earned · <span className="text-primary font-semibold tabular-nums">{summary.spent}</span> spent</div>
              <div className="text-muted-foreground/70">Showing {rows.length} entries</div>
            </div>
          </CardContent>
        </Card>

        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="grid grid-cols-4 w-full">
            <TabsTrigger value="all">All</TabsTrigger>
            <TabsTrigger value="earned">Earned</TabsTrigger>
            <TabsTrigger value="spent">Spent</TabsTrigger>
            <TabsTrigger value="refunded">Refunded</TabsTrigger>
          </TabsList>
        </Tabs>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Ledger</CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {loading && rows.length === 0 ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                No activity yet. Join an event to earn points.
              </p>
            ) : (
              rows.map((r) => {
                const isRefund = r.type === "refunded";
                const positive = r.amount > 0;
                const Icon = isRefund ? RotateCcw : positive ? Trophy : Sparkles;
                const label =
                  r.song_title
                    ? `${r.reason} — ${r.song_title}${r.song_artist ? ` · ${r.song_artist}` : ""}`
                    : r.event_name
                    ? `${r.reason}${r.event_name ? ` · ${r.event_name}` : ""}`
                    : r.reason || r.type;
                const RowInner = (
                  <div className="flex items-center justify-between px-4 py-3 hover:bg-secondary/40">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                        isRefund
                          ? "bg-muted text-muted-foreground"
                          : positive
                          ? "bg-success/15 text-success"
                          : "bg-primary/15 text-primary"
                      }`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium text-sm truncate">{label}</div>
                        <div className="text-xs text-muted-foreground" title={format(new Date(r.created_at), "PPpp")}>
                          {formatDistanceToNow(new Date(r.created_at), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                    <span className={`font-bold tabular-nums ${
                      isRefund ? "text-muted-foreground" : positive ? "text-success" : "text-primary"
                    }`}>
                      {positive ? "+" : ""}{r.amount}
                    </span>
                  </div>
                );
                return r.event_id ? (
                  <Link key={r.id} to={`/event/${r.event_id}`} className="block">{RowInner}</Link>
                ) : (
                  <div key={r.id}>{RowInner}</div>
                );
              })
            )}
          </CardContent>
        </Card>

        {hasMore && rows.length > 0 && (
          <div className="flex justify-center">
            <Button variant="outline" onClick={() => loadPage(page + 1)} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Load more
            </Button>
          </div>
        )}
      </main>
      <SiteFooter />
    </div>
  );
}
