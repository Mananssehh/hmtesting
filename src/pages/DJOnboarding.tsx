import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Disc3, Loader2, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Button } from "@/components/ui/button";

const DJOnboarding = () => {
  const navigate = useNavigate();
  const { user, isDJ, loading: authLoading, refreshProfile } = useAuth();
  const [accepted, setAccepted] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/auth?role=dj", { replace: true });
    } else if (isDJ) {
      navigate("/dj", { replace: true });
    }
  }, [user, isDJ, authLoading, navigate]);

  const handleClaim = async () => {
    if (!accepted) {
      toast.error("Please accept the DJ certification to continue");
      return;
    }
    setSubmitting(true);
    try {
      const { error } = await supabase.rpc("claim_dj_role");
      if (error) throw new Error(error.message);
      await refreshProfile();
      toast.success("You're a DJ now 🎧");
      navigate("/dj", { replace: true });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not activate DJ access");
    } finally {
      setSubmitting(false);
    }
  };

  if (authLoading || !user || isDJ) {
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
      <div className="container max-w-lg py-10 sm:py-16">
        <div className="text-center mb-8">
          <Disc3 className="h-12 w-12 text-primary mx-auto mb-4 animate-float" strokeWidth={1.5} />
          <h1 className="text-[28px] sm:text-3xl font-semibold tracking-tight">Become a DJ on Decks</h1>
          <p className="text-muted-foreground mt-2 text-[15px]">
            Self-serve onboarding — accept the certification and you're ready to host events.
          </p>
        </div>

        <div className="p-6 sm:p-7 rounded-3xl glass-strong space-y-5">
          <div className="flex items-start gap-3 p-4 rounded-2xl bg-secondary/60">
            <ShieldCheck className="h-5 w-5 text-primary mt-0.5 shrink-0" />
            <div className="text-sm space-y-2">
              <div className="font-medium">DJ certification</div>
              <ul className="list-disc list-inside text-muted-foreground space-y-1 text-[13px]">
                <li>I will only host events I'm authorised to perform at.</li>
                <li>I will moderate explicit requests and respect venue rules.</li>
                <li>I understand Decks may suspend accounts that abuse the platform.</li>
                <li>I agree to the Terms of Service and Trust &amp; Safety policy.</li>
              </ul>
            </div>
          </div>

          <label className="flex items-start gap-3 p-3 rounded-lg bg-secondary/40 cursor-pointer">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 accent-primary"
            />
            <div className="text-sm">
              I accept the DJ certification above and want to start hosting events.
            </div>
          </label>

          <Button
            onClick={handleClaim}
            disabled={submitting || !accepted}
            variant="premium"
            className="w-full h-11"
          >
            {submitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Activate DJ access
          </Button>
        </div>
      </div>
    </div>
  );
};

export default DJOnboarding;
