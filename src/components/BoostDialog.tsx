import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Slider } from "@/components/ui/slider";
import { Badge } from "@/components/ui/badge";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  songRequestId: string;
  songTitle: string;
  onBoosted?: () => void;
}

const PRESETS = [5, 10, 25];

export function BoostDialog({ open, onOpenChange, songRequestId, songTitle, onBoosted }: Props) {
  const { profile, refreshProfile } = useAuth();
  const balance = profile?.points ?? 0;
  const max = Math.max(5, Math.min(100, balance));
  const [amount, setAmount] = useState(5);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (amount > balance) {
      toast.error("Not enough points");
      return;
    }
    setLoading(true);
    const { error } = await supabase.rpc("boost_request", {
      _song_request_id: songRequestId,
      _amount: amount,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`Boosted +${amount}! 🚀`);
    await refreshProfile();
    onBoosted?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm rounded-2xl border-white/[0.08]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-lg tracking-tight">
            <Sparkles className="h-5 w-5 text-primary" /> Boost this request
          </DialogTitle>
          <DialogDescription className="truncate">{songTitle}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Your balance</span>
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 rounded-full">
              {balance} pts
            </Badge>
          </div>

          <div className="text-center py-5 rounded-2xl bg-gradient-to-b from-primary/8 to-transparent border border-primary/15">
            <div className="text-[10px] text-muted-foreground uppercase tracking-widest font-medium">Boost</div>
            <div className="text-5xl font-semibold text-primary tabular-nums mt-1 tracking-tight">+{amount}</div>
          </div>

          <Slider
            min={5}
            max={max}
            step={1}
            value={[Math.min(amount, max)]}
            onValueChange={(v) => setAmount(v[0])}
            disabled={balance < 5}
          />

          <div className="flex gap-2">
            {PRESETS.map((p) => (
              <Button
                key={p}
                size="sm"
                variant={amount === p ? "default" : "outline"}
                onClick={() => setAmount(p)}
                disabled={p > balance}
                className="flex-1"
              >
                +{p}
              </Button>
            ))}
          </div>

          {balance < 5 && (
            <p className="text-xs text-center text-muted-foreground">
              Earn at least 5 points to boost. Try requesting & getting upvotes!
            </p>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            variant="premium"
            onClick={submit}
            disabled={loading || balance < amount || amount < 1}
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Spend {amount} pts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
