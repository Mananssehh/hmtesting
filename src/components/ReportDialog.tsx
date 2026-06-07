import { useState } from "react";
import { Flag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

type TargetType = "request" | "user" | "nickname";
type Reason = "inappropriate" | "harassment" | "spam" | "copyright" | "other";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  targetType: TargetType;
  targetId: string;
  eventId?: string | null;
  contextLabel?: string;
}

const REASONS: { value: Reason; label: string; description: string }[] = [
  { value: "inappropriate", label: "Inappropriate content", description: "Offensive, hateful, or NSFW" },
  { value: "harassment", label: "Harassment", description: "Targeting or bullying a person" },
  { value: "spam", label: "Spam", description: "Repetitive, fake, or off-topic" },
  { value: "copyright", label: "Copyright", description: "Unauthorized use of protected work" },
  { value: "other", label: "Something else", description: "Use the box below" },
];

export function ReportDialog({ open, onOpenChange, targetType, targetId, eventId, contextLabel }: Props) {
  const { user } = useAuth();
  const [reason, setReason] = useState<Reason>("inappropriate");
  const [details, setDetails] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const reset = () => {
    setReason("inappropriate");
    setDetails("");
  };

  const submit = async () => {
    if (!user) {
      toast.error("Sign in to report");
      return;
    }
    if (details.length > 500) {
      toast.error("Details are too long");
      return;
    }
    setSubmitting(true);
    const { error } = await (supabase as any).from("reports").insert({
      reporter_id: user.id,
      event_id: eventId ?? null,
      target_type: targetType,
      target_id: targetId,
      reason,
      details: details.trim() || null,
    });
    setSubmitting(false);
    if (error) {
      if (error.message?.includes("Too many reports")) {
        toast.error("You've sent too many reports recently. Try again later.");
      } else {
        toast.error(error.message ?? "Could not submit report");
      }
      return;
    }
    toast.success("Report submitted. Thanks for keeping Decks safe.");
    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) reset(); onOpenChange(v); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Flag className="h-5 w-5 text-destructive" /> Report{" "}
            {targetType === "request" ? "this request" : targetType === "nickname" ? "this nickname" : "this user"}
          </DialogTitle>
          <DialogDescription>
            {contextLabel ? <span className="text-foreground">{contextLabel}</span> : null}
            <span className="block mt-1">
              Reports go to the DJ and the Decks safety team. Abuse of this tool may suspend your account.
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="space-y-2">
            <Label className="text-xs uppercase tracking-wider text-muted-foreground">Reason</Label>
            <div className="grid gap-2">
              {REASONS.map((r) => (
                <label
                  key={r.value}
                  className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                    reason === r.value ? "border-primary bg-primary/5" : "border-border hover:bg-secondary/50"
                  }`}
                >
                  <input
                    type="radio"
                    name="reason"
                    value={r.value}
                    checked={reason === r.value}
                    onChange={() => setReason(r.value)}
                    className="mt-0.5 accent-primary"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{r.label}</div>
                    <div className="text-xs text-muted-foreground">{r.description}</div>
                  </div>
                </label>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="report-details" className="text-xs uppercase tracking-wider text-muted-foreground">
              Details <span className="text-muted-foreground/70 normal-case">(optional, 500 chars)</span>
            </Label>
            <Textarea
              id="report-details"
              value={details}
              onChange={(e) => setDetails(e.target.value.slice(0, 500))}
              placeholder="What happened?"
              rows={3}
            />
            <div className="text-[10px] text-right text-muted-foreground tabular-nums">{details.length}/500</div>
          </div>
        </div>

        <div className="flex gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1" disabled={submitting}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={submitting}
            className="flex-1"
          >
            {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : "Submit report"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
