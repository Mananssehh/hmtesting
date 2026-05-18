import { useEffect, useRef, useState } from "react";
import type { SongRequestRow } from "@/components/SongRequestCard";

export interface BoostEvent {
  id: string;
  songId: string;
  title: string;
  artist: string;
  requester: string;
  delta: number;
  total: number;
  at: number;
}

/**
 * Tracks boost deltas from the live song list and emits short-lived "boost events"
 * for the activity strip, floating toasts, and mega overlays.
 *
 * - Skips the initial snapshot so we don't replay history on mount.
 * - Auto-expires events after `ttlMs` so the feed stays fresh.
 */
export function useBoostFeed(songs: SongRequestRow[], ttlMs = 12000) {
  const prev = useRef<Map<string, number> | null>(null);
  const [events, setEvents] = useState<BoostEvent[]>([]);

  useEffect(() => {
    const next = new Map<string, number>();
    for (const s of songs) next.set(s.id, s.boost ?? 0);

    if (prev.current === null) {
      prev.current = next;
      return;
    }

    const newOnes: BoostEvent[] = [];
    for (const s of songs) {
      const before = prev.current.get(s.id) ?? 0;
      const after = s.boost ?? 0;
      if (after > before) {
        newOnes.push({
          id: `${s.id}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          songId: s.id,
          title: s.title,
          artist: s.artist,
          requester: s.requester_name || "Guest",
          delta: after - before,
          total: after,
          at: Date.now(),
        });
      }
    }

    prev.current = next;
    if (newOnes.length) {
      setEvents((cur) => [...newOnes, ...cur].slice(0, 20));
    }
  }, [songs]);

  // Expire old events
  useEffect(() => {
    if (events.length === 0) return;
    const t = window.setInterval(() => {
      const cutoff = Date.now() - ttlMs;
      setEvents((cur) => cur.filter((e) => e.at > cutoff));
    }, 1500);
    return () => window.clearInterval(t);
  }, [events.length, ttlMs]);

  return events;
}
