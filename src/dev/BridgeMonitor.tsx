import { useEffect, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, Music2, Radio, WifiOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";

interface Props {
  eventId: string;
}

interface NowPlaying {
  title: string;
  artist: string | null;
  source: string | null;
  status: string;
  started_at: string | null;
  updated_at: string;
  now_playing_request_id: string | null;
}

interface AutoMarked {
  id: string;
  title: string;
  artist: string;
  played_at: string;
  requester_name: string;
}

interface IntegrationRow {
  last_seen_at: string | null;
  source_type: string | null;
}

interface ErrorRow {
  id: string;
  message: string;
  created_at: string;
  severity: string;
}

const STALE_MS = 90_000; // 90s without heartbeat = disconnected

function timeAgo(iso: string | null): string {
  if (!iso) return "never";
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

export function BridgeMonitor({ eventId }: Props) {
  const [integration, setIntegration] = useState<IntegrationRow | null>(null);
  const [nowPlaying, setNowPlaying] = useState<NowPlaying | null>(null);
  const [lastAutoMarked, setLastAutoMarked] = useState<AutoMarked | null>(null);
  const [errors, setErrors] = useState<ErrorRow[]>([]);
  const [tick, setTick] = useState(0);

  const load = async () => {
    const [{ data: integ }, { data: np }, { data: marked }, { data: errs }] = await Promise.all([
      supabase
        .from("event_integrations")
        .select("last_seen_at, source_type")
        .eq("event_id", eventId)
        .maybeSingle(),
      supabase
        .from("now_playing")
        .select("title, artist, source, status, started_at, updated_at, now_playing_request_id")
        .eq("event_id", eventId)
        .maybeSingle(),
      supabase
        .from("song_requests")
        .select("id, title, artist, played_at, requester_name")
        .eq("event_id", eventId)
        .eq("played_by_source", "decks_bridge")
        .order("played_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("error_logs")
        .select("id, message, created_at, severity")
        .in("source", ["now-playing-ingest", "bridge-pair"])
        .order("created_at", { ascending: false })
        .limit(3),
    ]);
    setIntegration(integ as IntegrationRow | null);
    setNowPlaying(np as NowPlaying | null);
    setLastAutoMarked(marked as AutoMarked | null);
    setErrors((errs as ErrorRow[]) ?? []);
  };

  useEffect(() => {
    load();
    const poll = setInterval(load, 5000);
    const ticker = setInterval(() => setTick((t) => t + 1), 1000);
    return () => {
      clearInterval(poll);
      clearInterval(ticker);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const lastSeen = integration?.last_seen_at;
  const connected = lastSeen ? Date.now() - new Date(lastSeen).getTime() < STALE_MS : false;
  // tick is referenced so the "x seconds ago" labels stay fresh
  void tick;

  return (
    <Card className="p-4 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-primary" />
          <h3 className="font-semibold">Bridge Monitor</h3>
        </div>
        {connected ? (
          <Badge className="bg-green-500/15 text-green-500 border-green-500/30">
            <Radio className="w-3 h-3 mr-1" /> Connected
          </Badge>
        ) : (
          <Badge variant="outline" className="text-muted-foreground">
            <WifiOff className="w-3 h-3 mr-1" /> Disconnected
          </Badge>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Last heartbeat</div>
          <div className="font-medium">{timeAgo(lastSeen)}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Source</div>
          <div className="font-medium capitalize">{integration?.source_type ?? "—"}</div>
        </div>
      </div>

      <div className="border-t pt-3">
        <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
          <Music2 className="w-3 h-3" /> Last detected track
        </div>
        {nowPlaying ? (
          <div>
            <div className="font-medium truncate">{nowPlaying.title}</div>
            <div className="text-xs text-muted-foreground truncate">
              {nowPlaying.artist || "Unknown artist"} · {nowPlaying.status} ·{" "}
              {timeAgo(nowPlaying.updated_at)}
            </div>
            <div className="text-xs mt-1">
              {nowPlaying.now_playing_request_id ? (
                <span className="text-green-500 flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> Auto-matched to a request
                </span>
              ) : (
                <span className="text-muted-foreground">No matching request found</span>
              )}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">No track received yet</div>
        )}
      </div>

      <div className="border-t pt-3">
        <div className="text-xs text-muted-foreground mb-1">Last auto-marked played</div>
        {lastAutoMarked ? (
          <div>
            <div className="font-medium truncate">{lastAutoMarked.title}</div>
            <div className="text-xs text-muted-foreground truncate">
              {lastAutoMarked.artist} · requested by {lastAutoMarked.requester_name} ·{" "}
              {timeAgo(lastAutoMarked.played_at)}
            </div>
          </div>
        ) : (
          <div className="text-sm text-muted-foreground">None yet</div>
        )}
      </div>

      {errors.length > 0 && (
        <div className="border-t pt-3">
          <div className="text-xs text-muted-foreground mb-1 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3 text-destructive" /> Recent errors
          </div>
          <ul className="space-y-1">
            {errors.map((e) => (
              <li key={e.id} className="text-xs">
                <span className="text-destructive font-medium">{e.severity}</span>{" "}
                <span className="text-muted-foreground">· {timeAgo(e.created_at)}</span>
                <div className="truncate">{e.message}</div>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
