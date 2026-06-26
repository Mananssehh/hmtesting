// Creates a Stripe Checkout Session (destination charge) sending the tip to
// the DJ's connected account with a 30% platform fee. TEST MODE only.
//
// Returns HTTP 200 with a structured error_code so the frontend can show
// friendly messages instead of a generic "non-2xx" toast. Genuine 4xx/5xx
// is reserved for auth failures and unexpected crashes.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeFee, corsHeaders, getStripe, json } from "../_shared/stripe.ts";

type ErrorCode =
  | "UNAUTHORIZED"
  | "INVALID_REQUEST"
  | "EVENT_NOT_FOUND"
  | "SELF_TIP"
  | "CONSENT_REQUIRED"
  | "TIP_LIMIT_REACHED"
  | "DJ_PAYOUTS_NOT_READY"
  | "STRIPE_CONFIG_ERROR"
  | "STRIPE_CHECKOUT_FAILED"
  | "SERVICE_FAILED";

function err(code: ErrorCode, message: string, status = 200) {
  return json({ error_code: code, error: message, message }, status);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return err("UNAUTHORIZED", "Please sign in to tip.", 401);
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (!claims?.claims) return err("UNAUTHORIZED", "Please sign in to tip.", 401);
    const userId = claims.claims.sub as string;
    const email = (claims.claims.email as string | undefined) ?? undefined;

    const body = await req.json().catch(() => ({}));
    const eventId = (body.event_id as string | null) ?? null;
    const checkOnly = !!body.check_only;
    const amountCents = checkOnly ? 100 : Math.floor(Number(body.amount_cents));

    if (!eventId) return err("INVALID_REQUEST", "Missing event.");
    if (!checkOnly && (!Number.isFinite(amountCents) || amountCents < 100)) {
      return err("INVALID_REQUEST", "Minimum tip is $1.");
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    // Stripe key check (accept test or live)
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const hasStripeKey = !!stripeKey;
    const stripeKeyValid = stripeKey.startsWith("sk_test_") || stripeKey.startsWith("sk_live_");
    const stripeLiveMode = stripeKey.startsWith("sk_live_");
    if (!hasStripeKey || !stripeKeyValid) {
      console.error("[tip-create-checkout] STRIPE_CONFIG", {
        has_stripe_key: hasStripeKey,
        valid: stripeKeyValid,
      });
      return err("STRIPE_CONFIG_ERROR", "Tips are temporarily unavailable.");
    }

    // Resolve DJ for the event
    const { data: ev, error: evErr } = await admin
      .from("events")
      .select("id, dj_id, name, dj_name")
      .eq("id", eventId)
      .maybeSingle();
    if (evErr || !ev?.dj_id) return err("EVENT_NOT_FOUND", "Event not found.");
    if (ev.dj_id === userId) return err("SELF_TIP", "You cannot tip yourself.");

    // DJ Connect status
    const { data: payout } = await admin
      .from("dj_payout_accounts")
      .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted")
      .eq("user_id", ev.dj_id)
      .maybeSingle();

    const payoutReady = !!(
      payout?.stripe_account_id &&
      payout.charges_enabled &&
      payout.payouts_enabled
    );

    console.log("[tip-create-checkout] context", {
      user_id: userId,
      event_id: eventId,
      dj_id: ev.dj_id,
      amount_cents: amountCents,
      has_stripe_key: hasStripeKey,
      stripe_account_id_present: !!payout?.stripe_account_id,
      charges_enabled: !!payout?.charges_enabled,
      payouts_enabled: !!payout?.payouts_enabled,
      details_submitted: !!payout?.details_submitted,
      check_only: checkOnly,
    });

    if (!payoutReady) {
      return err(
        "DJ_PAYOUTS_NOT_READY",
        "This DJ hasn't set up payouts yet — tips aren't available for this event.",
      );
    }

    // Check-only mode: return readiness without creating a session
    if (checkOnly) {
      return json({ ok: true, ready: true });
    }

    // Check consent was acknowledged
    const { data: consent } = await admin
      .from("purchase_consents")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!consent) return err("CONSENT_REQUIRED", "Tip consent required.");

    // Server-side caps
    const { error: capErr } = await admin.rpc("check_tip_cap", {
      _user_id: userId,
      _event_id: eventId,
      _amount_cents: amountCents,
    });
    if (capErr) return err("TIP_LIMIT_REACHED", capErr.message);

    const stripe = getStripe();
    const { platform_fee_cents, net_amount_cents } = computeFee(amountCents);

    const origin = req.headers.get("origin") ?? "";

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: email,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `Tip for DJ ${ev.dj_name}`,
              description: `Tip for "${ev.name}" — does not affect queue order.`,
            },
          },
        }],
        payment_intent_data: {
          application_fee_amount: platform_fee_cents,
          transfer_data: { destination: payout!.stripe_account_id! },
          metadata: {
            tipper_user_id: userId,
            dj_id: ev.dj_id,
            event_id: eventId,
            gross_amount_cents: String(amountCents),
            platform_fee_cents: String(platform_fee_cents),
            net_amount_cents: String(net_amount_cents),
          },
        },
        metadata: {
          tipper_user_id: userId,
          dj_id: ev.dj_id,
          event_id: eventId,
        },
        success_url: `${origin}/event/${eventId}?tip=success`,
        cancel_url: `${origin}/event/${eventId}?tip=cancel`,
      });
    } catch (se) {
      console.error("[tip-create-checkout] stripe checkout failed", {
        message: (se as Error).message,
      });
      return err("STRIPE_CHECKOUT_FAILED", "Payment setup failed. Please try again.");
    }

    await admin.from("dj_tips").insert({
      user_id: userId,
      dj_id: ev.dj_id,
      event_id: eventId,
      gross_amount_cents: amountCents,
      platform_fee_cents,
      net_amount_cents,
      currency: "usd",
      status: "pending",
      stripe_checkout_session_id: session.id,
      stripe_destination_account: payout!.stripe_account_id!,
      livemode: false,
    });

    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    console.error("[tip-create-checkout] unexpected", (e as Error).message);
    return err("SERVICE_FAILED", "Something went wrong. Please try again.");
  }
});
