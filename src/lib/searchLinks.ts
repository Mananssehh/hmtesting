// External search-link helpers. We never embed playback — these just open
// the DJ's preferred app/site in a new tab so they can pull up the track.

export interface SongMeta {
  title: string;
  artist: string;
}

const q = (s: SongMeta) => encodeURIComponent(`${s.title} ${s.artist}`.trim());

export const searchLinks = {
  spotify: (s: SongMeta) => `https://open.spotify.com/search/${q(s)}`,
  appleMusic: (s: SongMeta) => `https://music.apple.com/us/search?term=${q(s)}`,
  youtube: (s: SongMeta) => `https://www.youtube.com/results?search_query=${q(s)}`,
  soundcloud: (s: SongMeta) => `https://soundcloud.com/search?q=${q(s)}`,
  google: (s: SongMeta) => `https://www.google.com/search?q=${q(s)}`,
};

export const djCopyText = (s: SongMeta) => `${s.title} - ${s.artist}`;

export function formatDuration(ms?: number | null): string | null {
  if (!ms || ms <= 0) return null;
  const total = Math.round(ms / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

export const platformLabel = (p?: string | null): string => {
  if (!p) return "Catalog";
  const map: Record<string, string> = {
    spotify: "Spotify",
    itunes: "Apple Music",
    apple_music: "Apple Music",
    youtube: "YouTube",
    soundcloud: "SoundCloud",
  };
  return map[p] ?? p;
};
