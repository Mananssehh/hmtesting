import { useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate, Link, useLocation } from "react-router-dom";
import {
  Loader2, Plus, Search, Sparkles, Music, PauseCircle, XCircle, PartyPopper, CheckCircle2,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { SongRequestCard, SongRequestRow } from "@/components/SongRequestCard";
import { TipDialog } from "@/components/TipDialog";
import { ReportDialog } from "@/components/ReportDialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog";
import { Badge } from "@/components/ui/badge";
import { searchMusic, MusicSearchResult, normalizeKey, RateLimitedError } from "@/lib/musicSearch";
import { formatDuration, platformLabel } from "@/lib/searchLinks";
import { PreviewButton } from "@/components/PreviewButton";
import { NowPlayingDisplay } from "@/components/NowPlayingDisplay";
import { useTrending } from "@/hooks/useTrending";
import { ENABLE_BOOSTS } from "@/lib/featureFlags";

import { useNowPlaying } from "@/hooks/useNowPlaying";

type SortMode = "top" | "trending" | "played";

interface EventInfo {
  id: string; name: string; venue: string | null; dj_name: string;
  is_active: boolean; requests_status: "live" | "paused" | "ended";
  allow_explicit: boolean; require_approval: boolean;
  cooldown_seconds: number; rules_text: string | null;
}

const EventPage = () => {
  const { code } = useParams<{ code: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, profile, loading: authLoading } = useAuth();

  const [eventInfo, setEventInfo] = useState<EventInfo | null>(null);
  const [songs, setSongs] = useState<SongRequestRow[]>([]);
  const [myVotes, setMyVotes] = useState<Record<string, 1 | -1>>({});
  const [pendingVotes, setPendingVotes] = useState<Record<string, boolean>>({});
  const [sort, setSort] = useState<SortMode>("top");
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [requestOpen, setRequestOpen] = useState(false);
  const [boostTarget, setBoostTarget] = useState<SongRequestRow | null>(null);
  const [reportTarget, setReportTarget] = useState<SongRequestRow | null>(null);
  const [removeTarget, setRemoveTarget] = useState<SongRequestRow | null>(null);
  const [removing, setRemoving] = useState(false);
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
        .select("id, name, venue, dj_name, is_active, requests_status, allow_explicit, require_approval, cooldown_seconds, rules_text")
        .eq("room_code", code.toUpperCase())
        .maybeSingle();

      if (!ev) {
        toast.error("That event code doesn't exist. Double-check the code on the QR poster.");
        navigate("/join", { replace: true });
        return;
      }
      if (cancelled) return;
      if (ev.requests_status === "ended") {
        toast.info("This event has ended — you can still browse the played tracks.");
      }
      setEventInfo(ev as EventInfo);

      // Show welcome hint once per event per browser
      const hintKey = `decks-hint-${ev.id}`;
      if (!localStorage.getItem(hintKey)) {
        setShowHint(true);
        localStorage.setItem(hintKey, "1");
      }

      const nick = profile?.nickname || "Guest";
      const nowIso = new Date().toISOString();
      // Upsert participant row: avoids 409 on revisit, preserves joined_at, refreshes last_seen_at.
      await supabase
        .from("event_participants")
        .upsert(
          {
            event_id: ev.id,
            user_id: user.id,
            nickname: nick,
            joined_at: nowIso,
            last_seen_at: nowIso,
          },
          { onConflict: "event_id,user_id", ignoreDuplicates: true },
        )
        .then(() => null, () => null);

      // Always bump last_seen_at for returning guests (ignoreDuplicates skips update on conflict).
      await supabase
        .from("event_participants")
        .update({ last_seen_at: nowIso })
        .eq("event_id", ev.id)
        .eq("user_id", user.id)
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

  // Restore scroll position when returning from a user profile page (Back button).
  // Source of truth in priority order: location.state.scrollY, then sessionStorage.
  // We wait until `loading` is false so the song list has rendered and the page has height.
  const scrollRestoredRef = useRef(false);
  useEffect(() => {
    if (loading || scrollRestoredRef.current) return;
    const path = location.pathname + location.search;
    const key = `decks:scroll:${path}`;
    const stateY = (location.state as { scrollY?: number } | null)?.scrollY;
    let y: number | null = null;
    if (typeof stateY === "number" && stateY > 0) y = stateY;
    else {
      try {
        const stored = sessionStorage.getItem(key);
        if (stored) y = parseInt(stored, 10);
      } catch {
        /* ignore */
      }
    }
    if (y && y > 0) {
      requestAnimationFrame(() => window.scrollTo({ top: y!, behavior: "auto" }));
    }
    try { sessionStorage.removeItem(key); } catch { /* ignore */ }
    // Remember last event path so PublicProfile can fall back here after a refresh.
    try { sessionStorage.setItem("decks:lastEvent", path); } catch { /* ignore */ }
    scrollRestoredRef.current = true;
  }, [loading, location.pathname, location.search, location.state]);



  // Realtime: songs + event lifecycle, with mobile-friendly reconnect
  useEffect(() => {
    if (!eventInfo) return;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let backoff = 1000;
    let reconnectTimer: number | null = null;
    let cancelled = false;

    const refetch = async () => {
      const [{ data: reqs }] = await Promise.all([
        supabase.from("song_requests").select("*").eq("event_id", eventInfo.id),
      ]);
      if (!cancelled && reqs) setSongs(reqs as SongRequestRow[]);
    };

    const subscribe = () => {
      if (channel) supabase.removeChannel(channel);
      channel = supabase
        .channel(`event-${eventInfo.id}-${Date.now()}`)
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
        .subscribe((status) => {
          if (status === "SUBSCRIBED") {
            backoff = 1000;
          } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            if (reconnectTimer) window.clearTimeout(reconnectTimer);
            reconnectTimer = window.setTimeout(() => {
              if (!cancelled) {
                refetch();
                subscribe();
                backoff = Math.min(backoff * 2, 30000);
              }
            }, backoff);
          }
        });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) {
        refetch();
        subscribe();
      }
    };
    const onOnline = () => { if (!cancelled) { refetch(); subscribe(); } };

    subscribe();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      if (channel) supabase.removeChannel(channel);
    };
  }, [eventInfo?.id]);

  const nowPlaying = useMemo(() => songs.find((s) => s.status === "playing"), [songs]);

  // Live broadcast (DJ/Bridge) — used to auto-merge with a matching queue request.
  const { nowPlaying: broadcastNowPlaying } = useNowPlaying(eventInfo?.id);
  const matchedPlayingRequest = useMemo(() => {
    if (nowPlaying) return nowPlaying;
    if (!broadcastNowPlaying) return null;
    const key = normalizeKey(broadcastNowPlaying.title, broadcastNowPlaying.artist ?? "");
    return (
      songs.find(
        (s) =>
          s.status !== "removed" &&
          normalizeKey(s.title, s.artist) === key,
      ) ?? null
    );
  }, [nowPlaying, broadcastNowPlaying, songs]);

  // Boost-driven "dominating" / "battle" overlays are paused along with ENABLE_BOOSTS.
  // Queue ordering is strictly votes + recency + DJ actions — tips never affect placement.
  const battleIds = useMemo(() => new Set<string>(), []);

  const playedSongs = useMemo(() => {
    return songs
      .filter((s) => s.status === "played")
      .sort((a, b) => {
        const ta = +new Date(a.played_at || a.created_at);
        const tb = +new Date(b.played_at || b.created_at);
        return tb - ta;
      })
      .slice(0, 25);
  }, [songs]);

  const trending = useTrending(songs);
  const prevRanks = useRef<Map<string, number>>(new Map());

  const visibleSongs = useMemo(() => {
    let list = songs.filter(
      (s) => s.status !== "removed" && s.status !== "playing" && s.status !== "played" && s.status !== "skipped",
    );
    const q = search.trim().toLowerCase();
    if (q) list = list.filter((s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q));

    const ts = (s: SongRequestRow) => +new Date(s.created_at);

    if (sort === "top") {
      // TOP = votes only. Tips MUST NOT affect placement.
      // Tiebreakers: earlier request wins (FIFO fairness), then id for stability.
      const netVotes = (s: SongRequestRow) => s.upvotes - s.downvotes;
      list = [...list].sort((a, b) =>
        netVotes(b) - netVotes(a) ||
        ts(a) - ts(b) ||
        a.id.localeCompare(b.id),
      );
    } else {
      // TRENDING = recent upvote velocity. No boost/tip term.
      list = [...list].sort((a, b) => {
        const sa = trending.scoreMap.get(a.id) ?? 0;
        const sb = trending.scoreMap.get(b.id) ?? 0;
        return (
          sb - sa ||
          ts(b) - ts(a) ||
          a.id.localeCompare(b.id)
        );
      });
    }
    return list;
  }, [songs, sort, search, trending]);

  // Track previous rank per sort mode for movement arrows
  const movementMap = useMemo(() => {
    const m = new Map<string, "up" | "down" | "same" | "new">();
    visibleSongs.forEach((s, i) => {
      const prev = prevRanks.current.get(`${sort}:${s.id}`);
      if (prev === undefined) m.set(s.id, "new");
      else if (i < prev) m.set(s.id, "up");
      else if (i > prev) m.set(s.id, "down");
      else m.set(s.id, "same");
    });
    return m;
  }, [visibleSongs, sort]);

  useEffect(() => {
    const next = new Map<string, number>();
    visibleSongs.forEach((s, i) => next.set(`${sort}:${s.id}`, i));
    prevRanks.current = next;
  }, [visibleSongs, sort]);

  const handleVote = async (songId: string, value: 1 | -1) => {
    if (!user) return;
    if (eventInfo?.requests_status === "ended") {
      toast.error("Voting closed — this event has ended");
      return;
    }
    // Per-song debounce: ignore taps while a vote request is in flight
    if (pendingVotes[songId]) return;

    const prevVote = myVotes[songId];
    const isToggleOff = prevVote === value;

    // Compute optimistic delta for upvotes/downvotes counters
    const upDelta =
      (value === 1 && !isToggleOff ? 1 : 0) - (prevVote === 1 ? 1 : 0);
    const downDelta =
      (value === -1 && !isToggleOff ? 1 : 0) - (prevVote === -1 ? 1 : 0);

    // Lock this song's vote buttons
    setPendingVotes((p) => ({ ...p, [songId]: true }));

    // Optimistic UI: vote button + score
    setMyVotes((prev) => {
      const n = { ...prev };
      if (isToggleOff) delete n[songId];
      else n[songId] = value;
      return n;
    });
    setSongs((prev) =>
      prev.map((s) =>
        s.id === songId
          ? { ...s, upvotes: Math.max(0, s.upvotes + upDelta), downvotes: Math.max(0, s.downvotes + downDelta) }
          : s,
      ),
    );

    try {
      if (isToggleOff) {
        const { error } = await supabase
          .from("votes")
          .delete()
          .eq("song_request_id", songId)
          .eq("user_id", user.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from("votes")
          .upsert(
            { song_request_id: songId, user_id: user.id, value },
            { onConflict: "song_request_id,user_id" },
          );
        if (error) throw error;
      }
    } catch (err) {
      // Rollback optimistic state on failure
      setMyVotes((prev) => {
        const n = { ...prev };
        if (prevVote) n[songId] = prevVote;
        else delete n[songId];
        return n;
      });
      setSongs((prev) =>
        prev.map((s) =>
          s.id === songId
            ? { ...s, upvotes: Math.max(0, s.upvotes - upDelta), downvotes: Math.max(0, s.downvotes - downDelta) }
            : s,
        ),
      );
      const msg = (err as { message?: string })?.message ?? "Vote failed";
      toast.error(`Vote failed: ${msg}`);
    } finally {
      setPendingVotes((p) => {
        const n = { ...p };
        delete n[songId];
        return n;
      });
    }
  };

  const handleConfirmRemove = async () => {
    if (!removeTarget) return;
    setRemoving(true);
    const target = removeTarget;
    try {
      const { error } = await supabase.rpc("remove_my_song_request", { _song_request_id: target.id });
      if (error) throw error;
      // Soft-delete: mark as removed locally so it disappears from visible lists (filters drop status === "removed")
      setSongs((prev) => prev.map((s) => (s.id === target.id ? { ...s, status: "removed" as const } : s)));
      toast.success("Request removed. Cooldown still applies.");
      setRemoveTarget(null);
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? "";
      if (/can't be removed|cannot be removed|only remove|not authenticated/i.test(msg)) {
        toast.error("This request can't be removed anymore.");
      } else {
        toast.error(msg || "Could not remove request");
      }
    } finally {
      setRemoving(false);
    }
  };



  const handleRequestSong = async (song: MusicSearchResult) => {
    if (!user || !eventInfo) return;
    if (eventInfo.requests_status !== "live") {
      toast.error(eventInfo.requests_status === "paused" ? "Requests are paused" : "Event has ended");
      return;
    }

    // Block explicit if event disallows
    if (!eventInfo.allow_explicit && song.explicit) {
      toast.error("This event isn't accepting explicit songs.");
      return;
    }

    // Client-side cooldown
    const cooldown = eventInfo.cooldown_seconds ?? 30;
    const elapsed = (Date.now() - lastRequestAt) / 1000;
    if (cooldown > 0 && elapsed < cooldown) {
      toast.error(`Slow down! Try again in ${Math.ceil(cooldown - elapsed)}s`);
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
        external_url:
          (song.external_url && song.external_url.trim()) ||
          `https://music.apple.com/us/search?term=${encodeURIComponent(`${song.title} ${song.artist}`.trim())}`,
      })
      .select()
      .single();

    if (error) {
      if (error.code === "23505") toast.error("Already requested — vote for it!");
      else if (error.code === "42501" || /row-level security|violates row-level/i.test(error.message)) {
        const cd = eventInfo.cooldown_seconds ?? 30;
        toast.error(`Hold on — you can request again in ${cd}s, or this song may be blocked by the DJ.`);
      } else toast.error(error.message);
      return;
    }

    setLastRequestAt(Date.now());

    if (inserted) {
      await supabase.from("votes").upsert({ song_request_id: inserted.id, user_id: user.id, value: 1 });
      setMyVotes((p) => ({ ...p, [inserted.id]: 1 }));
    }

    toast.success("Song requested! +1 pt 🎶", { icon: <PartyPopper className="h-4 w-4" /> });
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
    <div className="min-h-screen pb-28 sm:pb-10" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 6rem)" }}>
      <SEO title="Live event" description="Request songs, vote, and boost your favorites in real time on Decks." path="/event" noindex />
      <AppHeader />
      <div className="container max-w-3xl px-4 sm:px-6 py-5 sm:py-10">
        {/* Event header */}
        <div className="mb-5 sm:mb-7 p-5 sm:p-7 rounded-3xl glass-strong relative overflow-hidden">
          <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-primary/8 via-transparent to-accent/4 pointer-events-none" />
          <div className="relative">
            <div className="flex items-center justify-between gap-2 mb-3">
              <StatusBadge status={status} />
              <div className="flex items-center gap-1.5">
                <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 rounded-full gap-1">
                  <Sparkles className="h-3 w-3" />{profile?.points ?? 0} pts
                </Badge>
              </div>
            </div>
            <h1 className="text-[26px] sm:text-3xl font-semibold leading-tight tracking-tight">{eventInfo.name}</h1>
            <p className="text-[14px] text-muted-foreground mt-1.5">
              {eventInfo.venue ? `${eventInfo.venue} · ` : ""}with DJ {eventInfo.dj_name}
            </p>
            <div className="mt-4 inline-flex items-center px-3 py-1 rounded-full bg-secondary/70 text-[11px] font-mono tracking-wider text-muted-foreground">
              {code}
            </div>
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

        {/* Event rules chips */}
        {isLive && (
          <div className="mb-4 flex flex-wrap items-center gap-1.5 text-xs">
            <Badge variant="secondary" className={eventInfo.allow_explicit ? "" : "bg-amber-500/15 text-amber-300 border-amber-500/30"}>
              {eventInfo.allow_explicit ? "Explicit OK" : "No explicit"}
            </Badge>
            <Badge variant="secondary" className={eventInfo.require_approval ? "bg-accent/15 text-accent border-accent/30" : ""}>
              {eventInfo.require_approval ? "DJ approves first" : "Open requests"}
            </Badge>
            {eventInfo.cooldown_seconds > 0 && (
              <Badge variant="secondary">{eventInfo.cooldown_seconds}s cooldown</Badge>
            )}
            {eventInfo.rules_text && (
              <span className="text-muted-foreground italic ml-1 truncate">{eventInfo.rules_text}</span>
            )}
          </div>
        )}

        {/* Single hero Now Playing — merges DJ broadcast + matched queue request */}
        {eventInfo?.id && (
          <NowPlayingDisplay
            eventId={eventInfo.id}
            matchedRequest={matchedPlayingRequest}
            fallbackRequest={nowPlaying ?? null}
          />
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
                title={isPaused ? "Requests are paused by the DJ" : isEnded ? "Event has ended" : undefined}
                variant="premium"
                className="shrink-0"
              >
                <Plus className="mr-1 h-4 w-4" /> Request
              </Button>
            </DialogTrigger>
            <DialogContent className="p-0 gap-0 w-[calc(100vw-1rem)] max-w-lg max-h-[90dvh] flex flex-col overflow-hidden sm:rounded-3xl border-white/[0.08]">
              <DialogHeader className="px-4 pt-4 pb-2 shrink-0 text-left">
                <DialogTitle className="pr-8">Request a song</DialogTitle>
              </DialogHeader>
              <RequestPicker onPick={handleRequestSong} existing={songs} allowExplicit={eventInfo.allow_explicit} />
            </DialogContent>
          </Dialog>
        </div>

        {/* Boost FX paused with ENABLE_BOOSTS=false. Tips never affect placement. */}

        {/* Sort tabs */}
        <Tabs value={sort} onValueChange={(v) => setSort(v as SortMode)} className="mb-4">
          <TabsList className="grid grid-cols-3 w-full rounded-full bg-secondary/60 p-1 h-10">
            <TabsTrigger value="top" className="rounded-full"><Sparkles className="h-3.5 w-3.5 mr-1.5" />Top</TabsTrigger>
            <TabsTrigger value="trending" className="rounded-full">🔥 Trending</TabsTrigger>
            <TabsTrigger value="played" className="rounded-full"><CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />Played</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Song list */}
        {sort === "played" ? (
          playedSongs.length === 0 ? (
            <div className="text-center py-16 px-4 rounded-2xl border border-dashed border-border/60">
              <CheckCircle2 className="h-10 w-10 text-muted-foreground/50 mx-auto mb-3" />
              <p className="font-medium">No songs played yet.</p>
              <p className="text-sm text-muted-foreground">Played tracks appear here once the DJ spins them.</p>
            </div>
          ) : (
            <div className="space-y-2 opacity-95">
              {playedSongs.map((s) => (
                <div key={s.id} className="space-y-1">
                  <SongRequestCard song={s} eventId={eventInfo?.id} myVote={myVotes[s.id] ?? 0} />
                  {s.played_by_source === "bridge" && (
                    <p className="pl-2 text-[11px] text-muted-foreground/70 italic">
                      Auto-marked played by Decks Bridge
                    </p>
                  )}
                </div>
              ))}
            </div>
          )
        ) : visibleSongs.length === 0 ? (
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
                eventId={eventInfo?.id}
                myVote={myVotes[s.id] ?? 0}

                onVote={(v) => handleVote(s.id, v)}
                onTip={isLive ? () => setBoostTarget(s) : undefined}
                onRemove={s.requested_by === user?.id && s.status === "pending" ? () => setRemoveTarget(s) : undefined}
                onReport={user && s.requested_by !== user.id ? () => setReportTarget(s) : undefined}
                disabled={!!pendingVotes[s.id]}
                battle={battleIds.has(s.id)}
                trending={sort === "trending" && trending.hotIds.has(s.id)}
                movement={sort === "trending" ? movementMap.get(s.id) : undefined}
              />
            ))}
          </div>
        )}
      </div>

      {/* Boost FX overlay removed — paused with ENABLE_BOOSTS=false */}

      {/* Mobile sticky request CTA */}
      {isLive && (
        <div className="sm:hidden fixed inset-x-4 z-30 bottom-safe">
          <Button
            onClick={() => setRequestOpen(true)}
            variant="premium"
            className="w-full h-12 shadow-elevated"
          >
            <Plus className="mr-2 h-5 w-5" /> Request a song
          </Button>
        </div>
      )}

      {boostTarget && (
        <TipDialog
          open={!!boostTarget}
          onOpenChange={(o) => !o && setBoostTarget(null)}
          eventId={eventInfo?.id ?? null}
          djName={eventInfo?.dj_name ?? null}
          songTitle={`${boostTarget.title} — ${boostTarget.artist}`}
        />
      )}

      {reportTarget && (
        <ReportDialog
          open={!!reportTarget}
          onOpenChange={(o) => !o && setReportTarget(null)}
          targetType="request"
          targetId={reportTarget.id}
          eventId={eventInfo?.id ?? null}
          contextLabel={`${reportTarget.title} — ${reportTarget.artist}`}
        />
      )}


      <AlertDialog open={!!removeTarget} onOpenChange={(o) => !o && !removing && setRemoveTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove this pending request?</AlertDialogTitle>
            <AlertDialogDescription>
              The request cooldown still applies — you can request another song once it expires.
              {removeTarget && (
                <span className="block mt-2 text-foreground/80 font-medium">
                  {removeTarget.title} — {removeTarget.artist}
                </span>
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={removing}>Keep it</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleConfirmRemove(); }}
              disabled={removing}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {removing ? "Removing…" : "Remove"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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

function RequestPicker({ onPick, existing, allowExplicit = true }: { onPick: (song: MusicSearchResult) => void; existing: SongRequestRow[]; allowExplicit?: boolean }) {
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [results, setResults] = useState<MusicSearchResult[]>([]);
  const [provider, setProvider] = useState<"spotify" | "itunes" | "none">("none");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(false);
  const [rateLimited, setRateLimited] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 500);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    if (!debounced || debounced.length < 2) {
      setResults([]);
      setProvider("none");
      setLoading(false);
      setError(false);
      setRateLimited(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(false);
    setRateLimited(false);
    (async () => {
      try {
        const res = await searchMusic(debounced);
        if (cancelled) return;
        setResults(res.results);
        setProvider(res.provider);
      } catch (e) {
        if (cancelled) return;
        if (e instanceof RateLimitedError) {
          setRateLimited(true);
        } else {
          setError(true);
        }
        setResults([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [debounced]);

  const isAlreadyRequested = (s: MusicSearchResult) =>
    existing.some(
      (e) => {
        if (e.status === "removed") return false;
        if (s.source_song_id && e.source_song_id && e.source_song_id === s.source_song_id) return true;
        return normalizeKey(e.title, e.artist) === normalizeKey(s.title, s.artist);
      },
    );

  const hasQuery = debounced.length >= 2;
  const showInitialEmpty = !hasQuery && !loading;
  const showNoResults = hasQuery && !loading && !error && !rateLimited && results.length === 0;
  const showError = hasQuery && !loading && error;
  const showRateLimited = hasQuery && !loading && rateLimited;
  const showLoadingSkeleton = loading && results.length === 0;

  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-4 pb-2 shrink-0">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            autoFocus
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search any song or artist..."
            className="pl-9 h-11"
          />
          {loading && (
            <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
          )}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto scrollbar-thin px-2 space-y-1 overscroll-contain">
        {showInitialEmpty && (
          <div className="text-center py-12 px-6">
            <Music className="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
            <p className="text-sm font-medium">Find a track to request</p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Search by song title or artist. Real catalog — no fake data.
            </p>
          </div>
        )}

        {showLoadingSkeleton && (
          <div className="space-y-1">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex items-center gap-2.5 p-2">
                <div className="h-11 w-11 rounded-md bg-muted animate-pulse shrink-0" />
                <div className="flex-1 space-y-1.5">
                  <div className="h-3 w-2/3 rounded bg-muted animate-pulse" />
                  <div className="h-2.5 w-1/2 rounded bg-muted animate-pulse" />
                </div>
              </div>
            ))}
          </div>
        )}

        {showNoResults && (
          <ManualFallback query={debounced} onPick={onPick} />
        )}

        {showError && (
          <div className="text-center py-12 px-6">
            <Search className="h-8 w-8 text-destructive/60 mx-auto mb-2" />
            <p className="text-sm font-medium">Search is unavailable right now</p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Check your connection and try again in a moment.
            </p>
            <ManualFallback query={debounced} onPick={onPick} compact />
          </div>
        )}

        {showRateLimited && (
          <div className="text-center py-12 px-6">
            <Loader2 className="h-8 w-8 text-muted-foreground/60 mx-auto mb-2" />
            <p className="text-sm font-medium">Search is busy. Try again in a moment.</p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              You've searched a lot in the last minute. Wait a few seconds and try again.
            </p>
          </div>
        )}



        {results.map((s) => {
          const already = isAlreadyRequested(s);
          const dur = formatDuration(s.duration_ms);
          const key = `${s.source_platform}-${s.source_song_id ?? `${s.title}-${s.artist}`}`;
          return (
            <div
              key={key}
              className="flex items-center gap-2.5 p-2 rounded-lg hover:bg-secondary/60 active:bg-secondary/80 transition-colors"
            >
              <div className="h-11 w-11 rounded-md overflow-hidden bg-muted shrink-0">
                {s.album_art_url ? (
                  <img src={s.album_art_url} alt="" className="h-full w-full object-cover" loading="lazy" />
                ) : (
                  <div className="h-full w-full bg-gradient-to-br from-primary/40 to-accent/40" />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="font-medium truncate text-sm">{s.title}</span>
                  {s.explicit && (
                    <span className="text-[9px] font-bold px-1 rounded bg-muted text-muted-foreground border border-border shrink-0">E</span>
                  )}
                </div>
                <div className="text-xs text-muted-foreground truncate">{s.artist}</div>
                <div className="text-[11px] text-muted-foreground/70 truncate">
                  {s.album}{dur && ` · ${dur}`} · {platformLabel(s.source_platform)}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {s.preview_url && <PreviewButton src={s.preview_url} size="icon" />}
                {already ? (
                  <Badge variant="secondary" className="text-[10px]">Added</Badge>
                ) : !allowExplicit && s.explicit ? (
                  <Badge variant="secondary" className="text-[10px] bg-amber-500/15 text-amber-300 border-amber-500/30">Blocked</Badge>
                ) : (
                  <Button size="sm" onClick={() => onPick(s)} variant="premium" className="h-9 w-9 p-0" aria-label={`Request ${s.title}`}>
                    <Plus className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <p
        className="px-4 pt-2 text-[11px] text-muted-foreground border-t border-border/50 shrink-0"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 0.625rem)" }}
      >
        {provider !== "none"
          ? `Catalog: ${platformLabel(provider)} · DJ plays from their own setup.`
          : "Live catalog · DJ plays from their own setup."}
      </p>
    </div>
  );
}

function ManualFallback({
  query,
  onPick,
  compact = false,
}: {
  query: string;
  onPick: (song: MusicSearchResult) => void;
  compact?: boolean;
}) {
  // Best-effort split of "title - artist" or "title by artist"
  const guess = (() => {
    const byMatch = query.match(/^(.*?)\s+by\s+(.+)$/i);
    if (byMatch) return { title: byMatch[1].trim(), artist: byMatch[2].trim() };
    if (query.includes(" - ")) {
      const [a, b] = query.split(" - ").map((s) => s.trim());
      return { title: a, artist: b };
    }
    return { title: query, artist: "" };
  })();

  const [title, setTitle] = useState(guess.title);
  const [artist, setArtist] = useState(guess.artist);
  const [link, setLink] = useState("");
  const [open, setOpen] = useState(false);

  const submit = () => {
    const t = title.trim();
    const a = artist.trim();
    if (!t || !a) {
      toast.error("Title and artist required");
      return;
    }
    const ext = link.trim();
    const isSpotify = /open\.spotify\.com\/track\//.test(ext);
    const isApple = /music\.apple\.com\//.test(ext);
    onPick({
      source_song_id: null,
      source_platform: isSpotify ? "spotify" : isApple ? "itunes" : "manual",
      title: t,
      artist: a,
      album: "",
      album_art_url: null,
      duration_ms: 0,
      preview_url: null,
      external_url: ext || `https://music.apple.com/us/search?term=${encodeURIComponent(`${t} ${a}`)}`,
      explicit: false,
    } as unknown as MusicSearchResult);
  };

  const sp = `https://open.spotify.com/search/${encodeURIComponent(query)}`;
  const ap = `https://music.apple.com/us/search?term=${encodeURIComponent(query)}`;

  if (!open) {
    return (
      <div className={compact ? "mt-4" : "text-center py-10 px-6"}>
        {!compact && (
          <>
            <Search className="h-8 w-8 text-muted-foreground/40 mx-auto mb-2" />
            <p className="text-sm font-medium">No matches for &ldquo;{query}&rdquo;</p>
            <p className="text-xs text-muted-foreground/80 mt-1">
              Try the artist name, or request it manually below.
            </p>
          </>
        )}
        <div className="flex flex-col items-center gap-2 mt-4">
          <Button size="sm" variant="premium" onClick={() => setOpen(true)} className="w-full max-w-xs">
            Request manually
          </Button>
          <div className="flex gap-2 mt-1">
            <a
              href={ap}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Search Apple Music
            </a>
            <span className="text-xs text-muted-foreground/40">·</span>
            <a
              href={sp}
              target="_blank"
              rel="noreferrer"
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2"
            >
              Search Spotify
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="px-4 py-4 space-y-2">
      <p className="text-xs text-muted-foreground">Manual request — the DJ sees title, artist, and your link.</p>
      <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Song title" />
      <Input value={artist} onChange={(e) => setArtist(e.target.value)} placeholder="Artist" />
      <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="Spotify / Apple Music link (optional)" />
      <div className="flex gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={() => setOpen(false)} className="flex-1">
          Cancel
        </Button>
        <Button size="sm" variant="premium" onClick={submit} className="flex-1">
          Send request
        </Button>
      </div>
    </div>
  );
}

export default EventPage;


