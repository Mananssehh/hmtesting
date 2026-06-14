// Creates a Stripe Checkout Session (destination charge) sending the tip to
// the DJ's connected account with a 30% platform fee. TEST MODE only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { computeFee, corsHeaders, getStripe, json } from "../_shared/stripe.ts";

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
    const email = (claims.claims.email as string | undefined) ?? undefined;

    const body = await req.json().catch(() => ({}));
    const eventId = (body.event_id as string | null) ?? null;
    const amountCents = Math.floor(Number(body.amount_cents));
    if (!Number.isFinite(amountCents) || amountCents < 100) {
      return json({ error: "Minimum tip is $1" }, 400);
    }

    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );

    if (!eventId) return json({ error: "event_id required" }, 400);

    // Resolve DJ for the event
    const { data: ev, error: evErr } = await admin
      .from("events")
      .select("id, dj_id, name, dj_name")
      .eq("id", eventId)
      .maybeSingle();
    if (evErr || !ev?.dj_id) return json({ error: "Event not found" }, 404);
    if (ev.dj_id === userId) return json({ error: "You cannot tip yourself" }, 400);

    // Check consent was acknowledged
    const { data: consent } = await admin
      .from("purchase_consents")
      .select("id")
      .eq("user_id", userId)
      .limit(1)
      .maybeSingle();
    if (!consent) return json({ error: "Tip consent required" }, 400);

    // Server-side caps (re-check)
    const { error: capErr } = await admin.rpc("check_tip_cap", {
      _user_id: userId,
      _event_id: eventId,
      _amount_cents: amountCents,
    });
    if (capErr) return json({ error: capErr.message }, 400);

    // DJ must have a ready Connect account
    const { data: payout } = await admin
      .from("dj_payout_accounts")
      .select("stripe_account_id, charges_enabled, payouts_enabled")
      .eq("user_id", ev.dj_id)
      .maybeSingle();
    if (!payout?.stripe_account_id || !payout.charges_enabled) {
      return json({ error: "DJ hasn't finished payout setup yet." }, 400);
    }

    const stripe = getStripe();
    const { platform_fee_cents, net_amount_cents } = computeFee(amountCents);

    const origin = req.headers.get("origin") ?? "";
    const session = await stripe.checkout.sessions.create({
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
        transfer_data: { destination: payout.stripe_account_id },
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

    // Insert pending tip row (idempotent via unique on session id)
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
      stripe_destination_account: payout.stripe_account_id,
      livemode: false,
    });

    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    console.error("[tip-create-checkout]", e);
    return json({ error: (e as Error).message ?? "Checkout failed" }, 400);
  }
});
