import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Gift } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useGuestJoinLimits } from "@/hooks/useGuestJoinLimits";
import { logGuestFunnel } from "@/lib/guestFunnel";

interface Props {
  eventId: string | null;
  roomCode: string | null;
}

/**
 * Soft prompt shown once per session per event to anonymous/guest users
 * who have just crossed the `prompt_at` unique-event threshold.
 */
export function GuestUpgradePromptDialog({ eventId, roomCode }: Props) {
  const navigate = useNavigate();
  const { user, isAnonymous } = useAuth();
  const limits = useGuestJoinLimits();
  const [open, setOpen] = useState(false);

  const dismissKey = useMemo(
    () => (eventId ? `decks:guest_prompt_dismissed:${eventId}` : null),
    [eventId],
  );

  useEffect(() => {
    if (!limits.enabled || !eventId || !dismissKey) return;
    // Only prompt anonymous / signed-out users. Non-anon signed-in users skip.
    if (user && !isAnonymous) return;

    const alreadyDismissed = sessionStorage.getItem(dismissKey);
    const flag = sessionStorage.getItem(`decks:guest_prompt_pending:${eventId}`);
    if (flag && !alreadyDismissed) {
      setOpen(true);
      sessionStorage.removeItem(`decks:guest_prompt_pending:${eventId}`);
      void logGuestFunnel("guest_prompt_shown", { eventId });
    }
  }, [eventId, dismissKey, user, isAnonymous, limits.enabled]);

  const handleDismiss = () => {
    if (dismissKey) sessionStorage.setItem(dismissKey, "1");
    setOpen(false);
    void logGuestFunnel("guest_prompt_dismissed", { eventId });
  };

  const handleCreate = () => {
    if (dismissKey) sessionStorage.setItem(dismissKey, "1");
    setOpen(false);
    void logGuestFunnel("guest_prompt_create_clicked", { eventId });
    const next = roomCode ? `/event/${roomCode}` : window.location.pathname;
    navigate(`/auth?mode=signup&next=${encodeURIComponent(next)}&reason=guest_prompt`);
  };

  return (
    <Dialog open={open} onOpenChange={(v) => (v ? setOpen(true) : handleDismiss())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create your free Decks account</DialogTitle>
          <DialogDescription>
            Save your requests, tips, points, favorite DJs, and event history.
          </DialogDescription>
        </DialogHeader>
        {limits.bonus_points > 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-primary/10 px-3 py-2 text-sm">
            <Gift className="h-4 w-4 text-primary" />
            <span>
              Get <strong>{limits.bonus_points} bonus points</strong> when you create your account.
            </span>
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={handleDismiss}>Not now</Button>
          <Button variant="premium" onClick={handleCreate}>Create account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
