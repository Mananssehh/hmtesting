// Returns the DJ's live Stripe Connect payout summary: balance, schedule,
// last payout, lifetime totals (from dj_tips).
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
    const { data: claims } = await supabase.auth.getClaims(authHeader.replace("Bearer ", ""));
    if (!claims?.claims) return json({ error: "Unauthorized" }, 401);
    const userId = claims.claims.sub as string;

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Lifetime totals from our tips ledger (succeeded only).
    // Note: stripe_fee_cents is not stored on dj_tips — Stripe deducts its
    // processing fee from the destination account directly. We surface 0
    // here and leave Stripe processing as "deducted by Stripe" in the UI.
    const { data: tips, error: tipsErr } = await admin
      .from("dj_tips")
      .select("gross_amount_cents,net_amount_cents,platform_fee_cents,currency,status")
      .eq("dj_id", userId)
      .eq("status", "succeeded");
    if (tipsErr) console.error("[stripe-payout-summary] tips query error", tipsErr);

    let lifetime_gross_cents = 0;
    let lifetime_net_cents = 0;
    let lifetime_platform_fee_cents = 0;
    const lifetime_stripe_fee_cents = 0;
    let currency: string | null = null;
    for (const t of tips ?? []) {
      lifetime_gross_cents += (t as any).gross_amount_cents || 0;
      lifetime_net_cents += (t as any).net_amount_cents || 0;
      lifetime_platform_fee_cents += (t as any).platform_fee_cents || 0;
      if (!currency && (t as any).currency) currency = (t as any).currency;
    }
    console.log("[stripe-payout-summary] user", userId, "tips", tips?.length ?? 0, "gross", lifetime_gross_cents);

    const { data: row } = await admin
      .from("dj_payout_accounts")
      .select("stripe_account_id,charges_enabled,payouts_enabled,details_submitted")
      .eq("user_id", userId)
      .maybeSingle();

    const base = {
      connected: false as boolean,
      account_status: "not_started" as string,
      currency,
      balance: null as null | { available_cents: number; pending_cents: number; currency: string },
      schedule: null as null | { interval: string; delay_days: number | null; weekly_anchor?: string; monthly_anchor?: number },
      last_payout: null as null | { amount_cents: number; currency: string; arrival_date: string | null; status: string },
      estimated_next_payout: null as null | { available_cents: number; currency: string; estimated_arrival: string | null },
      lifetime: {
        gross_cents: lifetime_gross_cents,
        net_cents: lifetime_net_cents,
        platform_fee_cents: lifetime_platform_fee_cents,
        stripe_fee_cents: lifetime_stripe_fee_cents,
        tip_count: (tips ?? []).length,
      },
    };

    if (!row?.stripe_account_id) {
      return json(base);
    }

    base.connected = true;
    if (row.charges_enabled && row.payouts_enabled) base.account_status = "ready";
    else if (row.details_submitted) base.account_status = "action_required";
    else base.account_status = "pending";

    const stripe = getStripe();
    const acctId = row.stripe_account_id;

    try {
      const bal = await stripe.balance.retrieve({ stripeAccount: acctId });
      const cur = (bal.available?.[0]?.currency ?? bal.pending?.[0]?.currency ?? "usd").toLowerCase();
      const sum = (arr: { amount: number; currency: string }[] | undefined) =>
        (arr ?? []).filter((b) => b.currency === cur).reduce((s, b) => s + b.amount, 0);
      base.balance = {
        available_cents: sum(bal.available as any),
        pending_cents: sum(bal.pending as any),
        currency: cur,
      };
      if (!base.currency) base.currency = cur;
    } catch (e) {
      console.warn("[stripe-payout-summary] balance error", (e as Error).message);
    }

    try {
      const acct = await stripe.accounts.retrieve(acctId);
      const sch = (acct as any).settings?.payouts?.schedule;
      if (sch) {
        base.schedule = {
          interval: sch.interval,
          delay_days: sch.delay_days ?? null,
          weekly_anchor: sch.weekly_anchor,
          monthly_anchor: sch.monthly_anchor,
        };
      }
    } catch (e) {
      console.warn("[stripe-payout-summary] account error", (e as Error).message);
    }

    try {
      const payouts = await stripe.payouts.list({ limit: 1 }, { stripeAccount: acctId });
      const p = payouts.data[0];
      if (p) {
        base.last_payout = {
          amount_cents: p.amount,
          currency: p.currency,
          arrival_date: p.arrival_date ? new Date(p.arrival_date * 1000).toISOString() : null,
          status: p.status,
        };
      }
    } catch (e) {
      console.warn("[stripe-payout-summary] payouts error", (e as Error).message);
    }

    if (base.balance && base.balance.available_cents > 0) {
      const delay = base.schedule?.delay_days ?? 2;
      const eta = new Date();
      eta.setDate(eta.getDate() + delay);
      base.estimated_next_payout = {
        available_cents: base.balance.available_cents,
        currency: base.balance.currency,
        estimated_arrival: eta.toISOString(),
      };
    }

    return json(base);
  } catch (e) {
    console.error("[stripe-payout-summary]", e);
    return json({ error: (e as Error).message ?? "Failed" }, 400);
  }
});
