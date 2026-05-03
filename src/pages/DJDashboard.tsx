import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Archive as ArchiveIcon, ClipboardCheck, Copy, Loader2, Plus, QrCode, Radio, RefreshCw, Settings, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { eventSchema, roomCodeSchema } from "@/lib/validation";
import { generateRoomCode } from "@/lib/mockSongs";

interface EventRow {
  id: string;
  name: string;
  venue: string | null;
  dj_name: string;
  room_code: string;
  is_active: boolean;
  created_at: string;
  requests_status?: string;
}

interface CreateForm {
  name: string;
  venue: string;
  dj_name: string;
  room_code: string;
  allow_explicit: boolean;
  require_approval: boolean;
  cooldown_seconds: number;
  rules_text: string;
}

const DJDashboard = () => {
  const { user, isDJ, loading: authLoading, profile } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [qrEvent, setQrEvent] = useState<EventRow | null>(null);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
    if (!authLoading && user && !isDJ) {
      toast.error("DJ access required");
      navigate("/", { replace: true });
    }
  }, [user, isDJ, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("*")
        .eq("dj_id", user.id)
        .order("created_at", { ascending: false });
      setEvents(data ?? []);
      setLoading(false);
    })();
  }, [user]);

  const { active, past } = useMemo(() => {
    const a: EventRow[] = [];
    const p: EventRow[] = [];
    for (const e of events) (e.is_active ? a : p).push(e);
    return { active: a, past: p };
  }, [events]);

  const handleCreate = async (form: CreateForm) => {
    const parsed = eventSchema.safeParse({ name: form.name, venue: form.venue, dj_name: form.dj_name });
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    if (!user) throw new Error("Not signed in");

    let code = form.room_code.trim();
    if (code) {
      const codeParsed = roomCodeSchema.safeParse(code);
      if (!codeParsed.success) throw new Error(codeParsed.error.issues[0].message);
      code = codeParsed.data;
      const { data: existing } = await supabase.from("events").select("id").eq("room_code", code).maybeSingle();
      if (existing) throw new Error("That room code is already taken");
    } else {
      code = generateRoomCode();
      for (let i = 0; i < 5; i++) {
        const { data: existing } = await supabase.from("events").select("id").eq("room_code", code).maybeSingle();
        if (!existing) break;
        code = generateRoomCode();
      }
    }

    const { data, error } = await supabase
      .from("events")
      .insert({
        dj_id: user.id,
        name: parsed.data.name,
        venue: parsed.data.venue || null,
        dj_name: parsed.data.dj_name,
        room_code: code,
        allow_explicit: form.allow_explicit,
        require_approval: form.require_approval,
        cooldown_seconds: Math.max(0, Math.min(600, Math.floor(form.cooldown_seconds))),
        rules_text: form.rules_text.trim() || null,
      })
      .select()
      .single();
    if (error) throw error;

    setEvents((prev) => [data, ...prev]);
    setCreateOpen(false);
    toast.success("Event created!");
    navigate(`/dj/${data.id}`);
  };

  const launchDemoRoom = async () => {
    const { error } = await supabase.rpc("ensure_demo_event", { _code: "DEMO123" });
    if (error) return toast.error(error.message);
    toast.success("Demo room ready — code DEMO123");
    navigate("/event/DEMO123");
  };

  const resetDemoRooms = async () => {
    const { error } = await supabase.rpc("reset_demo_events");
    if (error) return toast.error(error.message);
    toast.success("All demo rooms reset");
  };

  const copyDemoLink = () => {
    const url = `${window.location.origin}/join?code=DEMO123`;
    navigator.clipboard.writeText(url);
    toast.success("Demo join link copied");
  };

  const copyJoinLink = (code: string) => {
    navigator.clipboard.writeText(`${window.location.origin}/join?code=${code}`);
    toast.success("Join link copied");
  };

  const toggleActive = async (ev: EventRow) => {
    const next = ev.is_active ? "ended" : "live";
    const { error } = await supabase.from("events").update({ requests_status: next }).eq("id", ev.id);
    if (error) return toast.error(error.message);
    setEvents((prev) => prev.map((e) => (e.id === ev.id ? { ...e, is_active: !ev.is_active } : e)));
    toast.success(next === "live" ? "Event reopened" : "Event ended");
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="container py-20 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="container max-w-5xl py-8">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
          <div>
            <h1 className="text-3xl font-bold">DJ Dashboard</h1>
            <p className="text-muted-foreground">Welcome back, {profile?.nickname}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button asChild variant="outline">
              <Link to="/testing"><ClipboardCheck className="mr-1 h-4 w-4" /> Testing</Link>
            </Button>
            <Button asChild variant="outline">
              <Link to="/dj/archive"><ArchiveIcon className="mr-1 h-4 w-4" /> Archive</Link>
            </Button>
            <Button variant="outline" onClick={launchDemoRoom}>
              <Sparkles className="mr-1 h-4 w-4 text-accent" /> Demo room
            </Button>
            <Button variant="outline" size="icon" onClick={copyDemoLink} title="Copy demo join link">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" onClick={resetDemoRooms} title="Reset all demo rooms">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <Plus className="mr-1 h-4 w-4" /> New event
                </Button>
              </DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <DialogTitle>Create live event</DialogTitle>
                </DialogHeader>
                <CreateEventForm defaultDJ={profile?.nickname ?? ""} onCreate={handleCreate} />
              </DialogContent>
            </Dialog>
          </div>
        </div>

        {/* Quick stats */}
        <div className="grid grid-cols-3 gap-3 mb-8">
          <StatCard label="Active events" value={active.length} />
          <StatCard label="Past events" value={past.length} />
          <StatCard label="Total" value={events.length} />
        </div>

        {events.length === 0 ? (
          <div className="text-center py-16 sm:py-20 rounded-2xl glass px-4">
            <Radio className="h-12 w-12 text-primary mx-auto mb-3" />
            <h2 className="text-xl font-semibold">No events yet</h2>
            <p className="text-muted-foreground mt-1 mb-6">Create your first session to start receiving requests.</p>
            <div className="flex flex-col sm:flex-row gap-2 justify-center">
              <Button onClick={() => setCreateOpen(true)} className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                <Plus className="mr-1 h-4 w-4" /> New event
              </Button>
              <Button variant="outline" onClick={launchDemoRoom}>
                <Wand2 className="mr-1 h-4 w-4" /> Open demo room
              </Button>
            </div>
          </div>
        ) : (
          <>
            {active.length > 0 && (
              <Section title="Active events">
                <Grid>
                  {active.map((ev) => (
                    <EventCard key={ev.id} ev={ev} onCopy={copyJoinLink} onQR={() => setQrEvent(ev)} onToggle={() => toggleActive(ev)} />
                  ))}
                </Grid>
              </Section>
            )}
            {past.length > 0 && (
              <Section title="Past events">
                <Grid>
                  {past.map((ev) => (
                    <EventCard key={ev.id} ev={ev} onCopy={copyJoinLink} onQR={() => setQrEvent(ev)} onToggle={() => toggleActive(ev)} />
                  ))}
                </Grid>
              </Section>
            )}
          </>
        )}
      </div>

      {/* QR dialog */}
      <Dialog open={!!qrEvent} onOpenChange={(o) => !o && setQrEvent(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Scan to join</DialogTitle>
          </DialogHeader>
          {qrEvent && (
            <div className="flex flex-col items-center gap-3">
              <img
                alt="Event QR code"
                className="rounded-lg border bg-background p-2"
                width={260}
                height={260}
                src={`https://api.qrserver.com/v1/create-qr-code/?size=260x260&bgcolor=0a0a0c&color=ec4899&margin=10&data=${encodeURIComponent(`${window.location.origin}/join?code=${qrEvent.room_code}`)}`}
              />
              <div className="font-mono font-bold tracking-widest text-xl">{qrEvent.room_code}</div>
              <Button variant="outline" onClick={() => copyJoinLink(qrEvent.room_code)}>
                <Copy className="mr-2 h-4 w-4" /> Copy join link
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-8">
      <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">{title}</h2>
      {children}
    </div>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="grid sm:grid-cols-2 gap-4">{children}</div>;
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card className="bg-card/60">
      <CardContent className="py-4">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">{label}</div>
        <div className="text-2xl font-bold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  );
}

function EventCard({ ev, onCopy, onQR, onToggle }: { ev: EventRow; onCopy: (c: string) => void; onQR: () => void; onToggle: () => void }) {
  return (
    <div className="p-5 rounded-2xl glass hover:border-primary/40 transition-all">
      <div className="flex items-start justify-between mb-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-lg truncate">{ev.name}</h3>
          <p className="text-sm text-muted-foreground truncate">
            {ev.venue ? `${ev.venue} · ` : ""}DJ {ev.dj_name}
          </p>
        </div>
        <Badge variant={ev.is_active ? "default" : "secondary"} className={ev.is_active ? "bg-success text-success-foreground" : ""}>
          {ev.is_active ? "Live" : "Ended"}
        </Badge>
      </div>

      <div className="flex items-center gap-2 mb-4">
        <span className="text-xs text-muted-foreground">CODE</span>
        <span className="font-mono font-bold tracking-widest">{ev.room_code}</span>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button asChild className="flex-1 min-w-[120px]">
          <Link to={`/dj/${ev.id}`}>
            <Settings className="mr-1 h-4 w-4" /> Manage
          </Link>
        </Button>
        <Button variant="outline" size="icon" onClick={() => onCopy(ev.room_code)} title="Copy join link">
          <Copy className="h-4 w-4" />
        </Button>
        <Button variant="outline" size="icon" onClick={onQR} title="Show QR code">
          <QrCode className="h-4 w-4" />
        </Button>
        <Button variant="outline" onClick={onToggle}>
          {ev.is_active ? "End" : "Reopen"}
        </Button>
      </div>
    </div>
  );
}

function CreateEventForm({ defaultDJ, onCreate }: { defaultDJ: string; onCreate: (f: CreateForm) => Promise<void> }) {
  const [form, setForm] = useState<CreateForm>({
    name: "",
    venue: "",
    dj_name: defaultDJ,
    room_code: "",
    allow_explicit: true,
    require_approval: false,
    cooldown_seconds: 30,
    rules_text: "",
  });
  const [loading, setLoading] = useState(false);

  const update = <K extends keyof CreateForm>(k: K, v: CreateForm[K]) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onCreate(form);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
      <div className="space-y-2">
        <Label htmlFor="name">Event name</Label>
        <Input id="name" value={form.name} onChange={(e) => update("name", e.target.value)} placeholder="Saturday Night Sessions" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="venue">Venue</Label>
          <Input id="venue" value={form.venue} onChange={(e) => update("venue", e.target.value)} placeholder="Club Neon" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dj">DJ name</Label>
          <Input id="dj" value={form.dj_name} onChange={(e) => update("dj_name", e.target.value)} placeholder="DJ Sparkles" required />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="code">Room code (optional)</Label>
        <Input id="code" value={form.room_code} onChange={(e) => update("room_code", e.target.value.toUpperCase())} placeholder="Auto-generated if blank" maxLength={10} />
        <p className="text-xs text-muted-foreground">5–10 letters/numbers. Leave blank for a random one.</p>
      </div>

      <div className="flex items-center justify-between gap-4 pt-1">
        <div>
          <Label className="text-sm">Allow explicit songs</Label>
          <p className="text-xs text-muted-foreground">Off blocks explicit tracks at request time.</p>
        </div>
        <Switch checked={form.allow_explicit} onCheckedChange={(v) => update("allow_explicit", v)} />
      </div>

      <div className="flex items-center justify-between gap-4">
        <div>
          <Label className="text-sm">Require approval</Label>
          <p className="text-xs text-muted-foreground">New requests appear as pending until you approve.</p>
        </div>
        <Switch checked={form.require_approval} onCheckedChange={(v) => update("require_approval", v)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="cooldown">Request cooldown (seconds)</Label>
        <Input id="cooldown" type="number" min={0} max={600} value={form.cooldown_seconds} onChange={(e) => update("cooldown_seconds", Number(e.target.value) || 0)} />
      </div>

      <div className="space-y-2">
        <Label htmlFor="rules">Event rules (shown to guests)</Label>
        <Textarea id="rules" rows={3} value={form.rules_text} onChange={(e) => update("rules_text", e.target.value)} placeholder="e.g. House &amp; techno only — no top 40." />
      </div>

      <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create event
      </Button>
    </form>
  );
}

export default DJDashboard;
