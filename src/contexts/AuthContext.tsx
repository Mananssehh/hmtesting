import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { Session, User } from "@supabase/supabase-js";
import { supabase } from "@/integrations/supabase/client";

interface Profile {
  id: string;
  nickname: string;
  points: number;
  is_premium: boolean;
}

interface AuthContextValue {
  session: Session | null;
  user: User | null;
  profile: Profile | null;
  isDJ: boolean;
  isAnonymous: boolean;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  adjustProfilePoints: (delta: number) => void;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [isDJ, setIsDJ] = useState(false);
  const [loading, setLoading] = useState(true);

  const loadProfile = async (uid: string, { retryUntilFound = false }: { retryUntilFound?: boolean } = {}) => {
    // After signup the handle_new_user trigger may not have inserted the
    // profile row yet. When retryUntilFound is true (post-signup path) we
    // retry a few times with backoff so the UI never sees a null profile
    // for a fresh user.
    const delays = retryUntilFound ? [0, 250, 500, 1000, 1500] : [0];
    let prof: Profile | null = null;
    let roles: { role: string }[] | null = null;
    for (const delay of delays) {
      if (delay) await new Promise((r) => setTimeout(r, delay));
      const [pRes, rRes] = await Promise.all([
        (supabase as any).rpc("get_my_profile"),
        supabase.from("user_roles").select("role").eq("user_id", uid),
      ]);
      prof = (pRes.data as Profile | null) ?? null;
      roles = rRes.data ?? null;
      if (prof || !retryUntilFound) break;
    }
    setProfile(prof);
    setIsDJ(!!roles?.some((r) => r.role === "dj"));
  };

  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      if (newSession?.user) {
        setTimeout(() => loadProfile(newSession.user.id), 0);
      } else {
        setProfile(null);
        setIsDJ(false);
      }
    });

    supabase.auth.getSession().then(async ({ data }) => {
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        // Await initial profile + role load so route guards see accurate isDJ
        // on first render — prevents signed-in DJs from being bounced to /auth.
        await loadProfile(data.session.user.id);
      }
      setLoading(false);
    });

    return () => sub.subscription.unsubscribe();
  }, []);

  // No Realtime subscription on public.profiles: client roles hold no SELECT
  // privilege on that table, so a postgres_changes channel can never deliver
  // rows and would only keep an idle socket open. Owner profile state is
  // refreshed through get_my_profile() on login, focus, visibility change and
  // a single 60s interval. All listeners/timers are torn down on logout and
  // unmount.
  useEffect(() => {
    if (!user) return;
    const uid = user.id;
    let cancelled = false;
    const refresh = () => { if (!cancelled) void loadProfile(uid); };
    const onVisible = () => { if (document.visibilityState === "visible") refresh(); };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", refresh);
    const interval = setInterval(() => { if (document.visibilityState === "visible") refresh(); }, 60_000);
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", refresh);
      clearInterval(interval);
    };
  }, [user?.id]);


  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const refreshProfile = async () => {
    if (user) await loadProfile(user.id, { retryUntilFound: !profile });
  };

  const adjustProfilePoints = (delta: number) => {
    if (!delta) return;
    setProfile((prev) => (prev ? { ...prev, points: Math.max(0, prev.points + delta) } : prev));
  };

  return (
    <AuthContext.Provider value={{ session, user, profile, isDJ, isAnonymous: (user as any)?.is_anonymous === true, loading, signOut, refreshProfile, adjustProfilePoints }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
