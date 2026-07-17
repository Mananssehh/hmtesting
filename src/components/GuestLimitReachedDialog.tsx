import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useGuestJoinLimits } from "@/hooks/useGuestJoinLimits";
import { logGuestFunnel } from "@/lib/guestFunnel";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  roomCode: string;
}

/**
 * Hard gate shown when an anonymous/signed-out user tries to join their
 * `require_at`-th unique event. They must Create an account or Log In to
 * continue — the room code is preserved via `?next=/event/<CODE>`.
 */
export function GuestLimitReachedDialog({ open, onOpenChange, roomCode }: Props) {
  const navigate = useNavigate();
  const limits = useGuestJoinLimits();

  useEffect(() => {
    if (open) void logGuestFunnel("guest_limit_shown", { metadata: { roomCode } });
  }, [open, roomCode]);

  const next = `/event/${roomCode}`;

  const handleCreate = () => {
    void logGuestFunnel("guest_limit_create_clicked", { metadata: { roomCode } });
    navigate(`/auth?mode=signup&next=${encodeURIComponent(next)}&reason=guest_limit`);
  };
  const handleLogin = () => {
    void logGuestFunnel("guest_limit_login_clicked", { metadata: { roomCode } });
    navigate(`/auth?next=${encodeURIComponent(next)}&reason=guest_limit`);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>You've been enjoying Decks!</DialogTitle>
          <DialogDescription>
            To continue joining events, please create your free account or log in.
            Your requests, tips, and history will be saved.
          </DialogDescription>
        </DialogHeader>
        {limits.bonus_points > 0 && (
          <div className="rounded-lg bg-primary/10 px-3 py-2 text-sm">
            🎁 Get <strong>{limits.bonus_points} bonus points</strong> when you create your account.
          </div>
        )}
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" onClick={handleLogin}>Log In</Button>
          <Button variant="premium" onClick={handleCreate}>Create Account</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
