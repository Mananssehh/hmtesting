import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Loader2, Trophy, Crown, Medal, ArrowLeft, Sparkles, Music2, ThumbsUp } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type EventOption = { id: string; name: string; room_code: string; venue: string | null };
type GuestRow = {
  user_id: string | null;
  nickname: string;
  requests: number;
  upvotes: number;
  downvotes: number;
  boost: number;
  points: number;
};
type SongRow = {
  id: string;
  title: string;
  artist: string;
  album_art: string | null;
  upvotes: number;
  downvotes: number;
  boost: number;
  requester_name: string;
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
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"points" | "upvotes" | "requests" | "boosted">("points");

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

  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: reqs } = await supabase
        .from("song_requests")
        .select("id, requested_by, requester_name, title, artist, album_art, upvotes, downvotes, boost")
        .eq("event_id", selectedEventId);

      if (cancelled) return;
      const songRows: SongRow[] = (reqs ?? []).map((r) => ({
        id: r.id,
        title: r.title,
        artist: r.artist,
        album_art: r.album_art,
        upvotes: r.upvotes,
        downvotes: r.downvotes,
        boost: r.boost,
        requester_name: r.requester_name || "Guest",
      }));
      setSongs(songRows);

      const map = new Map<string, GuestRow>();
      for (const r of reqs ?? []) {
        const key = r.requested_by ?? `anon:${r.requester_name}`;
        const existing = map.get(key) ?? {
          user_id: r.requested_by,
          nickname: r.requester_name || "Guest",
          requests: 0,
          upvotes: 0,
          downvotes: 0,
          boost: 0,
          points: 0,
        };
        existing.requests += 1;
        existing.upvotes += r.upvotes ?? 0;
        existing.downvotes += r.downvotes ?? 0;
        existing.boost += r.boost ?? 0;
        map.set(key, existing);
      }

      const userIds = Array.from(map.values()).map((r) => r.user_id).filter(Boolean) as string[];
      let pointsMap = new Map<string, number>();
      if (userIds.length) {
        const { data: profs } = await supabase
          .from("profiles")
          .select("id, nickname, points")
          .in("id", userIds);
        for (const p of profs ?? []) {
          pointsMap.set(p.id, p.points ?? 0);
          const row = Array.from(map.values()).find((r) => r.user_id === p.id);
          if (row && p.nickname) row.nickname = p.nickname;
        }
      }

      const computed = Array.from(map.values()).map((r) => ({
        ...r,
        points: r.user_id ? (pointsMap.get(r.user_id) ?? 0) : 0,
      }));
      setGuests(computed);
      setLoading(false);
    })();

    return () => { cancelled = true; };
  }, [selectedEventId]);

  const sortedGuests = useMemo(() => {
    const arr = [...guests];
    if (tab === "points") arr.sort((a, b) => b.points - a.points);
    else if (tab === "upvotes") arr.sort((a, b) => b.upvotes - a.upvotes);
    else if (tab === "requests") arr.sort((a, b) => b.requests - a.requests);
    return arr;
  }, [guests, tab]);

  const boostedSongs = useMemo(() => [...songs].sort((a, b) => b.boost - a.boost).filter((s) => s.boost > 0), [songs]);

  const myRank = useMemo(() => {
    if (!user) return null;
    const idx = sortedGuests.findIndex((r) => r.user_id === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [sortedGuests, user]);

  const handleEventChange = (id: string) => {
    setSelectedEventId(id);
    setParams({ event: id }, { replace: true });
  };

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-primary" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-muted-foreground" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-accent" />;
    return <span className="text-muted-foreground font-mono text-sm w-5 text-center tabular-nums">{rank}</span>;
  };

  const metricLabel = tab === "points" ? "pts" : tab === "upvotes" ? "▲" : "reqs";
  const metricValue = (r: GuestRow) =>
    tab === "points" ? r.points : tab === "upvotes" ? r.upvotes : r.requests;

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-3xl py-8 sm:py-10 space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-3 -ml-3">
            <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
          </Button>
          <h1 className="text-[28px] sm:text-3xl font-semibold tracking-tight flex items-center gap-2.5">
            <Trophy className="h-7 w-7 text-primary" strokeWidth={1.75} />
            Leaderboard
          </h1>
          <p className="text-muted-foreground text-[15px] mt-1.5">Hot 100 of the dance floor</p>
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
              {!events.length && <SelectItem value="none" disabled>No events yet</SelectItem>}
            </SelectContent>
          </Select>
        </div>

        {myRank && tab !== "boosted" && (
          <div className="surface-1 px-4 py-3 flex items-center justify-between">
            <span className="text-sm text-muted-foreground">Your rank</span>
            <Badge className="bg-primary/15 text-primary border-primary/25 rounded-full">#{myRank}</Badge>
          </div>
        )}

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)}>
          <TabsList className="grid grid-cols-4 w-full rounded-full bg-secondary/60 p-1 h-10">
            <TabsTrigger value="points" className="rounded-full"><Trophy className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Points</span></TabsTrigger>
            <TabsTrigger value="upvotes" className="rounded-full"><ThumbsUp className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Upvotes</span></TabsTrigger>
            <TabsTrigger value="requests" className="rounded-full"><Music2 className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Requesters</span></TabsTrigger>
            <TabsTrigger value="boosted" className="rounded-full"><Sparkles className="h-3.5 w-3.5 sm:mr-1" /><span className="hidden sm:inline">Boosted</span></TabsTrigger>
          </TabsList>

          <TabsContent value={tab} className="mt-4">
            <div className="surface-1 overflow-hidden">
              <div className="divide-y divide-white/[0.05]">
                {loading ? (
                  <div className="py-16 flex justify-center">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : tab === "boosted" ? (
                  boostedSongs.length === 0 ? (
                    <div className="py-16 text-center text-muted-foreground">No boosted songs yet.</div>
                  ) : (
                    boostedSongs.map((s, i) => (
                      <div key={s.id} className="flex items-center gap-4 px-4 py-3.5">
                        <div className="w-8 flex justify-center">{rankIcon(i + 1)}</div>
                        {s.album_art ? (
                          <img src={s.album_art} alt="" className="h-12 w-12 rounded-xl object-cover" loading="lazy" />
                        ) : (
                          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/30 to-accent/30" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">{s.title}</div>
                          <div className="text-xs text-muted-foreground truncate">{s.artist} · by {s.requester_name}</div>
                        </div>
                        {/* requester link rendered in guest list below */}
                        <Badge className="bg-primary/15 text-primary border-primary/25 rounded-full gap-1">
                          <Sparkles className="h-3 w-3" /> +{s.boost}
                        </Badge>
                      </div>
                    ))
                  )
                ) : sortedGuests.length === 0 ? (
                  <div className="py-16 text-center text-muted-foreground">
                    No activity yet for this event.
                  </div>
                ) : (
                  sortedGuests.map((r, i) => {
                    const rank = i + 1;
                    const isMe = user && r.user_id === user.id;
                    return (
                      <div
                        key={(r.user_id ?? r.nickname) + i}
                        className={cn(
                          "flex items-center gap-4 px-4 py-3.5 transition-colors",
                          isMe && "bg-primary/[0.04]",
                        )}
                      >
                        <div className="w-8 flex justify-center">{rankIcon(rank)}</div>
                        <div className="flex-1 min-w-0">
                          <div className="font-medium truncate">
                            {r.user_id ? (
                              <Link to={`/users/${r.user_id}`} className="hover:text-primary hover:underline underline-offset-2 transition-colors">
                                {r.nickname}
                              </Link>
                            ) : (
                              r.nickname
                            )}
                            {isMe && <span className="ml-2 text-xs text-primary">(you)</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            {r.requests} req · {r.upvotes} ▲ · {r.downvotes} ▼
                            {r.boost > 0 && <> · {r.boost} boost</>}
                          </div>
                        </div>
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-primary/20 rounded-full tabular-nums">
                          {metricValue(r)} {metricLabel}
                        </Badge>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Leaderboard;
