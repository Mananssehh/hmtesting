// Public diagnostic: returns the Stripe account the STRIPE_SECRET_KEY belongs to.
import Stripe from "https://esm.sh/stripe@17.5.0?target=denonext";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
  const key = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  if (!key) {
    return new Response(JSON.stringify({ error: "no key" }), { status: 500, headers: { ...cors, "Content-Type": "application/json" } });
  }
  const stripe = new Stripe(key, { apiVersion: "2024-12-18.acacia", httpClient: Stripe.createFetchHttpClient() });
  try {
    const acct = await stripe.accounts.retrieve();
    return new Response(JSON.stringify({
      key_mode: key.startsWith("sk_test_") ? "test" : key.startsWith("sk_live_") ? "live" : "unknown",
      key_tail: key.slice(-4),
      account_id: acct.id,
      email: acct.email,
      business_profile: acct.business_profile,
      country: acct.country,
      type: acct.type,
      settings_dashboard: (acct as any).settings?.dashboard ?? null,
    }, null, 2), { headers: { ...cors, "Content-Type": "application/json" } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message, type: e?.type, code: e?.code }), { status: 400, headers: { ...cors, "Content-Type": "application/json" } });
  }
});
