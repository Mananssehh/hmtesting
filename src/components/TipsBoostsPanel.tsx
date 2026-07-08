import { useEffect, useMemo, useRef, useState } from "react";
import { CircleDollarSign, Loader2, Music, Play, Check, ArrowRight, Filter, TrendingUp, Clock } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { SongRequestRow } from "@/components/SongRequestCard";

export interface DJTipRow {
  id: string;
  event_id: string | null;
  user_id: string;
  song_request_id: string | null;
  song_title: string | null;
  artist: string | null;
  guest_nickname: string | null;
  gross_amount_cents: number;
  net_amount_cents: number;
  platform_fee_cents: number;
  status: string; // pending | succeeded | failed | refunded | partially_refunded | disputed
  refunded_amount_cents: number;
  created_at: string;
}

interface Props {
  eventId: string;
  songs: SongRequestRow[];
  onMarkPlaying?: (songId: string) => void;
  onMarkPlayed?: (songId: string) => void;
  onApprove?: (songId: string) => void;
}

type FilterKey = "all" | "succeeded" | "pending" | "highest" | "newest";

const filters: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "succeeded", label: "Paid" },
  { key: "pending", label: "Pending" },
  { key: "highest", label: "Highest" },
  { key: "newest", label: "Newest" },
];

function fmt(cents: number) {
  const dollars = cents / 100;
  return `$${dollars.toFixed(dollars % 1 === 0 ? 0 : 2)}`;
}

function timeAgo(iso: string) {
  const diff = Date.now() - +new Date(iso);
  const s = Math.floor(diff / 1000);
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    succeeded: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    pending: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    failed: "bg-destructive/15 text-destructive border-destructive/30",
    refunded: "bg-muted text-muted-foreground border-border",
    partially_refunded: "bg-muted text-muted-foreground border-border",
    disputed: "bg-orange-500/15 text-orange-300 border-orange-500/30",
  };
  return map[status] ?? "bg-secondary text-muted-foreground border-transparent";
}

export function TipsBoostsPanel({ eventId, songs, onMarkPlaying, onMarkPlayed, onApprove }: Props) {
  const [tips, setTips] = useState<DJTipRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FilterKey>("all");
  const firstLoad = useRef(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data, error } = await supabase
        .from("dj_tips")
        .select("id, event_id, user_id, song_request_id, song_title, artist, guest_nickname, gross_amount_cents, net_amount_cents, platform_fee_cents, status, refunded_amount_cents, created_at")
        .eq("event_id", eventId)
        .order("created_at", { ascending: false });
      if (cancelled) return;
      if (error) {
        console.error("[TipsBoostsPanel] load", error.message);
      }
      setTips((data ?? []) as DJTipRow[]);
      setLoading(false);
      firstLoad.current = false;
    })();
    return () => { cancelled = true; };
  }, [eventId]);

  // Realtime — new/updated tips.
  useEffect(() => {
    const channel = supabase
      .channel(`dj-tips-${eventId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "dj_tips", filter: `event_id=eq.${eventId}` },
        (payload) => {
          setTips((prev) => {
            if (payload.eventType === "INSERT") {
              const row = payload.new as DJTipRow;
              return [row, ...prev.filter((t) => t.id !== row.id)];
            }
            if (payload.eventType === "UPDATE") {
              const row = payload.new as DJTipRow;
              const before = prev.find((t) => t.id === row.id);
              // Toast when a tip transitions to succeeded.
              if (before && before.status !== "succeeded" && row.status === "succeeded") {
                const label = row.song_title ? `"${row.song_title}"` : "your event";
                toast.success(`💸 ${fmt(row.gross_amount_cents)} tip for ${label}`);
              }
              return prev.map((t) => (t.id === row.id ? row : t));
            }
            if (payload.eventType === "DELETE") {
              const row = payload.old as { id: string };
              return prev.filter((t) => t.id !== row.id);
            }
            return prev;
          });
        },
      )
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  const totals = useMemo(() => {
    let gross = 0, net = 0, fee = 0, pending = 0;
    const bySong = new Map<string, number>();
    for (const t of tips) {
      const active = t.status === "succeeded" || t.status === "partially_refunded";
      if (active) {
        const effective = Math.max(0, t.gross_amount_cents - (t.refunded_amount_cents ?? 0));
        gross += effective;
        const netEff = Math.max(0, t.net_amount_cents - Math.floor((t.refunded_amount_cents ?? 0) * (t.net_amount_cents / (t.gross_amount_cents || 1))));
        net += netEff;
        fee += Math.max(0, effective - netEff);
        if (t.song_request_id) {
          bySong.set(t.song_request_id, (bySong.get(t.song_request_id) ?? 0) + effective);
        }
      }
      if (t.status === "pending") pending += t.gross_amount_cents;
    }
    let topId: string | null = null; let topCents = 0;
    for (const [id, c] of bySong) if (c > topCents) { topCents = c; topId = id; }
    const topSong = topId ? songs.find((s) => s.id === topId) : null;
    return { gross, net, fee, pending, topSong, topCents, tipsCount: tips.filter((t) => t.status === "succeeded" || t.status === "partially_refunded").length };
  }, [tips, songs]);

  const filtered = useMemo(() => {
    let list = [...tips];
    if (filter === "succeeded") list = list.filter((t) => t.status === "succeeded" || t.status === "partially_refunded");
    else if (filter === "pending") list = list.filter((t) => t.status === "pending");
    else if (filter === "highest") list.sort((a, b) => b.gross_amount_cents - a.gross_amount_cents);
    else if (filter === "newest") list.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    if (filter !== "highest" && filter !== "newest") {
      list.sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    }
    return list;
  }, [tips, filter]);

  const songById = useMemo(() => new Map(songs.map((s) => [s.id, s])), [songs]);

  return (
    <section className="mb-6 rounded-2xl border border-primary/25 bg-gradient-to-b from-primary/[0.06] to-transparent p-4 sm:p-5">
      <header className="flex items-center justify-between gap-2 mb-4 flex-wrap">
        <div className="flex items-center gap-2">
          <div className="h-8 w-8 rounded-full bg-primary/20 border border-primary/40 flex items-center justify-center">
            <CircleDollarSign className="h-4 w-4 text-primary" />
          </div>
          <div>
            <h2 className="text-base font-bold tracking-tight leading-none">Tips &amp; Boosts</h2>
            <p className="text-[11px] text-muted-foreground mt-0.5">Live view of songs guests are paying to hear</p>
          </div>
        </div>
        <Badge variant="outline" className="text-[10px] gap-1 border-primary/30">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
        </Badge>
      </header>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 mb-4">
        <SummaryCard label="Tips this event" value={fmt(totals.gross)} sub={`${totals.tipsCount} tip${totals.tipsCount === 1 ? "" : "s"}`} accent />
        <SummaryCard label="Your payout" value={fmt(totals.net)} sub={`Decks fee ${fmt(totals.fee)}`} />
        <SummaryCard
          label="Top tipped song"
          value={totals.topSong ? fmt(totals.topCents) : "—"}
          sub={totals.topSong ? `${totals.topSong.title}` : "No tips yet"}
        />
        <SummaryCard label="Pending" value={fmt(totals.pending)} sub="Awaiting Stripe" />
      </div>

      {/* Filters */}
      <div className="flex items-center gap-1 flex-wrap mb-3">
        <Filter className="h-3.5 w-3.5 text-muted-foreground/70 mr-1" />
        {filters.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={cn(
              "text-[11px] px-2.5 py-1 rounded-full border transition-colors",
              filter === f.key
                ? "bg-primary/20 text-primary border-primary/40"
                : "bg-transparent text-muted-foreground border-white/[0.08] hover:border-white/[0.18]",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* List */}
      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-10 rounded-xl border border-dashed border-border/60">
          <CircleDollarSign className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
          <p className="font-medium text-sm">No tipped songs yet.</p>
          <p className="text-xs text-muted-foreground mt-1">
            When guests boost or tip a request, it will appear here live.
          </p>
        </div>
      ) : (
        <ul className="space-y-2">
          {filtered.map((t) => {
            const linkedSong = t.song_request_id ? songById.get(t.song_request_id) : null;
            const requestStatus = linkedSong?.status;
            const refunded = t.status === "refunded" || t.status === "partially_refunded";
            return (
              <li
                key={t.id}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-xl bg-card/60 border border-white/[0.06] hover:border-primary/30 transition-colors",
                  refunded && "opacity-60",
                )}
              >
                <div className="h-11 w-11 rounded-lg overflow-hidden bg-secondary/40 shrink-0 flex items-center justify-center">
                  {linkedSong?.album_art ? (
                    <img src={linkedSong.album_art} alt="" className="h-full w-full object-cover" />
                  ) : (
                    <Music className="h-4 w-4 text-muted-foreground" />
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-emerald-300 font-bold text-sm tabular-nums">
                      {fmt(t.gross_amount_cents)}
                    </span>
                    <span className="text-sm font-semibold truncate">
                      {t.song_title || linkedSong?.title || (t.song_request_id ? "Unknown song" : "General tip")}
                    </span>
                    {(t.artist || linkedSong?.artist) && (
                      <span className="text-xs text-muted-foreground truncate">— {t.artist || linkedSong?.artist}</span>
                    )}
                  </div>
                  <div className="flex items-center gap-2 flex-wrap text-[11px] text-muted-foreground mt-0.5">
                    <span>{t.guest_nickname ? `@${t.guest_nickname}` : "Anonymous"}</span>
                    <span>·</span>
                    <span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" />{timeAgo(t.created_at)}</span>
                    <Badge variant="outline" className={cn("text-[9px] px-1.5 py-0 capitalize", statusBadge(t.status))}>
                      {t.status.replace("_", " ")}
                    </Badge>
                    {requestStatus && (
                      <Badge variant="outline" className="text-[9px] px-1.5 py-0 capitalize">
                        Request: {requestStatus}
                      </Badge>
                    )}
                  </div>
                </div>

                {/* Actions */}
                {linkedSong && (
                  <div className="flex items-center gap-1 shrink-0">
                    {onApprove && linkedSong.status === "pending" && (
                      <Button size="sm" variant="outline" onClick={() => onApprove(linkedSong.id)} title="Approve">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {onMarkPlaying && linkedSong.status !== "playing" && linkedSong.status !== "played" && linkedSong.status !== "skipped" && (
                      <Button size="sm" variant="premium" onClick={() => onMarkPlaying(linkedSong.id)} title="Mark Now Playing">
                        <Play className="h-3.5 w-3.5 mr-1 fill-current" />
                        Play
                      </Button>
                    )}
                    {onMarkPlayed && linkedSong.status === "playing" && (
                      <Button size="sm" variant="outline" onClick={() => onMarkPlayed(linkedSong.id)} title="Mark played">
                        <Check className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function SummaryCard({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <Card className={cn("bg-card/50", accent && "border-primary/40 bg-primary/[0.05]")}>
      <CardContent className="py-3 px-3">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
        <div className={cn("text-lg sm:text-xl font-bold tabular-nums mt-0.5 truncate", accent && "text-primary")}>{value}</div>
        {sub && <div className="text-[10px] text-muted-foreground truncate mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}
