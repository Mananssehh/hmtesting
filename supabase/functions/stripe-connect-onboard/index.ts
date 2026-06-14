// Creates (or reuses) a Stripe Connect Express account for the calling DJ
// and returns a Stripe-hosted onboarding URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getStripe, json } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;
    const email = (claims.claims.email as string | undefined) ?? undefined;

    // Must be a DJ
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "dj")
      .maybeSingle();
    if (!roles) return json({ error: "DJ role required" }, 403);

    const body = await req.json().catch(() => ({}));
    const returnUrl = (body.return_url as string) ||
      `${req.headers.get("origin") ?? ""}/dj?stripe=return`;
    const refreshUrl = (body.refresh_url as string) ||
      `${req.headers.get("origin") ?? ""}/dj?stripe=refresh`;

    const stripe = getStripe();

    // Reuse existing account if any
    const { data: existing } = await admin
      .from("dj_payout_accounts")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();

    let accountId = existing?.stripe_account_id as string | undefined;
    if (!accountId) {
      const acct = await stripe.accounts.create({
        type: "express",
        email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true },
        },
        business_type: "individual",
        metadata: { user_id: userId, app: "decks" },
      });
      accountId = acct.id;
      await admin.from("dj_payout_accounts").upsert({
        user_id: userId,
        stripe_account_id: accountId,
        charges_enabled: acct.charges_enabled,
        payouts_enabled: acct.payouts_enabled,
        details_submitted: acct.details_submitted,
        livemode: acct.livemode,
        last_synced_at: new Date().toISOString(),
      });
    }

    const link = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: refreshUrl,
      return_url: returnUrl,
      type: "account_onboarding",
    });

    return json({ url: link.url, account_id: accountId });
  } catch (e) {
    console.error("[stripe-connect-onboard]", e);
    return json({ error: (e as Error).message ?? "Onboarding failed" }, 400);
  }
});
