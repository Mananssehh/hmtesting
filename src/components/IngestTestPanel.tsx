import { useEffect, useState } from "react";
import { Copy, Loader2, Send, Terminal, RefreshCw, Eye, EyeOff, FlaskConical, Check, X } from "lucide-react";
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

const SMOKE_PAYLOAD = {
  title: "FE!N",
  artist: "Travis Scott",
  album_art: "",
  source: "smoke_test",
  status: "playing" as const,
};

type StepStatus = "pending" | "running" | "pass" | "fail";
interface SmokeStep { label: string; status: StepStatus; detail?: string }

export function IngestTestPanel({ eventId }: Props) {
  const [token, setToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [reveal, setReveal] = useState(false);
  const [lastResult, setLastResult] = useState<{ ok: boolean; message: string } | null>(null);
  const [smokeRunning, setSmokeRunning] = useState(false);
  const [smokeSteps, setSmokeSteps] = useState<SmokeStep[]>([]);

  const loadToken = async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_ingest_token", { _event_id: eventId });
    if (error) {
      toast.error(error.message);
      setLoading(false);
      return;
    }
    if (data) setToken(data as string);
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

  const runSmokeTest = async () => {
    setSmokeRunning(true);
    const steps: SmokeStep[] = [
      { label: "Find or create event_integrations row", status: "pending" },
      { label: "Get ingest_token", status: "pending" },
      { label: "POST /functions/v1/now-playing-ingest", status: "pending" },
      { label: "Edge Function returned ok", status: "pending" },
      { label: "Query now_playing by event_id", status: "pending" },
      { label: "Validate title / artist / source / status", status: "pending" },
    ];
    const update = (i: number, patch: Partial<SmokeStep>) => {
      steps[i] = { ...steps[i], ...patch };
      setSmokeSteps([...steps]);
    };
    setSmokeSteps([...steps]);

    try {
      // 1. Ensure integration row + token via secure RPC
      update(0, { status: "running" });
      const { data: tkData, error: tkErr } = await supabase.rpc("get_ingest_token", { _event_id: eventId });
      if (tkErr) throw new Error(`get_ingest_token: ${tkErr.message}`);
      update(0, { status: "pass", detail: "row ready" });

      // 2. Token
      update(1, { status: "running" });
      const tk = (tkData as string | null) ?? undefined;
      if (!tk) throw new Error("ingest_token missing");
      setToken(tk);
      update(1, { status: "pass", detail: `${tk.slice(0, 6)}…${tk.slice(-4)}` });

      // 3. POST
      update(2, { status: "running" });
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Ingest-Token": tk },
        body: JSON.stringify(SMOKE_PAYLOAD),
      });
      const json = await res.json().catch(() => ({}));
      update(2, {
        status: res.ok ? "pass" : "fail",
        detail: `HTTP ${res.status}`,
      });
      if (!res.ok) throw new Error(typeof json?.error === "string" ? json.error : `HTTP ${res.status}`);

      // 4. Function ok
      update(3, {
        status: json?.ok ? "pass" : "fail",
        detail: json?.ok ? "{ ok: true }" : JSON.stringify(json),
      });
      if (!json?.ok) throw new Error("Edge Function did not return ok");

      // 5. Query now_playing
      update(4, { status: "running" });
      const { data: np, error: npErr } = await supabase
        .from("now_playing")
        .select("title, artist, source, status")
        .eq("event_id", eventId)
        .maybeSingle();
      if (npErr) throw new Error(`now_playing select: ${npErr.message}`);
      if (!np) throw new Error("now_playing row not found");
      update(4, { status: "pass", detail: `${np.title} — ${np.artist}` });

      // 6. Validate fields
      update(5, { status: "running" });
      const mismatches: string[] = [];
      if (np.title !== SMOKE_PAYLOAD.title) mismatches.push(`title=${np.title}`);
      if (np.artist !== SMOKE_PAYLOAD.artist) mismatches.push(`artist=${np.artist}`);
      if (np.source !== SMOKE_PAYLOAD.source) mismatches.push(`source=${np.source}`);
      if (np.status !== SMOKE_PAYLOAD.status) mismatches.push(`status=${np.status}`);
      if (mismatches.length) {
        update(5, { status: "fail", detail: `mismatch: ${mismatches.join(", ")}` });
        throw new Error(`Field mismatch: ${mismatches.join(", ")}`);
      }
      update(5, { status: "pass", detail: "all fields match" });
      toast.success("Smoke test passed ✅");
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // Mark first non-pass as fail with detail
      const idx = steps.findIndex((s) => s.status !== "pass");
      if (idx >= 0) update(idx, { status: "fail", detail: msg });
      toast.error(`Smoke test failed: ${msg}`);
    } finally {
      setSmokeRunning(false);
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
            variant="premium"
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

        <div className="pt-2 border-t border-border/50">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs uppercase tracking-wider text-muted-foreground">End-to-end smoke test</span>
            <Button
              size="sm"
              variant="outline"
              onClick={runSmokeTest}
              disabled={smokeRunning}
              className="h-8"
            >
              {smokeRunning ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <FlaskConical className="mr-2 h-3.5 w-3.5" />
              )}
              Run Ingest Smoke Test
            </Button>
          </div>
          {smokeSteps.length > 0 && (
            <ol className="space-y-1.5 text-xs">
              {smokeSteps.map((s, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 px-3 py-2 rounded-lg bg-background/60 border"
                >
                  <span className="mt-0.5 shrink-0">
                    {s.status === "pass" && <Check className="h-3.5 w-3.5 text-primary" />}
                    {s.status === "fail" && <X className="h-3.5 w-3.5 text-destructive" />}
                    {s.status === "running" && <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />}
                    {s.status === "pending" && <span className="block h-3.5 w-3.5 rounded-full border border-muted-foreground/40" />}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className={s.status === "fail" ? "text-destructive" : s.status === "pass" ? "text-foreground" : "text-muted-foreground"}>
                      {i + 1}. {s.label}
                    </div>
                    {s.detail && (
                      <div className="font-mono text-[11px] text-muted-foreground break-all">{s.detail}</div>
                    )}
                  </div>
                </li>
              ))}
            </ol>
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
