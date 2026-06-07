import { useEffect, useState } from "react";
import { Link, useParams, useNavigate, useLocation } from "react-router-dom";
import { ArrowLeft, Loader2, Lock, Music2, Rocket, ThumbsUp, Trophy, Calendar, Sparkles, Flag } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ReportDialog } from "@/components/ReportDialog";

interface RecentSong {
  id: string;
  title: string;
  artist: string;
  album_art: string | null;
  upvotes: number;
  downvotes: number;
  boost: number;
  status: string;
  created_at: string;
}

interface PublicProfileData {
  found: boolean;
  is_public: boolean;
  user_id?: string;
  nickname: string;
  is_dj: boolean;
  points?: number;
  rank?: number;
  total_requests?: number;
  total_upvotes?: number;
  total_boosts?: number;
  events_joined?: number;
  top_song?: RecentSong | null;
  recent_songs?: RecentSong[];
}

const PublicProfile = () => {
  const { userId } = useParams<{ userId: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();
  const backState = location.state as { from?: string; scrollY?: number } | null;
  const [reportOpen, setReportOpen] = useState<null | "user" | "nickname">(null);

  const handleBack = () => {
    const from = backState?.from;
    // 1. In-app nav: replace profile with the source route, forwarding scrollY so EventPage can restore.
    if (from && from.startsWith("/") && !from.startsWith("//") && !from.startsWith("/users/")) {
      navigate(from, { replace: true, state: { scrollY: backState?.scrollY } });
      return;
    }
    // 2. Browser history available -> pop (works for native back gesture too).
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    // 3. Refresh on profile: fall back to last visited event page if we have one.
    try {
      const lastEvent = sessionStorage.getItem("decks:lastEvent");
      if (lastEvent && lastEvent.startsWith("/")) {
        navigate(lastEvent, { replace: true });
        return;
      }
    } catch { /* ignore */ }
    // 4. Final fallback (never leaderboard).
    navigate("/", { replace: true });
  };

  const [data, setData] = useState<PublicProfileData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    (async () => {
      setLoading(true);
      const { data: res, error } = await supabase.rpc("get_public_profile", { _user_id: userId });
      if (!error) setData(res as unknown as PublicProfileData);
      setLoading(false);
    })();
  }, [userId]);

  if (loading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="container py-20 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  if (!data?.found) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <main className="container max-w-2xl py-12 text-center">
          <h1 className="text-2xl font-semibold mb-2">User not found</h1>
          <p className="text-muted-foreground mb-6">This profile doesn't exist.</p>
          <Button asChild variant="outline"><Link to="/">Back home</Link></Button>
        </main>
      </div>
    );
  }

  const initial = (data.nickname || "G").charAt(0).toUpperCase();

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container max-w-3xl py-8 space-y-6">
        <div className="flex items-center justify-between">
          <Button variant="ghost" size="sm" className="-ml-3" onClick={handleBack}>
            <ArrowLeft className="h-4 w-4 mr-1" />Back
          </Button>
          {user && userId && user.id !== userId && (
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={() => setReportOpen("nickname")}>
                <Flag className="h-3.5 w-3.5 mr-1" /> Report nickname
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setReportOpen("user")}>
                <Flag className="h-3.5 w-3.5 mr-1" /> Report user
              </Button>
            </div>
          )}
        </div>

        {/* Identity card */}
        <Card className="glass overflow-hidden">
          <div className="bg-gradient-to-br from-primary/20 via-card to-card p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="h-20 w-20 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-3xl font-bold text-primary-foreground shrink-0">
              {initial}
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl font-bold truncate">{data.nickname}</h1>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className="border-primary/40 text-primary">
                  {data.is_dj ? "DJ" : "Guest"}
                </Badge>
                {data.is_public && data.rank && (
                  <Badge className="bg-primary/15 text-primary border-primary/25 rounded-full">
                    <Trophy className="h-3 w-3 mr-1" />Rank #{data.rank}
                  </Badge>
                )}
                {!data.is_public && (
                  <Badge variant="secondary" className="rounded-full">
                    <Lock className="h-3 w-3 mr-1" />Private
                  </Badge>
                )}
              </div>
            </div>
          </div>
        </Card>

        {!data.is_public ? (
          <Card>
            <CardContent className="py-12 text-center text-muted-foreground flex flex-col items-center gap-3">
              <Lock className="h-8 w-8" />
              <p>This user's profile is private.</p>
            </CardContent>
          </Card>
        ) : (
          <>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <Stat icon={<Trophy className="h-4 w-4" />} label="Points" value={data.points ?? 0} highlight />
              <Stat icon={<Music2 className="h-4 w-4" />} label="Requests" value={data.total_requests ?? 0} />
              <Stat icon={<ThumbsUp className="h-4 w-4" />} label="Upvotes" value={data.total_upvotes ?? 0} />
              <Stat icon={<Rocket className="h-4 w-4" />} label="Boosts" value={data.total_boosts ?? 0} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Stat icon={<Calendar className="h-4 w-4" />} label="Events joined" value={data.events_joined ?? 0} />
              {data.top_song && (
                <Card className="border-primary/30 bg-primary/[0.04]">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-1.5 text-xs text-primary mb-2">
                      <Sparkles className="h-3.5 w-3.5" /><span className="uppercase tracking-wider">Top song</span>
                    </div>
                    <div className="flex items-center gap-3 min-w-0">
                      {data.top_song.album_art ? (
                        <img src={data.top_song.album_art} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/30 to-accent/30" />
                      )}
                      <div className="min-w-0">
                        <div className="font-semibold truncate text-sm">{data.top_song.title}</div>
                        <div className="text-xs text-muted-foreground truncate">{data.top_song.artist}</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              )}
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Recent requests</CardTitle>
              </CardHeader>
              <CardContent className="p-0 divide-y divide-white/[0.05]">
                {(data.recent_songs ?? []).length === 0 ? (
                  <p className="px-6 py-8 text-center text-sm text-muted-foreground">No requests yet.</p>
                ) : (
                  data.recent_songs!.map((s) => (
                    <div key={s.id} className="flex items-center gap-3 px-4 py-3">
                      {s.album_art ? (
                        <img src={s.album_art} alt="" className="h-10 w-10 rounded-lg object-cover" />
                      ) : (
                        <div className="h-10 w-10 rounded-lg bg-gradient-to-br from-primary/30 to-accent/30" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="font-medium text-sm truncate">{s.title}</div>
                        <div className="text-xs text-muted-foreground truncate">
                          {s.artist} · {formatDistanceToNow(new Date(s.created_at), { addSuffix: true })}
                        </div>
                      </div>
                      <div className="text-xs tabular-nums text-muted-foreground shrink-0">
                        +{s.upvotes - s.downvotes + s.boost}
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            </Card>
          </>
        )}
      </main>
      {reportOpen && userId && (
        <ReportDialog
          open={!!reportOpen}
          onOpenChange={(o) => !o && setReportOpen(null)}
          targetType={reportOpen}
          targetId={userId}
          contextLabel={data?.nickname}
        />
      )}
    </div>
  );
};

function Stat({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
  return (
    <Card className={highlight ? "border-primary/40 bg-primary/5" : ""}>
      <CardContent className="p-4">
        <div className={`flex items-center gap-1.5 text-xs ${highlight ? "text-primary" : "text-muted-foreground"}`}>
          {icon}<span className="uppercase tracking-wider">{label}</span>
        </div>
        <div className={`text-2xl font-bold tabular-nums mt-1 ${highlight ? "text-primary" : ""}`}>{value}</div>
      </CardContent>
    </Card>
  );
}

export default PublicProfile;
