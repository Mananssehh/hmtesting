import { supabase } from "@/integrations/supabase/client";
import { MOCK_SONGS } from "@/lib/mockSongs";

const DEMO_GUESTS = [
  "NeonRider", "BassQueen", "DiscoDuke", "MidnightMia", "PulseKid",
  "StrobeSam", "VinylVee", "GlowPilot", "RaveRoxy", "SubwooferSid",
];

/**
 * Seed an event with a realistic-looking crowd:
 * - 10 song requests with varied vote counts and one big boost
 * - distinct fake "requester_name" labels per row
 * Rows are owned by the DJ (RLS) but display fake names so it feels live.
 */
export async function seedDemoEvent(eventId: string) {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not signed in");

  const picks = [...MOCK_SONGS].sort(() => Math.random() - 0.5).slice(0, 10);

  const inserts = picks.map((song, i) => ({
    event_id: eventId,
    requested_by: user.id,
    requester_name: DEMO_GUESTS[i % DEMO_GUESTS.length],
    title: song.title,
    artist: song.artist,
    album_art: song.album_art,
    external_url: song.external_url,
    boost: i === 0 ? 30 : i === 1 ? 10 : 0,
    upvotes: Math.max(0, 18 - i * 2 + Math.floor(Math.random() * 4)),
    downvotes: Math.floor(Math.random() * 3),
    status: (i === 9 ? "playing" : "pending") as "playing" | "pending",
  }));

  const { data: rows, error } = await supabase
    .from("song_requests")
    .insert(inserts)
    .select("id");
  if (error) {
    // Likely a duplicate from a previous seed — surface a friendly message
    if (error.code === "23505") throw new Error("Demo songs already exist in this event");
    throw error;
  }
  return { count: rows?.length ?? 0 };
}

/** Wipe all song requests from an event (DJ-owned, used by demo reset). */
export async function resetDemoEvent(eventId: string) {
  const { error } = await supabase.from("song_requests").delete().eq("event_id", eventId);
  if (error) throw error;
}
