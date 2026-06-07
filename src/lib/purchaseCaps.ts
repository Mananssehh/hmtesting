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
  maxSingleCents: 2000, // $20
  max24hCents: 5000, // $50
  maxPerEvent: 10,
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
