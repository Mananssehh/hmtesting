// Stress test orchestrator (DEV ONLY).
// Uses service-role to seed fake participants/requests/votes/now_playing rows.
// Requires the caller to be authenticated AND the DJ owner of the target event.
// All inserted rows are tagged so cleanup can wipe them safely.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const STRESS_TAG = "[STRESS]";
const STRESS_SOURCE = "stress_test";

const SAMPLE_TRACKS = [
  { title: "FE!N", artist: "Travis Scott" },
  { title: "Strobe", artist: "Deadmau5" },
  { title: "One More Time", artist: "Daft Punk" },
  { title: "Levels", artist: "Avicii" },
  { title: "Animals", artist: "Martin Garrix" },
  { title: "Titanium", artist: "David Guetta" },
  { title: "Clarity", artist: "Zedd" },
  { title: "Wake Me Up", artist: "Avicii" },
  { title: "Midnight City", artist: "M83" },
  { title: "Get Lucky", artist: "Daft Punk" },
];

const FAKE_NAMES = [
  "NeonRider","BassQueen","DiscoDuke","MidnightMia","PulseKid","StrobeSam","VinylVee","GlowPilot",
  "EchoFox","RaveOwl","SubBass","NovaJay","LumenKai","HazePete","ZenithLuna","OrbitMo","SyncoNi",
  "FluxRey","KineticEli","ApexSky","GammaTed","HyperZoe","IonRiv","JoltMax","KiloAri",
];

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function rand<T>(arr: T[]) { return arr[Math.floor(Math.random() * arr.length)]; }

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return jsonResponse({ error: "Missing auth" }, 401);

  const userClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return jsonResponse({ error: "Invalid auth" }, 401);

  let body: { event_id?: string; action?: string; count?: number; title?: string; artist?: string };
  try { body = await req.json(); } catch { return jsonResponse({ error: "Invalid JSON" }, 400); }
  const { event_id, action } = body;
  if (!event_id || !action) return jsonResponse({ error: "event_id + action required" }, 400);

  const admin = createClient(SUPABASE_URL, SERVICE_KEY);

  // Ownership check
  const { data: ev } = await admin.from("events").select("id, dj_id").eq("id", event_id).maybeSingle();
  if (!ev || ev.dj_id !== user.id) return jsonResponse({ error: "Not the DJ for this event" }, 403);

  try {
    if (action === "seed_participants") {
      const count = Math.min(Math.max(body.count ?? 25, 1), 100);
      const rows = Array.from({ length: count }, (_, i) => ({
        event_id,
        user_id: crypto.randomUUID(),
        nickname: `${STRESS_TAG} ${FAKE_NAMES[i % FAKE_NAMES.length]}`,
      }));
      const { error } = await admin.from("event_participants").insert(rows);
      if (error) throw error;
      return jsonResponse({ ok: true, inserted: rows.length });
    }

    if (action === "burst_requests") {
      const count = Math.min(Math.max(body.count ?? 5, 1), 50);
      const rows = Array.from({ length: count }, () => {
        const t = rand(SAMPLE_TRACKS);
        return {
          event_id,
          requested_by: crypto.randomUUID(),
          requester_name: `${STRESS_TAG} ${rand(FAKE_NAMES)}`,
          title: t.title,
          artist: t.artist,
          status: "pending" as const,
          source_platform: STRESS_SOURCE,
        };
      });
      const { error } = await admin.from("song_requests").insert(rows);
      if (error) throw error;
      return jsonResponse({ ok: true, inserted: rows.length });
    }

    if (action === "burst_votes") {
      const count = Math.min(Math.max(body.count ?? 10, 1), 100);
      const { data: reqs } = await admin
        .from("song_requests")
        .select("id")
        .eq("event_id", event_id)
        .eq("source_platform", STRESS_SOURCE)
        .order("created_at", { ascending: false })
        .limit(20);
      if (!reqs || reqs.length === 0) return jsonResponse({ ok: true, inserted: 0, note: "no stress requests yet" });
      const rows = Array.from({ length: count }, () => ({
        song_request_id: rand(reqs).id,
        user_id: crypto.randomUUID(),
        value: Math.random() < 0.85 ? 1 : -1,
      }));
      const { error } = await admin.from("votes").insert(rows);
      if (error) throw error;
      return jsonResponse({ ok: true, inserted: rows.length });
    }

    if (action === "now_playing") {
      const t = body.title && body.artist ? { title: body.title, artist: body.artist } : rand(SAMPLE_TRACKS);
      const { error } = await admin.from("now_playing").upsert(
        {
          event_id,
          title: t.title,
          artist: t.artist,
          album_art: null,
          source: STRESS_SOURCE,
          status: "playing",
          updated_at: new Date().toISOString(),
        },
        { onConflict: "event_id" },
      );
      if (error) throw error;
      return jsonResponse({ ok: true, title: t.title, artist: t.artist });
    }

    if (action === "cleanup") {
      // Delete in dependency order. Stress votes are linked via stress song_requests.
      const { data: reqs } = await admin
        .from("song_requests").select("id")
        .eq("event_id", event_id).eq("source_platform", STRESS_SOURCE);
      const ids = (reqs ?? []).map((r) => r.id);
      if (ids.length) await admin.from("votes").delete().in("song_request_id", ids);
      await admin.from("song_requests").delete().eq("event_id", event_id).eq("source_platform", STRESS_SOURCE);
      await admin.from("event_participants").delete().eq("event_id", event_id).like("nickname", `${STRESS_TAG}%`);
      await admin.from("now_playing").delete().eq("event_id", event_id).eq("source", STRESS_SOURCE);
      return jsonResponse({ ok: true, cleaned: { requests: ids.length } });
    }

    return jsonResponse({ error: "Unknown action" }, 400);
  } catch (err) {
    return jsonResponse({ error: (err as Error).message }, 500);
  }
});
