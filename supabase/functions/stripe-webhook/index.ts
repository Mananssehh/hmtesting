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

  // Locate the dj_tips row for a Stripe charge/refund. Tries every linking
  // identity we know about: PI, charge id, checkout session id, metadata.tip_id.
  // Returns the row or null.
  async function findTip(opts: {
    payment_intent?: string | null;
    charge_id?: string | null;
    checkout_session_id?: string | null;
    tip_id?: string | null;
  }) {
    const tryOne = async (col: string, val: string | null | undefined) => {
      if (!val) return null;
      const { data } = await admin.from("dj_tips").select("*").eq(col, val).maybeSingle();
      return data;
    };
    return (
      (await tryOne("id", opts.tip_id ?? null)) ||
      (await tryOne("stripe_payment_intent_id", opts.payment_intent ?? null)) ||
      (await tryOne("stripe_charge_id", opts.charge_id ?? null)) ||
      (await tryOne("stripe_checkout_session_id", opts.checkout_session_id ?? null))
    );
  }

  // Apply a refund event to a tip row.
  async function applyRefund(args: {
    tip: any;
    chargeAmount: number;        // charge.amount (gross cents)
    amountRefunded: number;      // charge.amount_refunded (cumulative)
    refundId?: string | null;
    refundedAt?: number | null;  // unix seconds
  }) {
    if (!args.tip) return;
    const full = args.amountRefunded >= (args.chargeAmount || args.tip.gross_amount_cents);
    const patch: Record<string, unknown> = {
      refunded_amount_cents: args.amountRefunded,
      refund_id: args.refundId ?? args.tip.refund_id ?? null,
      refunded_at: args.refundedAt
        ? new Date(args.refundedAt * 1000).toISOString()
        : new Date().toISOString(),
      status: full ? "refunded" : "partially_refunded",
    };
    await admin.from("dj_tips").update(patch).eq("id", args.tip.id);
  }

  // Send an app email through send-transactional-email. Failures never break
  // the webhook — Stripe must still get a 200 so it doesn't retry the payment
  // event. Idempotency keys make this safe to call multiple times.
  async function sendEmail(opts: {
    templateName: string;
    recipientEmail: string | null | undefined;
    idempotencyKey: string;
    templateData: Record<string, unknown>;
  }) {
    try {
      if (!opts.recipientEmail) return;
      const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      const e = opts.recipientEmail.trim().toLowerCase();
      if (!EMAIL_RE.test(e) || e.endsWith("@example.com")) return;
      const { error } = await admin.functions.invoke("send-transactional-email", {
        body: {
          templateName: opts.templateName,
          recipientEmail: e,
          idempotencyKey: opts.idempotencyKey,
          templateData: opts.templateData,
        },
      });
      if (error) console.warn("[stripe-webhook] sendEmail error", opts.templateName, error.message);
    } catch (e) {
      console.warn("[stripe-webhook] sendEmail threw", opts.templateName, (e as Error).message);
    }
  }

  // Resolve auth user email by id.
  async function getUserEmail(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;
    try {
      const { data } = await admin.auth.admin.getUserById(userId);
      return data?.user?.email ?? null;
    } catch {
      return null;
    }
  }

  async function getNickname(userId: string | null | undefined): Promise<string | null> {
    if (!userId) return null;
    const { data } = await admin.from("profiles").select("nickname").eq("id", userId).maybeSingle();
    return data?.nickname ?? null;
  }

  async function getEvent(eventId: string | null | undefined) {
    if (!eventId) return null;
    const { data } = await admin.from("events").select("id, name, dj_name, dj_id, room_code").eq("id", eventId).maybeSingle();
    return data;
  }

  // Pull a receipt URL from the latest charge of a PI (best-effort).
  async function getReceiptUrl(paymentIntentId: string | null | undefined, account?: string | null): Promise<string | null> {
    if (!paymentIntentId) return null;
    try {
      const opts = account ? { stripeAccount: account } : undefined;
      const pi: any = await stripe.paymentIntents.retrieve(
        paymentIntentId,
        { expand: ["latest_charge"] },
        opts as any,
      );
      const ch = pi.latest_charge;
      if (ch && typeof ch === "object") return ch.receipt_url ?? null;
    } catch {
      // ignore
    }
    return null;
  }

  // After a tip succeeds, fan out DJ + guest emails (idempotent per tip id).
  async function notifyTipSucceeded(tipId: string | null | undefined) {
    if (!tipId) return;
    const { data: tip } = await admin.from("dj_tips").select("*").eq("id", tipId).maybeSingle();
    if (!tip) return;
    const ev = await getEvent(tip.event_id);
    const djEmail = await getUserEmail(tip.dj_id);
    const guestEmail = await getUserEmail(tip.user_id);
    const guestNickname = (await getNickname(tip.user_id)) ?? "Anonymous";
    const djName = ev?.dj_name ?? (await getNickname(tip.dj_id)) ?? "DJ";
    const eventName = ev?.name ?? "Decks event";
    const receiptUrl = await getReceiptUrl(tip.stripe_payment_intent_id);

    await Promise.all([
      sendEmail({
        templateName: "dj-tip-notification",
        recipientEmail: djEmail,
        idempotencyKey: `dj-tip-notification:${tip.id}`,
        templateData: {
          djName,
          guestName: guestNickname,
          eventName,
          grossAmountCents: tip.gross_amount_cents,
          netAmountCents: tip.net_amount_cents,
        },
      }),
      sendEmail({
        templateName: "guest-tip-thank-you",
        recipientEmail: guestEmail,
        idempotencyKey: `guest-tip-thank-you:${tip.id}`,
        templateData: {
          djName,
          eventName,
          amountCents: tip.gross_amount_cents,
          receiptUrl,
          roomCode: ev?.room_code ?? null,
        },
      }),
    ]);
  }

  // After a refund is applied, notify both sides (idempotent per refund id).
  async function notifyRefund(tipId: string, refundId: string | null | undefined) {
    const { data: tip } = await admin.from("dj_tips").select("*").eq("id", tipId).maybeSingle();
    if (!tip) return;
    const ev = await getEvent(tip.event_id);
    const djEmail = await getUserEmail(tip.dj_id);
    const guestEmail = await getUserEmail(tip.user_id);
    const guestNickname = (await getNickname(tip.user_id)) ?? "Anonymous";
    const djName = ev?.dj_name ?? (await getNickname(tip.dj_id)) ?? "DJ";
    const eventName = ev?.name ?? "Decks event";
    const fullyRefunded = tip.status === "refunded";
    const receiptUrl = await getReceiptUrl(tip.stripe_payment_intent_id);
    const idemSuffix = refundId ?? tip.refund_id ?? `${tip.refunded_amount_cents}`;

    await Promise.all([
      sendEmail({
        templateName: "refund-dj",
        recipientEmail: djEmail,
        idempotencyKey: `refund-dj:${tip.id}:${idemSuffix}`,
        templateData: {
          djName,
          guestName: guestNickname,
          eventName,
          grossAmountCents: tip.gross_amount_cents,
          refundedAmountCents: tip.refunded_amount_cents ?? tip.gross_amount_cents,
          fullyRefunded,
        },
      }),
      sendEmail({
        templateName: "refund-guest",
        recipientEmail: guestEmail,
        idempotencyKey: `refund-guest:${tip.id}:${idemSuffix}`,
        templateData: {
          djName,
          eventName,
          grossAmountCents: tip.gross_amount_cents,
          refundedAmountCents: tip.refunded_amount_cents ?? tip.gross_amount_cents,
          fullyRefunded,
          receiptUrl,
        },
      }),
    ]);
  }


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
        // Capture the latest charge id so refund webhooks can locate the tip.
        let chargeId: string | null = null;
        if (typeof pi.latest_charge === "string") chargeId = pi.latest_charge;
        else if (pi.latest_charge?.id) chargeId = pi.latest_charge.id;
        else if (pi.charges?.data?.[0]?.id) chargeId = pi.charges.data[0].id;
        await admin.from("dj_tips").update({
          status: "succeeded",
          livemode: !!event.livemode,
          ...(chargeId ? { stripe_charge_id: chargeId } : {}),
        }).eq("stripe_payment_intent_id", pi.id);
        const { data: tipRow } = await admin
          .from("dj_tips").select("id").eq("stripe_payment_intent_id", pi.id).maybeSingle();
        if (tipRow?.id) await notifyTipSucceeded(tipRow.id);
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
      case "charge.succeeded": {
        // Backfill charge id when we only have the PI.
        const ch: any = event.data.object;
        if (ch.payment_intent) {
          await admin.from("dj_tips").update({ stripe_charge_id: ch.id })
            .eq("stripe_payment_intent_id", ch.payment_intent);
        }
        break;
      }
      case "charge.refunded": {
        const ch: any = event.data.object;
        const tip = await findTip({
          payment_intent: typeof ch.payment_intent === "string" ? ch.payment_intent : null,
          charge_id: ch.id,
          tip_id: ch.metadata?.tip_id,
        });
        const refund = ch.refunds?.data?.[0];
        await applyRefund({
          tip,
          chargeAmount: ch.amount ?? 0,
          amountRefunded: ch.amount_refunded ?? 0,
          refundId: refund?.id ?? null,
          refundedAt: refund?.created ?? null,
        });
        break;
      }
      case "refund.created":
      case "refund.updated": {
        const r: any = event.data.object;
        // Resolve the charge to learn cumulative amount_refunded.
        let chargeId: string | null = typeof r.charge === "string" ? r.charge : r.charge?.id ?? null;
        let chargeAmount = 0;
        let amountRefunded = r.amount ?? 0;
        let paymentIntent: string | null = null;
        let tipMetaId: string | null = r.metadata?.tip_id ?? null;
        try {
          if (chargeId) {
            const opts = event.account ? { stripeAccount: event.account } : undefined;
            const ch: any = await stripe.charges.retrieve(chargeId, opts as any);
            chargeAmount = ch.amount ?? 0;
            amountRefunded = ch.amount_refunded ?? amountRefunded;
            paymentIntent = typeof ch.payment_intent === "string" ? ch.payment_intent : null;
            tipMetaId = tipMetaId ?? ch.metadata?.tip_id ?? null;
          }
        } catch (e) {
          console.warn("[stripe-webhook] charges.retrieve failed", (e as Error).message);
        }
        // Treat non-succeeded refunds as a no-op (e.g. pending/failed/canceled).
        if (r.status && r.status !== "succeeded") break;
        const tip = await findTip({
          payment_intent: paymentIntent,
          charge_id: chargeId,
          tip_id: tipMetaId,
        });
        await applyRefund({
          tip,
          chargeAmount,
          amountRefunded,
          refundId: r.id,
          refundedAt: r.created ?? null,
        });
        break;
      }
      case "charge.dispute.created": {
        const d: any = event.data.object;
        if (d.payment_intent) {
          await admin.from("dj_tips").update({ status: "disputed" })
            .eq("stripe_payment_intent_id", d.payment_intent);
        } else if (d.charge) {
          await admin.from("dj_tips").update({ status: "disputed" })
            .eq("stripe_charge_id", d.charge);
        }
        break;
      }
      case "charge.dispute.closed": {
        const d: any = event.data.object;
        const next =
          d.status === "won" ? "succeeded" :
          d.status === "lost" ? "refunded" :
          null;
        if (!next) break;
        const patch: Record<string, unknown> = { status: next };
        if (next === "refunded") {
          patch.refunded_at = new Date().toISOString();
          patch.refunded_amount_cents = d.amount ?? null;
        }
        if (d.payment_intent) {
          await admin.from("dj_tips").update(patch).eq("stripe_payment_intent_id", d.payment_intent);
        } else if (d.charge) {
          await admin.from("dj_tips").update(patch).eq("stripe_charge_id", d.charge);
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
