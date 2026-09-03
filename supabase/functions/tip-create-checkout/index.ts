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

function err(code: ErrorCode, message: string, status = 200, extra: Record<string, unknown> = {}) {
  return json({ error_code: code, error: message, message, ...extra }, status);
}

function serializeStripeError(e: any) {
  const raw = e?.raw ?? {};
  return {
    http_status: e?.statusCode ?? raw?.statusCode ?? null,
    request_id: e?.requestId ?? raw?.request_log_url ?? null,
    stripe_type: e?.type ?? raw?.type ?? null,
    stripe_code: e?.code ?? raw?.code ?? null,
    decline_code: e?.decline_code ?? raw?.decline_code ?? null,
    param: e?.param ?? raw?.param ?? null,
    doc_url: e?.doc_url ?? raw?.doc_url ?? null,
    message: e?.message ?? raw?.message ?? String(e),
  };
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
    const rawEmail = (claims.claims.email as string | undefined) ?? undefined;
    const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const trimmed = (rawEmail ?? "").trim().toLowerCase();
    const isPlaceholder =
      !trimmed ||
      trimmed === "guest" ||
      trimmed === "anonymous" ||
      trimmed === "undefined" ||
      trimmed === "null" ||
      trimmed.endsWith("@example.com");
    const email = !isPlaceholder && EMAIL_RE.test(trimmed) ? trimmed : undefined;

    const body = await req.json().catch(() => ({}));
    const eventId = (body.event_id as string | null) ?? null;
    const checkOnly = !!body.check_only;
    const amountCents = checkOnly ? 100 : Math.floor(Number(body.amount_cents));
    const songRequestId = (body.song_request_id as string | null) ?? null;
    let songTitleMeta = (body.song_title as string | null) ?? null;
    let artistMeta = (body.artist as string | null) ?? null;

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
      .select("id, dj_id, name, dj_name, room_code")
      .eq("id", eventId)
      .maybeSingle();
    if (evErr || !ev?.dj_id) return err("EVENT_NOT_FOUND", "Event not found.");
    if (ev.dj_id === userId) return err("SELF_TIP", "You cannot tip yourself.");

    // DJ Connect status
    const { data: payout } = await admin
      .from("dj_payout_accounts")
      .select("stripe_account_id, charges_enabled, payouts_enabled, details_submitted, livemode")
      .eq("user_id", ev.dj_id)
      .maybeSingle();

    const payoutReady = !!(
      payout?.stripe_account_id &&
      payout.charges_enabled &&
      payout.payouts_enabled
    );
    const modeMismatch = !!(payout?.stripe_account_id && payout.livemode !== stripeLiveMode);

    console.log("[tip-create-checkout] context", {
      user_id: userId,
      event_id: eventId,
      dj_id: ev.dj_id,
      amount_cents: amountCents,
      key_live_mode: stripeLiveMode,
      stripe_account_id_present: !!payout?.stripe_account_id,
      account_livemode: payout?.livemode ?? null,
      mode_mismatch: modeMismatch,
      charges_enabled: !!payout?.charges_enabled,
      payouts_enabled: !!payout?.payouts_enabled,
      details_submitted: !!payout?.details_submitted,
      check_only: checkOnly,
    });

    if (modeMismatch) {
      return err(
        "DJ_PAYOUTS_NOT_READY",
        `This DJ's payout account is in ${payout?.livemode ? "live" : "test"} mode but Decks is in ${stripeLiveMode ? "live" : "test"} mode. The DJ needs to reconnect payouts.`,
        200,
        { mode_mismatch: true, account_livemode: payout?.livemode, key_live_mode: stripeLiveMode },
      );
    }

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

    // Resolve song request (validated to belong to this event) so DJs
    // can see exactly which song was tipped, and Stripe metadata carries the link.
    let resolvedRequestId: string | null = null;
    if (songRequestId) {
      const { data: reqRow } = await admin
        .from("song_requests")
        .select("id, title, artist, event_id")
        .eq("id", songRequestId)
        .maybeSingle();
      if (reqRow && reqRow.event_id === eventId) {
        resolvedRequestId = reqRow.id;
        songTitleMeta = songTitleMeta ?? reqRow.title ?? null;
        artistMeta = artistMeta ?? reqRow.artist ?? null;
      }
    }

    const { data: guestProfile } = await admin
      .from("profiles").select("nickname").eq("id", userId).maybeSingle();
    const guestNickname = guestProfile?.nickname ?? null;

    const origin = req.headers.get("origin") ?? "";

    const tipMetadata: Record<string, string> = {
      tipper_user_id: userId,
      dj_id: ev.dj_id,
      event_id: eventId,
    };
    if (resolvedRequestId) tipMetadata.song_request_id = resolvedRequestId;
    if (songTitleMeta) tipMetadata.song_title = songTitleMeta.slice(0, 500);
    if (artistMeta) tipMetadata.artist = artistMeta.slice(0, 500);
    if (guestNickname) tipMetadata.guest_nickname = guestNickname.slice(0, 200);

    // One generated expiry timestamp: sent to Stripe and (as the value Stripe
    // echoes back) persisted so cap math can tell live from abandoned checkouts.
    // Stripe allows 30 min .. 24 h; we use 30 min so caps free up quickly.
    const CHECKOUT_TTL_SECONDS = 30 * 60;
    const expiresAtUnix = Math.floor(Date.now() / 1000) + CHECKOUT_TTL_SECONDS;

    let session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        customer_email: email,
        expires_at: expiresAtUnix,
        line_items: [{
          quantity: 1,
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: `Tip for DJ ${ev.dj_name}`,
              description: songTitleMeta
                ? `Tip for "${songTitleMeta}"${artistMeta ? ` — ${artistMeta}` : ""} at "${ev.name}". Does not affect queue order.`
                : `Tip for "${ev.name}" — does not affect queue order.`,
            },
          },
        }],
        payment_intent_data: {
          application_fee_amount: platform_fee_cents,
          transfer_data: { destination: payout!.stripe_account_id! },
          metadata: {
            ...tipMetadata,
            gross_amount_cents: String(amountCents),
            platform_fee_cents: String(platform_fee_cents),
            net_amount_cents: String(net_amount_cents),
          },
        },
        metadata: tipMetadata,
        success_url: `${origin}/event/${ev.room_code ?? eventId}?tip=success`,
        cancel_url: `${origin}/event/${ev.room_code ?? eventId}?tip=cancel`,
      });
    } catch (se: any) {
      const stripe_error = serializeStripeError(se);
      console.error("[tip-create-checkout][RAW checkout.sessions.create error]", JSON.stringify(stripe_error));
      return err(
        "STRIPE_CHECKOUT_FAILED",
        `Stripe ${stripe_error.http_status ?? "?"} ${stripe_error.stripe_type ?? ""} ${stripe_error.stripe_code ?? ""}: ${stripe_error.message} (req ${stripe_error.request_id ?? "n/a"})`,
        200,
        { stripe_error, endpoint: "POST /v1/checkout/sessions", destination_account: payout?.stripe_account_id, destination_livemode: payout?.livemode, key_live_mode: stripeLiveMode },
      );
    }

    // Prefer the value Stripe returned; fall back to the requested one.
    const sessionExpiresAt = new Date(
      (typeof session.expires_at === "number" ? session.expires_at : expiresAtUnix) * 1000,
    ).toISOString();

    const { error: insertErr } = await admin.from("dj_tips").insert({
      user_id: userId,
      dj_id: ev.dj_id,
      event_id: eventId,
      song_request_id: resolvedRequestId,
      song_title: songTitleMeta,
      artist: artistMeta,
      guest_nickname: guestNickname,
      gross_amount_cents: amountCents,
      platform_fee_cents,
      net_amount_cents,
      currency: "usd",
      status: "pending",
      stripe_checkout_session_id: session.id,
      checkout_expires_at: sessionExpiresAt,
      stripe_destination_account: payout!.stripe_account_id!,
      livemode: stripeLiveMode,
    });
    if (insertErr) {
      console.error("[tip-create-checkout] tip insert failed", {
        session_id: session.id,
        message: insertErr.message,
      });
      return err("SERVICE_FAILED", "Something went wrong. Please try again.");
    }


    return json({ url: session.url, session_id: session.id });
  } catch (e) {
    console.error("[tip-create-checkout] unexpected", (e as Error).message);
    return err("SERVICE_FAILED", "Something went wrong. Please try again.");
  }
});
