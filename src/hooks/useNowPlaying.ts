import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { fetchNowPlaying, NowPlayingRow } from "@/lib/nowPlaying";

export function useNowPlaying(eventId: string | undefined) {
  const [nowPlaying, setNowPlaying] = useState<NowPlayingRow | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!eventId) return;
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let backoff = 1000;
    let reconnectTimer: number | null = null;

    const refresh = async () => {
      try {
        const row = await fetchNowPlaying(eventId);
        console.log("[now-playing hook] fetched row", { eventId, row });
        if (!cancelled) setNowPlaying(row);
      } catch (e) {
        console.error("fetchNowPlaying", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    let subscribing = false;
    const subscribe = () => {
      if (subscribing || cancelled) return;
      subscribing = true;
      if (channel) {
        try { supabase.removeChannel(channel); } catch { /* noop */ }
        channel = null;
      }
      const ch = supabase
        .channel(`now-playing-${eventId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`)
        .on(
          "postgres_changes",
          {
            event: "*",
            schema: "public",
            table: "now_playing",
            filter: `event_id=eq.${eventId}`,
          },
          (payload) => {
            if (payload.eventType === "DELETE") setNowPlaying(null);
            else setNowPlaying(payload.new as NowPlayingRow);
            refresh();
          },
        );
      channel = ch;
      ch.subscribe((status) => {
        subscribing = false;
        if (status === "SUBSCRIBED") {
          backoff = 1000;
        } else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
          if (reconnectTimer) window.clearTimeout(reconnectTimer);
          reconnectTimer = window.setTimeout(() => {
            if (!cancelled) {
              refresh();
              subscribe();
              backoff = Math.min(backoff * 2, 30000);
            }
          }, backoff);
        }
      });
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !cancelled) {
        // Mobile may have killed the socket while backgrounded — pull fresh + resubscribe.
        refresh();
        subscribe();
      }
    };

    const onOnline = () => {
      if (!cancelled) {
        refresh();
        subscribe();
      }
    };

    refresh();
    subscribe();
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onOnline);

    return () => {
      cancelled = true;
      if (reconnectTimer) window.clearTimeout(reconnectTimer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onOnline);
      if (channel) supabase.removeChannel(channel);
    };
  }, [eventId]);

  return { nowPlaying, loading };
}
