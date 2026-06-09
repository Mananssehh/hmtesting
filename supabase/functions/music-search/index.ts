// Music search proxy: searches Spotify + iTunes in parallel across multiple
// query variants and merges results with strict dedupe so Apple-only and
// Spotify-only tracks both survive.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

interface SearchResult {
  source_song_id: string;
  source_platform: "spotify" | "itunes";
  title: string;
  artist: string;
  album: string;
  album_art_url: string | null;
  duration_ms: number;
  preview_url: string | null;
  external_url: string;
  explicit: boolean;
}

let spotifyToken: { value: string; exp: number } | null = null;

async function getSpotifyToken(): Promise<string | null> {
  const id = Deno.env.get("SPOTIFY_CLIENT_ID");
  const secret = Deno.env.get("SPOTIFY_CLIENT_SECRET");
  if (!id || !secret) {
    console.warn("[music-search] spotify creds missing", { has_id: !!id, has_secret: !!secret });
    return null;
  }
  if (spotifyToken && spotifyToken.exp > Date.now() + 30_000) return spotifyToken.value;
  try {
    const res = await fetch("https://accounts.spotify.com/api/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${btoa(`${id}:${secret}`)}`,
      },
      body: "grant_type=client_credentials",
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      console.warn("[music-search] spotify token failed", res.status, body.slice(0, 200));
      return null;
    }
    const j = await res.json();
    spotifyToken = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return spotifyToken.value;
  } catch (e) {
    console.warn("[music-search] spotify token error", String(e));
    return null;
  }
}

async function spotifyOnce(q: string, token: string): Promise<SearchResult[]> {
  // market=US (client-credentials cannot use `from_token`; that was silently
  // filtering out region-restricted catalogs and missing many tracks).
  const url = `https://api.spotify.com/v1/search?type=track&limit=50&market=US&q=${encodeURIComponent(q)}`;
  const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    console.warn("[music-search] spotify status", res.status, "q=", q);
    return [];
  }
  const j = await res.json();
  const items: any[] = j?.tracks?.items ?? [];
  return items.map((t) => ({
    source_song_id: t.id,
    source_platform: "spotify" as const,
    title: t.name,
    artist: (t.artists ?? []).map((a: any) => a.name).join(", "),
    album: t.album?.name ?? "",
    album_art_url: t.album?.images?.[0]?.url ?? null,
    duration_ms: t.duration_ms ?? 0,
    preview_url: t.preview_url ?? null,
    external_url: t.external_urls?.spotify ?? `https://open.spotify.com/track/${t.id}`,
    explicit: !!t.explicit,
  }));
}

async function itunesOnce(q: string): Promise<SearchResult[]> {
  const url = `https://itunes.apple.com/search?media=music&entity=song&country=US&limit=50&term=${encodeURIComponent(q)}`;
  const res = await fetch(url);
  if (!res.ok) {
    console.warn("[music-search] itunes status", res.status, "q=", q);
    return [];
  }
  const j = await res.json();
  const items: any[] = j?.results ?? [];
  return items.map((t) => ({
    source_song_id: String(t.trackId),
    source_platform: "itunes" as const,
    title: t.trackName ?? "Unknown",
    artist: t.artistName ?? "Unknown",
    album: t.collectionName ?? "",
    album_art_url: (t.artworkUrl100 as string | undefined)?.replace("100x100", "600x600") ?? null,
    duration_ms: t.trackTimeMillis ?? 0,
    preview_url: t.previewUrl ?? null,
    external_url: t.trackViewUrl ?? "",
    explicit: t.trackExplicitness === "explicit",
  }));
}

// Build query variants to widen coverage (afrobeat / amapiano / Ghanaian
// tracks often have inconsistent metadata across providers).
function queryVariants(raw: string): string[] {
  const q = raw.trim();
  const variants = new Set<string>();
  variants.add(q);

  // Strip parenthetical, feat/ft, remix tags
  const stripped = q
    .replace(/\b(feat\.?|ft\.?|featuring|with)\b.*$/i, " ")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\b(remix|version|edit|extended|radio|club mix)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped && stripped !== q) variants.add(stripped);

  // "title - artist" / "artist - title" swap
  if (q.includes(" - ")) {
    const [a, b] = q.split(" - ").map((s) => s.trim()).filter(Boolean);
    if (a && b) {
      variants.add(`${b} ${a}`);
      variants.add(`${a} ${b}`);
    }
  }

  return [...variants].slice(0, 4);
}

function norm(s: string): string {
  return (s ?? "")
    .toLowerCase()
    .replace(/\b(featuring|feat\.?|ft\.?|with)\b/g, " ")
    .replace(/[\(\)\[\]\{\}]/g, " ")
    .replace(/&/g, " and ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function artistTokens(s: string): Set<string> {
  return new Set(
    norm(s)
      .split(" ")
      .filter((t) => t.length > 1),
  );
}

// Strict cross-provider dedupe: titles must match exactly (normalized) AND
// the artist token sets must overlap by ≥ 1 meaningful token AND durations
// must be within 5s when both known. Otherwise keep both — different recordings.
function isSameRecording(a: SearchResult, b: SearchResult): boolean {
  if (norm(a.title) !== norm(b.title)) return false;
  const ta = artistTokens(a.artist);
  const tb = artistTokens(b.artist);
  let overlap = 0;
  for (const t of ta) if (tb.has(t)) overlap++;
  if (overlap === 0) return false;
  if (a.duration_ms > 0 && b.duration_ms > 0) {
    if (Math.abs(a.duration_ms - b.duration_ms) > 5000) return false;
  }
  return true;
}

interface MergeStats {
  spotify_raw: number;
  itunes_raw: number;
  merged: number;
  dropped_dupes: number;
}

function mergeResults(
  spotify: SearchResult[],
  itunes: SearchResult[],
): { results: SearchResult[]; stats: MergeStats } {
  const kept: SearchResult[] = [];
  const seenIds = new Set<string>();
  let dropped = 0;

  // Interleave so Apple-only tracks aren't pushed off the end.
  const interleaved: SearchResult[] = [];
  const maxLen = Math.max(spotify.length, itunes.length);
  for (let i = 0; i < maxLen; i++) {
    if (spotify[i]) interleaved.push(spotify[i]);
    if (itunes[i]) interleaved.push(itunes[i]);
  }

  for (const r of interleaved) {
    const id = `${r.source_platform}:${r.source_song_id}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    const dupe = kept.find((k) => k.source_platform !== r.source_platform && isSameRecording(k, r));
    if (dupe) {
      dropped++;
      continue;
    }
    kept.push(r);
  }

  return {
    results: kept.slice(0, 60),
    stats: {
      spotify_raw: spotify.length,
      itunes_raw: itunes.length,
      merged: kept.length,
      dropped_dupes: dropped,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await supabase.auth.getUser(token);
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch (e) {
    console.error("Auth check failed", e);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    let q = "";
    if (req.method === "GET") {
      q = (new URL(req.url).searchParams.get("q") ?? "").trim();
    } else {
      const body = await req.json().catch(() => ({}));
      q = String(body?.q ?? "").trim();
    }
    if (!q) {
      return new Response(JSON.stringify({ provider: "none", results: [] }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const variants = queryVariants(q);
    const spotifyToken = await getSpotifyToken();

    // Run all variants × both providers in parallel.
    const spotifyJobs = spotifyToken
      ? variants.map((v) => spotifyOnce(v, spotifyToken))
      : [];
    const itunesJobs = variants.map((v) => itunesOnce(v));

    const [spotifyArrs, itunesArrs] = await Promise.all([
      Promise.all(spotifyJobs),
      Promise.all(itunesJobs),
    ]);

    // Flatten + per-provider dedupe by id (preserve order across variants).
    const seenSp = new Set<string>();
    const spotify: SearchResult[] = [];
    for (const arr of spotifyArrs) {
      for (const r of arr) {
        if (seenSp.has(r.source_song_id)) continue;
        seenSp.add(r.source_song_id);
        spotify.push(r);
      }
    }
    const seenIt = new Set<string>();
    const itunes: SearchResult[] = [];
    for (const arr of itunesArrs) {
      for (const r of arr) {
        if (seenIt.has(r.source_song_id)) continue;
        seenIt.add(r.source_song_id);
        itunes.push(r);
      }
    }

    const { results, stats } = mergeResults(spotify, itunes);

    const provider: "spotify" | "itunes" | "none" =
      results.length === 0 ? "none" : spotify.length >= itunes.length ? "spotify" : "itunes";

    if (results.length < 3) {
      console.warn(
        "[music-search] low-result",
        JSON.stringify({ q, variants, ...stats, returned: results.length }),
      );
    } else {
      console.log("[music-search] ok", JSON.stringify({ q, ...stats, returned: results.length }));
    }

    return new Response(JSON.stringify({ provider, results, stats }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("music-search error", e);
    return new Response(
      JSON.stringify({ provider: "error", results: [] }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
