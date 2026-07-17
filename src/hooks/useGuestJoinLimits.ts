import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export interface GuestJoinLimits {
  enabled: boolean;
  prompt_at: number;
  require_at: number;
  bonus_points: number;
}

const DEFAULTS: GuestJoinLimits = {
  enabled: true,
  prompt_at: 3,
  require_at: 4,
  bonus_points: 0,
};

let cache: GuestJoinLimits | null = null;
let inflight: Promise<GuestJoinLimits> | null = null;

export async function fetchGuestJoinLimits(): Promise<GuestJoinLimits> {
  if (cache) return cache;
  if (inflight) return inflight;
  inflight = (async () => {
    try {
      const { data } = await (supabase as any).rpc("get_guest_join_limits");
      const v = (data ?? {}) as Partial<GuestJoinLimits>;
      cache = { ...DEFAULTS, ...v };
    } catch {
      cache = DEFAULTS;
    } finally {
      inflight = null;
    }
    return cache!;
  })();
  return inflight;
}

export async function fetchGuestEventCount(): Promise<number> {
  try {
    const { data } = await (supabase as any).rpc("get_guest_event_count");
    return typeof data === "number" ? data : 0;
  } catch {
    return 0;
  }
}

export function useGuestJoinLimits() {
  const [limits, setLimits] = useState<GuestJoinLimits | null>(cache);
  useEffect(() => {
    let alive = true;
    fetchGuestJoinLimits().then((l) => {
      if (alive) setLimits(l);
    });
    return () => {
      alive = false;
    };
  }, []);
  return limits ?? DEFAULTS;
}
