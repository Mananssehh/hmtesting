import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams } from "react-router-dom";
import { Disc3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "@/components/AppHeader";
import { GoogleButton } from "@/components/GoogleButton";
import { emailSchema, nicknameSchema, passwordSchema } from "@/lib/validation";

const Auth = () => {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const djIntent = searchParams.get("role") === "dj" || searchParams.get("mode") === "dj";
  const { user, isDJ, loading: authLoading, refreshProfile } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(djIntent ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [becomeDJ, setBecomeDJ] = useState(true);
  const [inviteCode, setInviteCode] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    // Don't auto-claim DJ on mount anymore — invite code is required, handled in submit.
    if (isDJ) {
      navigate("/dj", { replace: true });
    } else if (!djIntent) {
      navigate("/", { replace: true });
    }
  }, [user, isDJ, authLoading, navigate, djIntent]);

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

        const wantsDJ = becomeDJ || djIntent;
        if (wantsDJ && !inviteCode.trim()) {
          throw new Error("DJ invite code required");
        }

        const { data, error } = await supabase.auth.signUp({
          email: emailParse.data,
          password: passParse.data,
          options: {
            emailRedirectTo: window.location.origin,
            data: { nickname: nickParse.data },
          },
        });
        if (error) throw error;

        if (wantsDJ && data.user) {
          const { error: roleErr } = await supabase.rpc("claim_dj_role", { _invite_code: inviteCode.trim() });
          if (roleErr) throw new Error(roleErr.message);
          await refreshProfile();
        }
        toast.success("Account created! Welcome to Decks.");
        navigate(wantsDJ ? "/dj" : "/", { replace: true });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: emailParse.data,
          password: passParse.data,
        });
        if (error) throw error;
        if (djIntent && inviteCode.trim()) {
          const { error: roleErr } = await supabase.rpc("claim_dj_role", { _invite_code: inviteCode.trim() });
          if (roleErr) throw new Error(roleErr.message);
          await refreshProfile();
        }
        toast.success("Welcome back!");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Something went wrong";
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
      <AppHeader />
      <div className="container max-w-md py-10 sm:py-16">
        <div className="text-center mb-8">
          <Disc3 className="h-12 w-12 text-primary mx-auto mb-4 animate-float" strokeWidth={1.5} />
          <h1 className="text-[28px] sm:text-3xl font-semibold tracking-tight">Welcome to Decks</h1>
          <p className="text-muted-foreground mt-2 text-[15px]">Sign in to vote, request, and boost.</p>
        </div>

        <div className="p-6 sm:p-7 rounded-3xl glass-strong">
          <Tabs value={mode} onValueChange={(v) => setMode(v as "login" | "signup")}>
            <TabsList className="grid grid-cols-2 w-full rounded-full bg-secondary/60 p-1 h-10">
              <TabsTrigger value="login" className="rounded-full">Sign in</TabsTrigger>
              <TabsTrigger value="signup" className="rounded-full">Sign up</TabsTrigger>
            </TabsList>

            <form onSubmit={handleSubmit} className="space-y-4 mt-6">
              {mode === "signup" && (
                <div className="space-y-2">
                  <Label htmlFor="nickname">Nickname</Label>
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
                <label className="flex items-start gap-3 p-3 rounded-lg bg-secondary/60 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={becomeDJ}
                    onChange={(e) => setBecomeDJ(e.target.checked)}
                    className="mt-1 accent-primary"
                  />
                  <div className="text-sm">
                    <div className="font-medium">I'm a DJ</div>
                    <div className="text-muted-foreground text-xs">Get access to create events and manage queues.</div>
                  </div>
                </label>
              )}

              {((mode === "signup" && becomeDJ) || (mode === "login" && djIntent)) && (
                <div className="space-y-2">
                  <Label htmlFor="invite">DJ invite code</Label>
                  <Input
                    id="invite"
                    value={inviteCode}
                    onChange={(e) => setInviteCode(e.target.value)}
                    placeholder="Paste your invite code"
                    autoComplete="off"
                  />
                  <p className="text-xs text-muted-foreground">
                    Don't have one? Email us — DJ access is invite-only during launch.
                  </p>
                </div>
              )}

              <TabsContent value="login" className="m-0">
                <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground h-11">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign in
                </Button>
              </TabsContent>
              <TabsContent value="signup" className="m-0">
                <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground h-11">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </TabsContent>
            </form>
          </Tabs>

          <div className="my-6 flex items-center gap-3">
            <span className="h-px flex-1 bg-border" />
            <span className="text-xs text-muted-foreground uppercase tracking-wider">Or</span>
            <span className="h-px flex-1 bg-border" />
          </div>

          <GoogleButton />

          <p className="text-xs text-center text-muted-foreground mt-6">
            Just want to vote? <Link to="/join" className="text-primary hover:underline">Join an event with a code →</Link>
          </p>
        </div>
      </div>
    </div>
  );
};

export default Auth;
