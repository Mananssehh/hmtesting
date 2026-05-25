import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Crown, Globe2, Loader2, Music2, Rocket, ThumbsUp, Trophy, Calendar, Headphones } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

type Period = "all" | "week" | "month";
type RoleFilter = "dj" | "guest";

type Row = {
  user_id: string;
  nickname: string;
  is_dj: boolean;
  points: number;
  total_requests: number;
  total_upvotes: number;
  total_boosts: number;
  events_joined: number;
  top_song: { id: string; title: string; artist: string; album_art: string | null } | null;
  global_score: number;
};

type MyRank = {
  user_id: string;
  nickname: string;
  is_dj: boolean;
  global_score: number;
  rank: number;
};

const MAX_ROWS = 100;

const RankBadge = ({ rank }: { rank: number }) => {
  if (rank === 1)
    return (
      <div className="h-10 w-10 rounded-full grid place-items-center bg-gradient-to-br from-yellow-300 to-amber-500 text-black shadow-[0_0_22px_-2px_hsl(45_100%_55%/0.7)]">
        <Crown className="h-5 w-5" strokeWidth={2.2} />
      </div>
    );
  if (rank === 2)
    return (
      <div className="h-10 w-10 rounded-full grid place-items-center bg-gradient-to-br from-slate-200 to-slate-400 text-black">
        <span className="text-sm font-bold">2</span>
      </div>
    );
  if (rank === 3)
    return (
      <div className="h-10 w-10 rounded-full grid place-items-center bg-gradient-to-br from-orange-300 to-amber-700 text-black">
        <span className="text-sm font-bold">3</span>
      </div>
    );
  return (
    <div className="h-10 w-10 rounded-full grid place-items-center bg-secondary/60 text-muted-foreground font-mono text-sm tabular-nums">
      {rank}
    </div>
  );
};

export default function GlobalLeaderboard() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<Period>("all");
  const [roleFilter, setRoleFilter] = useState<RoleFilter>("dj");
  const [rows, setRows] = useState<Row[]>([]);
  const [myRank, setMyRank] = useState<MyRank | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      const { data, error } = await supabase.rpc("get_global_leaderboard", {
        _period: period,
        _role_filter: roleFilter,
        _limit: MAX_ROWS,
      });
      if (cancelled) return;
      if (error) {
        setError(error.message);
        setRows([]);
      } else {
        setRows(((data ?? []) as unknown as Row[]).slice(0, MAX_ROWS));
      }
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [period, roleFilter]);

  // Fetch the current user's rank separately so we can pin it if they're outside top 100
  useEffect(() => {
    let cancelled = false;
    if (!user) {
      setMyRank(null);
      return;
    }
    (async () => {
      const { data, error } = await supabase.rpc("get_user_global_rank", {
        _user_id: user.id,
        _period: period,
        _role_filter: roleFilter,
      });
      if (cancelled) return;
      if (error || !data || (data as any[]).length === 0) {
        setMyRank(null);
      } else {
        setMyRank((data as any[])[0] as MyRank);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user, period, roleFilter]);

  const top3 = useMemo(() => rows.slice(0, 3), [rows]);
  const inTop100 = !!(myRank && rows.some((r) => r.user_id === myRank.user_id));

  return (
    <div className="min-h-screen bg-background pb-28">
      <SEO
        title="Global Leaderboard"
        description="The world's top 100 DJs and listeners on Decks — see who's running the dancefloor worldwide."
        path="/global-leaderboard"
      />
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
            <Globe2 className="h-7 w-7 text-primary" strokeWidth={1.75} />
            Global Leaderboard
          </h1>
          <p className="text-muted-foreground text-[15px] mt-1.5">
            The top 100 most influential listeners and DJs on Decks.
          </p>
        </div>

        {/* Period tabs */}
        <Tabs value={period} onValueChange={(v) => setPeriod(v as Period)}>
          <TabsList className="w-full grid grid-cols-3">
            <TabsTrigger value="all">Global</TabsTrigger>
            <TabsTrigger value="week">This Week</TabsTrigger>
            <TabsTrigger value="month">This Month</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Role filter — DJs vs Guests only */}
        <Tabs value={roleFilter} onValueChange={(v) => setRoleFilter(v as RoleFilter)}>
          <TabsList className="w-full grid grid-cols-2">
            <TabsTrigger value="dj"><Headphones className="h-3.5 w-3.5 mr-1.5" />DJs</TabsTrigger>
            <TabsTrigger value="guest"><Trophy className="h-3.5 w-3.5 mr-1.5" />Guests</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Top 3 podium */}
        {!loading && !error && top3.length > 0 && (
          <div className="grid grid-cols-3 gap-2 sm:gap-3">
            {top3.map((r, i) => (
              <Link
                key={r.user_id}
                to={`/users/${r.user_id}`}
                className={cn(
                  "rounded-2xl border p-3 text-center hover:scale-[1.02] transition-transform",
                  i === 0
                    ? "border-primary/40 bg-gradient-to-br from-primary/15 via-primary/5 to-accent/10 shadow-[0_0_40px_-12px_hsl(322_70%_60%/0.4)]"
                    : "border-white/[0.06] bg-card/60",
                )}
              >
                <div className="flex justify-center mb-2"><RankBadge rank={i + 1} /></div>
                <div className="font-semibold text-sm truncate">{r.nickname}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
                  {r.is_dj ? "DJ" : "Guest"}
                </div>
                <div className="mt-2 text-lg font-bold tabular-nums text-primary">{r.global_score}</div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground">score</div>
              </Link>
            ))}
          </div>
        )}

        {/* List */}
        <div className="surface-1 overflow-hidden">
          {loading ? (
            <div className="py-16 flex justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          ) : error ? (
            <div className="py-12 text-center text-sm text-destructive">
              Couldn't load leaderboard. {error}
            </div>
          ) : rows.length === 0 ? (
            <div className="py-16 text-center text-sm text-muted-foreground">
              No public results yet for this filter. Check back soon.
            </div>
          ) : (
            <ul className="divide-y divide-white/[0.05]">
              {rows.map((r, i) => {
                const rank = i + 1;
                const initial = (r.nickname || "G").charAt(0).toUpperCase();
                const isMe = user?.id === r.user_id;
                return (
                  <li key={r.user_id}>
                    <Link
                      to={`/users/${r.user_id}`}
                      className={cn(
                        "flex items-center gap-3 px-3 sm:px-4 py-3 transition-colors",
                        isMe
                          ? "bg-primary/10 ring-1 ring-inset ring-primary/40 shadow-[inset_0_0_24px_-8px_hsl(var(--primary)/0.5)]"
                          : "hover:bg-white/[0.03]",
                      )}
                    >
                      <RankBadge rank={rank} />
                      <div className="h-10 w-10 rounded-full bg-gradient-to-br from-primary to-accent grid place-items-center text-sm font-bold text-primary-foreground shrink-0">
                        {initial}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold truncate">{r.nickname}</span>
                          {isMe && (
                            <Badge className="rounded-full text-[10px] px-1.5 py-0 h-4 bg-primary text-primary-foreground">
                              You
                            </Badge>
                          )}
                          <Badge
                            variant="outline"
                            className={cn(
                              "rounded-full text-[10px] px-1.5 py-0 h-4",
                              r.is_dj ? "border-primary/40 text-primary" : "border-white/10 text-muted-foreground",
                            )}
                          >
                            {r.is_dj ? "DJ" : "Guest"}
                          </Badge>
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground mt-0.5 tabular-nums">
                          <span className="inline-flex items-center gap-0.5"><Trophy className="h-3 w-3" />{r.points}</span>
                          <span className="inline-flex items-center gap-0.5"><Music2 className="h-3 w-3" />{r.total_requests}</span>
                          <span className="inline-flex items-center gap-0.5"><ThumbsUp className="h-3 w-3" />{r.total_upvotes}</span>
                          <span className="inline-flex items-center gap-0.5"><Rocket className="h-3 w-3" />{r.total_boosts}</span>
                          <span className="inline-flex items-center gap-0.5"><Calendar className="h-3 w-3" />{r.events_joined}</span>
                        </div>
                        {r.top_song && (
                          <div className="text-[11px] text-muted-foreground/80 truncate mt-0.5">
                            ♪ {r.top_song.title} — {r.top_song.artist}
                          </div>
                        )}
                      </div>
                      <div className="text-right shrink-0">
                        <div className="text-base font-bold tabular-nums text-primary">{r.global_score}</div>
                        <div className="text-[9px] uppercase tracking-wider text-muted-foreground">score</div>
                      </div>
                    </Link>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

      </main>

      {/* Sticky "Your Rank" card when outside top 100 */}
      {myRank && !inTop100 && (
        <div className="fixed bottom-0 inset-x-0 z-40 px-3 pb-3 sm:pb-4 pointer-events-none">
          <div className="container max-w-3xl pointer-events-auto">
            <Link
              to={`/users/${myRank.user_id}`}
              className="flex items-center gap-3 rounded-2xl border border-primary/40 bg-card/95 backdrop-blur-xl px-3 sm:px-4 py-3 shadow-[0_8px_40px_-8px_hsl(var(--primary)/0.5)]"
            >
              <div className="h-10 w-10 rounded-full grid place-items-center bg-secondary/60 text-foreground font-mono text-sm tabular-nums shrink-0">
                #{myRank.rank}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold truncate">{myRank.nickname}</span>
                  <Badge className="rounded-full text-[10px] px-1.5 py-0 h-4 bg-primary text-primary-foreground">
                    You
                  </Badge>
                </div>
                <div className="text-[11px] text-muted-foreground">Your global rank</div>
              </div>
              <div className="text-right shrink-0">
                <div className="text-base font-bold tabular-nums text-primary">{myRank.global_score}</div>
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">score</div>
              </div>
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
