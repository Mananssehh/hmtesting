import { useState, useEffect } from "react";
import { useNavigate, Link, useSearchParams, useLocation } from "react-router-dom";
import { Disc3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AppHeader } from "@/components/AppHeader";
import { emailSchema, nicknameSchema, passwordSchema } from "@/lib/validation";

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const djIntent = searchParams.get("role") === "dj" || searchParams.get("mode") === "dj";
  const fromPath = (location.state as { from?: string } | null)?.from;
  const { user, isDJ, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"login" | "signup">(djIntent ? "signup" : "login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [nickname, setNickname] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (authLoading || !user) return;
    if (djIntent) {
      navigate(isDJ ? (fromPath || "/dj") : "/dj/onboarding", { replace: true });
    } else {
      navigate(fromPath || "/", { replace: true });
    }
  }, [user, isDJ, authLoading, navigate, djIntent, fromPath]);

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

        const { error } = await supabase.auth.signUp({
          email: emailParse.data,
          password: passParse.data,
          options: {
            emailRedirectTo: window.location.origin,
            data: { nickname: nickParse.data },
          },
        });
        if (error) throw error;
        toast.success("Account created! Welcome to Decks.");
        navigate(djIntent ? "/dj/onboarding" : (fromPath || "/"), { replace: true });
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
          <Disc3 className="h-12 w-12 text-primary mx-auto mb-4 animate-float" strokeWidth={1.5} />
          <h1 className="text-[28px] sm:text-3xl font-semibold tracking-tight">Welcome to Decks</h1>
          <p className="text-muted-foreground mt-2 text-[15px]">
            {djIntent ? "Create your account to start DJing." : "Sign in to vote, request, and boost."}
          </p>
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

              <TabsContent value="login" className="m-0">
                <Button type="submit" disabled={loading} variant="premium" className="w-full h-11">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Sign in
                </Button>
              </TabsContent>
              <TabsContent value="signup" className="m-0">
                <Button type="submit" disabled={loading} variant="premium" className="w-full h-11">
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Create account
                </Button>
              </TabsContent>
            </form>
          </Tabs>

          <p className="text-xs text-center text-muted-foreground mt-6">
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
