// Client-side wrapper around the server-side cap guard.
// The DB function `check_boost_purchase_cap` is the source of truth —
// this wrapper just lets the UI pre-check before opening the consent modal
// so we can show a friendly error without burning a Stripe round-trip.
//
// The actual enforcement runs again inside the future Stripe checkout edge
// function before any PaymentIntent is created. Never rely on this client
// check alone.
import { supabase } from "@/integrations/supabase/client";

export const PURCHASE_CAPS = {
  /** Maximum single tip: $50.00 */
  maxSingleCents: 5000,
  /** Maximum tips in a rolling 24h window across all events: $100.00 */
  max24hCents: 10000,
  /** Maximum tips per event/night for one user: $100.00 */
  maxPerEventCents: 10000,
} as const;

export interface CapCheckResult {
  ok: boolean;
  error?: string;
}

export async function checkBoostPurchaseCap(args: {
  amountCents: number;
  eventId?: string | null;
}): Promise<CapCheckResult> {
  const { data: u } = await supabase.auth.getUser();
  if (!u?.user) return { ok: false, error: "Sign in required" };

  const { error } = await (supabase as any).rpc("check_boost_purchase_cap", {
    _user_id: u.user.id,
    _event_id: args.eventId ?? null,
    _amount_cents: args.amountCents,
  });

  if (error) return { ok: false, error: error.message ?? "Purchase blocked" };
  return { ok: true };
}
