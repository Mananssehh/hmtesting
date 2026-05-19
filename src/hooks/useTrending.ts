import { useEffect, useMemo, useRef, useState } from "react";
import type { SongRequestRow } from "@/components/SongRequestCard";

interface BoostDelta { at: number; delta: number }

/**
 * Tracks per-song boost deltas over a rolling window and computes a
 * "trending" score that heavily weights very recent activity.
 *
 * Trending = hot RIGHT NOW (recent boosts, acceleration, recency)
 * Top      = best overall (computed separately as upvotes + boost*2)
 */
export function useTrending(songs: SongRequestRow[], windowMs = 5 * 60_000) {
  const prevBoost = useRef<Map<string, number>>(new Map());
  const history = useRef<Map<string, BoostDelta[]>>(new Map());
  const [tick, setTick] = useState(0);

  // Capture boost deltas as they arrive via realtime updates
  useEffect(() => {
    const now = Date.now();
    for (const s of songs) {
      const before = prevBoost.current.get(s.id);
      const after = s.boost ?? 0;
      if (before !== undefined && after > before) {
        const arr = history.current.get(s.id) ?? [];
        arr.push({ at: now, delta: after - before });
        history.current.set(s.id, arr);
      }
      prevBoost.current.set(s.id, after);
    }
  }, [songs]);

  // Periodic re-eval so the "hot now" score decays naturally
  useEffect(() => {
    const t = window.setInterval(() => setTick((n) => n + 1), 15000);
    return () => window.clearInterval(t);
  }, []);

  return useMemo(() => {
    const now = Date.now();
    const cutoff = now - windowMs;
    const scoreMap = new Map<string, number>();
    const recentBoostMap = new Map<string, number>();
    const recentBurstMap = new Map<string, number>();

    for (const s of songs) {
      const arr = (history.current.get(s.id) ?? []).filter((e) => e.at > cutoff);
      history.current.set(s.id, arr);

      const recentBoost = arr.reduce((sum, e) => sum + e.delta, 0);
      const recentEvents = arr.length;
      // burst = boosts in last 60s
      const burst = arr.filter((e) => e.at > now - 60_000).reduce((s, e) => s + e.delta, 0);

      const ageMin = Math.max(1, (now - +new Date(s.created_at)) / 60_000);
      const recencyBoost = ageMin < 10 ? (10 - ageMin) * 0.5 : 0;

      // Heavily weight recent momentum over historical totals
      const trendingScore =
        recentBoost * 4 +
        burst * 3 +
        recentEvents * 2 +
        Math.max(0, s.upvotes - s.downvotes) * 0.4 +
        recencyBoost;

      scoreMap.set(s.id, trendingScore);
      recentBoostMap.set(s.id, recentBoost);
      recentBurstMap.set(s.id, burst);
    }

    const hotIds = new Set<string>();
    for (const [id, score] of scoreMap) {
      if (score >= 8) hotIds.add(id);
    }

    return { scoreMap, recentBoostMap, recentBurstMap, hotIds };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [songs, tick, windowMs]);
}
