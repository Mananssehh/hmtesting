import { useEffect, useState } from "react";
import { Loader2, CircleDollarSign, Wallet, Clock, CheckCircle2, AlertCircle } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { supabase } from "@/integrations/supabase/client";

interface Summary {
  connected: boolean;
  account_status: "not_started" | "pending" | "action_required" | "ready" | string;
  currency: string | null;
  balance: { available_cents: number; pending_cents: number; currency: string } | null;
  schedule: { interval: string; delay_days: number | null; weekly_anchor?: string; monthly_anchor?: number } | null;
  last_payout: { amount_cents: number; currency: string; arrival_date: string | null; status: string } | null;
  estimated_next_payout: { available_cents: number; currency: string; estimated_arrival: string | null } | null;
  lifetime: {
    gross_cents: number;
    net_cents: number;
    platform_fee_cents: number;
    stripe_fee_cents: number;
    tip_count: number;
  };
}

const fmt = (cents: number, currency: string | null | undefined) =>
  new Intl.NumberFormat(undefined, { style: "currency", currency: (currency || "usd").toUpperCase() }).format(
    (cents || 0) / 100,
  );

const fmtDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" }) : "—";

const scheduleLabel = (s: Summary["schedule"]) => {
  if (!s) return "—";
  if (s.interval === "manual") return "Manual";
  if (s.interval === "daily") return `Daily${s.delay_days != null ? ` (T+${s.delay_days})` : ""}`;
  if (s.interval === "weekly") return `Weekly${s.weekly_anchor ? ` · ${s.weekly_anchor}` : ""}`;
  if (s.interval === "monthly") return `Monthly${s.monthly_anchor ? ` · day ${s.monthly_anchor}` : ""}`;
  return s.interval;
};

const statusBadge = (s: Summary["account_status"]) => {
  switch (s) {
    case "ready":
      return { label: "Connected", tone: "bg-emerald-500/20 text-emerald-200 border-emerald-500/30", icon: CheckCircle2 };
    case "action_required":
      return { label: "Action Required", tone: "bg-orange-500/20 text-orange-200 border-orange-500/30", icon: AlertCircle };
    case "pending":
      return { label: "Verification Pending", tone: "bg-amber-500/20 text-amber-200 border-amber-500/30", icon: Clock };
    default:
      return { label: "Not Connected", tone: "bg-muted text-muted-foreground border-border", icon: AlertCircle };
  }
};

export function PayoutSummaryCard() {
  const [data, setData] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke("stripe-payout-summary");
        if (error) throw error;
        if (!cancelled) setData(data as Summary);
      } catch (e: any) {
        if (!cancelled) setError(e?.message ?? "Failed to load payout summary");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <Card className="bg-card/60">
        <CardContent className="p-6 flex items-center justify-center gap-2 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading payout summary…
        </CardContent>
      </Card>
    );
  }

  if (error || !data) {
    return (
      <Card className="bg-card/60 border-destructive/40">
        <CardContent className="p-6 text-sm text-destructive">
          {error ?? "Payout summary unavailable."}
        </CardContent>
      </Card>
    );
  }

  const cur = data.currency ?? data.balance?.currency ?? "usd";
  const badge = statusBadge(data.account_status);
  const BadgeIcon = badge.icon;
  const hasAnyPayout = !!data.last_payout;

  return (
    <Card className="bg-card/60 border-primary/20">
      <CardContent className="p-5 sm:p-6 space-y-5">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-lg font-semibold flex items-center gap-2">
              <Wallet className="h-5 w-5 text-primary" /> Payout summary
            </h2>
            <p className="text-xs text-muted-foreground mt-1">Live Stripe Connect balance and history.</p>
          </div>
          <Badge variant="outline" className={`${badge.tone} gap-1`}>
            <BadgeIcon className="h-3 w-3" /> {badge.label}
          </Badge>
        </div>

        {/* Balance */}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <Tile
            label="Available balance"
            value={data.balance ? fmt(data.balance.available_cents, data.balance.currency) : "—"}
            sub={data.balance ? data.balance.currency.toUpperCase() : "Awaiting Stripe"}
            highlight
          />
          <Tile
            label="Pending balance"
            value={data.balance ? fmt(data.balance.pending_cents, data.balance.currency) : "—"}
            sub="Clearing in Stripe"
          />
          <Tile
            label="Estimated next payout"
            value={data.estimated_next_payout ? fmt(data.estimated_next_payout.available_cents, data.estimated_next_payout.currency) : "—"}
            sub={data.estimated_next_payout?.estimated_arrival ? `≈ ${fmtDate(data.estimated_next_payout.estimated_arrival)}` : "When balance available"}
          />
        </div>

        {/* Tip breakdown */}
        <div>
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold mb-2">
            Lifetime tip breakdown
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Tile label="Gross tips" value={fmt(data.lifetime.gross_cents, cur)} sub={`${data.lifetime.tip_count} tip${data.lifetime.tip_count === 1 ? "" : "s"}`} />
            <Tile label="Platform fee (30%)" value={`− ${fmt(data.lifetime.platform_fee_cents, cur)}`} sub="Decks fee" />
            <Tile
              label="Stripe processing"
              value={data.lifetime.stripe_fee_cents > 0 ? `− ${fmt(data.lifetime.stripe_fee_cents, cur)}` : "—"}
              sub={data.lifetime.stripe_fee_cents > 0 ? "Tracked" : "Deducted by Stripe"}
            />
            <Tile label="Your share (70%)" value={fmt(data.lifetime.net_cents, cur)} sub="Net" highlight />
          </div>
        </div>

        {/* Schedule + last payout */}
        <div className="grid sm:grid-cols-3 gap-3 pt-1 border-t border-border/40">
          <Row label="Payout schedule" value={scheduleLabel(data.schedule)} />
          <Row
            label="Last payout"
            value={hasAnyPayout ? fmtDate(data.last_payout!.arrival_date) : "—"}
            sub={hasAnyPayout ? data.last_payout!.status : undefined}
          />
          <Row
            label="Last payout amount"
            value={hasAnyPayout ? fmt(data.last_payout!.amount_cents, data.last_payout!.currency) : "—"}
          />
        </div>

        {!hasAnyPayout && data.connected && (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2 flex items-center gap-2">
            <CircleDollarSign className="h-4 w-4 text-primary shrink-0" />
            Your first payout will appear here after Stripe processes your completed tips.
          </div>
        )}

        {!data.connected && (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded-md px-3 py-2 flex items-center gap-2">
            <AlertCircle className="h-4 w-4 text-amber-400 shrink-0" />
            Connect your Stripe account on the DJ dashboard to start receiving payouts.
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Tile({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string;
  sub?: string;
  highlight?: boolean;
}) {
  return (
    <div className={`rounded-md border ${highlight ? "border-primary/30 bg-primary/5" : "border-border/40 bg-card/40"} px-3 py-3`}>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className={`mt-1 text-lg font-bold tabular-nums ${highlight ? "text-primary" : ""}`}>{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function Row({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-sm font-semibold mt-1">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground capitalize">{sub}</div>}
    </div>
  );
}
