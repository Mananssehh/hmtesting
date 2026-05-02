import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Award, Check, Copy, Loader2, Play, SkipForward, Sparkles, Trophy, Wand2,
  PauseCircle, PlayCircle, XCircle, Music, Rocket, RefreshCw, ListMusic,
  Maximize2, Minimize2, BarChart3,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { SongRequestCard, SongRequestRow } from "@/components/SongRequestCard";
import { DJSongActions } from "@/components/DJSongActions";
import { AwardPointsDialog } from "@/components/AwardPointsDialog";
import { ArchivedEventSummary } from "@/components/ArchivedEventSummary";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { seedDemoEvent, resetDemoEvent } from "@/lib/demoSeed";

interface EventInfo {
  id: string;
  name: string;
  venue: string | null;
  dj_name: string;
  room_code: string;
  is_active: boolean;
  dj_id: string;
  requests_status: "live" | "paused" | "ended";
}

type Status = SongRequestRow["status"];
type Filter = "queue" | "boosted" | "newest" | "approved" | "played" | "all";

const filters: { key: Filter; label: string; icon?: React.ReactNode }[] = [
  { key: "queue", label: "Queue" },
  { key: "boosted", label: "Boosted", icon: <Sparkles className="h-3.5 w-3.5 mr-1" /> },
  { key: "newest", label: "Newest" },
  { key: "approved", label: "Approved" },
  { key: "played", label: "Played" },
  { key: "all", label: "All" },
];

const DJEventManage = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { user, isDJ, loading: authLoading } = useAuth();

  const [event, setEvent] = useState<EventInfo | null>(null);
  const [songs, setSongs] = useState<SongRequestRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<Filter>("queue");
  const [awardOpen, setAwardOpen] = useState(false);
  const [seeding, setSeeding] = useState(false);
  const [removeTarget, setRemoveTarget] = useState<SongRequestRow | null>(null);
  const [endConfirmOpen, setEndConfirmOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

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
      setEvent(ev as EventInfo);
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
    return () => { supabase.removeChannel(channel); };
  }, [event]);

  const nowPlaying = useMemo(() => songs.find((s) => s.status === "playing"), [songs]);

  const queueSongs = useMemo(
    () => songs
      .filter((s) => s.status === "pending" || s.status === "approved")
      .sort((a, b) => (b.upvotes - b.downvotes + b.boost) - (a.upvotes - a.downvotes + a.boost)),
    [songs],
  );

  const filtered = useMemo(() => {
    if (filter === "queue") return queueSongs;
    if (filter === "boosted") return [...songs].filter((s) => s.boost > 0 && s.status !== "removed")
      .sort((a, b) => b.boost - a.boost);
    if (filter === "newest") return [...songs].filter((s) => s.status !== "removed")
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    if (filter === "approved") return [...songs].filter((s) => s.status === "approved");
    if (filter === "played") return [...songs].filter((s) => s.status === "played" || s.status === "skipped")
      .sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    return [...songs].filter((s) => s.status !== "removed")
      .sort((a, b) => (b.upvotes - b.downvotes + b.boost) - (a.upvotes - a.downvotes + a.boost));
  }, [songs, queueSongs, filter]);

  const counts = useMemo(() => ({
    queue: queueSongs.length,
    boosted: songs.filter((s) => s.boost > 0 && s.status !== "removed").length,
    newest: songs.filter((s) => s.status !== "removed").length,
    approved: songs.filter((s) => s.status === "approved").length,
    played: songs.filter((s) => s.status === "played" || s.status === "skipped").length,
    all: songs.filter((s) => s.status !== "removed").length,
  }), [songs, queueSongs]);

  const updateStatus = async (songId: string, status: Status) => {
    if (status === "playing") {
      const current = songs.find((s) => s.status === "playing");
      if (current && current.id !== songId) {
        await supabase.from("song_requests").update({ status: "played" }).eq("id", current.id);
      }
    }
    const { error } = await supabase.from("song_requests").update({ status }).eq("id", songId);
    if (error) toast.error(error.message);
  };

  const playNext = async () => {
    const next = queueSongs[0];
    if (!next) return toast.info("Queue is empty");
    await updateStatus(next.id, "playing");
    toast.success(`Playing: ${next.title}`);
  };

  const remove = async (songId: string) => {
    const { error } = await supabase.from("song_requests").delete().eq("id", songId);
    if (error) toast.error(error.message);
    setRemoveTarget(null);
  };

  const setLifecycle = async (next: "live" | "paused" | "ended") => {
    if (!event) return;
    const { error } = await supabase.from("events").update({ requests_status: next }).eq("id", event.id);
    if (error) return toast.error(error.message);
    setEvent((p) => p ? { ...p, requests_status: next, is_active: next !== "ended" } : p);
    toast.success(
      next === "live" ? "Requests reopened 🎶" : next === "paused" ? "Requests paused" : "Event ended",
    );
  };

  const copyJoinLink = () => {
    if (!event) return;
    const url = `${window.location.origin}/join?code=${event.room_code}`;
    navigator.clipboard.writeText(url);
    toast.success("Join link copied!");
  };

  const handleSeed = async () => {
    if (!event) return;
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

  const handleReset = async () => {
    if (!event) return;
    try {
      await resetDemoEvent(event.id);
      toast.success("Event reset");
      setResetConfirmOpen(false);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Reset failed");
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

  const status = event.requests_status;

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="container max-w-6xl py-6 sm:py-8">
        {/* Header card */}
        <div className="grid lg:grid-cols-[1fr_auto] gap-6 mb-6 p-5 sm:p-6 rounded-2xl bg-gradient-to-br from-primary/15 via-card to-card border border-primary/20">
          <div>
            <div className="flex items-center gap-2 mb-2">
              {status === "live" && (
                <Badge className="bg-primary/20 text-primary border-primary/40 gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> LIVE
                </Badge>
              )}
              {status === "paused" && (
                <Badge className="bg-amber-500/20 text-amber-400 border-amber-500/40 gap-1.5">
                  <PauseCircle className="h-3 w-3" /> PAUSED
                </Badge>
              )}
              {status === "ended" && (
                <Badge variant="secondary" className="gap-1.5">
                  <XCircle className="h-3 w-3" /> ENDED
                </Badge>
              )}
            </div>
            <h1 className="text-2xl sm:text-3xl font-bold">{event.name}</h1>
            <p className="text-muted-foreground mt-1 text-sm sm:text-base">
              {event.venue ? `${event.venue} · ` : ""}DJ {event.dj_name}
            </p>

            <div className="mt-4 flex flex-wrap items-center gap-2 sm:gap-3">
              <div className="px-4 py-2 rounded-xl bg-background border">
                <div className="text-xs text-muted-foreground">Room code</div>
                <div className="font-mono text-xl sm:text-2xl font-bold tracking-widest">{event.room_code}</div>
              </div>
              <Button variant="outline" onClick={copyJoinLink}>
                <Copy className="mr-2 h-4 w-4" /> Copy join link
              </Button>
              <Button variant="outline" onClick={() => setAwardOpen(true)} disabled={status === "ended"}>
                <Award className="mr-2 h-4 w-4" /> Award points
              </Button>
              <Button asChild variant="outline">
                <Link to={`/leaderboard?event=${event.id}`}>
                  <Trophy className="mr-2 h-4 w-4" /> Leaderboard
                </Link>
              </Button>
            </div>

            {/* Lifecycle controls */}
            <div className="mt-4 flex flex-wrap items-center gap-2">
              {status === "live" && (
                <Button variant="outline" size="sm" onClick={() => setLifecycle("paused")}>
                  <PauseCircle className="mr-1.5 h-4 w-4" /> Pause requests
                </Button>
              )}
              {(status === "paused" || status === "ended") && (
                <Button variant="outline" size="sm" onClick={() => setLifecycle("live")}>
                  <PlayCircle className="mr-1.5 h-4 w-4" /> {status === "ended" ? "Reopen event" : "Resume requests"}
                </Button>
              )}
              {status !== "ended" && (
                <Button variant="outline" size="sm" onClick={() => setEndConfirmOpen(true)} className="text-destructive hover:text-destructive">
                  <XCircle className="mr-1.5 h-4 w-4" /> End event
                </Button>
              )}
              <div className="ml-auto flex gap-1">
                <Button variant="ghost" size="sm" onClick={handleSeed} disabled={seeding} className="text-muted-foreground">
                  {seeding ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Wand2 className="mr-1.5 h-4 w-4" />}
                  Seed demo
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setResetConfirmOpen(true)} className="text-muted-foreground">
                  <RefreshCw className="mr-1.5 h-4 w-4" /> Reset
                </Button>
              </div>
            </div>
          </div>

          <div className="flex justify-center lg:justify-end">
            <div className="p-2 rounded-xl bg-background border">
              <img src={qrUrl} alt="Event QR code" width={160} height={160} className="rounded-lg" />
              <p className="text-xs text-center text-muted-foreground mt-2">Scan to join</p>
            </div>
          </div>
        </div>

        {/* Now Playing + Next Up */}
        <div className="grid md:grid-cols-2 gap-4 mb-6">
          <div className="p-4 rounded-2xl bg-primary/5 border border-primary/30">
            <div className="flex items-center gap-2 mb-3 text-xs uppercase tracking-wider text-primary font-semibold">
              <Music className="h-3.5 w-3.5" /> Now playing
            </div>
            {nowPlaying ? (
              <div className="space-y-3">
                <SongRequestCard song={nowPlaying} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => updateStatus(nowPlaying.id, "played")}>
                    <Check className="mr-1.5 h-4 w-4" /> Mark played
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => updateStatus(nowPlaying.id, "skipped")}>
                    <SkipForward className="mr-1.5 h-4 w-4" /> Skip
                  </Button>
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-sm text-muted-foreground">
                Nothing playing yet. Tap <strong className="text-primary">Play next</strong> to start.
              </div>
            )}
          </div>

          <div className="p-4 rounded-2xl bg-card/60 border border-border/60">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground font-semibold">
                <ListMusic className="h-3.5 w-3.5" /> Next up
                <Badge variant="secondary" className="text-[10px]">{queueSongs.length}</Badge>
              </div>
              <Button size="sm" onClick={playNext} disabled={!queueSongs.length} className="bg-primary text-primary-foreground">
                <Play className="mr-1.5 h-4 w-4" /> Play next
              </Button>
            </div>
            {queueSongs.length === 0 ? (
              <div className="text-center py-8 text-sm text-muted-foreground">Queue is empty.</div>
            ) : (
              <div className="space-y-2 max-h-72 overflow-y-auto scrollbar-thin pr-1">
                {queueSongs.slice(0, 3).map((s) => (
                  <div key={s.id} className="flex items-center gap-2 p-2 rounded-lg bg-background/40 hover:bg-secondary/60 transition-colors">
                    {s.album_art ? (
                      <img src={s.album_art} alt="" className="h-9 w-9 rounded object-cover" />
                    ) : (
                      <div className="h-9 w-9 rounded bg-gradient-to-br from-primary/40 to-accent/40" />
                    )}
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{s.title}</div>
                      <div className="text-xs text-muted-foreground truncate">{s.artist}</div>
                    </div>
                    <Badge variant="secondary" className="text-xs gap-1 shrink-0">
                      {s.boost > 0 && <Rocket className="h-3 w-3 text-primary" />}
                      {s.upvotes - s.downvotes + s.boost}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Filter tabs */}
        <Tabs value={filter} onValueChange={(v) => setFilter(v as Filter)}>
          <TabsList className="flex flex-wrap w-full justify-start h-auto">
            {filters.map((b) => (
              <TabsTrigger key={b.key} value={b.key}>
                {b.icon}
                {b.label}
                <span className="ml-2 px-1.5 py-0.5 rounded text-xs bg-secondary text-muted-foreground tabular-nums">
                  {counts[b.key]}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value={filter} className="mt-4">
            {filtered.length === 0 ? (
              <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-border/60">
                <Music className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
                <p className="font-medium">Nothing here yet</p>
                <p className="text-sm text-muted-foreground">Requests will appear as guests submit them.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {filtered.map((song) => (
                  <div key={song.id} className="space-y-2">
                    <SongRequestCard song={song} />
                    <div className="flex flex-wrap gap-2 pl-2 sm:pl-4">
                      {song.status !== "playing" && (
                        <Button size="sm" onClick={() => updateStatus(song.id, "playing")} className="bg-primary text-primary-foreground h-9">
                          <Play className="mr-1 h-4 w-4" /> Play now
                        </Button>
                      )}
                      {song.status === "pending" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(song.id, "approved")} className="h-9">
                          <Check className="mr-1 h-4 w-4" /> Approve
                        </Button>
                      )}
                      {song.status !== "played" && song.status !== "skipped" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(song.id, "played")} className="h-9">
                          Mark played
                        </Button>
                      )}
                      {song.status !== "skipped" && song.status !== "played" && (
                        <Button size="sm" variant="outline" onClick={() => updateStatus(song.id, "skipped")} className="h-9">
                          <SkipForward className="mr-1 h-4 w-4" /> Skip
                        </Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => setRemoveTarget(song)} className="text-destructive hover:text-destructive h-9">
                        <Trash2 className="mr-1 h-4 w-4" /> Remove
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

      {/* Confirm remove */}
      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this request?</AlertDialogTitle>
            <AlertDialogDescription>
              {removeTarget && <>&ldquo;{removeTarget.title}&rdquo; by {removeTarget.artist} will be deleted from the queue and votes will be lost.</>}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => removeTarget && remove(removeTarget.id)} className="bg-destructive hover:bg-destructive/90">
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm end event */}
      <AlertDialog open={endConfirmOpen} onOpenChange={setEndConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>End this event?</AlertDialogTitle>
            <AlertDialogDescription>
              Guests will see an &ldquo;event ended&rdquo; message and can no longer request or vote. You can reopen it later.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep live</AlertDialogCancel>
            <AlertDialogAction onClick={() => { setEndConfirmOpen(false); setLifecycle("ended"); }} className="bg-destructive hover:bg-destructive/90">
              End event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Confirm reset */}
      <AlertDialog open={resetConfirmOpen} onOpenChange={setResetConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset all requests?</AlertDialogTitle>
            <AlertDialogDescription>
              This deletes every song request &amp; vote in this event. Use it to start fresh between demos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleReset} className="bg-destructive hover:bg-destructive/90">
              Reset event
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default DJEventManage;
