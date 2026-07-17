import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Loader2, ShieldCheck } from "lucide-react";
import { DecksLogo } from "@/components/DecksLogo";
import { toast } from "sonner";

type Details = {
  client?: { name?: string; client_name?: string; redirect_uri?: string };
  redirect_url?: string;
  redirect_to?: string;
  scope?: string;
  scopes?: string[];
};

export default function OAuthConsent() {
  const [params] = useSearchParams();
  const authorizationId = params.get("authorization_id") ?? "";
  const { user, profile, loading: authLoading } = useAuth();
  const [details, setDetails] = useState<Details | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!authorizationId) {
      setError("Missing authorization_id");
      return;
    }
    if (!user) {
      const next = window.location.pathname + window.location.search;
      window.location.href = "/auth?next=" + encodeURIComponent(next);
      return;
    }
    (async () => {
      try {
        const oauth = (supabase.auth as any).oauth;
        const { data, error } = await oauth.getAuthorizationDetails(authorizationId);
        if (error) {
          setError(error.message ?? "Could not load authorization request");
          return;
        }
        const immediate = data?.redirect_url ?? data?.redirect_to;
        if (immediate && !data?.client) {
          window.location.href = immediate;
          return;
        }
        setDetails(data ?? {});
      } catch (e: any) {
        setError(e?.message ?? "Could not load authorization request");
      }
    })();
  }, [authLoading, user, authorizationId]);

  async function decide(approve: boolean) {
    setBusy(true);
    try {
      const oauth = (supabase.auth as any).oauth;
      const { data, error } = approve
        ? await oauth.approveAuthorization(authorizationId)
        : await oauth.denyAuthorization(authorizationId);
      if (error) throw new Error(error.message);
      const target = data?.redirect_url ?? data?.redirect_to;
      if (!target) throw new Error("No redirect returned by the authorization server.");
      window.location.href = target;
    } catch (e: any) {
      setBusy(false);
      toast.error(e?.message ?? "Something went wrong");
    }
  }

  if (authLoading || (!details && !error)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center px-4">
        <div className="max-w-md w-full p-6 rounded-3xl glass-strong text-center space-y-3">
          <h1 className="text-lg font-semibold">Could not load this authorization request</h1>
          <p className="text-sm text-muted-foreground">{error}</p>
          <Button asChild variant="outline"><Link to="/">Return home</Link></Button>
        </div>
      </div>
    );
  }

  const clientName = details?.client?.name ?? details?.client?.client_name ?? "an app";
  const redirectUri = details?.client?.redirect_uri;
  const scopeList = details?.scopes ?? (details?.scope ? details.scope.split(/\s+/).filter(Boolean) : []);
  const scopeLabel = (s: string) => {
    if (s === "openid" || s === "profile") return "Share your basic profile";
    if (s === "email") return "Share your email address";
    return `Additional permission requested: ${s}`;
  };

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="max-w-md w-full p-6 sm:p-7 rounded-3xl glass-strong space-y-5">
        <div className="text-center">
          <DecksLogo className="h-12 w-12 mx-auto mb-3" />
          <h1 className="text-xl font-semibold tracking-tight">
            Connect {clientName} to Decks
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            This lets {clientName} use Decks as you.
          </p>
        </div>

        <div className="rounded-xl bg-secondary/40 p-3 text-sm">
          <div className="text-xs uppercase tracking-wider text-muted-foreground mb-1">Signed in as</div>
          <div className="font-medium">{profile?.nickname ?? user?.email}</div>
          {user?.email && profile?.nickname && (
            <div className="text-xs text-muted-foreground">{user.email}</div>
          )}
        </div>

        {redirectUri && (
          <div className="text-xs text-muted-foreground break-all">
            Redirect: <span className="font-mono">{redirectUri}</span>
          </div>
        )}

        {scopeList.length > 0 && (
          <ul className="space-y-1.5 text-sm">
            {scopeList.map((s) => (
              <li key={s} className="flex items-start gap-2">
                <ShieldCheck className="h-4 w-4 mt-0.5 text-primary shrink-0" />
                <span>{scopeLabel(s)}</span>
              </li>
            ))}
          </ul>
        )}

        <p className="text-[11px] text-muted-foreground">
          Approving does not bypass Decks' permissions or backend policies. You can revoke access
          anytime from your account settings.
        </p>

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy}
            onClick={() => decide(false)}
          >
            Cancel connection
          </Button>
          <Button
            variant="premium"
            className="flex-1"
            disabled={busy}
            onClick={() => decide(true)}
          >
            {busy && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Approve
          </Button>
        </div>
      </div>
    </div>
  );
}
