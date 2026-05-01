import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Award, Check, Copy, Loader2, Play, SkipForward, Sparkles, Trash2, Trophy, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { SongRequestCard, SongRequestRow } from "@/components/SongRequestCard";
import { AwardPointsDialog } from "@/components/AwardPointsDialog";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { seedDemoEvent } from "@/lib/demoSeed";

interface EventInfo {
  id: string;
  name: string;
  venue: string | null;
  dj_name: string;
  room_code: string;
  is_active: boolean;
  dj_id: string;
}

type Status = SongRequestRow["status"];

const buckets: { key: Status | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "pending", label: "Pending" },
  { key: "approved", label: "Approved" },
  { key: "playing", label: "Playing" },
  { key: "played", label: "Played" },
  { key: "skipped", label: "Skipped" },
];

const DJEventManage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isDJ, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [songs, setSongs] = useState<SongRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Status | "all">("all");
  const [awardOpen, setAwardOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);

  useEffect(() => {
    if (!authLoading && (!user || !isDJ)) navigate("/auth", { replace: true });
  }, [user, isDJ, authLoading, navigate]);

  useEffect(() => {
    if (!id || !user) return;
    (async () => {
      const { data: ev } = await supabase.from("events").select("*").eq("id", id).maybeSingle();
      if (!ev || ev.dj_id !== user.id) {
        toast.error("Event not found");
        navigate("/dj", { replace: true });
        return;
      }
      setEvent(ev);
      const { data: reqs } = await supabase.from("song_requests").select("*").eq("event_id", id);
      setSongs((reqs ?? []) as SongRequestRow[]);
      setLoading(false);
    })();
  }, [id, user, navigate]);

  // Realtime
  useEffect(() => {
    if (!event) return;
    const channel = supabase
      .channel(`dj-event-${event.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "song_requests", filter: `event_id=eq.${event.id}` },
        (payload) => {
          setSongs((prev) => {
            if (payload.eventType === "INSERT") return [...prev, payload.new as SongRequestRow];
            if (payload.eventType === "UPDATE")
              return prev.map((s) => (s.id === (payload.new as SongRequestRow).id ? (payload.new as SongRequestRow) : s));
            if (payload.eventType === "DELETE")
              return prev.filter((s) => s.id !== (payload.old as { id: string }).id);
            return prev;
          });
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [event]);

  const sorted = useMemo(() => {
    let list = songs;
    if (tab !== "all") list = list.filter((s) => s.status === tab);
    return [...list].sort((a, b) => (b.upvotes - b.downvotes + b.boost) - (a.upvotes - a.downvotes + a.boost));
  }, [songs, tab]);

  const counts = useMemo(() => {
    return buckets.reduce<Record<string, number>>((acc, b) => {
      acc[b.key] = b.key === "all" ? songs.length : songs.filter((s) => s.status === b.key).length;
      return acc;
    }, {});
  }, [songs]);

  const updateStatus = async (songId: string, status: Status) => {
    // If marking as playing, set any existing 'playing' to 'played' first
    if (status === "playing") {
      const current = songs.find((s) => s.status === "playing");
      if (current && current.id !== songId) {
        await supabase.from("song_requests").update({ status: "played" }).eq("id", current.id);
      }
    }
    const { error } = await supabase.from("song_requests").update({ status }).eq("id", songId);
    if (error) toast.error(error.message);
  };

  const remove = async (songId: string) => {
    const { error } = await supabase.from("song_requests").delete().eq("id", songId);
    if (error) toast.error(error.message);
  };

  const copyJoinLink = () => {
    if (!event) return;
    const url = `${window.location.origin}/join?code=${event.room_code}`;
    navigator.clipboard.writeText(url);
    toast.success("Join link copied!");
  };

  const handleSeed = async () => {
    if (!event) return;
    if (!confirm("Add demo songs and fake guests to this event?")) return;
    setSeeding(true);
    try {
      const { count } = await seedDemoEvent(event.id);
      toast.success(`Seeded ${count} demo requests 🎉`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Seed failed");
    } finally {
      setSeeding(false);
    }
  };

  if (authLoading || loading || !event) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="container py-20 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=240x240&bgcolor=0a0a0c&color=ec4899&margin=10&data=${encodeURIComponent(
    `${window.location.origin}/join?code=${event.room_code}`,
  )}`;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="container max-w-6xl py-8">
        {/* Header card */}
        <div className="grid lg:grid-cols-[1fr_auto] gap-6 mb-8 p-6 rounded-2xl bg-gradient-to-br from-primary/15 via-card to-card border border-primary/20">
          <div>
            <div className="flex items-center gap-2 text-xs text-primary font-medium mb-2">
              <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
              {event.is_active ? "LIVE QUEUE" : "ENDED"}
            </div>
            <h1 className="text-3xl font-bold">{event.name}</h1>
            <p className="text-muted-foreground mt-1">
              {event.venue ? `${event.venue} · ` : ""}DJ {event.dj_name}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <div className="px-4 py-2 rounded-xl bg-background border">
                <div className="text-xs text-muted-foreground">Room code</div>
                <div className="font-mono text-2xl font-bold tracking-widest">{event.room_code}</div>
              </div>
              <Button variant="outline" onClick={copyJoinLink}>
                <Copy className="mr-2 h-4 w-4" /> Copy join link
              </Button>
              <Button variant="outline" onClick={() => setAwardOpen(true)}>
                <Award className="mr-2 h-4 w-4" /> Award points
              </Button>
              <Button asChild variant="outline">
                <Link to={`/leaderboard?event=${event.id}`}>
                  <Trophy className="mr-2 h-4 w-4" /> Leaderboard
                </Link>
              </Button>
              <Button variant="ghost" onClick={handleSeed} disabled={seeding} className="text-muted-foreground">
                {seeding ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Wand2 className="mr-2 h-4 w-4" />}
                Seed demo
              </Button>
            </div>
          </div>
          <div className="flex justify-center lg:justify-end">
            <div className="p-2 rounded-xl bg-background border">
              <img src={qrUrl} alt="Event QR code" width={180} height={180} className="rounded-lg" />
              <p className="text-xs text-center text-muted-foreground mt-2">Scan to join</p>
            </div>
          </div>
        </div>

        {/* Status tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as Status | "all")}>
          <TabsList className="flex flex-wrap w-full justify-start h-auto">
            {buckets.map((b) => (
              <TabsTrigger key={b.key} value={b.key} className="capitalize">
                {b.label}
                <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-secondary text-muted-foreground tabular-nums">
                  {counts[b.key] ?? 0}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={tab} className="mt-6">
            {sorted.length === 0 ? (
              <div className="text-center py-20 text-muted-foreground">No songs in this bucket yet.</div>
            ) : (
              <div className="space-y-2">
                {sorted.map((song) => (
                  <div key={song.id} className="space-y-2">
                    <SongRequestCard song={song} />
                    <div className="flex flex-wrap gap-2 pl-4">
                      {song.status !== "playing" && (
                        <Button size="sm" onClick={() => updateStatus(song.id, "playing")} className="bg-primary text-primary-foreground">
                          <Play className="mr-1 h-3.5 w-3.5" /> Play now
                        </Button>
                      )}
                      {song.status !== "approved" && song.status !== "playing" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(song.id, "approved")}>
                          <Check className="mr-1 h-3.5 w-3.5" /> Approve
                        </Button>
                      )}
                      {song.status !== "played" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(song.id, "played")}>
                          Mark played
                        </Button>
                      )}
                      {song.status !== "skipped" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(song.id, "skipped")}>
                          <SkipForward className="mr-1 h-3.5 w-3.5" /> Skip
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => remove(song.id)} className="text-destructive hover:text-destructive">
                        <Trash2 className="mr-1 h-3.5 w-3.5" /> Remove
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>

      <AwardPointsDialog open={awardOpen} onOpenChange={setAwardOpen} eventId={event.id} />
    </div>
  );
};

export default DJEventManage;
