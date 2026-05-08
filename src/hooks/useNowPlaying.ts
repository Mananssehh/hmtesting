import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchNowPlaying, NowPlayingRow } from "@/lib/nowPlaying";

export function useNowPlaying(eventId: string | undefined) {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;

    (async () => {
      try {
        const row = await fetchNowPlaying(eventId);
        if (!cancelled) setNowPlaying(row);
      } catch (e) {
        console.error("fetchNowPlaying", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    const channel = supabase
      .channel(`now-playing-${eventId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "now_playing",
          filter: `event_id=eq.${eventId}`,
        },
        (payload) => {
          if (payload.eventType === "DELETE") {
            setNowPlaying(null);
          } else {
            setNowPlaying(payload.new as NowPlayingRow);
          }
        }
      )
      .subscribe();

    return () => {
      cancelled = true;
      supabase.removeChannel(channel);
    };
  }, [eventId]);

  return { nowPlaying, loading };
}
