import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import { Loader2, Plus, Search, Sparkles, Trophy } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { SongRequestCard, SongRequestRow } from "@/components/SongRequestCard";
import { BoostDialog } from "@/components/BoostDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { searchMockSongs, MockSong } from "@/lib/mockSongs";

type SortMode = "top" | "new" | "trending";

const EventPage = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  const [eventInfo, setEventInfo] = useState<{ id: string; name: string; venue: string | null; dj_name: string; is_active: boolean } | null>(null);
  const [songs, setSongs] = useState<SongRequestRow[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, 1 | -1>>({});
  const [sort, setSort] = useState<SortMode>("top");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [boostTarget, setBoostTarget] = useState<SongRequestRow | null>(null);

  // Redirect if not signed in (need a session — even anonymous — to vote)
  useEffect(() => {
    if (!authLoading && !user) {
      navigate(`/join?code=${code ?? ""}`, { replace: true });
    }
  }, [user, authLoading, code, navigate]);

  // Load event + songs + my votes
  useEffect(() => {
    if (!code || !user) return;
    let cancelled = false;

    (async () => {
      setLoading(true);
      const { data: ev } = await supabase
        .from("events")
        .select("id, name, venue, dj_name, is_active")
        .eq("room_code", code.toUpperCase())
        .maybeSingle();

      if (!ev) {
        toast.error("Event not found");
        navigate("/join", { replace: true });
        return;
      }
      if (cancelled) return;
      setEventInfo(ev);

      // Record participation (idempotent — unique constraint protects)
      const nick = profile?.nickname || "Guest";
      await supabase
        .from("event_participants")
        .insert({ event_id: ev.id, user_id: user.id, nickname: nick })
        .then(() => null, () => null); // ignore unique violation

      const [{ data: reqs }, { data: votes }] = await Promise.all([
        supabase.from("song_requests").select("*").eq("event_id", ev.id),
        supabase.from("votes").select("song_request_id, value").eq("user_id", user.id),
      ]);

      if (cancelled) return;
      setSongs((reqs ?? []) as SongRequestRow[]);
      setMyVotes(
        Object.fromEntries((votes ?? []).map((v) => [v.song_request_id, v.value as 1 | -1])),
      );
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [code, user, navigate]);

  // Realtime subscriptions
  useEffect(() => {
    if (!eventInfo) return;
    const channel = supabase
      .channel(`event-${eventInfo.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "song_requests", filter: `event_id=eq.${eventInfo.id}` },
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
  }, [eventInfo]);

  const visibleSongs = useMemo(() => {
    let list = songs.filter((s) => s.status !== "removed");
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));

    if (sort === "top") {
      list = [...list].sort((a, b) => (b.upvotes - b.downvotes + b.boost) - (a.upvotes - a.downvotes + a.boost));
    } else if (sort === "new") {
      list = [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    } else {
      // trending: score divided by hours since posted
      list = [...list].sort((a, b) => {
        const ageA = Math.max(0.25, (Date.now() - +new Date(a.created_at)) / 3600000);
        const ageB = Math.max(0.25, (Date.now() - +new Date(b.created_at)) / 3600000);
        return (b.upvotes - b.downvotes + b.boost) / ageB - (a.upvotes - a.downvotes + a.boost) / ageA;
      });
    }
    return list;
  }, [songs, sort, search]);

  const handleVote = async (songId: string, value: 1 | -1) => {
    if (!user) return;
    const current = myVotes[songId];

    if (current === value) {
      // Remove vote
      setMyVotes((prev) => {
        const next = { ...prev };
        delete next[songId];
        return next;
      });
      await supabase.from("votes").delete().eq("song_request_id", songId).eq("user_id", user.id);
    } else {
      setMyVotes((prev) => ({ ...prev, [songId]: value }));
      await supabase.from("votes").upsert(
        { song_request_id: songId, user_id: user.id, value },
        { onConflict: "song_request_id,user_id" },
      );
    }
  };

  const handleRequestSong = async (song: MockSong) => {
    if (!user || !eventInfo) return;

    // Check duplicate
    const exists = songs.some(
      (s) => s.title.toLowerCase() === song.title.toLowerCase() && s.artist.toLowerCase() === song.artist.toLowerCase() && s.status !== "removed",
    );
    if (exists) {
      toast.error("That song is already in the queue — go upvote it!");
      setRequestOpen(false);
      return;
    }

    const { data: prof } = await supabase.from("profiles").select("nickname").eq("id", user.id).maybeSingle();

    const { data: inserted, error } = await supabase
      .from("song_requests")
      .insert({
        event_id: eventInfo.id,
        requested_by: user.id,
        requester_name: prof?.nickname ?? "Guest",
        title: song.title,
        artist: song.artist,
        album_art: song.album_art,
        external_url: song.external_url,
      })
      .select()
      .single();

    if (error) {
      toast.error(error.message);
      return;
    }

    // Auto-upvote own request
    if (inserted) {
      await supabase.from("votes").upsert({ song_request_id: inserted.id, user_id: user.id, value: 1 });
      setMyVotes((p) => ({ ...p, [inserted.id]: 1 }));
    }

    toast.success("Song requested! 🎶");
    setRequestOpen(false);
  };

  if (authLoading || loading || !eventInfo) {
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
      <div className="container max-w-3xl py-6 sm:py-10">
        {/* Event header */}
        <div className="mb-8 p-6 rounded-2xl bg-gradient-to-br from-primary/15 via-card to-card border border-primary/20">
          <div className="flex items-center gap-2 text-xs text-primary font-medium mb-2">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
            LIVE
          </div>
          <h1 className="text-3xl font-bold">{eventInfo.name}</h1>
          <p className="text-muted-foreground mt-1">
            {eventInfo.venue ? `${eventInfo.venue} · ` : ""}with DJ {eventInfo.dj_name}
          </p>
          <div className="mt-3 inline-block px-3 py-1 rounded-full bg-secondary text-xs font-mono">
            Code: {code}
          </div>
        </div>

        {/* Search + request */}
        <div className="flex gap-2 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search the queue..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-9"
            />
          </div>
          <Dialog open={requestOpen} onOpenChange={setRequestOpen}>
            <DialogTrigger asChild>
              <Button className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shrink-0">
                <Plus className="mr-1 h-4 w-4" /> Request
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Request a song</DialogTitle>
              </DialogHeader>
              <RequestPicker onPick={handleRequestSong} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Sort tabs */}
        <Tabs value={sort} onValueChange={(v) => setSort(v as SortMode)} className="mb-4">
          <TabsList className="grid grid-cols-3 w-full sm:w-auto">
            <TabsTrigger value="top">
              <Sparkles className="h-3.5 w-3.5 mr-1.5" /> Top
            </TabsTrigger>
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="new">Newest</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Song list */}
        {visibleSongs.length === 0 ? (
          <div className="text-center py-16 text-muted-foreground">
            <p className="mb-4">No requests yet. Be the first!</p>
            <Button onClick={() => setRequestOpen(true)} variant="outline">
              <Plus className="mr-1 h-4 w-4" /> Request a song
            </Button>
          </div>
        ) : (
          <div className="space-y-2">
            {visibleSongs.map((s, i) => (
              <SongRequestCard
                key={s.id}
                rank={sort === "top" ? i + 1 : undefined}
                song={s}
                myVote={myVotes[s.id] ?? 0}
                onVote={(v) => handleVote(s.id, v)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

function RequestPicker({ onPick }: { onPick: (song: MockSong) => void }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => searchMockSongs(q), [q]);

  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input autoFocus value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search title or artist..." className="pl-9" />
      </div>
      <div className="max-h-[50vh] overflow-y-auto scrollbar-thin space-y-1 pr-1">
        {results.map((s) => (
          <button
            key={`${s.title}-${s.artist}`}
            onClick={() => onPick(s)}
            className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary text-left transition-colors"
          >
            <img src={s.album_art} alt="" className="h-10 w-10 rounded-md object-cover" />
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{s.title}</div>
              <div className="text-sm text-muted-foreground truncate">{s.artist}</div>
            </div>
            <Plus className="h-4 w-4 text-muted-foreground" />
          </button>
        ))}
        {results.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">No matches in catalog</p>}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        MVP: requests use a mock catalog. The DJ plays from their own setup.
      </p>
    </div>
  );
}

export default EventPage;
