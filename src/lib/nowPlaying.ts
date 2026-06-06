import { supabase } from "@/integrations/supabase/client";

export type NowPlayingStatus = "playing" | "mixing" | "paused";

export interface NowPlayingRow {
  id: string;
  event_id: string;
  title: string;
  artist: string | null;
  album_art: string | null;
  apple_url: string | null;
  spotify_url: string | null;
  source: string | null;
  status: NowPlayingStatus;
  updated_at: string;
}

export interface NowPlayingInput {
  eventId: string;
  title: string;
  artist?: string;
  albumArt?: string;
  source?: string;
  status?: NowPlayingStatus;
}

export async function updateNowPlaying({
  eventId,
  title,
  artist = "",
  albumArt = "",
  source = "manual",
  status = "playing",
}: NowPlayingInput): Promise<NowPlayingRow> {
  if (!eventId || !title) throw new Error("eventId and title are required");

  const { data, error } = await (supabase as any)
    .from("now_playing")
    .upsert(
      {
        event_id: eventId,
        title,
        artist,
        album_art: albumArt,
        source,
        status,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "event_id" }
    )
    .select()
    .single();

  if (error) throw error;
  return data as NowPlayingRow;
}

export async function fetchNowPlaying(eventId: string): Promise<NowPlayingRow | null> {
  const { data, error } = await (supabase as any)
    .from("now_playing")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();
  if (error) throw error;
  return (data as NowPlayingRow) ?? null;
}
