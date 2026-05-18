// Now Playing ingest endpoint.
// Helper apps (Serato bridge, custom scripts) POST track metadata here using
// a per-event ingest_token. We never accept audio — only metadata.
//
// POST /functions/v1/now-playing-ingest
// Headers:  X-Ingest-Token: <token from event_integrations.ingest_token>
// Body: {
//   title: string (required),
//   artist?: string,
//   album_art?: string,
//   source?: "serato" | "helper" | "manual" | string,
//   source_track_id?: string,
//   status?: "playing" | "mixing" | "paused",
//   started_at?: string (ISO)
// }
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";
import { z } from "https://esm.sh/zod@3.23.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-ingest-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const BodySchema = z.object({
  title: z.string().trim().min(1).max(300),
  artist: z.string().trim().max(300).optional().default(""),
  album_art: z.string().url().max(2000).optional().nullable(),
  source: z.string().trim().max(40).optional().default("helper"),
  source_track_id: z.string().trim().max(200).optional().nullable(),
  status: z.enum(["playing", "mixing", "paused"]).optional().default("playing"),
  started_at: z.string().datetime().optional(),
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return jsonResponse({ error: "Method not allowed" }, 405);

  const token = req.headers.get("x-ingest-token") ?? "";
  if (!token || token.length < 16) return jsonResponse({ error: "Missing ingest token" }, 401);

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Look up integration by token.
  const { data: integration, error: integErr } = await supabase
    .from("event_integrations")
    .select("id, event_id, source_type")
    .eq("ingest_token", token)
    .maybeSingle();

  if (integErr || !integration) return jsonResponse({ error: "Invalid token" }, 401);

  const rawBody = await req.json().catch(() => ({}));

  // Bridge heartbeat: mark integration as seen without touching now_playing.
  if (rawBody && typeof rawBody === "object" && (rawBody as any).type === "bridge_connected") {
    const { error: hbErr } = await supabase
      .from("event_integrations")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", integration.id);
    if (hbErr) {
      console.error("bridge heartbeat update failed:", hbErr);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
    return jsonResponse({ ok: true, type: "bridge_connected" });
  }

  const parsed = BodySchema.safeParse(rawBody);
  if (!parsed.success) {
    return jsonResponse({ error: parsed.error.flatten().fieldErrors }, 400);
  }
  const b = parsed.data;

  const row = {
    event_id: integration.event_id,
    title: b.title,
    artist: b.artist || "",
    album_art: b.album_art ?? null,
    source: b.source || integration.source_type || "helper",
    source_track_id: b.source_track_id ?? null,
    status: b.status,
    started_at: b.started_at ?? new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  // --- Auto-match against song_requests for this event ---
  // Normalize text: lowercase, strip feat/ft, strip non-alphanumerics.
  const normalize = (s: string | null | undefined) => {
    if (!s) return "";
    return s
      .toLowerCase()
      .replace(/\(feat\.?[^)]*\)|\[feat\.?[^\]]*\]/g, " ")
      .replace(/\s+(feat\.?|ft\.?)\s+.*$/g, " ")
      .replace(/[^a-z0-9]+/g, "");
  };
  const npTitleN = normalize(b.title);
  const npArtistN = normalize(b.artist);
  console.log("[bridge-match] now playing title/artist", { title: b.title, artist: b.artist });

  let matchedRequestId: string | null = null;
  try {
    const { data: candidates } = await supabase
      .from("song_requests")
      .select("id, title, artist, status, upvotes, downvotes, boost, created_at")
      .eq("event_id", integration.event_id)
      .not("status", "in", "(removed,skipped)");

    if (candidates && candidates.length) {
      const matches = candidates.filter((c: any) => {
        const t = normalize(c.title);
        const a = normalize(c.artist);
        if (!t) return false;
        if (t !== npTitleN) return false;
        // If both sides have artist, require artist match; otherwise title alone is enough.
        if (npArtistN && a) return a === npArtistN;
        return true;
      });
      if (matches.length) {
        // Prefer not-yet-played; then highest score; then newest.
        const statusRank = (s: string) =>
          s === "played" ? 2 : 1; // active first
        matches.sort((a: any, b: any) => {
          const ra = statusRank(a.status);
          const rb = statusRank(b.status);
          if (ra !== rb) return ra - rb;
          const sa = (a.upvotes ?? 0) - (a.downvotes ?? 0) + (a.boost ?? 0);
          const sb = (b.upvotes ?? 0) - (b.downvotes ?? 0) + (b.boost ?? 0);
          if (sa !== sb) return sb - sa;
          return +new Date(b.created_at) - +new Date(a.created_at);
        });
        matchedRequestId = matches[0].id;
        console.log("[bridge-match] matched request id", matchedRequestId);

        if (matches[0].status !== "played") {
          const { error: markErr } = await supabase
            .from("song_requests")
            .update({
              status: "played",
              played_at: new Date().toISOString(),
              played_by_source: "bridge",
            })
            .eq("id", matchedRequestId);
          if (markErr) console.error("[bridge-match] mark played failed:", markErr);
        }
      } else {
        console.log("[bridge-match] no match found");
      }
    } else {
      console.log("[bridge-match] no match found");
    }
  } catch (e) {
    console.error("[bridge-match] error:", e);
  }

  const rowWithMatch = { ...row, now_playing_request_id: matchedRequestId };

  // Find existing now_playing row for this event (one row per event in practice).
  const { data: existing } = await supabase
    .from("now_playing")
    .select("id")
    .eq("event_id", integration.event_id)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("now_playing").update(rowWithMatch).eq("id", existing.id);
    if (error) {
      console.error("now_playing update failed:", error);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  } else {
    const { error } = await supabase.from("now_playing").insert(rowWithMatch);
    if (error) {
      console.error("now_playing insert failed:", error);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  }

  await supabase
    .from("event_integrations")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", integration.id);

  return jsonResponse({ ok: true, matched_request_id: matchedRequestId });
});
