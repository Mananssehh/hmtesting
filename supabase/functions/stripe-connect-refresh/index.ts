// Re-fetches the DJ's Stripe Connect account status and syncs charges_enabled
// / payouts_enabled / details_submitted into dj_payout_accounts.
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
    const { data: claims } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (!claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: row } = await admin
      .from("dj_payout_accounts")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!row?.stripe_account_id) {
      return json({
        status: "not_started",
        charges_enabled: false,
        payouts_enabled: false,
        details_submitted: false,
      });
    }

    const stripe = getStripe();
    const acct = await stripe.accounts.retrieve(row.stripe_account_id);

    await admin.from("dj_payout_accounts").update({
      charges_enabled: acct.charges_enabled,
      payouts_enabled: acct.payouts_enabled,
      details_submitted: acct.details_submitted,
      livemode: acct.livemode,
      last_synced_at: new Date().toISOString(),
    }).eq("user_id", userId);

    let status = "pending";
    if (acct.charges_enabled && acct.payouts_enabled) status = "ready";
    else if (acct.requirements?.disabled_reason || (acct.requirements?.currently_due ?? []).length > 0)
      status = acct.details_submitted ? "action_required" : "pending";

    return json({
      status,
      charges_enabled: acct.charges_enabled,
      payouts_enabled: acct.payouts_enabled,
      details_submitted: acct.details_submitted,
      requirements: acct.requirements ?? null,
    });
  } catch (e) {
    console.error("[stripe-connect-refresh]", e);
    return json({ error: (e as Error).message ?? "Refresh failed" }, 400);
  }
});
