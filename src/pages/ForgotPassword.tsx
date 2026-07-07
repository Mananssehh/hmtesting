import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ArrowLeft } from "lucide-react";
import { DecksLogo } from "@/components/DecksLogo";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import { emailSchema } from "@/lib/validation";

const RESET_REDIRECT = "https://linku99.com/reset-password";
const GENERIC_MESSAGE =
  "If an account exists for that email, we've sent a reset link. Check your inbox.";

const ForgotPassword = () => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const parsed = emailSchema.safeParse(email);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);

      // Fire-and-forget — never reveal whether the account exists.
      await supabase.auth
        .resetPasswordForEmail(parsed.data, { redirectTo: RESET_REDIRECT })
        .catch(() => undefined);

      setSubmitted(true);
      toast.success(GENERIC_MESSAGE);
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
        <button
          onClick={() => navigate("/auth")}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
        >
          <ArrowLeft className="h-4 w-4" /> Back to sign in
        </button>

        <div className="text-center mb-8">
          <DecksLogo className="h-14 w-14 mx-auto mb-4" />
          <h1 className="text-[28px] sm:text-3xl font-semibold tracking-tight">
            Forgot your password?
          </h1>
          <p className="text-muted-foreground mt-2 text-[15px]">
            Enter your email and we'll send you a reset link.
          </p>
        </div>

        <div className="p-6 sm:p-7 rounded-3xl glass-strong">
          {submitted ? (
            <div className="space-y-4 text-center">
              <p className="text-sm text-foreground">{GENERIC_MESSAGE}</p>
              <p className="text-xs text-muted-foreground">
                Didn't get it? Check spam, or try again in a minute.
              </p>
              <Button
                variant="outline"
                className="w-full h-11"
                onClick={() => setSubmitted(false)}
              >
                Send another reset email
              </Button>
              <Link
                to="/auth"
                className="block text-sm text-primary hover:underline"
              >
                Back to sign in
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
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
              <Button
                type="submit"
                disabled={loading}
                variant="premium"
                className="w-full h-11"
              >
                {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Send reset link
              </Button>
              <p className="text-xs text-center text-muted-foreground">
                Remembered it?{" "}
                <Link to="/auth" className="text-primary hover:underline">
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ForgotPassword;
