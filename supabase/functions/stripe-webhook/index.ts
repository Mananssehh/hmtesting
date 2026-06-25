// Stripe webhook receiver. PUBLIC endpoint (no JWT).
//
// Supports TWO signing secrets so a single endpoint can receive events from
// both the platform account and Connect (connected accounts):
//   - STRIPE_WEBHOOK_SECRET_PLATFORM  (platform endpoint)
//   - STRIPE_WEBHOOK_SECRET_CONNECT   (Connect endpoint)
//
// The handler tries each configured secret until one verifies the signature.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getStripe, json } from "../_shared/stripe.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const secrets = [
    Deno.env.get("STRIPE_WEBHOOK_SECRET_PLATFORM"),
    Deno.env.get("STRIPE_WEBHOOK_SECRET_CONNECT"),
    Deno.env.get("STRIPE_WEBHOOK_SECRET"),
  ].filter((s): s is string => !!s);

  if (secrets.length === 0) {
    console.error("No STRIPE_WEBHOOK_SECRET* configured");
    return json({ error: "Webhook secret not configured" }, 500);
  }

  const sig = req.headers.get("stripe-signature");
  if (!sig) return json({ error: "Missing signature" }, 400);

  const stripe = getStripe();
  const raw = await req.text();

  let event: any = null;
  let lastErr: unknown = null;
  for (const secret of secrets) {
    try {
      event = await stripe.webhooks.constructEventAsync(raw, sig, secret);
      break;
    } catch (e) {
      lastErr = e;
    }
  }
  if (!event) {
    console.error("[stripe-webhook] signature verification failed", (lastErr as Error)?.message);
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
      case "charge.dispute.closed": {
        const d: any = event.data.object;
        if (d.payment_intent) {
          // Map dispute outcome back onto the tip row.
          // won  -> tip stands (succeeded)
          // lost -> funds reversed (refunded)
          // warning_closed / other -> leave as disputed
          const next =
            d.status === "won" ? "succeeded" :
            d.status === "lost" ? "refunded" :
            null;
          if (next) {
            await admin.from("dj_tips").update({ status: next })
              .eq("stripe_payment_intent_id", d.payment_intent);
          }
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
