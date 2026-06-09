import { supabase } from "@/integrations/supabase/client";

export interface MusicSearchResult {
  source_song_id: string | null;
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

export interface MusicSearchResponse {
  provider: "spotify" | "itunes" | "none";
  results: MusicSearchResult[];
  cached?: boolean;
  stale?: boolean;
}

export class RateLimitedError extends Error {
  retryAfter: number;
  constructor(retryAfter: number) {
    super("Search is busy. Try again in a moment.");
    this.retryAfter = retryAfter;
    this.name = "RateLimitedError";
  }
}

export async function searchMusic(query: string): Promise<MusicSearchResponse> {
  const q = query.trim();
  if (q.length < 2) return { provider: "none", results: [] };

  const { data, error } = await supabase.functions.invoke<MusicSearchResponse & { error?: string }>(
    "music-search",
    { body: { q } },
  );
  if (error) {
    // supabase-js FunctionsHttpError surfaces non-2xx; inspect context if present
    const ctx: any = (error as any).context;
    const status = ctx?.status ?? ctx?.response?.status;
    if (status === 429) {
      const retryAfter = Number(ctx?.response?.headers?.get?.("Retry-After")) || 60;
      throw new RateLimitedError(retryAfter);
    }
    throw error;
  }
  if ((data as any)?.error === "rate_limited") {
    throw new RateLimitedError(60);
  }
  return data ?? { provider: "none", results: [] };
}

export function normalizeKey(title: string, artist: string): string {
  return `${title}|${artist}`.toLowerCase().replace(/\s+/g, " ").trim();
}
