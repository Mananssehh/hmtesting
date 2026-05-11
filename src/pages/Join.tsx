import { useState, useEffect } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Headphones, Loader2, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AppHeader } from "@/components/AppHeader";
import { nicknameSchema, roomCodeSchema } from "@/lib/validation";
import { containsProfanity, looksSpammy } from "@/lib/profanity";

const Join = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, profile } = useAuth();
  const [code, setCode] = useState(params.get("code")?.toUpperCase() ?? "");
  const [nickname, setNickname] = useState(profile?.nickname && profile.nickname !== "Guest" ? profile.nickname : "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (profile?.nickname && profile.nickname !== "Guest" && !nickname) {
      setNickname(profile.nickname);
    }
  }, [profile, nickname]);

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    try {
      const codeParse = roomCodeSchema.safeParse(code);
      if (!codeParse.success) throw new Error(codeParse.error.issues[0].message);
      const nickParse = nicknameSchema.safeParse(nickname);
      if (!nickParse.success) throw new Error(nickParse.error.issues[0].message);
      if (containsProfanity(nickParse.data) || looksSpammy(nickParse.data)) {
        throw new Error("Please choose a different nickname.");
      }

      const DEMO_CODES = ["DEMO123", "EMPTY123", "PAUSED123", "ENDED123", "MOD123"];
      const isDemo = DEMO_CODES.includes(codeParse.data);

      // Sign in first (anonymous if needed) so demo RPCs and inserts work under RLS.
      if (!user) {
        const { error: anonError } = await supabase.auth.signInAnonymously({
          options: { data: { nickname: nickParse.data } },
        });
        if (anonError) throw anonError;
        const { data: { user: newUser } } = await supabase.auth.getUser();
        if (newUser) {
          await supabase.from("profiles").update({ nickname: nickParse.data }).eq("id", newUser.id);
        }
      } else if (profile?.nickname !== nickParse.data) {
        await supabase.from("profiles").update({ nickname: nickParse.data }).eq("id", user.id);
      }

      // For demo codes, ensure the corresponding demo event exists (idempotent, requires auth)
      if (isDemo) {
        await supabase.rpc("ensure_demo_event", { _code: codeParse.data });
      }

      // Verify event exists & is active
      const { data: event, error: eventError } = await supabase
        .from("events")
        .select("id, is_active, requests_status")
        .eq("room_code", codeParse.data)
        .maybeSingle();

      if (eventError) throw eventError;
      if (!event) throw new Error("No event with that code. Double-check with the DJ.");
      if (!isDemo && (event.requests_status === "ended" || !event.is_active)) {
        throw new Error("This event has ended");
      }

      toast.success(`Joining as ${nickParse.data}`);
      navigate(`/event/${codeParse.data}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen">
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
              onChange={(e) => setNickname(e.target.value)}
              placeholder="DanceFloorKing"
              maxLength={24}
              required
            />
          </div>

          <Button type="submit" disabled={loading} className="w-full bg-gradient-to-r from-primary to-primary-glow text-primary-foreground h-11">
            {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Join event
          </Button>

          <div className="space-y-2 pt-1">
            <p className="text-xs text-center text-muted-foreground">
              Testing? Try one of the demo codes:
            </p>
            <div className="grid grid-cols-2 gap-2">
              {[
                { code: "DEMO123", label: "Full Demo" },
                { code: "EMPTY123", label: "Empty Event" },
                { code: "PAUSED123", label: "Paused Event" },
                { code: "ENDED123", label: "Ended Event" },
                { code: "MOD123", label: "Moderation" },
              ].map((d) => (
                <Button
                  key={d.code}
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => {
                    setCode(d.code);
                    if (!nickname) setNickname("DemoGuest");
                  }}
                >
                  <Sparkles className="mr-1 h-3 w-3 text-accent" />
                  {d.label}
                </Button>
              ))}
            </div>
          </div>
          <p className="text-xs text-center text-muted-foreground">
            No signup needed. We'll create a guest session for you.
          </p>
        </form>
      </div>
    </div>
  );
};

export default Join;
