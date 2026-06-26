import { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Loader2 } from "lucide-react";

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;

type State =
  | { kind: "loading" }
  | { kind: "ready" }
  | { kind: "already" }
  | { kind: "invalid" }
  | { kind: "submitting" }
  | { kind: "success" }
  | { kind: "error"; message: string };

export default function Unsubscribe() {
  const [params] = useSearchParams();
  const token = params.get("token");
  const [state, setState] = useState<State>({ kind: "loading" });

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    (async () => {
      try {
        const res = await fetch(
          `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe?token=${encodeURIComponent(token)}`,
          { headers: { apikey: SUPABASE_ANON } },
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setState({ kind: "invalid" });
          return;
        }
        if (data?.valid === false && data?.reason === "already_unsubscribed") {
          setState({ kind: "already" });
        } else if (data?.valid) {
          setState({ kind: "ready" });
        } else {
          setState({ kind: "invalid" });
        }
      } catch (e) {
        setState({ kind: "error", message: (e as Error).message });
      }
    })();
  }, [token]);

  async function confirm() {
    if (!token) return;
    setState({ kind: "submitting" });
    try {
      const res = await fetch(
        `${SUPABASE_URL}/functions/v1/handle-email-unsubscribe`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SUPABASE_ANON },
          body: JSON.stringify({ token }),
        },
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && (data.success || data.reason === "already_unsubscribed")) {
        setState({ kind: "success" });
      } else {
        setState({ kind: "error", message: data?.error ?? "Could not process unsubscribe." });
      }
    } catch (e) {
      setState({ kind: "error", message: (e as Error).message });
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <Card className="max-w-md w-full p-8 space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Email preferences</h1>
        {state.kind === "loading" && (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Checking link…
          </div>
        )}
        {state.kind === "ready" && (
          <>
            <p className="text-muted-foreground">
              Click below to unsubscribe from non-essential Decks emails.
              You'll still receive receipts and security notices.
            </p>
            <Button onClick={confirm} className="w-full">Confirm unsubscribe</Button>
          </>
        )}
        {state.kind === "submitting" && (
          <div className="flex items-center justify-center py-6 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin mr-2" /> Updating…
          </div>
        )}
        {state.kind === "success" && (
          <>
            <p>You've been unsubscribed. Sorry to see you go.</p>
            <Link to="/"><Button variant="outline" className="w-full">Back to Decks</Button></Link>
          </>
        )}
        {state.kind === "already" && (
          <>
            <p className="text-muted-foreground">This address is already unsubscribed.</p>
            <Link to="/"><Button variant="outline" className="w-full">Back to Decks</Button></Link>
          </>
        )}
        {state.kind === "invalid" && (
          <p className="text-muted-foreground">
            This unsubscribe link is invalid or has expired. If you're still receiving
            emails you don't want, contact <a className="underline" href="mailto:support@linku99.com">support@linku99.com</a>.
          </p>
        )}
        {state.kind === "error" && (
          <p className="text-destructive text-sm">{state.message}</p>
        )}
      </Card>
    </div>
  );
}
