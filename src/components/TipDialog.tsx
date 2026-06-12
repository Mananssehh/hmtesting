import { useState } from "react";
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
import { checkBoostPurchaseCap, PURCHASE_CAPS } from "@/lib/purchaseCaps";
import { recordConsent, CURRENT_CONSENT_VERSION } from "@/lib/consent";
import { ENABLE_LIVE_STRIPE } from "@/lib/featureFlags";

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
      // Server-side cap check (single $50, $100/event, $100/24h)
      const cap = await checkBoostPurchaseCap({ amountCents, eventId });
      if (!cap.ok) {
        const msg = cap.error ?? "Tip blocked";
        if (/single-purchase/i.test(msg)) {
          toast.error(`You can tip up to $${MAX_TIP_DOLLARS} in a single tip.`);
        } else if (/24h|daily/i.test(msg)) {
          toast.error("You've reached today's tip limit. Try again later.");
        } else if (/event/i.test(msg)) {
          toast.error(`You've reached the $${PURCHASE_CAPS.maxPerEventCents / 100} tip limit for this event.`);
        } else {
          toast.error(msg);
        }
        return;
      }

      // Record consent against current version (idempotent).
      await recordConsent(CURRENT_CONSENT_VERSION);

      if (!ENABLE_LIVE_STRIPE) {
        toast.success(
          `Tips launching soon — your $${amountDollars} tip${djName ? ` for DJ ${djName}` : ""} will be enabled when payments go live.`,
        );
        onOpenChange(false);
        reset();
        return;
      }

      // Future: open Stripe Checkout edge function here.
      toast.error("Payments aren't live yet.");
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
            <HandCoins className="h-5 w-5 text-primary" /> Tip the DJ
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
            disabled={submitting || !validAmount || !acknowledged}
            className="flex-[2] h-11 text-base font-semibold"
          >
            {submitting ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Heart className="mr-2 h-4 w-4" />
            )}
            Tip ${amountDollars || 0}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
