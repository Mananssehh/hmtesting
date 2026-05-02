import { useEffect, useMemo, useState } from "react";
import { useParams, useNavigate, Link } from "react-router-dom";
import {
  Loader2, Plus, Search, Sparkles, Trophy, Music, PauseCircle, XCircle, PartyPopper,
} from "lucide-react";
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
import { searchMusic, MusicSearchResult, normalizeKey } from "@/lib/musicSearch";
import { formatDuration, platformLabel } from "@/lib/searchLinks";
import { PreviewButton } from "@/components/PreviewButton";

type SortMode = "top" | "new" | "trending";

interface EventInfo {
  id: string; name: string; venue: string | null; dj_name: string;
  is_active: boolean; requests_status: "live" | "paused" | "ended";
}

const REQUEST_COOLDOWN_SEC = 30;

const EventPage = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const { user, profile, loading: authLoading } = useAuth();

  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [songs, setSongs] = useState<SongRequestRow[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, 1 | -1>>({});
  const [sort, setSort] = useState<SortMode>("top");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [boostTarget, setBoostTarget] = useState<SongRequestRow | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [lastRequestAt, setLastRequestAt] = useState(0);

  // Redirect if not signed in
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
        .select("id, name, venue, dj_name, is_active, requests_status")
        .eq("room_code", code.toUpperCase())
        .maybeSingle();

      if (!ev) {
        toast.error("That event doesn't exist anymore");
        navigate("/join", { replace: true });
        return;
      }
      if (cancelled) return;
      setEventInfo(ev as EventInfo);

      // Show welcome hint once per event per browser
      const hintKey = `decks-hint-${ev.id}`;
      if (!localStorage.getItem(hintKey)) {
        setShowHint(true);
        localStorage.setItem(hintKey, "1");
      }

      const nick = profile?.nickname || "Guest";
      await supabase
        .from("event_participants")
        .insert({ event_id: ev.id, user_id: user.id, nickname: nick })
        .then(() => null, () => null);

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

    return () => { cancelled = true; };
  }, [code, user, navigate, profile?.nickname]);

  // Realtime: songs + event lifecycle
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
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "events", filter: `id=eq.${eventInfo.id}` },
        (payload) => setEventInfo((prev) => prev ? { ...prev, ...(payload.new as EventInfo) } : prev),
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [eventInfo]);

  const nowPlaying = useMemo(() => songs.find((s) => s.status === "playing"), [songs]);

  const visibleSongs = useMemo(() => {
    let list = songs.filter((s) => s.status !== "removed" && s.status !== "playing");
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));

    if (sort === "top") {
      list = [...list].sort((a, b) => (b.upvotes - b.downvotes + b.boost) - (a.upvotes - a.downvotes + a.boost));
    } else if (sort === "new") {
      list = [...list].sort((a, b) => +new Date(b.created_at) - +new Date(a.created_at));
    } else {
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
    if (eventInfo?.requests_status === "ended") {
      toast.error("Voting closed — this event has ended");
      return;
    }
    const current = myVotes[songId];
    if (current === value) {
      setMyVotes((prev) => { const n = { ...prev }; delete n[songId]; return n; });
      await supabase.from("votes").delete().eq("song_request_id", songId).eq("user_id", user.id);
    } else {
      setMyVotes((prev) => ({ ...prev, [songId]: value }));
      await supabase.from("votes").upsert(
        { song_request_id: songId, user_id: user.id, value },
        { onConflict: "song_request_id,user_id" },
      );
    }
  };

  const handleRequestSong = async (song: MusicSearchResult) => {
    if (!user || !eventInfo) return;
    if (eventInfo.requests_status !== "live") {
      toast.error(eventInfo.requests_status === "paused" ? "Requests are paused" : "Event has ended");
      return;
    }

    // Client-side cooldown
    const elapsed = (Date.now() - lastRequestAt) / 1000;
    if (elapsed < REQUEST_COOLDOWN_SEC) {
      toast.error(`Slow down! Try again in ${Math.ceil(REQUEST_COOLDOWN_SEC - elapsed)}s`);
      return;
    }

    // Duplicate detection: source_song_id first, then normalized title+artist
    const key = normalizeKey(song.title, song.artist);
    const exists = songs.some((s) => {
      if (s.status === "removed") return false;
      if (song.source_song_id && s.source_song_id && s.source_song_id === song.source_song_id) return true;
      return normalizeKey(s.title, s.artist) === key;
    });
    if (exists) {
      toast.error("Already requested — vote for it instead!");
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
        album: song.album,
        album_art: song.album_art_url,
        album_art_url: song.album_art_url,
        duration_ms: song.duration_ms,
        preview_url: song.preview_url,
        explicit: song.explicit,
        source_platform: song.source_platform,
        source_song_id: song.source_song_id,
        external_url: song.external_url,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") toast.error("Already requested — vote for it!");
      else toast.error(error.message);
      return;
    }

    setLastRequestAt(Date.now());

    if (inserted) {
      await supabase.from("votes").upsert({ song_request_id: inserted.id, user_id: user.id, value: 1 });
      setMyVotes((p) => ({ ...p, [inserted.id]: 1 }));
    }

    toast.success("Song requested! +5 pts 🎶", { icon: <PartyPopper className="h-4 w-4" /> });
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

  const status = eventInfo.requests_status;
  const isLive = status === "live";
  const isPaused = status === "paused";
  const isEnded = status === "ended";

  return (
    <div className="min-h-screen pb-24 sm:pb-10">
      <AppHeader />
      <div className="container max-w-3xl py-4 sm:py-8">
        {/* Event header */}
        <div className="mb-4 sm:mb-6 p-4 sm:p-6 rounded-2xl bg-gradient-to-br from-primary/15 via-card to-card border border-primary/20">
          <div className="flex items-center justify-between gap-2 mb-2">
            <StatusBadge status={status} />
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/30 gap-1">
                <Sparkles className="h-3 w-3" />{profile?.points ?? 0} pts
              </Badge>
              <Button asChild size="sm" variant="ghost" className="h-7 px-2">
                <Link to={`/leaderboard?event=${eventInfo.id}`} aria-label="Top fans">
                  <Trophy className="h-3.5 w-3.5" />
                </Link>
              </Button>
            </div>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold leading-tight">{eventInfo.name}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {eventInfo.venue ? `${eventInfo.venue} · ` : ""}with DJ {eventInfo.dj_name}
          </p>
          <div className="mt-3 inline-block px-3 py-1 rounded-full bg-secondary text-xs font-mono">
            Code: {code}
          </div>
        </div>

        {/* First-time hint */}
        {showHint && (
          <div className="mb-4 p-4 rounded-2xl bg-primary/5 border border-primary/20 flex items-start gap-3 animate-in fade-in slide-in-from-top-2">
            <PartyPopper className="h-5 w-5 text-primary shrink-0 mt-0.5" />
            <div className="flex-1 text-sm">
              <p className="font-medium">Welcome to the dancefloor</p>
              <p className="text-muted-foreground mt-0.5">
                Request songs, vote on the crowd&rsquo;s picks, and earn points when your songs get love.
              </p>
            </div>
            <Button size="sm" variant="ghost" onClick={() => setShowHint(false)}>Got it</Button>
          </div>
        )}

        {/* Lifecycle banners */}
        {isPaused && (
          <div className="mb-4 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
            <PauseCircle className="h-5 w-5 text-amber-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium text-amber-200">Requests are paused</p>
              <p className="text-muted-foreground">You can still vote on what's already in the queue.</p>
            </div>
          </div>
        )}
        {isEnded && (
          <div className="mb-4 p-4 rounded-2xl bg-destructive/10 border border-destructive/30 flex items-start gap-3">
            <XCircle className="h-5 w-5 text-destructive shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-medium">This event has ended</p>
              <p className="text-muted-foreground">Thanks for playing — see you next time!</p>
            </div>
          </div>
        )}

        {/* Now Playing */}
        {nowPlaying && (
          <div className="mb-4">
            <div className="flex items-center gap-2 mb-2 text-xs uppercase tracking-wider text-primary font-medium">
              <Music className="h-3.5 w-3.5" /> Now playing
            </div>
            <SongRequestCard
              song={nowPlaying}
              myVote={myVotes[nowPlaying.id] ?? 0}
              onVote={(v) => handleVote(nowPlaying.id, v)}
            />
          </div>
        )}

        {/* Search + request */}
        <div className="flex gap-2 mb-3">
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
              <Button
                disabled={!isLive}
                className="bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shrink-0"
              >
                <Plus className="mr-1 h-4 w-4" /> Request
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Request a song</DialogTitle>
              </DialogHeader>
              <RequestPicker onPick={handleRequestSong} existing={songs} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Sort tabs */}
        <Tabs value={sort} onValueChange={(v) => setSort(v as SortMode)} className="mb-4">
          <TabsList className="grid grid-cols-3 w-full">
            <TabsTrigger value="top"><Sparkles className="h-3.5 w-3.5 mr-1.5" />Top</TabsTrigger>
            <TabsTrigger value="trending">Trending</TabsTrigger>
            <TabsTrigger value="new">Newest</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Song list */}
        {visibleSongs.length === 0 ? (
          <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-border/60">
            <Music className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
            <p className="font-medium">No requests yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              {isLive ? "Be the first to drop a track." : "Waiting for the DJ to reopen requests."}
            </p>
            {isLive && (
              <Button onClick={() => setRequestOpen(true)} variant="outline">
                <Plus className="mr-1 h-4 w-4" /> Request a song
              </Button>
            )}
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
                onBoost={isLive ? () => setBoostTarget(s) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Mobile sticky request CTA */}
      {isLive && (
        <div className="sm:hidden fixed bottom-4 inset-x-4 z-30">
          <Button
            onClick={() => setRequestOpen(true)}
            className="w-full h-12 bg-gradient-to-r from-primary to-primary-glow text-primary-foreground shadow-lg glow-primary"
          >
            <Plus className="mr-2 h-5 w-5" /> Request a song
          </Button>
        </div>
      )}

      {boostTarget && (
        <BoostDialog
          open={!!boostTarget}
          onOpenChange={(o) => !o && setBoostTarget(null)}
          songRequestId={boostTarget.id}
          songTitle={`${boostTarget.title} — ${boostTarget.artist}`}
        />
      )}
    </div>
  );
};

function StatusBadge({ status }: { status: "live" | "paused" | "ended" }) {
  if (status === "live")
    return (
      <div className="flex items-center gap-1.5 text-xs text-primary font-medium">
        <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" /> LIVE
      </div>
    );
  if (status === "paused")
    return (
      <div className="flex items-center gap-1.5 text-xs text-amber-400 font-medium">
        <PauseCircle className="h-3.5 w-3.5" /> PAUSED
      </div>
    );
  return (
    <div className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
      <XCircle className="h-3.5 w-3.5" /> ENDED
    </div>
  );
}

function RequestPicker({ onPick, existing }: { onPick: (song: MockSong) => void; existing: SongRequestRow[] }) {
  const [q, setQ] = useState("");
  const results = useMemo(() => searchMockSongs(q), [q]);

  const isAlreadyRequested = (s: MockSong) =>
    existing.some(
      (e) => e.title.toLowerCase() === s.title.toLowerCase()
        && e.artist.toLowerCase() === s.artist.toLowerCase()
        && e.status !== "removed",
    );

  return (
    <div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          autoFocus
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search title or artist..."
          className="pl-9"
        />
      </div>
      <div className="max-h-[55vh] overflow-y-auto scrollbar-thin space-y-1 pr-1">
        {results.map((s) => {
          const already = isAlreadyRequested(s);
          const dur = formatDuration(s.duration_ms);
          return (
            <button
              key={`${s.title}-${s.artist}`}
              onClick={() => !already && onPick(s)}
              disabled={already}
              className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-secondary text-left transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              <img src={s.album_art} alt="" className="h-12 w-12 rounded-md object-cover bg-muted" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate">{s.title}</span>
                  {s.explicit && (
                    <span className="text-[9px] font-bold px-1 rounded bg-muted text-muted-foreground border border-border">E</span>
                  )}
                </div>
                <div className="text-sm text-muted-foreground truncate">{s.artist}</div>
                <div className="text-xs text-muted-foreground/70 truncate">
                  {s.album}{dur && ` · ${dur}`} · {platformLabel(s.source_platform)}
                </div>
              </div>
              {already ? (
                <Badge variant="secondary" className="text-[10px] shrink-0">Already requested</Badge>
              ) : (
                <Plus className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </button>
          );
        })}
        {q && results.length === 0 && (
          <div className="text-center py-12">
            <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No matches in catalog</p>
            <p className="text-xs text-muted-foreground/70 mt-1">Try a different title or artist.</p>
          </div>
        )}
      </div>
      <p className="text-xs text-muted-foreground mt-3">
        MVP: requests use a demo catalog. The DJ plays from their own setup.
      </p>
    </div>
  );
}

export default EventPage;
