// Mock song search catalog — no copyrighted playback, just metadata for requests.
export interface MockSong {
  title: string;
  artist: string;
  album_art: string;
  external_url: string;
}

const palette = ["#ec4899", "#22d3ee", "#a855f7", "#f59e0b", "#10b981", "#3b82f6", "#ef4444", "#eab308"];
const cover = (seed: string) =>
  `https://api.dicebear.com/7.x/shapes/svg?seed=${encodeURIComponent(seed)}&backgroundColor=${palette
    .map((c) => c.slice(1))
    .join(",")}`;

const raw: Array<[string, string]> = [
  ["Blinding Lights", "The Weeknd"],
  ["One Dance", "Drake"],
  ["Levitating", "Dua Lipa"],
  ["Bad Guy", "Billie Eilish"],
  ["Sunflower", "Post Malone"],
  ["Heat Waves", "Glass Animals"],
  ["Shape of You", "Ed Sheeran"],
  ["Stay", "The Kid LAROI"],
  ["As It Was", "Harry Styles"],
  ["Flowers", "Miley Cyrus"],
  ["Industry Baby", "Lil Nas X"],
  ["Save Your Tears", "The Weeknd"],
  ["Watermelon Sugar", "Harry Styles"],
  ["Peaches", "Justin Bieber"],
  ["Anti-Hero", "Taylor Swift"],
  ["Unholy", "Sam Smith"],
  ["About Damn Time", "Lizzo"],
  ["Calm Down", "Rema"],
  ["Title Track", "DJ Demo"],
  ["Closer", "The Chainsmokers"],
  ["Don't Start Now", "Dua Lipa"],
  ["Rockstar", "DaBaby"],
  ["Mood", "24kGoldn"],
  ["Dance Monkey", "Tones and I"],
  ["Lose Yourself", "Eminem"],
  ["Uptown Funk", "Mark Ronson"],
  ["Hotline Bling", "Drake"],
  ["Cheap Thrills", "Sia"],
  ["Despacito", "Luis Fonsi"],
  ["Believer", "Imagine Dragons"],
];

export const MOCK_SONGS: MockSong[] = raw.map(([title, artist]) => ({
  title,
  artist,
  album_art: cover(`${title}-${artist}`),
  external_url: `https://open.spotify.com/search/${encodeURIComponent(`${title} ${artist}`)}`,
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
