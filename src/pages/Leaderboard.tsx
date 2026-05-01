import { useEffect, useMemo, useState } from "react";
import { useNavigate, useSearchParams, Link } from "react-router-dom";
import { Loader2, Trophy, Medal, Crown, ArrowLeft } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

type EventOption = { id: string; name: string; room_code: string; venue: string | null };
type LeaderRow = {
  user_id: string | null;
  nickname: string;
  requests: number;
  upvotes: number;
  downvotes: number;
  boost: number;
  points: number;
};

const Leaderboard = () => {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const eventIdParam = params.get("event");

  const [events, setEvents] = useState<EventOption[]>([]);
  const [selectedEventId, setSelectedEventId] = useState<string | null>(eventIdParam);
  const [rows, setRows] = useState<LeaderRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  // Load events list (active first)
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

  // Load leaderboard for selected event
  useEffect(() => {
    if (!selectedEventId) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      const { data: reqs } = await supabase
        .from("song_requests")
        .select("requested_by, requester_name, upvotes, downvotes, boost")
        .eq("event_id", selectedEventId);

      if (cancelled) return;

      const map = new Map<string, LeaderRow>();
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

      // Enrich nicknames from profiles for known users
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

      // Points formula: 2 per upvote, +5 per boost, -1 per downvote, +1 per request submitted
      const computed = Array.from(map.values()).map((r) => ({
        ...r,
        points: r.upvotes * 2 + r.boost * 5 - r.downvotes + r.requests,
      }));
      computed.sort((a, b) => b.points - a.points);
      setRows(computed);
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [selectedEventId]);

  const myRank = useMemo(() => {
    if (!user) return null;
    const idx = rows.findIndex((r) => r.user_id === user.id);
    return idx >= 0 ? idx + 1 : null;
  }, [rows, user]);

  const handleEventChange = (id: string) => {
    setSelectedEventId(id);
    setParams({ event: id }, { replace: true });
  };

  const rankIcon = (rank: number) => {
    if (rank === 1) return <Crown className="h-5 w-5 text-primary" />;
    if (rank === 2) return <Medal className="h-5 w-5 text-muted-foreground" />;
    if (rank === 3) return <Medal className="h-5 w-5 text-accent" />;
    return <span className="text-muted-foreground font-mono text-sm w-5 text-center">{rank}</span>;
  };

  return (
    <div className="min-h-screen bg-background">
      <AppHeader />
      <main className="container max-w-3xl py-8 space-y-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <Button asChild variant="ghost" size="sm" className="mb-2 -ml-3">
              <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
            </Button>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
              <Trophy className="h-7 w-7 text-primary" />
              Leaderboard
            </h1>
            <p className="text-muted-foreground text-sm mt-1">Top requesters by crowd votes</p>
          </div>
        </div>

        <Card className="glass">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-muted-foreground">Event</CardTitle>
          </CardHeader>
          <CardContent>
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
          </CardContent>
        </Card>

        {myRank && (
          <Card className="glass border-primary/40">
            <CardContent className="py-4 flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Your rank</span>
              <Badge className="bg-primary/20 text-primary border-primary/40">#{myRank}</Badge>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="p-0 divide-y">
            {loading ? (
              <div className="py-16 flex justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : rows.length === 0 ? (
              <div className="py-16 text-center text-muted-foreground">
                No requests yet for this event.
              </div>
            ) : (
              rows.map((r, i) => {
                const rank = i + 1;
                const isMe = user && r.user_id === user.id;
                return (
                  <div
                    key={(r.user_id ?? r.nickname) + i}
                    className={`flex items-center gap-4 px-4 py-3 ${isMe ? "bg-primary/5" : ""}`}
                  >
                    <div className="w-8 flex justify-center">{rankIcon(rank)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="font-medium truncate">
                        {r.nickname}
                        {isMe && <span className="ml-2 text-xs text-primary">(you)</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {r.requests} request{r.requests === 1 ? "" : "s"} · {r.upvotes} ▲ · {r.downvotes} ▼
                        {r.boost > 0 && <> · {r.boost} boost</>}
                      </div>
                    </div>
                    <Badge variant="secondary" className="bg-primary/15 text-primary border-primary/30">
                      {r.points} pts
                    </Badge>
                  </div>
                );
              })
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
};

export default Leaderboard;
