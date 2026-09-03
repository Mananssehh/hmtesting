import { ReactNode, useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";

/**
 * Fail-closed route guards.
 *
 * Three explicit states are modelled everywhere:
 *   loading  -> neutral loading screen, protected content never rendered
 *   allowed  -> children render
 *   denied   -> safe redirect, no sensitive detail in the message
 *
 * These guards are a navigation/UX boundary on top of the database
 * authorization (RLS + owner-scoped RPCs), never a replacement for it.
 */

export function GuardLoading() {
  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="container py-20 flex justify-center" role="status" aria-label="Loading">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    </div>
  );
}

/** Signed-in user required (any role). */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <GuardLoading />;
  if (!user) return <Navigate to="/auth?role=dj" replace />;
  return <>{children}</>;
}

/** Signed-in user with the `dj` role required. */
export function RequireDJ({ children }: { children: ReactNode }) {
  const { user, isDJ, loading } = useAuth();
  if (loading) return <GuardLoading />;
  if (!user) return <Navigate to="/auth?role=dj" replace />;
  // Role fetch failures leave isDJ false -> denied (fail closed).
  if (!isDJ) return <Navigate to="/dj/onboarding" replace />;
  return <>{children}</>;
}

/** Signed-in user with the `admin` role required. Fails closed. */
export function RequireAdmin({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");

  useEffect(() => {
    if (loading) return;
    if (!user) {
      setState("denied");
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id)
        .eq("role", "admin");
      if (cancelled) return;
      // Any error -> denied.
      setState(!error && (data?.length ?? 0) > 0 ? "allowed" : "denied");
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, loading]);

  if (loading || state === "loading") return <GuardLoading />;
  if (state === "denied") return <Navigate to="/" replace />;
  return <>{children}</>;
}

/**
 * DJ role + ownership of the `:id` event required.
 * The page is never rendered — not even briefly — for a non-owner.
 */
export function RequireEventOwner({ children }: { children: ReactNode }) {
  const { user, isDJ, loading } = useAuth();
  const { id } = useParams<{ id: string }>();
  const [state, setState] = useState<"loading" | "allowed" | "denied">("loading");

  useEffect(() => {
    if (loading) return;
    if (!user || !isDJ || !id) {
      setState("denied");
      return;
    }
    let cancelled = false;
    setState("loading");
    (async () => {
      const { data, error } = await supabase
        .from("events")
        .select("id")
        .eq("id", id)
        .eq("dj_id", user.id)
        .maybeSingle();
      if (cancelled) return;
      setState(!error && data ? "allowed" : "denied");
    })();
    return () => {
      cancelled = true;
    };
  }, [user?.id, isDJ, loading, id]);

  if (loading || state === "loading") return <GuardLoading />;
  if (state === "denied") {
    if (!user) return <Navigate to="/auth?role=dj" replace />;
    if (!isDJ) return <Navigate to="/dj/onboarding" replace />;
    return <Navigate to="/dj" replace />;
  }
  return <>{children}</>;
}
