import { useEffect, useState } from "react";
import { Loader2, Plus, Shield, Trash2, UserX } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { fetchNicknames } from "@/lib/publicProfiles";

interface Props {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  eventId: string;
  initial: {
    allow_explicit: boolean;
    require_approval: boolean;
    cooldown_seconds: number;
    rules_text: string | null;
  };
  onSaved?: (next: Props["initial"]) => void;
}

interface BlockRow {
  id: string;
  kind: "artist" | "song" | "keyword";
  value: string;
}
interface BanRow {
  id: string;
  user_id: string;
  reason: string | null;
  nickname?: string;
}

export function ModerationDialog({ open, onOpenChange, eventId, initial, onSaved }: Props) {
  const [allowExplicit, setAllowExplicit] = useState(initial.allow_explicit);
  const [requireApproval, setRequireApproval] = useState(initial.require_approval);
  const [cooldown, setCooldown] = useState(initial.cooldown_seconds);
  const [rules, setRules] = useState(initial.rules_text ?? "");
  const [saving, setSaving] = useState(false);

  const [blocks, setBlocks] = useState<BlockRow[]>([]);
  const [bans, setBans] = useState<BanRow[]>([]);
  const [newKind, setNewKind] = useState<"artist" | "song" | "keyword">("artist");
  const [newValue, setNewValue] = useState("");

  useEffect(() => {
    if (!open) return;
    setAllowExplicit(initial.allow_explicit);
    setRequireApproval(initial.require_approval);
    setCooldown(initial.cooldown_seconds);
    setRules(initial.rules_text ?? "");
    (async () => {
      const [{ data: bl }, { data: bn }] = await Promise.all([
        supabase.from("event_blocklist").select("*").eq("event_id", eventId).order("created_at", { ascending: false }),
        supabase.from("event_banned_guests").select("*").eq("event_id", eventId),
      ]);
      setBlocks((bl ?? []) as BlockRow[]);
      const banRows = (bn ?? []) as BanRow[];
      if (banRows.length) {
        const nameMap = await fetchNicknames(banRows.map((b) => b.user_id), "ModerationDialog");
        setBans(banRows.map((b) => ({ ...b, nickname: nameMap[b.user_id] ?? "Guest" })));
      } else setBans([]);
    })();
  }, [open, eventId, initial]);

  const save = async () => {
    setSaving(true);
    const next = {
      allow_explicit: allowExplicit,
      require_approval: requireApproval,
      cooldown_seconds: Math.max(0, Math.min(600, Math.floor(cooldown))),
      rules_text: rules.trim() || null,
    };
    const { error } = await supabase.from("events").update(next).eq("id", eventId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Moderation settings saved");
    onSaved?.({ ...next, rules_text: next.rules_text });
    onOpenChange(false);
  };

  const addBlock = async () => {
    const v = newValue.trim();
    if (!v) return;
    const { data, error } = await supabase
      .from("event_blocklist")
      .insert({ event_id: eventId, kind: newKind, value: v })
      .select()
      .single();
    if (error) return toast.error(error.message);
    setBlocks((p) => [data as BlockRow, ...p]);
    setNewValue("");
  };

  const removeBlock = async (id: string) => {
    const { error } = await supabase.from("event_blocklist").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setBlocks((p) => p.filter((b) => b.id !== id));
  };

  const removeBan = async (id: string) => {
    const { error } = await supabase.from("event_banned_guests").delete().eq("id", id);
    if (error) return toast.error(error.message);
    setBans((p) => p.filter((b) => b.id !== id));
    toast.success("Guest unbanned");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Shield className="h-5 w-5 text-primary" /> Moderation
          </DialogTitle>
        </DialogHeader>

        <Tabs defaultValue="settings">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="settings">Settings</TabsTrigger>
            <TabsTrigger value="blocklist">Blocklist</TabsTrigger>
            <TabsTrigger value="bans">Bans</TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-4 mt-4">
            <Row label="Allow explicit songs" hint="When off, explicit tracks are blocked at request time.">
              <Switch checked={allowExplicit} onCheckedChange={setAllowExplicit} />
            </Row>
            <Row label="Require DJ approval" hint="New requests appear as pending until approved.">
              <Switch checked={requireApproval} onCheckedChange={setRequireApproval} />
            </Row>
            <div className="space-y-2">
              <Label>Cooldown (seconds)</Label>
              <Input type="number" min={0} max={600} value={cooldown} onChange={(e) => setCooldown(Number(e.target.value) || 0)} />
              <p className="text-xs text-muted-foreground">Minimum time between requests from the same guest.</p>
            </div>
            <div className="space-y-2">
              <Label>Custom event rules (shown to guests)</Label>
              <Textarea rows={3} value={rules} onChange={(e) => setRules(e.target.value)} placeholder="e.g. House &amp; techno only — no top 40." />
            </div>
            <Button onClick={save} disabled={saving} className="w-full bg-primary text-primary-foreground">
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}Save settings
            </Button>
          </TabsContent>

          <TabsContent value="blocklist" className="space-y-3 mt-4">
            <div className="flex gap-2">
              <select
                value={newKind}
                onChange={(e) => setNewKind(e.target.value as typeof newKind)}
                className="h-10 rounded-md border border-input bg-background px-2 text-sm"
              >
                <option value="artist">Artist</option>
                <option value="song">Song title</option>
                <option value="keyword">Keyword</option>
              </select>
              <Input value={newValue} onChange={(e) => setNewValue(e.target.value)} placeholder="Add to blocklist..." onKeyDown={(e) => e.key === "Enter" && addBlock()} />
              <Button onClick={addBlock} className="bg-primary text-primary-foreground"><Plus className="h-4 w-4" /></Button>
            </div>
            <div className="max-h-64 overflow-y-auto space-y-1.5">
              {blocks.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-6">Blocklist is empty.</p>
              ) : (
                blocks.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 p-2 rounded-md bg-card/60 border border-border/40">
                    <Badge variant="secondary" className="text-[10px] uppercase">{b.kind}</Badge>
                    <span className="flex-1 text-sm truncate">{b.value}</span>
                    <Button size="icon" variant="ghost" onClick={() => removeBlock(b.id)} aria-label="Remove">
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </TabsContent>

          <TabsContent value="bans" className="space-y-3 mt-4">
            {bans.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No banned guests.</p>
            ) : (
              <div className="space-y-1.5 max-h-72 overflow-y-auto">
                {bans.map((b) => (
                  <div key={b.id} className="flex items-center gap-2 p-2 rounded-md bg-card/60 border border-border/40">
                    <UserX className="h-4 w-4 text-destructive" />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{b.nickname}</div>
                      {b.reason && <div className="text-xs text-muted-foreground truncate">{b.reason}</div>}
                    </div>
                    <Button size="sm" variant="outline" onClick={() => removeBan(b.id)}>Unban</Button>
                  </div>
                ))}
              </div>
            )}
            <p className="text-xs text-muted-foreground">Tip: ban a guest from any of their requests in the queue.</p>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

function Row({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <Label className="text-sm">{label}</Label>
        {hint && <p className="text-xs text-muted-foreground mt-0.5">{hint}</p>}
      </div>
      <div className="pt-0.5">{children}</div>
    </div>
  );
}
