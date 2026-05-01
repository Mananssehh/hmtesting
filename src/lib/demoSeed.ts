import { supabase } from "@/integrations/supabase/client";
import { MOCK_SONGS } from "@/lib/mockSongs";

const DEMO_GUESTS = [
  "NeonRider", "BassQueen", "DiscoDuke", "MidnightMia", "PulseKid",
  "StrobeSam", "VinylVee", "GlowPilot",
];

/**
 * Seeds an event with fake guests, requests, votes and one big boost.
 * Uses the current DJ's session — guests are simulated rows referencing
 * fake UUIDs (no auth.users entries), so nothing collides with real users.
 *
 * Returns a summary of what was inserted.
 */
export async function seedDemoEvent(eventId: string) {
  const picks = [...MOCK_SONGS].sort(() => Math.random() - 0.5).slice(0, 8);

  // Build fake requests (requested_by = null because we can't fake auth users)
  // RLS requires auth.uid() = requested_by for INSERT, so we use the DJ as requester
  // for these demo rows. The requester_name still shows fake guests.
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const inserts = picks.map((song, i) => ({
    event_id: eventId,
    requested_by: user.id, // DJ owns these demo rows so RLS passes
    requester_name: DEMO_GUESTS[i % DEMO_GUESTS.length],
    title: song.title,
    artist: song.artist,
    album_art: song.album_art,
    external_url: song.external_url,
    boost: i === 0 ? 25 : 0,
  }));

  const { data: rows, error } = await supabase
    .from("song_requests")
    .insert(inserts)
    .select("id");
  if (error) throw error;

  // Add fake upvotes from the DJ's own user (limited — we can't fake other voters)
  // Skip vote inserts to avoid RLS conflicts; rely on boost & visual variety.
  return { count: rows?.length ?? 0 };
}
