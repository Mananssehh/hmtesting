// Centralised version string for purchase / boost consent.
// Bumping this value forces a fresh consent re-prompt before checkout.
// Keep this in sync with the copy shown in the (future) checkout modal and
// with any server-side enforcement in Stripe edge functions.
import { supabase } from "@/integrations/supabase/client";

// Bumped when tip disclaimer/limit copy changes — forces a fresh consent prompt.
export const CURRENT_CONSENT_VERSION = "v2-tips-2026-06-12";

export interface ConsentRow {
  id: string;
  user_id: string;
  version: string;
  accepted_at: string;
}

/**
 * Records consent for the current user against the active version.
 * Idempotent — unique (user_id, version) means re-submitting is a no-op.
 */
export async function recordConsent(version: string = CURRENT_CONSENT_VERSION): Promise<ConsentRow | null> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return null;

  const ua = typeof navigator !== "undefined" ? navigator.userAgent : null;
  const { data, error } = await (supabase as any)
    .from("purchase_consents")
    .insert({ user_id: u.user.id, version, user_agent: ua })
    .select("*")
    .maybeSingle();

  // 23505 = unique_violation: already consented to this version, treat as success
  if (error && (error as any).code !== "23505") throw error;
  return (data as ConsentRow | null) ?? null;
}

/**
 * Returns true when the current user has already accepted the given version.
 */
export async function hasConsented(version: string = CURRENT_CONSENT_VERSION): Promise<boolean> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return false;
  const { data } = await (supabase as any)
    .from("purchase_consents")
    .select("id")
    .eq("user_id", u.user.id)
    .eq("version", version)
    .maybeSingle();
  return !!data;
}
