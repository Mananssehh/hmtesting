import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, Loader2, LogOut, Music2, Pencil, Settings, ThumbsUp, Trophy, Sparkles, Award, Lock } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { nicknameSchema } from "@/lib/validation";

interface Stats {
  totalRequests: number;
  totalUpvotes: number;
}

interface TxRow {
  id: string;
  amount: number;
  type: "earned" | "spent" | "manual_adjustment";
  reason: string;
  created_at: string;
}

interface MyEvent {
  id: string;
  name: string;
  room_code: string;
  is_active: boolean;
}

const Profile = () => {
  const { user, profile, isDJ, loading: authLoading, signOut, refreshProfile } = useAuth();
  const navigate = useNavigate();

  const [stats, setStats] = useState<Stats>({ totalRequests: 0, totalUpvotes: 0 });
  const [txs, setTxs] = useState<TxRow[]>([]);
  const [myEvents, setMyEvents] = useState<MyEvent[]>([]);
  const [editingName, setEditingName] = useState(false);
  const [nickname, setNickname] = useState(profile?.nickname ?? "");
  const [savingName, setSavingName] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) navigate("/auth", { replace: true });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (profile?.nickname) setNickname(profile.nickname);
  }, [profile?.nickname]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [reqRes, txRes, evRes, profRes] = await Promise.all([
        supabase.from("song_requests").select("upvotes").eq("requested_by", user.id),
        supabase.from("points_transactions").select("id, amount, type, reason, created_at")
          .eq("user_id", user.id).gt("amount", 0).order("created_at", { ascending: false }).limit(20),
        isDJ
          ? supabase.from("events").select("id, name, room_code, is_active")
              .eq("dj_id", user.id).order("created_at", { ascending: false }).limit(5)
          : Promise.resolve({ data: [] as MyEvent[] }),
        supabase.from("profiles").select("is_public").eq("id", user.id).maybeSingle(),
      ]);

      const reqs = reqRes.data ?? [];
      setStats({
        totalRequests: reqs.length,
        totalUpvotes: reqs.reduce((sum, r) => sum + (r.upvotes ?? 0), 0),
      });
      setTxs((txRes.data ?? []) as TxRow[]);
      setMyEvents((evRes.data ?? []) as MyEvent[]);
      if (profRes.data) setIsPublic((profRes.data as { is_public?: boolean }).is_public ?? true);
      setLoading(false);
    })();
  }, [user, isDJ]);

  const togglePrivacy = async (next: boolean) => {
    if (!user) return;
    setSavingPrivacy(true);
    const prev = isPublic;
    setIsPublic(next);
    const { error } = await supabase.from("profiles").update({ is_public: next }).eq("id", user.id);
    setSavingPrivacy(false);
    if (error) {
      setIsPublic(prev);
      toast.error(error.message);
    } else {
      toast.success(next ? "Profile is now public" : "Profile is now private");
    }
  };

  const saveName = async () => {
    const parsed = nicknameSchema.safeParse(nickname);
    if (!parsed.success) return toast.error(parsed.error.issues[0].message);
    if (!user) return;
    setSavingName(true);
    const { error } = await supabase.from("profiles").update({ nickname: parsed.data }).eq("id", user.id);
    setSavingName(false);
    if (error) return toast.error(error.message);
    await refreshProfile();
    setEditingName(false);
    toast.success("Nickname updated");
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/");
  };

  if (authLoading || !user || !profile) {
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
      <main className="container max-w-3xl py-8 space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-3">
            <Link to="/"><ArrowLeft className="h-4 w-4 mr-1" />Back</Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Settings className="h-7 w-7 text-primary" /> Profile
          </h1>
        </div>

        {/* Identity card */}
        <Card className="glass overflow-hidden">
          <div className="bg-gradient-to-br from-primary/20 via-card to-card p-6 flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="h-16 w-16 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center text-2xl font-bold text-primary-foreground shrink-0">
              {(profile.nickname || "G").charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              {editingName ? (
                <div className="flex gap-2">
                  <Input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    maxLength={24}
                    autoFocus
                  />
                  <Button onClick={saveName} disabled={savingName}>
                    {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </Button>
                  <Button variant="ghost" onClick={() => { setEditingName(false); setNickname(profile.nickname); }}>
                    Cancel
                  </Button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <h2 className="text-2xl font-bold truncate">{profile.nickname}</h2>
                  <Button size="icon" variant="ghost" onClick={() => setEditingName(true)} aria-label="Edit nickname">
                    <Pencil className="h-4 w-4" />
                  </Button>
                </div>
              )}
              <div className="flex items-center gap-2 mt-1 text-sm text-muted-foreground">
                <Badge variant="outline" className="border-primary/40 text-primary">
                  {isDJ ? "DJ" : "Guest"}
                </Badge>
                <span className="truncate">{user.email ?? "Anonymous session"}</span>
              </div>
            </div>
          </div>
        </Card>

        {/* Privacy toggle */}
        <Card>
          <CardContent className="p-4 flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <Lock className="h-4 w-4 text-muted-foreground shrink-0" />
              <div className="min-w-0">
                <div className="font-medium text-sm">Public profile</div>
                <div className="text-xs text-muted-foreground">
                  {isPublic ? "Anyone can view your stats and recent songs." : "Only your nickname will be visible."}
                </div>
              </div>
            </div>
            <Switch checked={isPublic} onCheckedChange={togglePrivacy} disabled={savingPrivacy} />
          </CardContent>
        </Card>

        {/* Stats grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <StatCard icon={<Trophy className="h-4 w-4" />} label="Points" value={profile.points} highlight />
          <StatCard icon={<Music2 className="h-4 w-4" />} label="Requests" value={stats.totalRequests} />
          <StatCard icon={<ThumbsUp className="h-4 w-4" />} label="Upvotes" value={stats.totalUpvotes} />
          <Button asChild variant="outline" className="h-auto flex-col py-4 gap-2">
            <Link to="/leaderboard">
              <Trophy className="h-4 w-4" />
              <span className="text-xs">Leaderboard</span>
            </Link>
          </Button>
        </div>

        {/* DJ events shortcut */}
        {isDJ && (
          <Card>
            <CardHeader className="pb-3 flex flex-row items-center justify-between">
              <CardTitle className="text-base">Your events</CardTitle>
              <Button asChild size="sm" variant="ghost">
                <Link to="/dj">Open dashboard →</Link>
              </Button>
            </CardHeader>
            <CardContent className="p-0 divide-y">
              {myEvents.length === 0 ? (
                <p className="px-6 py-4 text-sm text-muted-foreground">No events yet.</p>
              ) : (
                myEvents.map((e) => (
                  <Link
                    key={e.id}
                    to={`/dj/${e.id}`}
                    className="flex items-center justify-between px-4 py-3 hover:bg-secondary/50"
                  >
                    <div>
                      <div className="font-medium">{e.name}</div>
                      <div className="text-xs font-mono text-muted-foreground">{e.room_code}</div>
                    </div>
                    <Badge variant={e.is_active ? "default" : "secondary"}>
                      {e.is_active ? "Live" : "Ended"}
                    </Badge>
                  </Link>
                ))
              )}
            </CardContent>
          </Card>
        )}

        {/* Transactions */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base flex items-center gap-2">
              <Award className="h-4 w-4 text-primary" /> Recent activity
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0 divide-y">
            {loading ? (
              <div className="py-12 flex justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : txs.length === 0 ? (
              <p className="px-6 py-8 text-center text-sm text-muted-foreground">
                No activity yet. Request a song or join an event to start earning!
              </p>
            ) : (
              txs.map((t) => (
                <div key={t.id} className="flex items-center justify-between px-4 py-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`h-8 w-8 rounded-full flex items-center justify-center shrink-0 ${
                      t.amount > 0 ? "bg-success/15 text-success" : "bg-primary/15 text-primary"
                    }`}>
                      {t.amount > 0 ? <Trophy className="h-4 w-4" /> : <Sparkles className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="font-medium text-sm truncate">{t.reason || t.type}</div>
                      <div className="text-xs text-muted-foreground">
                        {formatDistanceToNow(new Date(t.created_at), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                  <span className={`font-bold tabular-nums ${t.amount > 0 ? "text-success" : "text-primary"}`}>
                    {t.amount > 0 ? "+" : ""}{t.amount}
                  </span>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Button variant="outline" onClick={handleSignOut} className="w-full">
          <LogOut className="h-4 w-4 mr-2" /> Sign out
        </Button>
      </main>
    </div>
  );
};

function StatCard({ icon, label, value, highlight }: { icon: React.ReactNode; label: string; value: number; highlight?: boolean }) {
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

export default Profile;
