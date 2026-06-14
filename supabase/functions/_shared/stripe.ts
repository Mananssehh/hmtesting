// Shared Stripe helpers for tip / Connect functions.
// HARD GUARD: refuse any non-test secret key so live mode stays OFF until
// explicitly approved by the user.
import Stripe from "https://esm.sh/stripe@17.5.0?target=denonext";

export const PLATFORM_FEE_BPS = 3000; // 30%

export function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  if (!key.startsWith("sk_test_")) {
    throw new Error(
      "Live Stripe keys are blocked. Only sk_test_* keys are accepted in this build.",
    );
  }
  return new Stripe(key, {
    apiVersion: "2024-12-18.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, stripe-signature",
  "Access-Control-Allow-Methods": "POST, GET, OPTIONS",
};

export function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function computeFee(grossCents: number) {
  const platform_fee_cents = Math.floor((grossCents * PLATFORM_FEE_BPS) / 10000);
  return {
    platform_fee_cents,
    net_amount_cents: grossCents - platform_fee_cents,
  };
}
