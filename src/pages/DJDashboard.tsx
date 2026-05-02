import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Archive as ArchiveIcon, ClipboardCheck, Loader2, Plus, Radio, RefreshCw, Settings, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { eventSchema } from "@/lib/validation";
import { generateRoomCode } from "@/lib/mockSongs";

interface EventRow {
  id: string;
  name: string;
  venue: string | null;
  dj_name: string;
  room_code: string;
  is_active: boolean;
  created_at: string;
}

const DJDashboard = () => {
  const { user, isDJ, loading: authLoading, profile } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);

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

  const handleCreate = async (form: { name: string; venue: string; dj_name: string }) => {
    const parsed = eventSchema.safeParse(form);
    if (!parsed.success) throw new Error(parsed.error.issues[0].message);
    if (!user) throw new Error("Not signed in");

    let code = generateRoomCode();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabase.from("events").select("id").eq("room_code", code).maybeSingle();
      if (!existing) break;
      code = generateRoomCode();
    }

    const { data, error } = await supabase
      .from("events")
      .insert({
        dj_id: user.id,
        name: parsed.data.name,
        venue: parsed.data.venue || null,
        dj_name: parsed.data.dj_name,
        room_code: code,
      })
      .select()
      .single();
    if (error) throw error;

    setEvents((prev) => [data, ...prev]);
    setCreateOpen(false);
    toast.success("Event created!");
    navigate(`/dj/${data.id}`);
  };

  const createDemoEvent = async () => {
    if (!user) return;
    try {
      await handleCreate({
        name: "Demo Night @ Club Neon",
        venue: "Club Neon",
        dj_name: profile?.nickname || "DJ Demo",
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not create demo");
    }
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
        <div className="flex items-center justify-between mb-8">
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
            <Button variant="ghost" size="icon" onClick={resetDemoRoom} title="Reset demo room">
              <RefreshCw className="h-4 w-4" />
            </Button>
            <Dialog open={createOpen} onOpenChange={setCreateOpen}>
              <DialogTrigger asChild>
                <Button className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
                  <Plus className="mr-1 h-4 w-4" /> New event
                </Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Create live event</DialogTitle>
                </DialogHeader>
                <CreateEventForm defaultDJ={profile?.nickname ?? ""} onCreate={handleCreate} />
              </DialogContent>
            </Dialog>
          </div>
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
              <Button variant="outline" onClick={createDemoEvent}>
                <Wand2 className="mr-1 h-4 w-4" /> Create demo event
              </Button>
            </div>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 gap-4">
            {events.map((ev) => (
              <div key={ev.id} className="p-5 rounded-2xl glass hover:border-primary/40 transition-all">
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

                <div className="flex gap-2">
                  <Button asChild className="flex-1">
                    <Link to={`/dj/${ev.id}`}>
                      <Settings className="mr-1 h-4 w-4" /> Manage
                    </Link>
                  </Button>
                  <Button variant="outline" onClick={() => toggleActive(ev)}>
                    {ev.is_active ? "End" : "Reopen"}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function CreateEventForm({ defaultDJ, onCreate }: { defaultDJ: string; onCreate: (f: { name: string; venue: string; dj_name: string }) => Promise<void> }) {
  const [name, setName] = useState("");
  const [venue, setVenue] = useState("");
  const [djName, setDjName] = useState(defaultDJ);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      await onCreate({ name, venue, dj_name: djName });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <form onSubmit={submit} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="name">Event name</Label>
        <Input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Saturday Night Sessions" required />
      </div>
      <div className="space-y-2">
        <Label htmlFor="venue">Venue (optional)</Label>
        <Input id="venue" value={venue} onChange={(e) => setVenue(e.target.value)} placeholder="Club Neon" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="dj">DJ name</Label>
        <Input id="dj" value={djName} onChange={(e) => setDjName(e.target.value)} placeholder="DJ Sparkles" required />
      </div>
      <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground">
        {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        Create event
      </Button>
    </form>
  );
}

export default DJDashboard;
