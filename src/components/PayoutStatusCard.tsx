import { useEffect, useState } from "react";
import { AlertTriangle, CircleDollarSign, ExternalLink, Loader2, RefreshCw, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

type Status = "not_started" | "pending" | "action_required" | "ready" | "mode_mismatch" | "loading";

const LABELS: Record<Exclude<Status, "loading">, { label: string; tone: string }> = {
  not_started: { label: "Not Started", tone: "bg-muted text-muted-foreground" },
  pending: { label: "Pending Verification", tone: "bg-amber-500/20 text-amber-200" },
  action_required: { label: "Action Required", tone: "bg-orange-500/20 text-orange-200" },
  ready: { label: "Ready for Tips", tone: "bg-emerald-500/20 text-emerald-200" },
  mode_mismatch: { label: "Reconnect Required", tone: "bg-orange-500/20 text-orange-200" },
};

export function PayoutStatusCard() {
  const [status, setStatus] = useState<Status>("loading");
  const [mode, setMode] = useState<"live" | "test" | null>(null);
  const [keyMode, setKeyMode] = useState<"live" | "test" | null>(null);
  const [modeMismatch, setModeMismatch] = useState(false);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      const { data, error } = await supabase.functions.invoke("stripe-connect-refresh");
      if (error) throw error;
      setStatus((data?.status as Status) ?? "not_started");
      if (data?.mode === "live" || data?.mode === "test") setMode(data.mode);
      if (data?.key_mode === "live" || data?.key_mode === "test") setKeyMode(data.key_mode);
      setModeMismatch(Boolean(data?.mode_mismatch));
    } catch (e: any) {
      console.error(e);
      setStatus("not_started");
    }
  };

  useEffect(() => { refresh(); }, []);

  const onSetUp = async () => {
    setBusy(true);
    try {
      const origin = window.location.origin;
      const { data, error } = await supabase.functions.invoke("stripe-connect-onboard", {
        body: { return_url: `${origin}/dj?stripe=return`, refresh_url: `${origin}/dj?stripe=refresh` },
      });

      // Recover structured error body if supabase-js wrapped a non-2xx response
      let payload: any = data;
      if (error) {
        try {
          const ctx: any = (error as any).context;
          if (ctx?.json) payload = await ctx.json();
          else if (ctx?.text) {
            const t = await ctx.text();
            try { payload = JSON.parse(t); } catch { payload = { error: t }; }
          }
        } catch { /* ignore */ }
      }

      if (payload?.url) {
        window.location.href = payload.url;
        return;
      }

      // DEBUG: surface the full raw Stripe error payload to the console
      // so we can copy/paste it from devtools.
      console.error("[PayoutStatusCard] onboard RAW payload:", payload);
      console.error("[PayoutStatusCard] onboard invoke error:", error);

      const se = payload?.stripe_error;
      const detail = se
        ? `Stripe ${se.http_status ?? "?"} ${se.stripe_type ?? ""} ${se.stripe_code ?? ""}: ${se.message ?? ""} (req ${se.request_id ?? "n/a"})`
        : payload?.message || payload?.error || (error as any)?.message || "Couldn't start onboarding";
      toast.error(detail, { duration: 12000 });
      setBusy(false);
    } catch (e: any) {
      console.error(e);
      toast.error(e?.message ?? "Couldn't start onboarding");
      setBusy(false);
    }
  };

  const meta = status === "loading" ? null : LABELS[status];
  const isReady = status === "ready";

  return (
    <Card className="bg-card/60 border-white/[0.08]">
      <CardContent className="py-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2">
            <CircleDollarSign className="h-5 w-5 text-primary" />
            <h3 className="font-semibold">Payout Status</h3>
          </div>
          {meta ? (
            <Badge className={`${meta.tone} border-0`}>{meta.label}</Badge>
          ) : (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
        <p className="text-sm text-muted-foreground">
          Connect your secure Stripe payout account to receive tips directly through Stripe.
          Decks keeps a 30% platform fee; you receive 70% of every tip.
        </p>
        {/* Mode label reflects the connected account's actual livemode, not the server key alone. */}
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
          <ShieldCheck className="h-3.5 w-3.5" />
          {modeMismatch
            ? `Live mode · Your payout account was created in ${mode === "test" ? "test" : "a different"} mode — reconnect to enable live payouts`
            : mode === "live"
            ? "Live mode · Secure Stripe-hosted onboarding"
            : mode === "test"
            ? "Test mode · No banking forms inside Decks"
            : keyMode === "live"
            ? "Live mode · Secure Stripe-hosted onboarding"
            : "Secure Stripe-hosted onboarding"}
        </div>
        {modeMismatch && (
          <div className="flex items-start gap-2 rounded-md border border-orange-500/30 bg-orange-500/10 p-3 text-xs text-orange-100">
            <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
            <div>
              Your existing Stripe Connect account is in <strong>{mode}</strong> mode but Decks is now in <strong>{keyMode}</strong> mode.
              Click <strong>Reconnect Payouts</strong> to create a fresh live Express account. Your old test account is left untouched in Stripe.
            </div>
          </div>
        )}
        <div className="flex flex-wrap gap-2 pt-1">
          {(!isReady || modeMismatch) && (
            <Button onClick={onSetUp} disabled={busy} variant="premium">
              {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ExternalLink className="mr-2 h-4 w-4" />}
              {modeMismatch ? "Reconnect Payouts" : status === "not_started" ? "Set Up Payouts" : "Continue Setup"}
            </Button>
          )}
          <Button onClick={refresh} variant="outline" size="sm" disabled={status === "loading"}>
            <RefreshCw className="mr-1 h-3.5 w-3.5" /> Refresh
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
