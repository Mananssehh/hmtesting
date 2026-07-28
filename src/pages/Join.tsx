import { useState, useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Headphones, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import { SEO } from "@/components/SEO";
import { SiteFooter } from "@/components/SiteFooter";
import { nicknameSchema, roomCodeSchema } from "@/lib/validation";
import { containsProfanity, looksSpammy } from "@/lib/profanity";
import { GuestLimitReachedDialog } from "@/components/GuestLimitReachedDialog";
import { fetchGuestEventCount, fetchGuestJoinLimits } from "@/hooks/useGuestJoinLimits";

const Join = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, profile, isAnonymous, loading: authLoading, refreshProfile } = useAuth();
  const [blockOpen, setBlockOpen] = useState(false);
  const [code, setCode] = useState(params.get("code")?.toUpperCase() ?? "");
  const initialNickname = profile?.nickname && profile.nickname !== "Guest" ? profile.nickname : "";
  const [nickname, setNickname] = useState(initialNickname);
  const [hasEditedNickname, setHasEditedNickname] = useState(false);
  const [loading, setLoading] = useState(false);
  const autoJoinedRef = useRef(false);

  // QR route loaded — log for the auth-aware join flow.
  useEffect(() => {
    console.log("[Join] QR route loaded", {
      code: params.get("code"),
      hasUser: !!user,
      isAnonymous,
    });
  }, []);

  // Prefill nickname only once when profile first loads, and only if the user hasn't started editing.
  useEffect(() => {
    if (hasEditedNickname) return;
    if (nickname) return;
    if (profile?.nickname && profile.nickname !== "Guest") {
      setNickname(profile.nickname);
    }
  }, [profile, hasEditedNickname, nickname]);

  // If a real (non-anonymous) session already exists AND a QR code is present,
  // skip the nickname form and drop the user into the event. Existing users
  // should never be asked to "sign up again" when scanning a QR poster.
  useEffect(() => {
    if (authLoading) return;
    if (autoJoinedRef.current) return;
    const qrCode = (params.get("code") || "").toUpperCase();
    if (!qrCode) {
      if (!user) console.log("[Join] No session found — showing join/login options");
      return;
    }
    if (!user || isAnonymous) return;
    if (!profile) return; // wait so we can pass nickname through nav state
    const parsed = roomCodeSchema.safeParse(qrCode);
    if (!parsed.success) return;
    autoJoinedRef.current = true;
    console.log("[Join] Existing authenticated user — auto-joining event", parsed.data);
    navigate(`/event/${parsed.data}`, {
      replace: true,
      state: { nickname: profile.nickname || "Guest" },
    });
  }, [authLoading, user, isAnonymous, profile, params, navigate]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const codeParse = roomCodeSchema.safeParse(code);
      if (!codeParse.success) throw new Error(codeParse.error.issues[0].message);
      const trimmedNickname = nickname.trim();
      if (!trimmedNickname) throw new Error("Enter a nickname.");
      const nickParse = nicknameSchema.safeParse(trimmedNickname);
      if (!nickParse.success) throw new Error(nickParse.error.issues[0].message);
      if (containsProfanity(nickParse.data) || looksSpammy(nickParse.data)) {
        throw new Error("Please choose a different nickname.");
      }

      // Sign in first (anonymous if needed) so inserts work under RLS.
      if (!user) {
        const { error: anonError } = await supabase.auth.signInAnonymously({
          options: { data: { nickname: nickParse.data } },
        });
        if (anonError) throw anonError;
      }

      // Guarantee a profile row exists AND its nickname matches what the
      // guest just typed. Uses a SECURITY DEFINER RPC that upserts the row,
      // so we no longer depend on the handle_new_user trigger having created
      // the profile (it occasionally misses for anonymous sign-ins, which
      // caused the displayed name to fall back to "Guest").
      const { error: ensureErr } = await (supabase as any).rpc("ensure_profile", {
        p_nickname: nickParse.data,
      });
      if (ensureErr) throw new Error(ensureErr.message || "Could not save nickname");

      // Verify event exists & is active
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("id, is_active, requests_status")
        .eq("room_code", codeParse.data)
        .maybeSingle();

      if (eventError) throw eventError;
      if (!event) throw new Error("No event with that code. Double-check with the DJ.");
      if (event.requests_status === "ended" || !event.is_active) {
        throw new Error("This event has ended");
      }

      // Guest join-limit gate. Only applies to anonymous / signed-out users.
      // Signed-in permanent accounts are never gated.
      const { data: sess } = await supabase.auth.getSession();
      const uid = sess.session?.user?.id ?? null;
      const isAnon = sess.session?.user?.is_anonymous === true;
      if (uid && isAnon) {
        // Have they already joined this specific event? If so, no new unique
        // event is being added — never gate re-entry.
        const { data: existing } = await supabase
          .from("event_participants")
          .select("event_id")
          .eq("event_id", event.id)
          .eq("user_id", uid)
          .maybeSingle();
        const alreadyJoined = !!existing;

        if (!alreadyJoined) {
          const [limits, currentCount] = await Promise.all([
            fetchGuestJoinLimits(),
            fetchGuestEventCount(),
          ]);
          if (limits.enabled) {
            const projected = currentCount + 1;
            if (projected >= limits.require_at) {
              setLoading(false);
              setBlockOpen(true);
              return;
            }
            if (projected === limits.prompt_at) {
              sessionStorage.setItem(`decks:guest_prompt_pending:${event.id}`, "1");
            }
          }
        }
      }

      // Refresh the in-memory profile so EventPage sees the correct nickname
      // on first render (avoids the "Guest" fallback during AuthContext load).
      await refreshProfile();

      toast.success(`Joining as ${nickParse.data}`);
      navigate(`/event/${codeParse.data}`, { state: { nickname: nickParse.data } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEO title="Join the party" description="Enter the DJ's room code to request songs, vote, and tip the DJ in real time." path="/join" />
      <AppHeader />
      <div className="container max-w-md py-12">
        <div className="text-center mb-8">
          <Headphones className="h-12 w-12 text-primary mx-auto mb-3 animate-float" />
          <h1 className="text-3xl font-bold">Join the party</h1>
          <p className="text-muted-foreground mt-1">Enter the room code from the DJ</p>
        </div>

        <form onSubmit={handleJoin} className="p-6 rounded-2xl glass space-y-4">
          <div className="space-y-2">
            <Label htmlFor="code">Room code</Label>
            <Input
              id="code"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\s+/g, "").toUpperCase().slice(0, 10))}
              placeholder="ABC123"
              className="text-center font-mono text-2xl tracking-widest h-16 uppercase"
              autoFocus
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="nick">Your nickname</Label>
            <Input
              id="nick"
              value={nickname}
              onChange={(e) => {
                setHasEditedNickname(true);
                setNickname(e.target.value);
              }}
              placeholder="DanceFloorKing"
              maxLength={24}
            />

          </div>

          <Button type="submit" disabled={loading} variant="premium" className="w-full h-11">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Join event
          </Button>

          <p className="text-xs text-center text-muted-foreground">
            No signup needed — we'll create a guest session for you.
          </p>
          {!user && (
            <p className="text-xs text-center text-muted-foreground">
              Already have an account?{" "}
              <button
                type="button"
                className="text-primary underline underline-offset-2"
                onClick={() => {
                  const c = code.trim().toUpperCase();
                  const next = c ? `/join?code=${encodeURIComponent(c)}` : "/join";
                  console.log("[Join] Redirecting to login with next", next);
                  navigate(`/auth?next=${encodeURIComponent(next)}`);
                }}
              >
                Log in
              </button>
            </p>
          )}
        </form>
      </div>
      <div className="flex-1" />
      <SiteFooter />
      <GuestLimitReachedDialog
        open={blockOpen}
        onOpenChange={setBlockOpen}
        roomCode={code.trim().toUpperCase()}
      />
    </div>
  );
};

export default Join;
