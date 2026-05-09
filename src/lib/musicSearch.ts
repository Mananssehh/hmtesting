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
}

export async function searchMusic(query: string): Promise<MusicSearchResponse> {
  const q = query.trim();
  if (!q) return { provider: "none", results: [] };

  const { data, error } = await supabase.functions.invoke<MusicSearchResponse>(
    "music-search",
    { body: { q } },
  );
  if (error) throw error;
  return data ?? { provider: "none", results: [] };
}

export function normalizeKey(title: string, artist: string): string {
  return `${title}|${artist}`.toLowerCase().replace(/\s+/g, " ").trim();
}
