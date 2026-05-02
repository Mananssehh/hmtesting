import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowLeft, BarChart3, Copy, Loader2, ListMusic, Settings } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { AppHeader } from "@/components/AppHeader";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { generateRoomCode } from "@/lib/mockSongs";

interface EventRow {
  id: string;
  name: string;
  venue: string | null;
  dj_name: string;
  room_code: string;
  created_at: string;
  ended_at: string | null;
  requests_status: string;
  is_active: boolean;
  allow_explicit: boolean;
  require_approval: boolean;
  cooldown_seconds: number;
  rules_text: string | null;
}

const Archive = () => {
  const { user, isDJ, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [events, setEvents] = useState<EventRow[]>([]);
  const [counts, setCounts] = useState<Record<string, { reqs: number; played: number }>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!authLoading && (!user || !isDJ)) navigate("/auth", { replace: true });
  }, [user, isDJ, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const { data } = await supabase
        .from("events").select("*").eq("dj_id", user.id)
        .order("created_at", { ascending: false });
      const list = (data ?? []) as EventRow[];
      setEvents(list);
      if (list.length) {
        const { data: reqs } = await supabase
          .from("song_requests").select("event_id, status").in("event_id", list.map((e) => e.id));
        const c: Record<string, { reqs: number; played: number }> = {};
        for (const r of reqs ?? []) {
          c[r.event_id] = c[r.event_id] ?? { reqs: 0, played: 0 };
          c[r.event_id].reqs += 1;
          if (r.status === "played") c[r.event_id].played += 1;
        }
        setCounts(c);
      }
      setLoading(false);
    })();
  }, [user]);

  const duplicate = async (ev: EventRow) => {
    if (!user) return;
    let code = generateRoomCode();
    for (let i = 0; i < 5; i++) {
      const { data: existing } = await supabase.from("events").select("id").eq("room_code", code).maybeSingle();
      if (!existing) break;
      code = generateRoomCode();
    }
    const { data, error } = await supabase.from("events").insert({
      dj_id: user.id,
      name: `${ev.name} (copy)`,
      venue: ev.venue,
      dj_name: ev.dj_name,
      room_code: code,
      allow_explicit: ev.allow_explicit,
      require_approval: ev.require_approval,
      cooldown_seconds: ev.cooldown_seconds,
      rules_text: ev.rules_text,
    }).select().single();
    if (error) return toast.error(error.message);
    toast.success("Event duplicated");
    navigate(`/dj/${data.id}`);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen">
        <AppHeader />
        <div className="container py-20 flex justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </div>
    );
  }

  const past = events.filter((e) => e.requests_status === "ended");
  const live = events.filter((e) => e.requests_status !== "ended");

  return (
    <div className="min-h-screen">
      <AppHeader />
      <main className="container max-w-5xl py-8 space-y-6">
        <div>
          <Button asChild variant="ghost" size="sm" className="mb-2 -ml-3">
            <Link to="/dj"><ArrowLeft className="h-4 w-4 mr-1" />Back to dashboard</Link>
          </Button>
          <h1 className="text-3xl font-bold">Event archive</h1>
          <p className="text-muted-foreground text-sm mt-1">Past events, recaps and exports.</p>
        </div>

        {live.length > 0 && (
          <Section title="Active / paused">
            <Grid items={live} counts={counts} onDuplicate={duplicate} />
          </Section>
        )}

        <Section title={`Past events (${past.length})`}>
          {past.length === 0 ? (
            <Card className="bg-card/60"><CardContent className="py-12 text-center text-muted-foreground text-sm">No archived events yet.</CardContent></Card>
          ) : (
            <Grid items={past} counts={counts} onDuplicate={duplicate} />
          )}
        </Section>
      </main>
    </div>
  );
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-xs uppercase tracking-wider text-muted-foreground font-semibold mb-3">{title}</h2>
      {children}
    </section>
  );
}

function Grid({ items, counts, onDuplicate }: {
  items: EventRow[];
  counts: Record<string, { reqs: number; played: number }>;
  onDuplicate: (e: EventRow) => void;
}) {
  return (
    <div className="grid sm:grid-cols-2 gap-3">
      {items.map((ev) => {
        const c = counts[ev.id] ?? { reqs: 0, played: 0 };
        return (
          <Card key={ev.id} className="bg-card/60 hover:border-primary/40 transition-colors">
            <CardContent className="py-4 space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="font-semibold truncate">{ev.name}</div>
                  <div className="text-xs text-muted-foreground truncate">
                    {ev.venue ? `${ev.venue} · ` : ""}DJ {ev.dj_name}
                  </div>
                </div>
                <Badge variant={ev.requests_status === "ended" ? "secondary" : "default"} className={ev.requests_status === "live" ? "bg-primary/20 text-primary border-primary/40" : ""}>
                  {ev.requests_status}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <span><ListMusic className="inline h-3.5 w-3.5 mr-1" />{c.reqs} reqs · {c.played} played</span>
                <span>{new Date(ev.created_at).toLocaleDateString()}</span>
              </div>
              <div className="flex gap-2 flex-wrap">
                <Button asChild size="sm" variant="outline">
                  <Link to={`/dj/${ev.id}`}><Settings className="mr-1 h-4 w-4" />Open</Link>
                </Button>
                <Button asChild size="sm" variant="outline">
                  <Link to={`/dj/${ev.id}/analytics`}><BarChart3 className="mr-1 h-4 w-4" />Analytics</Link>
                </Button>
                <Button size="sm" variant="ghost" onClick={() => onDuplicate(ev)}>
                  <Copy className="mr-1 h-4 w-4" />Duplicate
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export default Archive;
