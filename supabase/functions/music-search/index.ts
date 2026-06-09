// Music search proxy with caching, rate limiting, provider abstraction,
// and a Spotify 429 circuit breaker.
import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

// ============================================================================
// Types
// ============================================================================
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

interface Provider {
  name: "spotify" | "itunes";
  available(): boolean;
  search(query: string): Promise<SearchResult[]>;
}

// ============================================================================
// Spotify provider (with circuit breaker)
// ============================================================================
let spotifyToken: { value: string; exp: number } | null = null;
let spotifyBreakerUntil = 0; // epoch ms; while > now, skip Spotify

function spotifyBreakerOpen(): boolean {
  return Date.now() < spotifyBreakerUntil;
}
function tripSpotifyBreaker(ms = 5 * 60_000) {
  spotifyBreakerUntil = Date.now() + ms;
  console.warn("[music-search] spotify circuit breaker tripped for", ms, "ms");
}

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
    if (!res.ok) {
      if (res.status === 429) tripSpotifyBreaker();
      console.warn("[music-search] spotify token failed", res.status);
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

const SpotifyProvider: Provider = {
  name: "spotify",
  available: () => !spotifyBreakerOpen(),
  async search(query) {
    const token = await getSpotifyToken();
    if (!token) return [];
    const url = `https://api.spotify.com/v1/search?q=${encodeURIComponent(query)}&type=track`;
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    if (!res.ok) {
      if (res.status === 429) tripSpotifyBreaker();
      console.warn("[music-search] spotify search failed", res.status, "q=", query);
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
  },
};

// ============================================================================
// Apple/iTunes provider
// ============================================================================
const AppleProvider: Provider = {
  name: "itunes",
  available: () => true,
  async search(query) {
    const url = `https://itunes.apple.com/search?media=music&entity=song&country=US&limit=50&term=${encodeURIComponent(query)}`;
    const res = await fetch(url);
    if (!res.ok) {
      console.warn("[music-search] itunes status", res.status, "q=", query);
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
  },
};

const PROVIDERS: Provider[] = [SpotifyProvider, AppleProvider];

// ============================================================================
// Query helpers
// ============================================================================
function queryVariants(raw: string): string[] {
  const q = raw.trim();
  const variants = new Set<string>();
  variants.add(q);
  const stripped = q
    .replace(/\b(feat\.?|ft\.?|featuring|with)\b.*$/i, " ")
    .replace(/\(.*?\)|\[.*?\]/g, " ")
    .replace(/\b(remix|version|edit|extended|radio|club mix)\b/gi, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (stripped && stripped !== q) variants.add(stripped);
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

function normalizeQuery(q: string): string {
  return norm(q);
}

function artistTokens(s: string): Set<string> {
  return new Set(norm(s).split(" ").filter((t) => t.length > 1));
}

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

function mergeResults(spotify: SearchResult[], itunes: SearchResult[]): SearchResult[] {
  const kept: SearchResult[] = [];
  const seenIds = new Set<string>();
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
    if (dupe) continue;
    kept.push(r);
  }
  return kept.slice(0, 60);
}

// ============================================================================
// Rate limiting
// ============================================================================
const USER_LIMIT = 20; // per minute
const IP_LIMIT = 60; // per minute
const WINDOW_SECONDS = 60;

async function checkAndLogRate(
  admin: SupabaseClient,
  userId: string | null,
  ip: string | null,
  endpoint: string,
): Promise<{ limited: boolean; retryAfter: number }> {
  const since = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
  try {
    if (userId) {
      const { count } = await admin
        .from("rate_limit_logs")
        .select("id", { count: "exact", head: true })
        .eq("user_id", userId)
        .eq("endpoint", endpoint)
        .gte("created_at", since);
      if ((count ?? 0) >= USER_LIMIT) {
        await admin.from("rate_limit_logs").insert({ user_id: userId, ip, endpoint });
        return { limited: true, retryAfter: WINDOW_SECONDS };
      }
    } else if (ip) {
      const { count } = await admin
        .from("rate_limit_logs")
        .select("id", { count: "exact", head: true })
        .eq("ip", ip)
        .is("user_id", null)
        .eq("endpoint", endpoint)
        .gte("created_at", since);
      if ((count ?? 0) >= IP_LIMIT) {
        await admin.from("rate_limit_logs").insert({ ip, endpoint });
        return { limited: true, retryAfter: WINDOW_SECONDS };
      }
    }
    // Log successful attempt
    await admin.from("rate_limit_logs").insert({ user_id: userId, ip, endpoint });
    return { limited: false, retryAfter: 0 };
  } catch (e) {
    console.warn("[music-search] rate-limit check failed; allowing", String(e));
    return { limited: false, retryAfter: 0 };
  }
}

// ============================================================================
// Cache
// ============================================================================
const CACHE_TTL_DAYS = 7;

interface CacheRow {
  normalized_query: string;
  results: SearchResult[];
  cached_at: string;
  expires_at: string;
}

async function readCache(admin: SupabaseClient, key: string): Promise<CacheRow | null> {
  try {
    const { data } = await admin
      .from("song_metadata")
      .select("normalized_query, results, cached_at, expires_at")
      .eq("normalized_query", key)
      .maybeSingle();
    return (data as CacheRow) ?? null;
  } catch {
    return null;
  }
}

async function writeCache(admin: SupabaseClient, key: string, results: SearchResult[]) {
  if (!results.length) return;
  const first = results[0];
  const spotify = results.find((r) => r.source_platform === "spotify");
  const apple = results.find((r) => r.source_platform === "itunes");
  const expires_at = new Date(Date.now() + CACHE_TTL_DAYS * 86400_000).toISOString();
  try {
    await admin
      .from("song_metadata")
      .upsert(
        {
          normalized_query: key,
          title: first.title,
          artist: first.artist,
          album: first.album,
          duration_ms: first.duration_ms,
          explicit: first.explicit,
          album_art_url: first.album_art_url,
          spotify_url: spotify?.external_url ?? null,
          apple_url: apple?.external_url ?? null,
          provider_ids: {
            spotify: spotify?.source_song_id ?? null,
            itunes: apple?.source_song_id ?? null,
          },
          results,
          cached_at: new Date().toISOString(),
          expires_at,
        },
        { onConflict: "normalized_query" },
      );
  } catch (e) {
    console.warn("[music-search] cache write failed", String(e));
  }
}

// Tiny in-memory in-flight dedupe (per-instance thundering herd protection)
const inflight = new Map<string, Promise<SearchResult[]>>();

async function fetchAllProviders(q: string): Promise<SearchResult[]> {
  const variants = queryVariants(q);
  const jobs: Promise<SearchResult[]>[] = [];
  for (const p of PROVIDERS) {
    if (!p.available()) continue;
    for (const v of variants) {
      jobs.push(p.search(v).catch(() => []));
    }
  }
  const arrs = await Promise.all(jobs);
  const spotifyArrs: SearchResult[][] = [];
  const itunesArrs: SearchResult[][] = [];
  let i = 0;
  for (const p of PROVIDERS) {
    if (!p.available()) continue;
    const slice = arrs.slice(i, i + variants.length);
    i += variants.length;
    if (p.name === "spotify") spotifyArrs.push(...slice);
    else itunesArrs.push(...slice);
  }
  const dedupePerProvider = (arrs: SearchResult[][]) => {
    const seen = new Set<string>();
    const out: SearchResult[] = [];
    for (const a of arrs) for (const r of a) {
      if (seen.has(r.source_song_id)) continue;
      seen.add(r.source_song_id);
      out.push(r);
    }
    return out;
  };
  return mergeResults(dedupePerProvider(spotifyArrs), dedupePerProvider(itunesArrs));
}

// ============================================================================
// Handler
// ============================================================================
Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null;
  let userId: string | null = null;
  let admin: SupabaseClient;
  try {
    const userClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
    );
    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error } = await userClient.auth.getUser(token);
    if (error || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = user.id;
    admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
  } catch (e) {
    console.error("Auth check failed", e);
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Parse query
  let q = "";
  if (req.method === "GET") {
    q = (new URL(req.url).searchParams.get("q") ?? "").trim();
  } else {
    const body = await req.json().catch(() => ({}));
    q = String(body?.q ?? "").trim();
  }
  if (!q || q.length < 2) {
    return new Response(JSON.stringify({ provider: "none", results: [] }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Rate limit
  const rl = await checkAndLogRate(admin, userId, ip, "music-search");
  if (rl.limited) {
    console.warn("[music-search] rate limited", { userId, ip });
    return new Response(
      JSON.stringify({ error: "rate_limited", message: "Search is busy. Try again in a moment." }),
      {
        status: 429,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          "Retry-After": String(rl.retryAfter),
        },
      },
    );
  }

  const key = normalizeQuery(q);

  // Cache check
  const cached = await readCache(admin, key);
  const now = Date.now();
  const isFresh = cached && new Date(cached.expires_at).getTime() > now;
  if (cached && isFresh) {
    const results = cached.results ?? [];
    const provider: "spotify" | "itunes" | "none" =
      results.length === 0 ? "none" :
        results.filter((r) => r.source_platform === "spotify").length >=
          results.filter((r) => r.source_platform === "itunes").length ? "spotify" : "itunes";
    return new Response(JSON.stringify({ provider, results, cached: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Thundering herd: dedupe concurrent fetches for the same key per instance
  let job = inflight.get(key);
  if (!job) {
    job = (async () => {
      try {
        return await fetchAllProviders(q);
      } finally {
        setTimeout(() => inflight.delete(key), 1000);
      }
    })();
    inflight.set(key, job);
  }

  let results: SearchResult[] = [];
  try {
    results = await job;
  } catch (e) {
    console.error("music-search providers failed", e);
  }

  // If providers returned nothing but we have stale cache, serve it.
  if (results.length === 0 && cached) {
    return new Response(
      JSON.stringify({
        provider: "none",
        results: cached.results ?? [],
        cached: true,
        stale: true,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }

  // Persist fresh results
  if (results.length > 0) {
    await writeCache(admin, key, results);
  }

  const provider: "spotify" | "itunes" | "none" =
    results.length === 0 ? "none" :
      results.filter((r) => r.source_platform === "spotify").length >=
        results.filter((r) => r.source_platform === "itunes").length ? "spotify" : "itunes";

  return new Response(JSON.stringify({ provider, results, cached: false }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
