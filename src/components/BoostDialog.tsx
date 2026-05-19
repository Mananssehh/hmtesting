import { useState } from "react";
import { Sparkles, Loader2, Flame, Rocket, Zap, Crown } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  songRequestId: string;
  songTitle: string;
  onBoosted?: () => void;
}

type Pack = {
  amount: number;
  price: string;
  save?: string;
  label: string;
  icon: React.ReactNode;
  accent: string;
  popular?: boolean;
};

const PACKS: Pack[] = [
  { amount: 5,   price: "$0.99", label: "Spark",     icon: <Sparkles className="h-5 w-5" />, accent: "from-primary/30 to-primary/5" },
  { amount: 25,  price: "$3.99", save: "SAVE 20%", label: "Boost", icon: <Rocket className="h-5 w-5" />, accent: "from-accent/40 to-primary/10", popular: true },
  { amount: 100, price: "$9.99", save: "SAVE 50%", label: "Flame", icon: <Flame className="h-5 w-5" />, accent: "from-orange-500/40 to-primary/10" },
  { amount: 250, price: "$19.99", save: "BEST DEAL", label: "Mega", icon: <Crown className="h-5 w-5" />, accent: "from-amber-400/40 to-orange-500/20" },
];

export function BoostDialog({ open, onOpenChange, songRequestId, songTitle, onBoosted }: Props) {
  const { profile, refreshProfile } = useAuth();
  const balance = profile?.points ?? 0;
  const [selected, setSelected] = useState<number>(25);
  const [custom, setCustom] = useState<string>("");
  const [loading, setLoading] = useState(false);

  const customAmount = Math.max(0, parseInt(custom || "0", 10) || 0);
  const amount = custom ? customAmount : selected;

  const submit = async () => {
    if (amount < 1) {
      toast.error("Pick a boost pack");
      return;
    }
    if (amount > balance) {
      toast.error("Not enough points — earn more by requesting & voting!");
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
    toast.success(`🔥 +${amount} BOOST! Pushing it up the queue.`);
    await refreshProfile();
    onBoosted?.();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md rounded-2xl border-white/[0.08] bg-gradient-to-b from-card to-background overflow-hidden">
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,hsl(var(--primary)/0.15),transparent_60%)]" />
        <DialogHeader className="relative">
          <DialogTitle className="flex items-center gap-2 text-xl tracking-tight">
            <Rocket className="h-5 w-5 text-primary" /> Boost the Vibe
          </DialogTitle>
          <DialogDescription className="truncate">
            Push <span className="text-foreground font-medium">{songTitle}</span> higher.
          </DialogDescription>
        </DialogHeader>

        <div className="relative space-y-4 py-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Your balance</span>
            <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 rounded-full gap-1">
              <Zap className="h-3 w-3" /> {balance} pts
            </Badge>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            {PACKS.map((p) => {
              const active = !custom && selected === p.amount;
              const affordable = p.amount <= balance;
              return (
                <button
                  key={p.amount}
                  type="button"
                  onClick={() => { setSelected(p.amount); setCustom(""); }}
                  disabled={!affordable}
                  className={cn(
                    "relative rounded-2xl p-3 text-left border transition-all duration-200 active:scale-[0.98] overflow-hidden",
                    "bg-gradient-to-br", p.accent,
                    active
                      ? "border-primary/60 shadow-[0_0_24px_hsl(var(--primary)/0.35)] ring-1 ring-primary/40"
                      : "border-white/[0.08] hover:border-white/[0.15]",
                    !affordable && "opacity-40 cursor-not-allowed",
                  )}
                >
                  {p.popular && (
                    <span className="absolute top-1.5 right-1.5 text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground">
                      Popular
                    </span>
                  )}
                  {p.save && !p.popular && (
                    <span className="absolute top-1.5 right-1.5 text-[9px] font-bold tracking-wider uppercase px-1.5 py-0.5 rounded-full bg-accent/80 text-accent-foreground">
                      {p.save}
                    </span>
                  )}
                  <div className="flex items-center gap-2 text-primary mb-1.5">{p.icon}</div>
                  <div className="text-2xl font-bold tabular-nums tracking-tight">+{p.amount}</div>
                  <div className="text-[11px] text-muted-foreground uppercase tracking-wider mt-0.5">{p.label}</div>
                  <div className="text-[11px] text-muted-foreground/70 mt-1 line-through">{p.price}</div>
                </button>
              );
            })}
          </div>

          <div className="space-y-1.5">
            <label className="text-[11px] text-muted-foreground uppercase tracking-wider font-medium">
              Custom amount
            </label>
            <input
              type="number"
              min={1}
              max={balance}
              value={custom}
              onChange={(e) => setCustom(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="e.g. 50"
              className="w-full h-10 px-3 rounded-xl bg-background border border-white/[0.08] focus:border-primary/50 focus:outline-none focus:ring-2 focus:ring-primary/30 text-sm tabular-nums transition-all"
            />
          </div>

          <p className="text-[10px] text-center text-muted-foreground/70 leading-relaxed">
            Test mode — boosts use points. Real-money packs unlock when payments go live.
          </p>
        </div>

        <div className="relative flex gap-2">
          <Button variant="ghost" onClick={() => onOpenChange(false)} className="flex-1">Cancel</Button>
          <Button
            variant="premium"
            onClick={submit}
            disabled={loading || amount < 1 || amount > balance}
            className="flex-[2] h-11 text-base font-semibold"
          >
            {loading ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
            Boost +{amount || 0}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
