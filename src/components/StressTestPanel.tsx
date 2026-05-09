import { useEffect, useMemo, useRef, useState } from "react";
import { Activity, Play, Square, Trash2, Loader2, Users, Music, ThumbsUp, Radio } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props { eventId: string }

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/stress-test`;

type EventTick = { kind: "request" | "vote" | "now_playing" | "queue"; ts: number; latencyMs?: number };

async function callStress(action: string, body: Record<string, unknown> = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(ENDPOINT, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ action, ...body }),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json?.error ?? `HTTP ${res.status}`);
  return json;
}

export function StressTestPanel({ eventId }: Props) {
  const [running, setRunning] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [activeGuests, setActiveGuests] = useState(0);
  const [edgeCalls, setEdgeCalls] = useState(0);
  const ticksRef = useRef<EventTick[]>([]);
  const [, force] = useState(0);
  const intervalsRef = useRef<number[]>([]);

  // Load participant count
  const refreshGuests = async () => {
    const { count } = await supabase
      .from("event_participants")
      .select("id", { count: "exact", head: true })
      .eq("event_id", eventId);
    setActiveGuests(count ?? 0);
  };

  useEffect(() => { refreshGuests(); }, [eventId]);

  // Subscribe to realtime for metrics + latency
  useEffect(() => {
    const channel = supabase
      .channel(`stress-${eventId}`)
      .on("postgres_changes",
        { event: "*", schema: "public", table: "song_requests", filter: `event_id=eq.${eventId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { created_at?: string };
          const latencyMs = row?.created_at ? Date.now() - new Date(row.created_at).getTime() : undefined;
          ticksRef.current.push({ kind: payload.eventType === "INSERT" ? "request" : "queue", ts: Date.now(), latencyMs });
          force((n) => n + 1);
        })
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "votes" },
        () => {
          ticksRef.current.push({ kind: "vote", ts: Date.now() });
          force((n) => n + 1);
        })
      .on("postgres_changes",
        { event: "*", schema: "public", table: "now_playing", filter: `event_id=eq.${eventId}` },
        (payload) => {
          const row = (payload.new ?? payload.old) as { updated_at?: string };
          const latencyMs = row?.updated_at ? Date.now() - new Date(row.updated_at).getTime() : undefined;
          ticksRef.current.push({ kind: "now_playing", ts: Date.now(), latencyMs });
          force((n) => n + 1);
        })
      .on("postgres_changes",
        { event: "INSERT", schema: "public", table: "event_participants", filter: `event_id=eq.${eventId}` },
        () => { setActiveGuests((c) => c + 1); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [eventId]);

  // Trim ticks to last 5 min
  useEffect(() => {
    const id = window.setInterval(() => {
      const cutoff = Date.now() - 5 * 60_000;
      ticksRef.current = ticksRef.current.filter((t) => t.ts > cutoff);
      force((n) => n + 1);
    }, 2000);
    return () => window.clearInterval(id);
  }, []);

  const metrics = useMemo(() => {
    const now = Date.now();
    const last60 = ticksRef.current.filter((t) => now - t.ts < 60_000);
    const reqs = last60.filter((t) => t.kind === "request").length;
    const votes = last60.filter((t) => t.kind === "vote").length;
    const queue = last60.filter((t) => t.kind === "queue").length;
    const np = last60.filter((t) => t.kind === "now_playing").length;
    const lats = last60.map((t) => t.latencyMs).filter((x): x is number => typeof x === "number" && x >= 0 && x < 60_000);
    const avgLat = lats.length ? Math.round(lats.reduce((a, b) => a + b, 0) / lats.length) : null;
    return { reqs, votes, queue, np, avgLat };
  }, [ticksRef.current.length]); // eslint-disable-line react-hooks/exhaustive-deps

  const trackEdge = async (action: string, body?: Record<string, unknown>) => {
    setEdgeCalls((c) => c + 1);
    return callStress(action, { event_id: eventId, ...(body ?? {}) });
  };

  const start = async () => {
    if (running) return;
    setRunning(true);
    setBusy("seeding");
    try {
      await trackEdge("seed_participants", { count: 25 });
      await refreshGuests();
      toast.success("Seeded 25 fake guests");
    } catch (e) {
      toast.error(`Seed failed: ${(e as Error).message}`);
      setRunning(false);
      setBusy(null);
      return;
    }
    setBusy(null);

    // Burst loops
    const reqInt = window.setInterval(() => { trackEdge("burst_requests", { count: 3 }).catch(() => {}); }, 4000);
    const voteInt = window.setInterval(() => { trackEdge("burst_votes", { count: 8 }).catch(() => {}); }, 2500);
    const npInt = window.setInterval(() => { trackEdge("now_playing").catch(() => {}); }, 12000);
    intervalsRef.current = [reqInt, voteInt, npInt];
  };

  const stop = () => {
    intervalsRef.current.forEach((id) => window.clearInterval(id));
    intervalsRef.current = [];
    setRunning(false);
  };

  const cleanup = async () => {
    stop();
    setBusy("cleanup");
    try {
      await trackEdge("cleanup");
      await refreshGuests();
      ticksRef.current = [];
      toast.success("Cleaned up stress data");
    } catch (e) {
      toast.error(`Cleanup failed: ${(e as Error).message}`);
    } finally {
      setBusy(null);
    }
  };

  useEffect(() => () => stop(), []);

  return (
    <div className="rounded-2xl border border-dashed border-amber-500/40 bg-amber-500/5 p-3 sm:p-4 space-y-3">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-amber-400 font-semibold">
          <Activity className="h-3.5 w-3.5" /> Live Event Stress Test
          <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-400">DEV</Badge>
        </div>
        <div className="flex gap-2">
          {!running ? (
            <Button size="sm" onClick={start} disabled={!!busy}>
              {busy === "seeding" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Play className="h-4 w-4 mr-1" />}
              Start
            </Button>
          ) : (
            <Button size="sm" variant="secondary" onClick={stop}>
              <Square className="h-4 w-4 mr-1" /> Stop
            </Button>
          )}
          <Button size="sm" variant="outline" onClick={cleanup} disabled={busy === "cleanup"}>
            {busy === "cleanup" ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Trash2 className="h-4 w-4 mr-1" />}
            Cleanup
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <Metric icon={<Users className="h-3.5 w-3.5" />} label="Active guests" value={activeGuests} />
        <Metric icon={<Music className="h-3.5 w-3.5" />} label="Reqs / min" value={metrics.reqs} />
        <Metric icon={<ThumbsUp className="h-3.5 w-3.5" />} label="Votes / min" value={metrics.votes} />
        <Metric icon={<Radio className="h-3.5 w-3.5" />} label="RT latency" value={metrics.avgLat == null ? "—" : `${metrics.avgLat}ms`} />
      </div>

      <div className="rounded-lg border border-border/60 bg-background/60 p-2 text-[11px] text-muted-foreground space-y-1">
        <div className="font-semibold text-foreground/80 uppercase tracking-wider text-[10px]">Dev monitor</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-0.5">
          <div>Edge calls: <span className="text-foreground">{edgeCalls}</span></div>
          <div>RT subscribed: <span className="text-foreground">songs · votes · now_playing · participants</span></div>
          <div>Now-playing updates/min: <span className="text-foreground">{metrics.np}</span></div>
          <div>Queue updates/min: <span className="text-foreground">{metrics.queue}</span></div>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground">
        Seeds 25 fake guests, then bursts requests every 4s, votes every 2.5s, and a now-playing swap every 12s. All rows are tagged and removed by Cleanup.
      </p>
    </div>
  );
}

function Metric({ icon, label, value }: { icon: React.ReactNode; label: string; value: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-background/60 p-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground">
        {icon}{label}
      </div>
      <div className="text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}
