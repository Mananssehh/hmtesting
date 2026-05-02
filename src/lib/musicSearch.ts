import { supabase } from "@/integrations/supabase/client";
import { MOCK_SONGS } from "@/lib/mockSongs";

export interface MusicSearchResult {
  source_song_id: string | null;
  source_platform: "spotify" | "itunes" | "mock";
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
  provider: "spotify" | "itunes" | "mock" | "none";
  results: MusicSearchResult[];
}

let lastProviderLogged: string | null = null;
function debugProvider(p: string) {
  if (lastProviderLogged === p) return;
  lastProviderLogged = p;
  // eslint-disable-next-line no-console
  console.info(`[music-search] active provider: ${p}`);
}

function mockResults(q: string): MusicSearchResult[] {
  const needle = q.trim().toLowerCase();
  const list = needle
    ? MOCK_SONGS.filter((s) => s.title.toLowerCase().includes(needle) || s.artist.toLowerCase().includes(needle))
    : MOCK_SONGS.slice(0, 12);
  return list.slice(0, 20).map((s) => ({
    source_song_id: null,
    source_platform: "mock" as const,
    title: s.title,
    artist: s.artist,
    album: s.album,
    album_art_url: s.album_art,
    duration_ms: s.duration_ms,
    preview_url: null,
    external_url: s.external_url,
    explicit: s.explicit,
  }));
}

export async function searchMusic(query: string): Promise<MusicSearchResponse> {
  const q = query.trim();
  if (!q) {
    debugProvider("mock");
    return { provider: "mock", results: mockResults("") };
  }

  try {
    const { data, error } = await supabase.functions.invoke<MusicSearchResponse>(
      "music-search",
      { body: { q } },
    );
    if (error) throw error;
    if (data && data.results && data.results.length > 0) {
      debugProvider(data.provider);
      return data;
    }
  } catch (e) {
    // eslint-disable-next-line no-console
    console.warn("[music-search] provider failed, using mock fallback", e);
  }

  debugProvider("mock");
  return { provider: "mock", results: mockResults(q) };
}

export function normalizeKey(title: string, artist: string): string {
  return `${title}|${artist}`.toLowerCase().replace(/\s+/g, " ").trim();
}
