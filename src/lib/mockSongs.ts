// Mock song search catalog — no copyrighted playback, just metadata for requests.
export interface MockSong {
  title: string;
  artist: string;
  album: string;
  album_art: string;
  external_url: string;
  duration_ms: number;
  explicit: boolean;
  source_platform: "mock";
}

const palette = ["ec4899", "22d3ee", "a855f7", "f59e0b", "10b981", "3b82f6", "ef4444", "eab308"];
const cover = (seed: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${palette.join(",")}`;

// [title, artist, album, durationSec, explicit]
const raw: Array<[string, string, string, number, boolean]> = [
  ["Blinding Lights", "The Weeknd", "After Hours", 200, false],
  ["One Dance", "Drake", "Views", 173, false],
  ["Levitating", "Dua Lipa", "Future Nostalgia", 203, false],
  ["Bad Guy", "Billie Eilish", "When We All Fall Asleep", 194, false],
  ["Sunflower", "Post Malone", "Spider-Man: Into the Spider-Verse", 158, false],
  ["Heat Waves", "Glass Animals", "Dreamland", 238, false],
  ["Shape of You", "Ed Sheeran", "÷", 233, false],
  ["Stay", "The Kid LAROI", "F*ck Love 3", 141, true],
  ["As It Was", "Harry Styles", "Harry's House", 167, false],
  ["Flowers", "Miley Cyrus", "Endless Summer Vacation", 200, false],
  ["Industry Baby", "Lil Nas X", "Montero", 212, true],
  ["Save Your Tears", "The Weeknd", "After Hours", 215, false],
  ["Watermelon Sugar", "Harry Styles", "Fine Line", 174, false],
  ["Peaches", "Justin Bieber", "Justice", 198, true],
  ["Anti-Hero", "Taylor Swift", "Midnights", 200, false],
  ["Unholy", "Sam Smith", "Gloria", 156, true],
  ["About Damn Time", "Lizzo", "Special", 191, false],
  ["Calm Down", "Rema", "Rave & Roses", 239, false],
  ["Closer", "The Chainsmokers", "Collage", 244, false],
  ["Don't Start Now", "Dua Lipa", "Future Nostalgia", 183, false],
  ["Rockstar", "DaBaby", "Blame It on Baby", 181, true],
  ["Mood", "24kGoldn", "El Dorado", 140, true],
  ["Dance Monkey", "Tones and I", "The Kids Are Coming", 209, false],
  ["Lose Yourself", "Eminem", "8 Mile", 326, true],
  ["Uptown Funk", "Mark Ronson", "Uptown Special", 269, false],
  ["Hotline Bling", "Drake", "Views", 267, false],
  ["Cheap Thrills", "Sia", "This Is Acting", 224, false],
  ["Despacito", "Luis Fonsi", "Vida", 229, false],
  ["Believer", "Imagine Dragons", "Evolve", 204, false],
];

export const MOCK_SONGS: MockSong[] = raw.map(([title, artist, album, dur, explicit]) => ({
  title,
  artist,
  album,
  album_art: cover(`${title}-${artist}`),
  external_url: `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`,
  duration_ms: dur * 1000,
  explicit,
  source_platform: "mock",
}));

export function searchMockSongs(query: string): MockSong[] {
  const q = query.trim().toLowerCase();
  if (!q) return MOCK_SONGS.slice(0, 12);
  return MOCK_SONGS.filter(
    (s) => s.title.toLowerCase().includes(q) || s.artist.toLowerCase().includes(q),
  ).slice(0, 20);
}

export function generateRoomCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => chars[Math.floor(Math.random() * chars.length)]).join("");
}
