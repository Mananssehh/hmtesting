import { useEffect, useState } from "react";
import { CircleDollarSign, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { cn } from "@/lib/utils";
import { PURCHASE_CAPS } from "@/lib/purchaseCaps";
import { recordConsent, CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { ENABLE_LIVE_STRIPE } from "@/lib/featureFlags";
import { supabase } from "@/integrations/supabase/client";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string | null;
  djName?: string | null;
  songTitle?: string;
}

const PRESETS = [1, 3, 5, 10, 20] as const;
const MIN_TIP_DOLLARS = 1;
const MAX_TIP_DOLLARS = PURCHASE_CAPS.maxSingleCents / 100; // $50

export const TIP_DISCLAIMER =
  "Tips support the DJ. Tips do not affect song placement and do not guarantee playback, prioritization, or any specific action by the DJ.";

export function TipDialog({ open, onOpenChange, eventId, djName, songTitle }: Props) {
  const [selected, setSelected] = useState<number>(5);
  const [custom, setCustom] = useState<string>("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [payoutReady, setPayoutReady] = useState<boolean | null>(null);
  const [payoutMessage, setPayoutMessage] = useState<string>("");

  // Precheck DJ payout readiness when dialog opens so we can disable the
  // Tip button up-front instead of failing inside Stripe Checkout.
  useEffect(() => {
    if (!open || !eventId || !ENABLE_LIVE_STRIPE) {
      setPayoutReady(null);
      setPayoutMessage("");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.functions.invoke("tip-create-checkout", {
        body: { event_id: eventId, check_only: true },
      });
      if (cancelled) return;
      let payload: any = data;
      if (!payload && error && (error as any).context) {
        const ctx = (error as any).context;
        try {
          if (typeof ctx.json === "function") payload = await ctx.json();
          else if (typeof ctx.text === "function") payload = JSON.parse(await ctx.text());
        } catch { /* ignore */ }
      }
      if (payload?.ready) {
        setPayoutReady(true);
        setPayoutMessage("");
      } else if (payload?.error_code) {
        setPayoutReady(false);
        setPayoutMessage(payload.message ?? "Tips aren't available right now.");
      } else {
        // Unknown — allow attempt; server will re-validate.
        setPayoutReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, eventId]);

  const customAmount = Math.max(0, parseInt(custom || "0", 10) || 0);
  const amountDollars = custom ? customAmount : selected;
  const amountCents = amountDollars * 100;

  const validAmount =
    amountDollars >= MIN_TIP_DOLLARS && amountDollars <= MAX_TIP_DOLLARS;

  const reset = () => {
    setSelected(5);
    setCustom("");
    setAcknowledged(false);
  };

  const submit = async () => {
    if (submitting) return;
    if (!validAmount) {
      toast.error(`Tip must be between $${MIN_TIP_DOLLARS} and $${MAX_TIP_DOLLARS}.`);
      return;
    }
    if (!acknowledged) {
      toast.error("Please acknowledge the tip notice to continue.");
      return;
    }

    setSubmitting(true);
    try {
      // Record consent (server-side checkout re-verifies both consent and caps).
      await recordConsent(CURRENT_CONSENT_VERSION);

      if (!ENABLE_LIVE_STRIPE) {
        toast.success(
          `Tips launching soon — your $${amountDollars} tip${djName ? ` for DJ ${djName}` : ""} will be enabled when payments go live.`,
        );
        onOpenChange(false);
        reset();
        return;
      }

      const { data, error } = await supabase.functions.invoke("tip-create-checkout", {
        body: { event_id: eventId, amount_cents: amountCents },
      });

      // supabase-js can wrap a structured-error body in `error` (FunctionsHttpError)
      // even when the function returned 200. Recover the JSON from error.context.
      let payload: any = data;
      if (!payload && error && (error as any).context) {
        const ctx = (error as any).context;
        try {
          if (typeof ctx.json === "function") payload = await ctx.json();
          else if (typeof ctx.text === "function") payload = JSON.parse(await ctx.text());
        } catch { /* ignore */ }
      }

      if (payload?.error_code) {
        // Surface raw Stripe error detail when present so we don't hide the root cause.
        console.error("[TipDialog] tip-create-checkout payload:", payload);
        const se = payload.stripe_error;
        const stripeDetail = se
          ? `Stripe ${se.http_status ?? "?"} ${se.stripe_type ?? ""} ${se.stripe_code ?? ""}: ${se.message ?? ""} (req ${se.request_id ?? "n/a"})`
          : null;
        const friendly: Record<string, string> = {
          DJ_PAYOUTS_NOT_READY: payload.message ?? "This DJ hasn't set up payouts yet — tips aren't available for this event.",
          STRIPE_CONFIG_ERROR: "Tips are temporarily unavailable (payment provider not configured).",
          TIP_LIMIT_REACHED: payload.message ?? "You've reached a tip limit. Try again later.",
          CONSENT_REQUIRED: "Please acknowledge the tip notice to continue.",
          SELF_TIP: "You cannot tip yourself.",
          EVENT_NOT_FOUND: "Event not found.",
          STRIPE_CHECKOUT_FAILED: stripeDetail ?? payload.message ?? "Stripe rejected the checkout request.",
          UNAUTHORIZED: "Please sign in to tip.",
          INVALID_REQUEST: payload.message ?? "Invalid request.",
          SERVICE_FAILED: "Something went wrong. Please try again.",
        };
        toast.error(friendly[payload.error_code] ?? payload.message ?? "Couldn't process tip", { duration: 12000 });
        if (payload.error_code === "DJ_PAYOUTS_NOT_READY") {
          setPayoutReady(false);
          setPayoutMessage(friendly.DJ_PAYOUTS_NOT_READY);
        }
        return;
      }

      if (error) throw error;
      if (!payload?.url) throw new Error("Checkout session missing URL — please try again.");
      window.location.href = payload.url as string;
    } catch (e: any) {
      toast.error(e?.message ?? "Couldn't process tip");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (submitting) return;
        if (!o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent className="max-w-md rounded-2xl border-white/[0.08] bg-gradient-to-b from-card to-background overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.15),transparent_60%)]" />
        <DialogHeader className="relative">
          <DialogTitle className="flex items-center gap-2 text-xl tracking-tight">
            <CircleDollarSign className="h-5 w-5 text-primary" /> Tip the DJ
          </DialogTitle>
          <DialogDescription>
            {djName ? `Send DJ ${djName} a tip` : "Send the DJ a tip"}
            {songTitle ? <> — currently on <span className="text-foreground font-medium">{songTitle}</span></> : null}.
          </DialogDescription>
        </DialogHeader>

        <div className="relative space-y-4 py-2">
          <div className="grid grid-cols-5 gap-2">
            {PRESETS.map((amt) => {
              const active = !custom && selected === amt;
              return (
                <button
                  key={amt}
                  type="button"
                  onClick={() => {
                    setSelected(amt);
                    setCustom("");
                  }}
                  className={cn(
                    "rounded-xl py-3 text-center border transition-all duration-150 active:scale-95",
                    active
                      ? "border-primary/60 bg-primary/15 shadow-[0_0_18px_hsl(var(--primary)/0.25)]"
                      : "border-white/[0.08] hover:border-white/[0.18] bg-card/40",
                  )}
                >
                  <div className="text-lg font-bold tabular-nums">${amt}</div>
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              Custom amount (USD, max ${MAX_TIP_DOLLARS})
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <input
                type="number"
                min={MIN_TIP_DOLLARS}
                max={MAX_TIP_DOLLARS}
                value={custom}
                onChange={(e) =>
                  setCustom(e.target.value.replace(/[^0-9]/g, "").slice(0, 3))
                }
                placeholder={`${MIN_TIP_DOLLARS}–${MAX_TIP_DOLLARS}`}
                className="w-full h-10 pl-7 pr-3 rounded-xl bg-background border border-white/[0.08] focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm tabular-nums"
              />
            </div>
          </div>

          <div className="rounded-xl border border-amber-500/25 bg-amber-500/[0.06] p-3 text-[12px] leading-relaxed text-amber-100/90">
            <strong className="block text-amber-200 mb-0.5">Heads up</strong>
            {TIP_DISCLAIMER}
          </div>

          <label className="flex items-start gap-2.5 cursor-pointer select-none">
            <Checkbox
              checked={acknowledged}
              onCheckedChange={(v) => setAcknowledged(!!v)}
              className="mt-0.5"
            />
            <span className="text-[12px] leading-relaxed text-foreground/80">
              I understand a tip is a gift to the DJ and does not guarantee the
              DJ plays, prioritizes, or queues any song.
            </span>
          </label>

          {payoutReady === false && (
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/[0.08] p-3 text-[12px] leading-relaxed text-rose-100">
              {payoutMessage || "This DJ hasn't set up payouts yet — tips aren't available for this event."}
            </div>
          )}
        </div>

        <div className="relative flex gap-2">
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            className="flex-1"
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="premium"
            onClick={submit}
            disabled={submitting || !validAmount || !acknowledged || payoutReady === false}
            className="flex-[2] h-11 text-base font-semibold"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CircleDollarSign className="mr-2 h-4 w-4" />
            )}
            Tip ${amountDollars || 0}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
