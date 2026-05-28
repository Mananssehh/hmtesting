// Music search proxy: searches Spotify + iTunes in parallel and merges results.
// iTunes requires no API key; Spotify is optional.
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
  if (!id || !secret) return null;
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
    if (!res.ok) return null;
    const j = await res.json();
    spotifyToken = { value: j.access_token, exp: Date.now() + (j.expires_in ?? 3600) * 1000 };
    return spotifyToken.value;
  } catch {
    return null;
  }
}

async function searchSpotify(q: string): Promise<SearchResult[] | null> {
  const token = await getSpotifyToken();
  if (!token) return null;
  try {
    // Higher limit + multi-market fallback to catch region-only tracks
    const url = `https://api.spotify.com/v1/search?type=track&limit=50&market=from_token&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      console.warn("[music-search] spotify status", res.status);
      return null;
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
  } catch (e) {
    console.warn("[music-search] spotify error", e);
    return null;
  }
}

async function searchItunes(q: string): Promise<SearchResult[] | null> {
  try {
    const url = `https://itunes.apple.com/search?media=music&entity=song&limit=50&term=${encodeURIComponent(q)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("[music-search] itunes status", res.status);
      return null;
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
  } catch (e) {
    console.warn("[music-search] itunes error", e);
    return null;
  }
}

// Loose normalization for dedupe: lowercase, drop punctuation, collapse
// common variants (feat./ft./featuring, &/and, remix tags, parens).
function normalizeForDedupe(title: string, artist: string): string {
  const norm = (s: string) =>
    (s ?? "")
      .toLowerCase()
      // Replace common collaborator markers
      .replace(/\b(featuring|feat\.?|ft\.?|with)\b/g, " ")
      // Strip parenthetical remix/version tags but keep the words
      .replace(/[\(\)\[\]\{\}]/g, " ")
      // & -> and
      .replace(/&/g, " and ")
      // Remove punctuation
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      // Collapse whitespace
      .replace(/\s+/g, " ")
      .trim();
  return `${norm(title)}|${norm(artist).split(" ")[0] ?? ""}`;
}

function mergeResults(spotify: SearchResult[], itunes: SearchResult[]): SearchResult[] {
  // Prefer Spotify entries when duplicate; always append unique iTunes entries.
  const seen = new Map<string, SearchResult>();
  const order: string[] = [];
  for (const r of [...spotify, ...itunes]) {
    const key = `${r.source_platform}:${r.source_song_id}`;
    const dupeKey = normalizeForDedupe(r.title, r.artist);
    // Hard-dedupe by same-platform id
    if (seen.has(key)) continue;
    // Soft dedupe across providers: keep the first (spotify wins because it iterates first)
    const existing = [...seen.values()].find(
      (s) => normalizeForDedupe(s.title, s.artist) === dupeKey,
    );
    if (existing) continue;
    seen.set(key, r);
    order.push(key);
  }
  return order.map((k) => seen.get(k)!).slice(0, 50);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  // Require an authenticated caller to prevent anonymous abuse of our Spotify quota
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
    const { data, error } = await supabase.auth.getClaims(token);
    if (error || !data?.claims) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  } catch {
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

    // Query both providers in parallel
    const [spotifyRes, itunesRes] = await Promise.all([
      searchSpotify(q),
      searchItunes(q),
    ]);
    const spotify = spotifyRes ?? [];
    const itunes = itunesRes ?? [];

    const merged = mergeResults(spotify, itunes);

    const provider: "spotify" | "itunes" | "none" =
      merged.length === 0
        ? "none"
        : spotify.length > 0 && itunes.length > 0
        ? "spotify"
        : spotify.length > 0
        ? "spotify"
        : "itunes";

    return new Response(JSON.stringify({ provider, results: merged }), {
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
