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

  const row: Record<string, any> = {
    event_id: integration.event_id,
    title: b.title,
    artist: b.artist || "",
    album_art: b.album_art ?? null,
    apple_url: null as string | null,
    spotify_url: null as string | null,
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
  // Dice coefficient on character bigrams — robust title similarity.
  const bigrams = (s: string) => {
    const out = new Map<string, number>();
    for (let i = 0; i < s.length - 1; i++) {
      const g = s.slice(i, i + 2);
      out.set(g, (out.get(g) ?? 0) + 1);
    }
    return out;
  };
  const similarity = (a: string, b: string) => {
    if (!a || !b) return 0;
    if (a === b) return 1;
    if (a.length < 2 || b.length < 2) return 0;
    const ba = bigrams(a);
    const bb = bigrams(b);
    let inter = 0;
    let total = 0;
    for (const v of ba.values()) total += v;
    for (const [k, v] of bb) {
      total += v;
      const av = ba.get(k);
      if (av) inter += Math.min(av, v);
    }
    return (2 * inter) / total;
  };

  const npTitleN = normalize(b.title);
  const npArtistN = normalize(b.artist);
  console.log("[bridge-match] now playing", { title: b.title, artist: b.artist });

  let matchedRequestId: string | null = null;
  try {
    // Only consider requests that are still actionable (never auto-mark played/skipped/removed twice).
    const { data: candidates } = await supabase
      .from("song_requests")
      .select("id, title, artist, album_art, album_art_url, external_url, source_platform, status, upvotes, downvotes, boost, created_at")
      .eq("event_id", integration.event_id)
      .in("status", ["pending", "approved"]);

    if (candidates && candidates.length) {
      // 1) Exact normalized title+artist (or title alone when one side has no artist).
      let matches = candidates.filter((c: any) => {
        const t = normalize(c.title);
        const a = normalize(c.artist);
        if (!t || t !== npTitleN) return false;
        if (npArtistN && a) return a === npArtistN;
        return true;
      });
      let matchType = "exact";

      // 2) Strong title similarity fallback (Dice ≥ 0.92). When artist is known on
      //    both sides, require artist similarity too to avoid false positives.
      if (!matches.length) {
        matches = candidates.filter((c: any) => {
          const t = normalize(c.title);
          const a = normalize(c.artist);
          const titleSim = similarity(t, npTitleN);
          if (titleSim < 0.92) return false;
          if (npArtistN && a) return similarity(a, npArtistN) >= 0.85;
          return true;
        });
        matchType = "similarity";
      }

      if (matches.length) {
        // Highest score, then newest.
        matches.sort((a: any, b: any) => {
          const sa = (a.upvotes ?? 0) - (a.downvotes ?? 0) + (a.boost ?? 0);
          const sb = (b.upvotes ?? 0) - (b.downvotes ?? 0) + (b.boost ?? 0);
          if (sa !== sb) return sb - sa;
          return +new Date(b.created_at) - +new Date(a.created_at);
        });
        matchedRequestId = matches[0].id;
        console.log("[bridge-match] matched", { matchType, id: matchedRequestId });

        // Backfill album_art + provider URLs from the matched request when the
        // bridge didn't supply them, so the broadcast row never has title/artist
        // from this track + art/links from another.
        if (!row.album_art) {
          const matchedArt = matches[0].album_art || matches[0].album_art_url || null;
          if (matchedArt) row.album_art = matchedArt;
        }
        const sp = (matches[0].source_platform ?? "").toLowerCase();
        const ext = (matches[0].external_url ?? "").trim();
        if (ext) {
          if ((sp === "itunes" || sp === "apple_music") && !row.apple_url) row.apple_url = ext;
          if (sp === "spotify" && !row.spotify_url) row.spotify_url = ext;
        }

        const { error: markErr } = await supabase
          .from("song_requests")
          .update({
            status: "played",
            played_at: new Date().toISOString(),
            played_by_source: "decks_bridge",
          })
          .eq("id", matchedRequestId)
          .in("status", ["pending", "approved"]);
        if (markErr) console.error("[bridge-match] mark played failed:", markErr);
      } else {
        console.log("[bridge-match] no confident match");
      }
    } else {
      console.log("[bridge-match] no active candidates");
    }
  } catch (e) {
    console.error("[bridge-match] error:", e);
  }

  // Final fallback: when neither bridge nor a matched request supplied artwork,
  // look it up on iTunes (no auth required, same provider used by music-search).
  let artSource: "bridge" | "request_backfill" | "itunes_lookup" | "none" =
    b.album_art ? "bridge" : row.album_art ? "request_backfill" : "none";
  if (!row.album_art) {
    try {
      const term = `${b.title} ${b.artist ?? ""}`.trim();
      const url = `https://itunes.apple.com/search?media=music&entity=song&country=US&limit=5&term=${encodeURIComponent(term)}`;
      const res = await fetch(url);
      if (res.ok) {
        const j = await res.json();
        const first = (j?.results ?? [])[0];
        const art = (first?.artworkUrl100 as string | undefined)?.replace("100x100", "600x600") ?? null;
        if (art) {
          row.album_art = art;
          artSource = "itunes_lookup";
        }
      }
    } catch (e) {
      console.error("[np-art] itunes lookup failed:", e);
    }
  }

  const rowWithMatch = { ...row, now_playing_request_id: matchedRequestId };
  console.log("[np-write] decks_bridge", {
    title: rowWithMatch.title,
    artist: rowWithMatch.artist,
    album_art: rowWithMatch.album_art,
    art_source: artSource,
    source: rowWithMatch.source,
    matched_request_id: matchedRequestId,
  });

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
