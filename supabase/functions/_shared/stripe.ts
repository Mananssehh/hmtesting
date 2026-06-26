// Shared Stripe helpers for tip / Connect functions.
// Accepts both sk_test_ and sk_live_ keys. Mode is determined by the key
// prefix; downstream code can inspect it via getStripeMode().
import Stripe from "https://esm.sh/stripe@17.5.0?target=denonext";

export const PLATFORM_FEE_BPS = 3000; // 30%

export function getStripeMode(): "test" | "live" | "unknown" {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (key.startsWith("sk_live_")) return "live";
  if (key.startsWith("sk_test_")) return "test";
  return "unknown";
}

export function getStripe(): Stripe {
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  if (!key.startsWith("sk_test_") && !key.startsWith("sk_live_")) {
    throw new Error("STRIPE_SECRET_KEY must start with sk_test_ or sk_live_");
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
