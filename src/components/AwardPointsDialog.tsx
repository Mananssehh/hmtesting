import { useEffect, useState } from "react";
import { Award, Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface Participant {
  user_id: string;
  nickname: string;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  eventId: string;
}

const PRESET_REASONS = ["Club purchase", "Engagement", "Promo", "VIP bonus"];

export function AwardPointsDialog({ open, onOpenChange, eventId }: Props) {
  const [people, setPeople] = useState<Participant[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Participant | null>(null);
  const [amount, setAmount] = useState<number>(10);
  const [reason, setReason] = useState<string>("Club purchase");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open) return;
    (async () => {
      // Combine participants and song requesters
      const [{ data: parts }, { data: reqs }] = await Promise.all([
        supabase.from("event_participants").select("user_id, nickname").eq("event_id", eventId),
        supabase.from("song_requests").select("requested_by, requester_name").eq("event_id", eventId),
      ]);
      const map = new Map<string, Participant>();
      for (const p of parts ?? []) map.set(p.user_id, { user_id: p.user_id, nickname: p.nickname });
      for (const r of reqs ?? []) {
        if (r.requested_by && !map.has(r.requested_by)) {
          map.set(r.requested_by, { user_id: r.requested_by, nickname: r.requester_name || "Guest" });
        }
      }
      setPeople(Array.from(map.values()));
    })();
  }, [open, eventId]);

  const filtered = people.filter((p) =>
    p.nickname.toLowerCase().includes(query.toLowerCase()),
  );

  const submit = async () => {
    if (!selected) return toast.error("Pick a guest first");
    if (!amount) return toast.error("Enter an amount");
    setLoading(true);
    const { error } = await supabase.rpc("dj_award_points", {
      _event_id: eventId,
      _user_id: selected.user_id,
      _amount: amount,
      _reason: reason,
    });
    setLoading(false);
    if (error) return toast.error(error.message);
    toast.success(`+${amount} pts to ${selected.nickname}`);
    setSelected(null);
    setAmount(10);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Award className="h-5 w-5 text-primary" /> Award points
          </DialogTitle>
          <DialogDescription>Reward a guest for engagement, purchases, or promos.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!selected ? (
            <>
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  autoFocus
                  placeholder="Search guest by nickname..."
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="pl-9"
                />
              </div>
              <div className="max-h-56 overflow-y-auto rounded-lg border divide-y">
                {filtered.length === 0 ? (
                  <p className="text-center text-sm text-muted-foreground py-6">No guests found</p>
                ) : (
                  filtered.map((p) => (
                    <button
                      key={p.user_id}
                      onClick={() => setSelected(p)}
                      className="w-full text-left px-3 py-2 hover:bg-secondary transition-colors"
                    >
                      {p.nickname}
                    </button>
                  ))
                )}
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center justify-between p-3 rounded-lg bg-secondary/60">
                <div>
                  <div className="text-xs text-muted-foreground">Awarding to</div>
                  <div className="font-semibold">{selected.nickname}</div>
                </div>
                <Button variant="ghost" size="sm" onClick={() => setSelected(null)}>Change</Button>
              </div>
              <div className="space-y-2">
                <Label htmlFor="amount">Amount</Label>
                <Input
                  id="amount"
                  type="number"
                  min={1}
                  max={1000}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <div className="flex flex-wrap gap-2">
                  {PRESET_REASONS.map((r) => (
                    <Button
                      key={r}
                      type="button"
                      size="sm"
                      variant={reason === r ? "default" : "outline"}
                      onClick={() => setReason(r)}
                    >
                      {r}
                    </Button>
                  ))}
                </div>
                <Input
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  maxLength={80}
                  placeholder="Custom reason..."
                />
              </div>
            </>
          )}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            onClick={submit}
            disabled={loading || !selected}
            className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground"
          >
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Award {amount} pts
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
