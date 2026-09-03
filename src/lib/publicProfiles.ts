import { supabase } from "@/integrations/supabase/client";
import { logWarning } from "@/lib/errorLogger";

/**
 * Batched, privacy-safe nickname lookup.
 *
 * Client roles have no direct SELECT on public.profiles. The only public
 * surface is the SECURITY DEFINER RPC get_public_nicknames, which returns
 * exactly { id, nickname } and accepts at most 500 ids per call.
 *
 * Returns a map of user_id -> nickname. On any failure the map is empty so
 * callers fall back to a neutral display name ("Guest") instead of guessing.
 */
const MAX_IDS = 500;

export async function fetchNicknames(
  userIds: Array<string | null | undefined>,
  source: string,
): Promise<Record<string, string>> {
  const unique = [...new Set(userIds.filter((id): id is string => !!id))];
  const map: Record<string, string> = {};
  if (unique.length === 0) return map;

  for (let i = 0; i < unique.length; i += MAX_IDS) {
    const chunk = unique.slice(i, i + MAX_IDS);
    const { data, error } = await supabase.rpc("get_public_nicknames", { _user_ids: chunk });
    if (error) {
      // Sanitized: never log or surface user ids / personal data.
      logWarning(source, "get_public_nicknames failed", {
        code: error.code ?? null,
        count: chunk.length,
      });
      return {};
    }
    for (const row of (data ?? []) as Array<{ id: string; nickname: string | null }>) {
      if (row?.id && row.nickname) map[row.id] = row.nickname;
    }
  }
  return map;
}

/** Owner-only full profile read via get_my_profile(). */
export type MyProfile = {
  id: string;
  nickname: string;
  points: number;
  is_premium: boolean;
  is_public: boolean;
  created_at: string;
  updated_at: string;
};

export async function fetchMyProfile(source: string): Promise<MyProfile | null> {
  const { data, error } = await supabase.rpc("get_my_profile");
  if (error) {
    logWarning(source, "get_my_profile failed", { code: error.code ?? null });
    return null;
  }
  return (data as unknown as MyProfile) ?? null;
}
