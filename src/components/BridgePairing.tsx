import { useEffect, useRef, useState } from "react";
import { Loader2, Link2, RefreshCw, Radio, ShieldAlert, Check, Copy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  eventId: string;
}

interface PairingCode {
  code: string;
  expires_at: string;
}

type ConnState = "idle" | "waiting" | "connected";

export function BridgePairing({ eventId }: Props) {
  const [pairing, setPairing] = useState<PairingCode | null>(null);
  const [generating, setGenerating] = useState(false);
  const [rotating, setRotating] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [lastSeen, setLastSeen] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<string | null>(null);
  const [connState, setConnState] = useState<ConnState>("idle");
  const baselineLastSeen = useRef<string | null>(null);

  // Load current integration status
  const loadIntegration = async () => {
    const { data } = await supabase
      .from("event_integrations")
      .select("last_seen_at, source_type")
      .eq("event_id", eventId)
      .maybeSingle();
    if (data) {
      setLastSeen(data.last_seen_at);
      setSourceType(data.source_type);
    }
  };

  useEffect(() => {
    loadIntegration();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  // 1s ticker for countdown + status polling while waiting
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  // Poll integration row when waiting for Bridge to connect
  useEffect(() => {
    if (connState !== "waiting") return;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("event_integrations")
        .select("last_seen_at, source_type")
        .eq("event_id", eventId)
        .maybeSingle();
      if (!data) return;
      setLastSeen(data.last_seen_at);
      setSourceType(data.source_type);
      if (data.last_seen_at && data.last_seen_at !== baselineLastSeen.current) {
        setConnState("connected");
        setPairing(null);
        toast.success("Decks Bridge connected 🎶");
      }
    }, 3000);
    return () => clearInterval(t);
  }, [connState, eventId]);

  // Detect expiry
  const secondsLeft = pairing
    ? Math.max(0, Math.floor((new Date(pairing.expires_at).getTime() - now) / 1000))
    : 0;
  useEffect(() => {
    if (pairing && secondsLeft <= 0) {
      setPairing(null);
      if (connState === "waiting") setConnState("idle");
    }
  }, [secondsLeft, pairing, connState]);

  // Initial connState — if last_seen recent, mark connected
  useEffect(() => {
    if (!lastSeen) return;
    const age = Date.now() - new Date(lastSeen).getTime();
    if (age < 1000 * 60 * 10) setConnState((s) => (s === "idle" ? "connected" : s));
  }, [lastSeen]);

  const generateCode = async () => {
    setGenerating(true);
    try {
      baselineLastSeen.current = lastSeen;
      const { data, error } = await supabase.rpc("generate_bridge_pairing_code", {
        _event_id: eventId,
      });
      if (error) throw error;
      const row = Array.isArray(data) ? data[0] : data;
      if (!row) throw new Error("No code returned");
      setPairing({ code: row.code as string, expires_at: row.expires_at as string });
      setConnState("waiting");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not generate code");
    } finally {
      setGenerating(false);
    }
  };

  const rotateToken = async () => {
    if (!confirm("Rotate ingest token? Decks Bridge will need to be re-paired.")) return;
    setRotating(true);
    try {
      const { error } = await supabase.rpc("regenerate_ingest_token", { _event_id: eventId });
      if (error) throw error;
      setPairing(null);
      setConnState("idle");
      baselineLastSeen.current = null;
      await loadIntegration();
      toast.success("Ingest token rotated. Pair Bridge again to reconnect.");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not rotate token");
    } finally {
      setRotating(false);
    }
  };

  const copyCode = () => {
    if (!pairing) return;
    navigator.clipboard.writeText(pairing.code);
    toast.success("Pairing code copied");
  };

  const mmss = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const lastSeenLabel = lastSeen
    ? formatRelative(new Date(lastSeen))
    : "never";

  return (
    <div className="rounded-2xl border border-primary/30 bg-card/40 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Radio className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Decks Bridge</h3>
        {connState === "connected" && (
          <Badge className="bg-primary/20 text-primary border-primary/40 gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> Connected
          </Badge>
        )}
        {connState === "waiting" && (
          <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 gap-1.5">
            <Loader2 className="h-3 w-3 animate-spin" /> Waiting for Bridge
          </Badge>
        )}
        {connState === "idle" && (
          <Badge variant="secondary">Not connected</Badge>
        )}
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Pair the Decks Bridge desktop app to push Now Playing track metadata into your event automatically.
      </p>

      {!pairing && (
        <div className="flex flex-col sm:flex-row gap-2">
          <Button onClick={generateCode} disabled={generating} variant="premium">
            {generating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Link2 className="mr-2 h-4 w-4" />}
            Connect Decks Bridge
          </Button>
          <Button onClick={rotateToken} disabled={rotating} variant="outline">
            {rotating ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldAlert className="mr-2 h-4 w-4" />}
            Rotate ingest token
          </Button>
        </div>
      )}

      {pairing && (
        <div className="space-y-3">
          <div className="rounded-xl bg-background/60 border p-4 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1">
              <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">
                Enter this code in Decks Bridge
              </div>
              <div className="font-mono text-4xl font-bold tracking-[0.4em]">{pairing.code}</div>
              <div className="text-xs text-muted-foreground mt-1">
                Expires in <span className="text-foreground font-medium">{mmss(secondsLeft)}</span>
              </div>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={copyCode}>
                <Copy className="mr-1.5 h-3.5 w-3.5" /> Copy
              </Button>
              <Button variant="ghost" size="sm" onClick={generateCode} disabled={generating}>
                <RefreshCw className="mr-1.5 h-3.5 w-3.5" /> New code
              </Button>
            </div>
          </div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Waiting for Decks Bridge to pair…
          </div>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border/50 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="uppercase tracking-wider text-muted-foreground">Source</div>
          <div className="font-medium">{sourceType ?? "—"}</div>
        </div>
        <div>
          <div className="uppercase tracking-wider text-muted-foreground">Last seen</div>
          <div className="font-medium flex items-center gap-1">
            {connState === "connected" && <Check className="h-3 w-3 text-primary" />}
            {lastSeenLabel}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatRelative(date: Date) {
  const diff = Date.now() - date.getTime();
  const s = Math.floor(diff / 1000);
  if (s < 5) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}
