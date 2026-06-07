import { useState, useEffect } from "react";
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

const Join = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { user, profile } = useAuth();
  const [code, setCode] = useState(params.get("code")?.toUpperCase() ?? "");
  const initialNickname = profile?.nickname && profile.nickname !== "Guest" ? profile.nickname : "";
  const [nickname, setNickname] = useState(initialNickname);
  const [hasEditedNickname, setHasEditedNickname] = useState(false);
  const [loading, setLoading] = useState(false);

  // Prefill nickname only once when profile first loads, and only if the user hasn't started editing.
  useEffect(() => {
    if (hasEditedNickname) return;
    if (nickname) return;
    if (profile?.nickname && profile.nickname !== "Guest") {
      setNickname(profile.nickname);
    }
  }, [profile, hasEditedNickname, nickname]);

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
        const { data: { user: newUser } } = await supabase.auth.getUser();
        if (newUser) {
          await supabase.from("profiles").update({ nickname: nickParse.data }).eq("id", newUser.id);
        }
      } else if (profile?.nickname !== nickParse.data) {
        await supabase.from("profiles").update({ nickname: nickParse.data }).eq("id", user.id);
      }

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

      toast.success(`Joining as ${nickParse.data}`);
      navigate(`/event/${codeParse.data}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not join");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <SEO title="Join the party" description="Enter the DJ's room code to request songs, vote, and boost tracks in real time." path="/join" />
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
            No signup needed. We'll create a guest session for you.
          </p>
        </form>
      </div>
    </div>
  );
};

export default Join;
