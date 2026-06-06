import { Button } from "@/components/ui/button";
import { lovable } from "@/integrations/lovable/index";
import { toast } from "sonner";
import { useState } from "react";
import { Loader2 } from "lucide-react";

export function AppleButton({ label = "Continue with Apple" }: { label?: string }) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    const result = await lovable.auth.signInWithOAuth("apple", {
      redirect_uri: window.location.origin,
    });
    if (result.error) {
      toast.error(result.error instanceof Error ? result.error.message : "Apple sign-in failed");
      setLoading(false);
      return;
    }
    if (result.redirected) {
      // Browser will redirect to Apple — let it happen.
      return;
    }
    // Tokens returned directly — session is already set by lovable auth.
  };

  return (
    <Button
      type="button"
      variant="outline"
      onClick={handleClick}
      disabled={loading}
      className="w-full h-11 bg-background/60 hover:bg-background"
    >
      {loading ? (
        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
      ) : (
        <svg className="mr-2 h-4 w-4" viewBox="0 0 814 1000" fill="currentColor" aria-hidden="true">
          <path d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 781.3 0 644.8 0 514.2c0-170.5 109.3-261.1 216.8-261.1 58.2 0 106.6 38.5 143.3 38.5 34.9 0 90.1-40.9 165.8-40.9 26.6 0 122.1 2.3 186.1 102.4l.6.9zm-402.8-74.1c31.5-37.6 52.7-89.6 52.7-141.7 0-7.3-.6-14.7-1.9-20.7-50.6 1.9-110.4 33.7-146.5 75.8-29.1 33.4-55.5 86.2-55.5 138.8 0 8 1.3 16 1.9 18.5 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.7-72.6z" />
        </svg>
      )}
      {label}
    </Button>
  );
}
