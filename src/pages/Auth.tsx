import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { DecksLogo } from "@/components/DecksLogo";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

import { AppHeader } from "@/components/AppHeader";
import { emailSchema, nicknameSchema, passwordSchema } from "@/lib/validation";
import { Checkbox } from "@/components/ui/checkbox";



const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const djIntent = searchParams.get("role") === "dj" || searchParams.get("mode") === "dj";
  const nextRaw = searchParams.get("next");
  const nextPath = nextRaw && nextRaw.startsWith("/") && !nextRaw.startsWith("//") ? nextRaw : null;
  const fromPath = (location.state as { from?: string } | null)?.from;
  const notice = (location.state as { notice?: string } | null)?.notice;
  const { user, profile, isDJ, isAnonymous, loading: authLoading, refreshProfile } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(djIntent || !!profile?.nickname ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState(profile?.nickname && profile.nickname !== "Guest" ? profile.nickname : "");
  const [loading, setLoading] = useState(false);
  const [wantsDj, setWantsDj] = useState(djIntent);

  useEffect(() => {
    if (notice) {
      toast.success(notice);
      // Clear location state so the toast doesn't re-fire on re-render.
      window.history.replaceState({}, "");
    }
  }, [notice]);


  useEffect(() => {
    if (isAnonymous && profile?.nickname && profile.nickname !== "Guest" && !nickname) {
      setNickname(profile.nickname);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAnonymous, profile?.nickname]);

  useEffect(() => {
    if (authLoading || !user) return;
    // Anonymous users stay on this page so they can upgrade via the signup form;
    // only redirect once they've actually become a permanent account.
    if (isAnonymous) return;
    if (nextPath) {
      navigate(nextPath, { replace: true });
    } else if (djIntent) {
      navigate(isDJ ? (fromPath || "/dj") : "/dj/onboarding", { replace: true });
    } else {
      navigate(fromPath || "/", { replace: true });
    }
  }, [user, isDJ, isAnonymous, authLoading, navigate, djIntent, fromPath, nextPath]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const emailParse = emailSchema.safeParse(email);
      if (!emailParse.success) throw new Error(emailParse.error.issues[0].message);
      const passParse = passwordSchema.safeParse(password);
      if (!passParse.success) throw new Error(passParse.error.issues[0].message);

      if (mode === "signup") {
        const nickParse = nicknameSchema.safeParse(nickname);
        if (!nickParse.success) throw new Error(nickParse.error.issues[0].message);

        if (isAnonymous) {
          // Upgrade in place — same auth.uid(), keeps profile/points/history.
          const { error } = await supabase.auth.updateUser({
            email: emailParse.data,
            password: passParse.data,
          });
          if (error) throw error;
          await (supabase as any).rpc("upgrade_anonymous_profile", {
            p_nickname: nickParse.data,
          });
          await refreshProfile();
          // Fire-and-forget welcome email after anonymous upgrade.
          supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "guest-welcome",
              recipientEmail: emailParse.data,
              idempotencyKey: `guest-welcome:${emailParse.data.toLowerCase()}`,
              templateData: { nickname: nickParse.data },
            },
          }).catch(() => undefined);
          toast.success("Account created — your nickname, points, and history are saved.");
        } else {
          const { data, error } = await supabase.auth.signUp({
            email: emailParse.data,
            password: passParse.data,
            options: {
              emailRedirectTo: `${window.location.origin}/auth/callback`,
              data: { nickname: nickParse.data },
            },
          });
          if (error) throw error;

          // If no session was returned, Supabase requires email confirmation
          // before the user can sign in. Do NOT navigate away — show the
          // "check your inbox" state so the user knows what to do next.
          if (!data.session) {
            toast.success("Check your inbox to confirm your email.");
            setMode("login");
            setPassword("");
            return;
          }

          // Auto-confirm was on (or user was already confirmed): welcome + go.
          supabase.functions.invoke("send-transactional-email", {
            body: {
              templateName: "guest-welcome",
              recipientEmail: emailParse.data,
              idempotencyKey: `guest-welcome:${emailParse.data.toLowerCase()}`,
              templateData: { nickname: nickParse.data },
            },
          }).catch(() => undefined);
          toast.success("Account created! Welcome to Decks.");
        }

        navigate(nextPath || ((djIntent || wantsDj) ? "/dj/onboarding" : (fromPath || "/")), { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailParse.data,
          password: passParse.data,
        });
        if (error) throw error;
        toast.success("Welcome back!");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  if (authLoading) {
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
      <div className="container max-w-md py-10 sm:py-16">
        <div className="text-center mb-8">
          <DecksLogo className="h-14 w-14 mx-auto mb-4 animate-float" />
          <h1 className="text-[28px] sm:text-3xl font-semibold tracking-tight">
            {mode === "signup" ? "Create your account" : "Login"}
          </h1>
          <p className="text-muted-foreground mt-2 text-[15px]">
            {mode === "signup"
              ? "Join Decks to vote, request, and tip the DJ."
              : "Welcome back to Decks."}
          </p>
        </div>

        <div className="p-6 sm:p-7 rounded-3xl glass-strong">
          <form onSubmit={handleSubmit} className="space-y-4">
            {mode === "signup" && (
              <div className="space-y-2">
                <Label htmlFor="nickname">Name</Label>
                <Input
                  id="nickname"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="DJ Sparkles"
                  maxLength={24}
                  required
                />
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@club.com"
                autoComplete="email"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
                autoComplete={mode === "signup" ? "new-password" : "current-password"}
                required
              />
            </div>

            {mode === "signup" && (
              <label className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40 cursor-pointer">
                <Checkbox
                  id="wants-dj"
                  checked={wantsDj}
                  onCheckedChange={(v) => setWantsDj(v === true)}
                  className="mt-0.5"
                />
                <div className="text-sm space-y-1">
                  <div className="font-medium">Sign up as a DJ</div>
                  <div className="text-[12px] text-muted-foreground">
                    Host events, manage your music queue, and receive tips.
                  </div>
                </div>
              </label>
            )}

            <Button type="submit" disabled={loading} variant="premium" className="w-full h-11">
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {mode === "signup" ? "Create account" : "Login"}
            </Button>

            {mode === "login" && (
              <div className="text-center">
                <Link to="/forgot-password" className="text-xs text-muted-foreground hover:text-primary hover:underline">
                  Forgot your password?
                </Link>
              </div>
            )}
          </form>

          <p className="text-sm text-center text-muted-foreground mt-6">
            {mode === "login" ? (
              <>
                Don't have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("signup")}
                  className="text-primary hover:underline font-medium"
                >
                  Create one
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => setMode("login")}
                  className="text-primary hover:underline font-medium"
                >
                  Login
                </button>
              </>
            )}
          </p>

          <p className="text-xs text-center text-muted-foreground mt-4">
            Just want to vote? <Link to="/join" className="text-primary hover:underline">Join an event with a code →</Link>
          </p>
          <p className="text-[11px] text-center text-muted-foreground mt-3">
            By continuing you agree to our <Link to="/terms" className="hover:text-primary underline-offset-2 hover:underline">Terms</Link> and{" "}
            <Link to="/privacy" className="hover:text-primary underline-offset-2 hover:underline">Privacy Policy</Link>.
            <br />
            Need help? <a href="mailto:support@linku99.com" className="hover:text-primary">support@linku99.com</a>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
