import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";

/**
 * Dedicated OAuth callback route.
 * Handles both PKCE (?code=...) and implicit (#access_token=...) flows so
 * Supabase redirects never fall through to the SPA 404 page.
 */
const AuthCallback = () => {
  const navigate = useNavigate();

  useEffect(() => {
    let cancelled = false;

    const finish = (path = "/") => {
      if (cancelled) return;
      // Clean any hash/query OAuth artifacts before navigating.
      window.history.replaceState({}, document.title, path);
      navigate(path, { replace: true });
    };

    const run = async () => {
      try {
        const url = new URL(window.location.href);
        const code = url.searchParams.get("code");
        const errorDesc =
          url.searchParams.get("error_description") ||
          new URLSearchParams(url.hash.replace(/^#/, "")).get("error_description");

        if (errorDesc) {
          toast.error(decodeURIComponent(errorDesc));
          finish("/auth");
          return;
        }

        if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(window.location.href);
          if (error) {
            toast.error(error.message);
            finish("/auth");
            return;
          }
        }
        // Implicit flow: supabase-js auto-detects the hash session on load.
        // Give it a tick, then verify a session exists.
        const { data } = await supabase.auth.getSession();
        const next = url.searchParams.get("next") || "/";
        finish(data.session ? next : "/auth");
      } catch (e: any) {
        toast.error(e?.message ?? "Sign-in failed");
        finish("/auth");
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
        <span>Signing you in…</span>
      </div>
    </div>
  );
};

export default AuthCallback;
