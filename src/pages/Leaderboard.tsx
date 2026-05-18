import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import {
  Loader2,
  Trophy,
  Crown,
  ArrowLeft,
  Sparkles,
  Music2,
  ThumbsUp,
  Flame,
  TrendingUp,
  TrendingDown,
  Minus,
  Share2,
  Headphones,
  Mic2,
  Heart,
  Zap,
  Star,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { toast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";

type EventOption = { id: string; name: string; room_code: string; venue: string | null };

type GuestRow = {
  user_id: string | null;
  nickname: string;
  requests: number;
  upvotes: number;
  downvotes: number;
  boost: number;
  played: number;
  influence: number;
  approval: number; // 0..1
  badges: string[];
};

type SongRow = {
  id: string;
  title: string;
  artist: string;
  album_art: string | null;
  upvotes: number;
  downvotes: number;
  boost: number;
  played: boolean;
  requester_name: string;
  requested_by: string | null;
};

type DjRow = {
  dj_id: string;
  dj_name: string;
  rooms: number;
  requests_played: number;
  total_boost: number;
  total_upvotes: number;
  vibe: number;
  title: string;
};

const GUEST_TITLES: { min: number; title: string; icon: string }[] = [
  { min: 500, title: "Aux God", icon: "👑" },
  { min: 300, title: "Crowd Controller", icon: "🎛️" },
  { min: 180, title: "Dancefloor Demon", icon: "🔥" },
  { min: 100, title: "Hitmaker", icon: "💎" },
  { min: 60, title: "Certified Vibe Curator", icon: "🌀" },
  { min: 30, title: "Taste Maker", icon: "🎧" },
  { min: 10, title: "Party Architect", icon: "✦" },
  { min: 0, title: "Late Night Legend", icon: "✨" },
];

const DJ_TITLES: { min: number; title: string }[] = [
  { min: 1500, title: "Decks Certified" },
  { min: 800, title: "Vibe General" },
  { min: 400, title: "Crowd Commander" },
  { min: 150, title: "Elite Selector" },
  { min: 50, title: "Club Architect" },
  { min: 0, title: "Main Character DJ" },
];

const guestTitleFor = (influence: number) => GUEST_TITLES.find((t) => influence >= t.min)!;
const djTitleFor = (vibe: number) => DJ_TITLES.find((t) => vibe >= t.min)!.title;

const RankBadge = ({ rank }: { rank: number }) => {
  if (rank === 1)
    return (
      <div className="relative h-9 w-9 rounded-full grid place-items-center bg-gradient-to-br from-yellow-300 to-amber-500 text-black shadow-[0_0_22px_-2px_hsl(45_100%_55%/0.7)]">
        <Crown className="h-4.5 w-4.5" strokeWidth={2.2} />
      </div>
    );
  if (rank === 2)
    return (
      <div className="h-9 w-9 rounded-full grid place-items-center bg-gradient-to-br from-slate-200 to-slate-400 text-black shadow-[0_0_18px_-4px_hsl(0_0%_80%/0.6)]">
        <span className="text-sm font-bold">2</span>
      </div>
    );
  if (rank === 3)
    return (
      <div className="h-9 w-9 rounded-full grid place-items-center bg-gradient-to-br from-orange-300 to-amber-700 text-black shadow-[0_0_18px_-4px_hsl(28_80%_55%/0.6)]">
        <span className="text-sm font-bold">3</span>
      </div>
    );
  return (
    <div className="h-9 w-9 rounded-full grid place-items-center bg-secondary/60 text-muted-foreground font-mono text-sm tabular-nums">
      {rank}
    </div>
  );
};

const TrendArrow = ({ delta }: { delta: number | null }) => {
  if (delta === null) return <span className="w-4" />;
  if (delta > 0)
    return (
      <span className="inline-flex items-center text-success text-[11px] font-semibold tabular-nums animate-fade-in">
        <TrendingUp className="h-3 w-3 mr-0.5" />
        {delta}
      </span>
    );
  if (delta < 0)
    return (
      <span className="inline-flex items-center text-destructive text-[11px] font-semibold tabular-nums animate-fade-in">
        <TrendingDown className="h-3 w-3 mr-0.5" />
        {Math.abs(delta)}
      </span>
    );
  return (
    <span className="inline-flex items-center text-muted-foreground/60 text-[11px]">
      <Minus className="h-3 w-3" />
    </span>
  );
};

const Leaderboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const eventIdParam = params.get("event");

  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(eventIdParam);
  const [guests, setGuests] = useState<GuestRow[]>([]);
  const [songs, setSongs] = useState<SongRow[]>([]);
  const [djs, setDjs] = useState<DjRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"influence" | "favs" | "hitmakers" | "boosted" | "djs">("influence");

  const prevRanksRef = useRef<Map<string, number>>(new Map());
  const [rankDeltas, setRankDeltas] = useState<Map<string, number>>(new Map());

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("events")
        .select("id, name, room_code, venue, is_active, created_at")
        .order("is_active", { ascending: false })
        .order("created_at", { ascending: false });
      const list = (data ?? []) as EventOption[];
      setEvents(list);
      if (!selectedEventId && list.length) {
        setSelectedEventId(list[0].id);
        setParams({ event: list[0].id }, { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Load DJ leaderboard (global, not event-specific)
  useEffect(() => {
    (async () => {
      const { data: evs } = await supabase
        .from("events")
        .select("id, dj_id, dj_name");
      if (!evs?.length) return;
      const { data: reqs } = await supabase
        .from("song_requests")
        .select("event_id, status, upvotes, boost");

      const byDj = new Map<string, DjRow>();
      const eventByDj = new Map<string, Set<string>>();
      for (const e of evs) {
        if (!eventByDj.has(e.dj_id)) eventByDj.set(e.dj_id, new Set());
        eventByDj.get(e.dj_id)!.add(e.id);
        if (!byDj.has(e.dj_id)) {
          byDj.set(e.dj_id, {
            dj_id: e.dj_id,
            dj_name: e.dj_name || "DJ",
            rooms: 0,
            requests_played: 0,
            total_boost: 0,
            total_upvotes: 0,
            vibe: 0,
            title: "",
          });
        }
      }
      const eventToDj = new Map<string, string>(evs.map((e) => [e.id, e.dj_id]));
      for (const r of reqs ?? []) {
        const dj = eventToDj.get(r.event_id);
        if (!dj) continue;
        const row = byDj.get(dj)!;
        if (r.status === "played") row.requests_played += 1;
        row.total_boost += r.boost ?? 0;
        row.total_upvotes += r.upvotes ?? 0;
      }
      const out: DjRow[] = [];
      byDj.forEach((row, dj) => {
        row.rooms = eventByDj.get(dj)?.size ?? 0;
        row.vibe =
          row.requests_played * 10 + row.total_boost * 3 + row.total_upvotes * 2 + row.rooms * 25;
        row.title = djTitleFor(row.vibe);
        out.push(row);
      });
      out.sort((a, b) => b.vibe - a.vibe);
      setDjs(out);
    })();
  }, []);

  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    setLoading(true);

    const load = async () => {
      const { data: reqs } = await supabase
        .from("song_requests")
        .select("id, requested_by, requester_name, title, artist, album_art, upvotes, downvotes, boost, status, played_at")
        .eq("event_id", selectedEventId);

      if (cancelled) return;
      const songRows: SongRow[] = (reqs ?? []).map((r: any) => ({
        id: r.id,
        title: r.title,
        artist: r.artist,
        album_art: r.album_art,
        upvotes: r.upvotes,
        downvotes: r.downvotes,
        boost: r.boost,
        played: r.status === "played" || !!r.played_at,
        requester_name: r.requester_name || "Guest",
        requested_by: r.requested_by,
      }));
      setSongs(songRows);

      const map = new Map<string, GuestRow>();
      for (const r of (reqs ?? []) as any[]) {
        const key = r.requested_by ?? `anon:${r.requester_name}`;
        const existing =
          map.get(key) ??
          ({
            user_id: r.requested_by,
            nickname: r.requester_name || "Guest",
            requests: 0,
            upvotes: 0,
            downvotes: 0,
            boost: 0,
            played: 0,
            influence: 0,
            approval: 0,
            badges: [],
          } as GuestRow);
        existing.requests += 1;
        existing.upvotes += r.upvotes ?? 0;
        existing.downvotes += r.downvotes ?? 0;
        existing.boost += r.boost ?? 0;
        if (r.status === "played" || r.played_at) existing.played += 1;
        map.set(key, existing);
      }

      // Fetch nicknames from profiles (privacy: never expose email)
      const userIds = Array.from(map.values()).map((r) => r.user_id).filter(Boolean) as string[];
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, nickname")
          .in("id", userIds);
        for (const p of profs ?? []) {
          const row = Array.from(map.values()).find((r) => r.user_id === p.id);
          if (row && p.nickname) row.nickname = p.nickname;
        }
      }

      const computed: GuestRow[] = Array.from(map.values()).map((r) => {
        const total = r.upvotes + r.downvotes;
        const approval = total > 0 ? r.upvotes / total : 0;
        const influence =
          r.upvotes * 2 + r.boost * 3 + r.played * 10 + r.requests * 1 - r.downvotes * 1;
        const badges: string[] = [];
        if (r.played >= 1) badges.push("Song Played");
        if (r.played >= 3) badges.push("3 Played Tonight");
        if (r.upvotes >= 100) badges.push("100 Upvotes");
        if (r.boost >= 50) badges.push("Big Spender");
        if (approval >= 0.9 && r.upvotes >= 10) badges.push("Crowd Favorite");
        return { ...r, influence: Math.max(0, influence), approval, badges };
      });

      if (!cancelled) {
        // compute rank delta vs previous
        const sortedByInfluence = [...computed].sort((a, b) => b.influence - a.influence);
        const newDeltas = new Map<string, number>();
        sortedByInfluence.forEach((r, i) => {
          const key = r.user_id ?? `anon:${r.nickname}`;
          const prev = prevRanksRef.current.get(key);
          if (prev !== undefined) newDeltas.set(key, prev - (i + 1));
        });
        const nextRanks = new Map<string, number>();
        sortedByInfluence.forEach((r, i) => {
          const key = r.user_id ?? `anon:${r.nickname}`;
          nextRanks.set(key, i + 1);
        });
        prevRanksRef.current = nextRanks;
        setRankDeltas(newDeltas);

        setGuests(computed);
        setLoading(false);
      }
    };

    load();

    const channel = supabase
      .channel(`leaderboard-${selectedEventId}-${Date.now()}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "song_requests", filter: `event_id=eq.${selectedEventId}` },
        () => load(),
      )
      .on("postgres_changes", { event: "*", schema: "public", table: "votes" }, () => load())
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [selectedEventId]);

  const sortedByTab = useMemo(() => {
    const arr = [...guests];
    if (tab === "favs") arr.sort((a, b) => b.approval - a.approval || b.upvotes - a.upvotes);
    else if (tab === "hitmakers") arr.sort((a, b) => b.played - a.played || b.influence - a.influence);
    else arr.sort((a, b) => b.influence - a.influence);
    return arr;
  }, [guests, tab]);

  const boostedSongs = useMemo(
    () => [...songs].sort((a, b) => b.boost - a.boost).filter((s) => s.boost > 0),
    [songs],
  );

  const mostPlayed = useMemo(() => {
    const arr = [...guests].sort((a, b) => b.played - a.played);
    return arr[0] && arr[0].played > 0 ? arr[0] : null;
  }, [guests]);

  const mostBoosted = useMemo(() => boostedSongs[0] ?? null, [boostedSongs]);

  const crowdFavorite = useMemo(() => {
    const arr = [...guests].filter((g) => g.upvotes >= 5);
    arr.sort((a, b) => b.approval - a.approval);
    return arr[0] ?? null;
  }, [guests]);

  const topInfluence = useMemo(() => {
    const arr = [...guests].sort((a, b) => b.influence - a.influence);
    return arr[0] ?? null;
  }, [guests]);

  const me = useMemo(() => {
    if (!user) return null;
    return guests.find((r) => r.user_id === user.id) ?? null;
  }, [guests, user]);

  const myRank = useMemo(() => {
    if (!user) return null;
    const idx = sortedByTab.findIndex((r) => r.user_id === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [sortedByTab, user]);

  const handleEventChange = (id: string) => {
    setSelectedEventId(id);
    setParams({ event: id }, { replace: true });
  };

  const currentEvent = events.find((e) => e.id === selectedEventId);

  const handleShare = async () => {
    if (!me || !currentEvent) return;
    const title = guestTitleFor(me.influence);
    const text = `I'm #${myRank} ${title.icon} ${title.title} at ${currentEvent.name} on Decks — ${me.influence} influence, ${me.upvotes} crowd upvotes, ${me.played} songs played.`;
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (navigator.share) {
        await navigator.share({ title: "My Decks rank", text, url });
      } else {
        await navigator.clipboard.writeText(`${text} ${url}`);
        toast({ title: "Copied to clipboard", description: "Paste it anywhere to flex." });
      }
    } catch {
      /* user cancelled */
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <SEO title="Leaderboard" description="See who's dominating the dancefloor — top requesters, biggest boosters, and live crowd influence on Decks." path="/leaderboard" />
      <AppHeader />
      <main className="container max-w-3xl py-8 sm:py-10 space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-3 -ml-3">
            <Link to="/">
              <ArrowLeft className="h-4 w-4 mr-1" />
              Back
            </Link>
          </Button>
          <h1 className="text-[28px] sm:text-3xl font-semibold tracking-tight flex items-center gap-2.5">
            <Trophy className="h-7 w-7 text-primary" strokeWidth={1.75} />
            Leaderboard
          </h1>
          <p className="text-muted-foreground text-[15px] mt-1.5">
            Climb the ranks. Earn your title. Run the room.
          </p>
        </div>

        <div className="surface-1 p-4">
          <Select value={selectedEventId ?? undefined} onValueChange={handleEventChange}>
            <SelectTrigger>
              <SelectValue placeholder="Select an event" />
            </SelectTrigger>
            <SelectContent>
              {events.map((e) => (
                <SelectItem key={e.id} value={e.id}>
                  {e.name} {e.venue ? `· ${e.venue}` : ""} ({e.room_code})
                </SelectItem>
              ))}
              {!events.length && (
                <SelectItem value="none" disabled>
                  No events yet
                </SelectItem>
              )}
            </SelectContent>
          </Select>
        </div>

        {/* Currently dominating */}
        {topInfluence && tab !== "djs" && (
          <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-accent/10 p-5 shadow-[0_0_40px_-12px_hsl(322_70%_60%/0.4)]">
            <div className="absolute -top-12 -right-12 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
            <div className="relative flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-yellow-300 to-amber-500 grid place-items-center text-black shadow-[0_0_30px_-2px_hsl(45_100%_55%/0.8)] animate-scale-in">
                <Crown className="h-7 w-7" strokeWidth={2.2} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-widest text-primary/80 font-semibold">
                  Currently dominating
                </div>
                <div className="text-xl font-bold truncate">{topInfluence.nickname}</div>
                <div className="text-xs text-muted-foreground">
                  {guestTitleFor(topInfluence.influence).icon} {guestTitleFor(topInfluence.influence).title}
                </div>
              </div>
              <div className="text-right">
                <div className="text-2xl font-bold tabular-nums text-primary">{topInfluence.influence}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">influence</div>
              </div>
            </div>
          </div>
        )}

        {/* Highlight cards */}
        {tab !== "djs" && (
          <div className="grid grid-cols-2 gap-3">
            <HighlightCard
              icon={<Flame className="h-4 w-4" />}
              label="Most Played Tonight"
              title={mostPlayed?.nickname ?? "—"}
              value={mostPlayed ? `${mostPlayed.played} song${mostPlayed.played === 1 ? "" : "s"}` : "Nothing yet"}
              tone="orange"
            />
            <HighlightCard
              icon={<Sparkles className="h-4 w-4" />}
              label="Most Boosted"
              title={mostBoosted?.title ?? "—"}
              value={mostBoosted ? `+${mostBoosted.boost} by ${mostBoosted.requester_name}` : "No boosts yet"}
              tone="pink"
            />
            <HighlightCard
              icon={<Heart className="h-4 w-4" />}
              label="Crowd Favorite"
              title={crowdFavorite?.nickname ?? "—"}
              value={crowdFavorite ? `${Math.round(crowdFavorite.approval * 100)}% approval` : "—"}
              tone="red"
            />
            <HighlightCard
              icon={<Star className="h-4 w-4" />}
              label="Highest Approval"
              title={crowdFavorite?.nickname ?? "—"}
              value={crowdFavorite ? `${crowdFavorite.upvotes} upvotes` : "—"}
              tone="cyan"
            />
          </div>
        )}

        {/* My recap card */}
        {me && tab !== "djs" && (
          <div className="rounded-2xl border border-primary/20 bg-card p-5 shadow-[var(--shadow-card)] animate-fade-in">
            <div className="flex items-center justify-between mb-3">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                Your card
              </div>
              <Button size="sm" variant="ghost" onClick={handleShare} className="h-7 -mr-2">
                <Share2 className="h-3.5 w-3.5 mr-1" /> Share
              </Button>
            </div>
            <div className="flex items-center gap-4">
              <div className="h-14 w-14 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-white font-bold text-lg shadow-[var(--shadow-glow-sm)]">
                #{myRank ?? "—"}
              </div>
              <div className="flex-1 min-w-0">
                <div className="font-semibold truncate">{me.nickname}</div>
                <div className="text-xs text-muted-foreground">
                  {guestTitleFor(me.influence).icon} {guestTitleFor(me.influence).title}
                </div>
              </div>
              <div className="text-right">
                <div className="text-xl font-bold tabular-nums text-primary">{me.influence}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">influence</div>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-2 mt-4">
              <Stat label="Upvotes" value={me.upvotes} />
              <Stat label="Played" value={me.played} />
              <Stat label="Boost" value={me.boost} />
              <Stat label="Approval" value={`${Math.round(me.approval * 100)}%`} />
            </div>
            {me.badges.length > 0 && (
              <div className="flex flex-wrap gap-1.5 mt-4">
                {me.badges.map((b) => (
                  <Badge key={b} variant="secondary" className="rounded-full bg-primary/15 text-primary border-primary/25 gap-1">
                    <Zap className="h-3 w-3" /> {b}
                  </Badge>
                ))}
              </div>
            )}
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid grid-cols-5 w-full rounded-full bg-secondary/60 p-1 h-10">
            <TabsTrigger value="influence" className="rounded-full">
              <Trophy className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Influence</span>
            </TabsTrigger>
            <TabsTrigger value="favs" className="rounded-full">
              <Heart className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Crowd</span>
            </TabsTrigger>
            <TabsTrigger value="hitmakers" className="rounded-full">
              <Music2 className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Played</span>
            </TabsTrigger>
            <TabsTrigger value="boosted" className="rounded-full">
              <Sparkles className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">Boosted</span>
            </TabsTrigger>
            <TabsTrigger value="djs" className="rounded-full">
              <Headphones className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">DJs</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            <div className="surface-1 overflow-hidden">
              {loading ? (
                <div className="py-16 flex justify-center">
                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                </div>
              ) : tab === "boosted" ? (
                <BoostedList songs={boostedSongs} />
              ) : tab === "djs" ? (
                <DjList djs={djs} />
              ) : (
                <GuestList
                  rows={sortedByTab}
                  metric={tab}
                  meId={user?.id ?? null}
                  rankDeltas={rankDeltas}
                />
              )}
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

const Stat = ({ label, value }: { label: string; value: number | string }) => (
  <div className="rounded-xl bg-secondary/40 px-3 py-2 text-center">
    <div className="text-base font-semibold tabular-nums">{value}</div>
    <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</div>
  </div>
);

const HighlightCard = ({
  icon,
  label,
  title,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  title: string;
  value: string;
  tone: "orange" | "pink" | "red" | "cyan";
}) => {
  const tones: Record<string, string> = {
    orange: "from-orange-500/20 to-amber-500/5 text-orange-300",
    pink: "from-primary/20 to-accent/5 text-primary",
    red: "from-rose-500/20 to-pink-500/5 text-rose-300",
    cyan: "from-cyan-500/20 to-sky-500/5 text-cyan-300",
  };
  return (
    <div className={cn("rounded-2xl border border-border/60 bg-gradient-to-br p-3.5", tones[tone])}>
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest font-semibold opacity-90">
        {icon}
        {label}
      </div>
      <div className="mt-2 font-semibold text-foreground truncate text-sm">{title}</div>
      <div className="text-[11px] text-muted-foreground truncate mt-0.5">{value}</div>
    </div>
  );
};

const GuestList = ({
  rows,
  metric,
  meId,
  rankDeltas,
}: {
  rows: GuestRow[];
  metric: "influence" | "favs" | "hitmakers";
  meId: string | null;
  rankDeltas: Map<string, number>;
}) => {
  if (rows.length === 0) {
    return <div className="py-16 text-center text-muted-foreground">No activity yet for this event.</div>;
  }
  return (
    <div className="divide-y divide-white/[0.05]">
      {rows.map((r, i) => {
        const rank = i + 1;
        const isMe = meId && r.user_id === meId;
        const key = r.user_id ?? `anon:${r.nickname}`;
        const delta = rankDeltas.get(key) ?? null;
        const title = guestTitleFor(r.influence);
        const primary =
          metric === "favs"
            ? `${Math.round(r.approval * 100)}%`
            : metric === "hitmakers"
            ? `${r.played}`
            : `${r.influence}`;
        const primaryLabel = metric === "favs" ? "approval" : metric === "hitmakers" ? "played" : "infl.";
        return (
          <div
            key={key + i}
            className={cn(
              "flex items-center gap-3 px-4 py-3.5 transition-all",
              isMe && "bg-primary/[0.05]",
              rank <= 3 && "bg-gradient-to-r from-primary/[0.04] to-transparent",
            )}
          >
            <RankBadge rank={rank} />
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <div className="font-medium truncate">
                  {r.user_id ? (
                    <Link
                      to={`/users/${r.user_id}`}
                      className="hover:text-primary hover:underline underline-offset-2 transition-colors"
                    >
                      {r.nickname}
                    </Link>
                  ) : (
                    r.nickname
                  )}
                </div>
                {isMe && <span className="text-[10px] text-primary uppercase tracking-wider">you</span>}
                <TrendArrow delta={delta} />
              </div>
              <div className="text-[11px] text-muted-foreground truncate flex items-center gap-1.5">
                <span className="text-foreground/70">
                  {title.icon} {title.title}
                </span>
                <span>·</span>
                <span>
                  {r.upvotes}▲ · {r.played} played · {Math.round(r.approval * 100)}%
                </span>
              </div>
            </div>
            <div className="text-right shrink-0">
              <div className="text-base font-semibold tabular-nums text-primary">{primary}</div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{primaryLabel}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
};

const BoostedList = ({ songs }: { songs: SongRow[] }) =>
  songs.length === 0 ? (
    <div className="py-16 text-center text-muted-foreground">No boosted songs yet.</div>
  ) : (
    <div className="divide-y divide-white/[0.05]">
      {songs.map((s, i) => (
        <div
          key={s.id}
          className={cn(
            "flex items-center gap-3 px-4 py-3.5",
            i <= 2 && "bg-gradient-to-r from-primary/[0.04] to-transparent",
          )}
        >
          <RankBadge rank={i + 1} />
          {s.album_art ? (
            <img src={s.album_art} alt="" className="h-12 w-12 rounded-xl object-cover" loading="lazy" />
          ) : (
            <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30" />
          )}
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">{s.title}</div>
            <div className="text-xs text-muted-foreground truncate">
              {s.artist} · by {s.requester_name}
            </div>
          </div>
          <Badge className="bg-primary/15 text-primary border-primary/25 rounded-full gap-1">
            <Sparkles className="h-3 w-3" /> +{s.boost}
          </Badge>
        </div>
      ))}
    </div>
  );

const DjList = ({ djs }: { djs: DjRow[] }) =>
  djs.length === 0 ? (
    <div className="py-16 text-center text-muted-foreground">No DJs yet.</div>
  ) : (
    <div className="divide-y divide-white/[0.05]">
      {djs.map((d, i) => (
        <div
          key={d.dj_id}
          className={cn(
            "flex items-center gap-3 px-4 py-3.5",
            i <= 2 && "bg-gradient-to-r from-primary/[0.04] to-transparent",
          )}
        >
          <RankBadge rank={i + 1} />
          <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 grid place-items-center text-white">
            <Mic2 className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-medium truncate">
              <Link
                to={`/users/${d.dj_id}`}
                className="hover:text-primary hover:underline underline-offset-2 transition-colors"
              >
                {d.dj_name}
              </Link>
            </div>
            <div className="text-[11px] text-muted-foreground truncate">
              <span className="text-foreground/70">{d.title}</span> · {d.rooms} rooms · {d.requests_played} played ·{" "}
              {d.total_boost} boost
            </div>
          </div>
          <div className="text-right shrink-0">
            <div className="text-base font-semibold tabular-nums text-primary">{d.vibe}</div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">vibe</div>
          </div>
        </div>
      ))}
    </div>
  );

export default Leaderboard;
