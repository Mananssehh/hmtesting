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

  // Find existing now_playing row for this event (one row per event in practice).
  const { data: existing } = await supabase
    .from("now_playing")
    .select("id")
    .eq("event_id", integration.event_id)
    .maybeSingle();

  if (existing?.id) {
    const { error } = await supabase.from("now_playing").update(row).eq("id", existing.id);
    if (error) {
      console.error("now_playing update failed:", error);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  } else {
    const { error } = await supabase.from("now_playing").insert(row);
    if (error) {
      console.error("now_playing insert failed:", error);
      return jsonResponse({ error: "Internal server error" }, 500);
    }
  }

  await supabase
    .from("event_integrations")
    .update({ last_seen_at: new Date().toISOString() })
    .eq("id", integration.id);

  return jsonResponse({ ok: true });
});
