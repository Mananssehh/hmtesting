import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Disc3, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import { passwordSchema } from "@/lib/validation";

type Status = "checking" | "ready" | "invalid";

const ResetPassword = () => {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    // Supabase puts the recovery token in the URL hash and exchanges it for a
    // session automatically. We just need to confirm a recovery session exists.
    let cancelled = false;

    const check = async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setStatus("ready");
      } else {
        // Give Supabase a moment to process the hash on first paint.
        setTimeout(async () => {
          if (cancelled) return;
          const { data: again } = await supabase.auth.getSession();
          setStatus(again.session ? "ready" : "invalid");
        }, 600);
      }
    };

    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setStatus("ready");
      }
    });

    check();
    return () => {
      cancelled = true;
      sub.subscription.unsubscribe();
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const parsed = passwordSchema.safeParse(password);
      if (!parsed.success) throw new Error(parsed.error.issues[0].message);
      if (password !== confirm) throw new Error("Passwords don't match");

      const { error } = await supabase.auth.updateUser({ password: parsed.data });
      if (error) throw error;

      await supabase.auth.signOut();
      toast.success("Password updated successfully");
      navigate("/auth", {
        replace: true,
        state: {
          notice:
            "Your password has been updated. Please sign in with your new password.",
        },
      });
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
          <Disc3 className="h-12 w-12 text-primary mx-auto mb-4" strokeWidth={1.5} />
          <h1 className="text-[28px] sm:text-3xl font-semibold tracking-tight">
            Set a new password
          </h1>
        </div>

        <div className="p-6 sm:p-7 rounded-3xl glass-strong">
          {status === "checking" && (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {status === "invalid" && (
            <div className="space-y-4 text-center">
              <p className="text-sm text-foreground">
                This password reset link has expired.
              </p>
              <Button
                variant="premium"
                className="w-full h-11"
                onClick={() => navigate("/forgot-password")}
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
          )}

          {status === "ready" && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="password">New password</Label>
                <Input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete="new-password"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="confirm">Confirm new password</Label>
                <Input
                  id="confirm"
                  type="password"
                  value={confirm}
                  onChange={(e) => setConfirm(e.target.value)}
                  autoComplete="new-password"
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
                Update password
              </Button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};

export default ResetPassword;
