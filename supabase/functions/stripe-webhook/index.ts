// Stripe webhook receiver. PUBLIC endpoint (no JWT). Verifies signature with
// STRIPE_WEBHOOK_SECRET (whsec_...). Handles tip lifecycle + Connect account updates.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getStripe, json } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!secret) {
    console.error("STRIPE_WEBHOOK_SECRET missing");
    return json({ error: "Webhook secret not configured" }, 500);
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "Missing signature" }, 400);

  const stripe = getStripe();
  const raw = await req.text();

  let event;
  try {
    event = await stripe.webhooks.constructEventAsync(raw, sig, secret);
  } catch (e) {
    console.error("[stripe-webhook] signature verification failed", (e as Error).message);
    return json({ error: "Invalid signature" }, 400);
  }

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const s: any = event.data.object;
        await admin.from("dj_tips").update({
          status: s.payment_status === "paid" ? "succeeded" : "pending",
          stripe_payment_intent_id: typeof s.payment_intent === "string" ? s.payment_intent : null,
          livemode: !!event.livemode,
        }).eq("stripe_checkout_session_id", s.id);
        break;
      }
      case "payment_intent.succeeded": {
        const pi: any = event.data.object;
        await admin.from("dj_tips").update({
          status: "succeeded",
          livemode: !!event.livemode,
        }).eq("stripe_payment_intent_id", pi.id);
        break;
      }
      case "payment_intent.payment_failed": {
        const pi: any = event.data.object;
        await admin.from("dj_tips").update({
          status: "failed",
          failure_reason: pi.last_payment_error?.message ?? "payment_failed",
        }).eq("stripe_payment_intent_id", pi.id);
        break;
      }
      case "charge.refunded": {
        const ch: any = event.data.object;
        if (ch.payment_intent) {
          await admin.from("dj_tips").update({ status: "refunded" })
            .eq("stripe_payment_intent_id", ch.payment_intent);
        }
        break;
      }
      case "charge.dispute.created": {
        const d: any = event.data.object;
        if (d.payment_intent) {
          await admin.from("dj_tips").update({ status: "disputed" })
            .eq("stripe_payment_intent_id", d.payment_intent);
        }
        break;
      }
      case "account.updated": {
        const acct: any = event.data.object;
        await admin.from("dj_payout_accounts").update({
          charges_enabled: !!acct.charges_enabled,
          payouts_enabled: !!acct.payouts_enabled,
          details_submitted: !!acct.details_submitted,
          livemode: !!acct.livemode,
          last_synced_at: new Date().toISOString(),
        }).eq("stripe_account_id", acct.id);
        break;
      }
      default:
        // unhandled — ack so Stripe doesn't retry forever
        break;
    }
  } catch (e) {
    console.error("[stripe-webhook] handler error", event.type, e);
    return json({ error: "handler_error" }, 500);
  }

  return json({ received: true });
});
