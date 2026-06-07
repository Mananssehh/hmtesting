import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Loader2 } from "lucide-react";
import { toast } from "@/hooks/use-toast";
import { recordConsent, CURRENT_CONSENT_VERSION } from "@/lib/consent";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Called only after all three boxes are ticked and consent is recorded. */
  onConfirm: () => void | Promise<void>;
  /** Label for the continue button (e.g. "Continue to checkout"). */
  confirmLabel?: string;
}

/**
 * Reusable Stripe-readiness consent modal.
 *
 * Three required acknowledgements must be ticked before `onConfirm` fires.
 * On confirm, the user's acceptance is stored in `purchase_consents` with the
 * current consent version. Stripe is NOT triggered here — this just gates the
 * caller's checkout flow.
 */
export function CheckoutConsentModal({
  open,
  onOpenChange,
  onConfirm,
  confirmLabel = "Continue to checkout",
}: Props) {
  const [visibility, setVisibility] = useState(false);
  const [discretion, setDiscretion] = useState(false);
  const [nonRefundable, setNonRefundable] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const allChecked = visibility && discretion && nonRefundable;

  const handleConfirm = async () => {
    if (!allChecked || submitting) return;
    setSubmitting(true);
    try {
      await recordConsent(CURRENT_CONSENT_VERSION);
      await onConfirm();
      onOpenChange(false);
      // Reset for next open
      setVisibility(false);
      setDiscretion(false);
      setNonRefundable(false);
    } catch (e: any) {
      toast({
        title: "Couldn't record consent",
        description: e?.message ?? "Please try again.",
        variant: "destructive",
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Before you continue</DialogTitle>
          <DialogDescription>
            Boosts increase visibility only. DJs decide what plays. Please
            confirm you understand before purchasing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={visibility}
              onCheckedChange={(v) => setVisibility(!!v)}
              className="mt-0.5"
            />
            <span className="text-sm leading-relaxed">
              I understand that boosts only increase a song's{" "}
              <strong>visibility</strong> in the queue.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={discretion}
              onCheckedChange={(v) => setDiscretion(!!v)}
              className="mt-0.5"
            />
            <span className="text-sm leading-relaxed">
              I understand that DJs are <strong>not required</strong> to play
              any song, regardless of boosts.
            </span>
          </label>

          <label className="flex items-start gap-3 cursor-pointer">
            <Checkbox
              checked={nonRefundable}
              onCheckedChange={(v) => setNonRefundable(!!v)}
              className="mt-0.5"
            />
            <span className="text-sm leading-relaxed">
              I understand that purchases are{" "}
              <strong>final and non-refundable</strong>.
            </span>
          </label>
        </div>

        <p className="text-xs text-muted-foreground">
          Review the full{" "}
          <Link
            to="/refund-policy"
            target="_blank"
            rel="noreferrer"
            className="underline underline-offset-2 hover:text-foreground"
          >
            refund policy
          </Link>
          .
        </p>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={handleConfirm} disabled={!allChecked || submitting}>
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
