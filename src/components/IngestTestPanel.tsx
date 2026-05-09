import { useEffect, useState } from "react";
import { Copy, Loader2, Send, Terminal, RefreshCw, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

interface Props {
  eventId: string;
}

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const ENDPOINT = `${SUPABASE_URL}/functions/v1/now-playing-ingest`;

const SAMPLE_PAYLOAD = {
  title: "FE!N",
  artist: "Travis Scott",
  album_art: "",
  source: "test_ingest",
  status: "playing",
};

export function IngestTestPanel({ eventId }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string } | null>(null);

  const loadToken = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("event_integrations")
      .select("ingest_token")
      .eq("event_id", eventId)
      .maybeSingle();

    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }

    if (data?.ingest_token) {
      setToken(data.ingest_token);
    } else {
      // Create one
      const { data: created, error: insErr } = await supabase
        .from("event_integrations")
        .insert({ event_id: eventId, source_type: "manual" })
        .select("ingest_token")
        .single();
      if (insErr) toast.error(insErr.message);
      else setToken(created.ingest_token);
    }
    setLoading(false);
  };

  useEffect(() => {
    loadToken();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId]);

  const copy = (label: string, value: string) => {
    navigator.clipboard.writeText(value);
    toast.success(`${label} copied`);
  };

  const sendTest = async () => {
    if (!token) return;
    setSending(true);
    setLastResult(null);
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Ingest-Token": token,
        },
        body: JSON.stringify(SAMPLE_PAYLOAD),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok) {
        setLastResult({ ok: true, message: "Test track sent — guests should update live ✨" });
        toast.success("Test track sent");
      } else {
        const msg = typeof json?.error === "string" ? json.error : `HTTP ${res.status}`;
        setLastResult({ ok: false, message: msg });
        toast.error(`Ingest failed: ${msg}`);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Network error";
      setLastResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setSending(false);
    }
  };

  const masked = token ? `${token.slice(0, 6)}••••••••${token.slice(-4)}` : "";

  return (
    <div className="rounded-2xl border border-dashed border-primary/30 bg-card/40 p-4 sm:p-5">
      <div className="flex items-center gap-2 mb-3">
        <Terminal className="h-4 w-4 text-primary" />
        <h3 className="font-semibold">Now Playing Ingest — Developer Test</h3>
        <Badge variant="secondary" className="text-[10px]">DEV</Badge>
      </div>
      <p className="text-xs text-muted-foreground mb-4">
        Use this to test the <code className="px-1 py-0.5 rounded bg-secondary text-foreground">now-playing-ingest</code> Edge Function.
        The guest Now Playing card updates live via Realtime — no refresh needed.
      </p>

      <div className="space-y-3 text-sm">
        <Field label="event_id" value={eventId} onCopy={() => copy("event_id", eventId)} mono />
        <Field
          label="Endpoint URL"
          value={ENDPOINT}
          onCopy={() => copy("Endpoint", ENDPOINT)}
          mono
        />
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">ingest_token</span>
            <div className="flex gap-1">
              <Button size="sm" variant="ghost" onClick={() => setReveal((r) => !r)} className="h-7 px-2">
                {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </Button>
              <Button size="sm" variant="ghost" onClick={loadToken} className="h-7 px-2" title="Reload">
                <RefreshCw className="h-3.5 w-3.5" />
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => token && copy("Token", token)}
                className="h-7 px-2"
                disabled={!token}
              >
                <Copy className="h-3.5 w-3.5" />
              </Button>
            </div>
          </div>
          <div className="font-mono text-xs px-3 py-2 rounded-lg bg-background/60 border break-all">
            {loading ? "Loading…" : reveal ? token : masked}
          </div>
        </div>

        <div>
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Example payload</div>
          <pre className="text-xs px-3 py-2 rounded-lg bg-background/60 border overflow-x-auto">
{JSON.stringify(SAMPLE_PAYLOAD, null, 2)}
          </pre>
        </div>

        <div className="flex flex-col sm:flex-row gap-2 pt-1">
          <Button
            onClick={sendTest}
            disabled={!token || sending}
            className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground"
          >
            {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
            Send Test Track
          </Button>
          {lastResult && (
            <div
              className={`flex-1 text-xs px-3 py-2 rounded-lg border ${
                lastResult.ok
                  ? "bg-primary/10 border-primary/30 text-primary"
                  : "bg-destructive/10 border-destructive/30 text-destructive"
              }`}
            >
              {lastResult.message}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({
  label,
  value,
  onCopy,
  mono,
}: {
  label: string;
  value: string;
  onCopy: () => void;
  mono?: boolean;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-xs uppercase tracking-wider text-muted-foreground">{label}</span>
        <Button size="sm" variant="ghost" onClick={onCopy} className="h-7 px-2">
          <Copy className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className={`px-3 py-2 rounded-lg bg-background/60 border break-all ${mono ? "font-mono text-xs" : "text-sm"}`}>
        {value}
      </div>
    </div>
  );
}
