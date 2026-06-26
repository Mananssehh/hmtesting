// Creates (or reuses) a Stripe Connect Express account for the calling DJ
// and returns a Stripe-hosted onboarding URL.
//
// DEBUG MODE: This function intentionally returns the RAW Stripe error
// payload (status, request id, type, code, message, endpoint) instead of a
// friendly wrapper, so we can diagnose Connect configuration issues.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/stripe.ts";
import Stripe from "https://esm.sh/stripe@17.5.0?target=denonext";

function fail(code: string, message: string, extra: Record<string, unknown> = {}, status = 200) {
  console.error("[stripe-connect-onboard][FAIL]", code, message, extra);
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
    raw_keys: Object.keys(raw ?? {}),
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  let step = "init";
  try {
    step = "auth_header";
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return fail("UNAUTHORIZED", "Sign in required.", {}, 401);
    }

    step = "verify_jwt";
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } },
    );
    const { data: claims, error: claimsErr } = await supabase.auth.getClaims(
      authHeader.replace("Bearer ", ""),
    );
    if (claimsErr || !claims?.claims) {
      return fail("UNAUTHORIZED", "Sign in required.", { detail: claimsErr?.message }, 401);
    }
    const userId = claims.claims.sub as string;
    const email = (claims.claims.email as string | undefined) ?? undefined;
    console.log("[stripe-connect-onboard] user:", userId, "email:", email);

    step = "role_check";
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    );
    const { data: roles, error: roleErr } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", userId)
      .eq("role", "dj")
      .maybeSingle();
    if (roleErr) {
      return fail("ROLE_LOOKUP_FAILED", "Couldn't verify DJ role.", { detail: roleErr.message });
    }
    if (!roles) {
      return fail("DJ_ROLE_REQUIRED", "You need a DJ account to set up payouts.", {}, 403);
    }

    step = "stripe_key";
    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
    const hasKey = stripeKey.length > 0;
    const isTest = stripeKey.startsWith("sk_test_");
    const isLive = stripeKey.startsWith("sk_live_");
    // Last 4 chars only — never log the full key.
    const keyTail = stripeKey ? stripeKey.slice(-4) : "(none)";
    console.log("[stripe-connect-onboard] stripe key present:", hasKey, "test:", isTest, "live:", isLive, "tail:", keyTail);
    if (!hasKey) {
      return fail("STRIPE_NOT_CONFIGURED", "Stripe isn't configured on the server yet.");
    }
    if (!isTest && !isLive) {
      return fail("STRIPE_KEY_INVALID", "Expected sk_test_ or sk_live_ key.", { key_tail: keyTail });
    }
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    // Identify the Stripe account this key belongs to BEFORE attempting
    // anything else. This tells us which account is actually in use.
    step = "stripe_whoami";
    let stripeAccountInfo: any = null;
    try {
      const acct = await stripe.accounts.retrieve();
      stripeAccountInfo = {
        id: acct.id,
        country: acct.country,
        email: acct.email,
        type: acct.type,
        details_submitted: acct.details_submitted,
        charges_enabled: acct.charges_enabled,
        capabilities: acct.capabilities,
      };
      console.log("[stripe-connect-onboard] whoami:", JSON.stringify(stripeAccountInfo));
    } catch (e: any) {
      const se = serializeStripeError(e);
      console.error("[stripe-connect-onboard] whoami failed", se);
      stripeAccountInfo = { error: se };
    }

    step = "parse_body";
    const body = await req.json().catch(() => ({}));
    const origin = req.headers.get("origin") ?? "";
    const returnUrl = (body.return_url as string) || `${origin}/dj?stripe=return`;
    const refreshUrl = (body.refresh_url as string) || `${origin}/dj?stripe=refresh`;

    step = "lookup_existing_account";
    const { data: existing, error: existingErr } = await admin
      .from("dj_payout_accounts")
      .select("stripe_account_id, livemode")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingErr) {
      return fail("DB_LOOKUP_FAILED", "Couldn't read your payout record.", { detail: existingErr.message });
    }

    let accountId = existing?.stripe_account_id as string | undefined;
    console.log("[stripe-connect-onboard] existing account:", accountId ?? "(none)", "livemode:", existing?.livemode);

    // Stripe's Account object does NOT include a `livemode` field on retrieve.
    // The account's mode is identical to the key that created it, so we only
    // need to confirm that the stored account is still retrievable with the
    // current key. If retrieve fails, the key belongs to a different Stripe
    // account (or different mode) — discard and recreate.
    if (accountId) {
      try {
        await stripe.accounts.retrieve(accountId);
        // Heal stale livemode flag from earlier broken inference.
        await admin.from("dj_payout_accounts")
          .update({ livemode: isLive })
          .eq("user_id", userId);
      } catch (e: any) {
        console.warn("[stripe-connect-onboard] existing account unreachable — discarding", serializeStripeError(e));
        await admin.from("dj_payout_accounts").delete().eq("user_id", userId);
        accountId = undefined;
      }
    }

    let accountCreateResult: "skipped_existing" | "success" | "failed" = "skipped_existing";

    if (!accountId) {
      step = "stripe_create_account";
      // Direct call — no preflight Connect check, no friendly wrapper.
      // Whatever Stripe returns is reported verbatim.
      try {
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
        accountCreateResult = "success";
        console.log("[stripe-connect-onboard] created account:", accountId);

        step = "db_upsert_account";
        const { error: upsertErr } = await admin.from("dj_payout_accounts").upsert({
          user_id: userId,
          stripe_account_id: accountId,
          charges_enabled: acct.charges_enabled,
          payouts_enabled: acct.payouts_enabled,
          details_submitted: acct.details_submitted,
          livemode: isLive, // Stripe Account API omits livemode; infer from key
          last_synced_at: new Date().toISOString(),
        });
        if (upsertErr) {
          return fail("DB_INSERT_FAILED", "Couldn't save your payout record.", {
            detail: upsertErr.message,
            stripe_account_id: accountId,
          });
        }
      } catch (e: any) {
        accountCreateResult = "failed";
        const se = serializeStripeError(e);
        console.error("[stripe-connect-onboard][RAW accounts.create error]", JSON.stringify(se));
        return json({
          error_code: "STRIPE_ACCOUNT_CREATE_FAILED",
          stage: "accounts.create",
          endpoint: "POST /v1/accounts",
          account_create_result: accountCreateResult,
          account_link_result: "not_attempted",
          stripe_error: se,
          stripe_key_tail: keyTail,
          stripe_account_in_use: stripeAccountInfo,
          message: se.message,
        }, 200);
      }
    }

    step = "stripe_create_account_link";
    try {
      const link = await stripe.accountLinks.create({
        account: accountId!,
        refresh_url: refreshUrl,
        return_url: returnUrl,
        type: "account_onboarding",
      });
      console.log("[stripe-connect-onboard] account link created");
      return json({
        url: link.url,
        account_id: accountId,
        account_create_result: accountCreateResult,
        account_link_result: "success",
        stripe_account_in_use: stripeAccountInfo,
      });
    } catch (e: any) {
      const se = serializeStripeError(e);
      console.error("[stripe-connect-onboard][RAW accountLinks.create error]", JSON.stringify(se));
      return json({
        error_code: "STRIPE_LINK_FAILED",
        stage: "accountLinks.create",
        endpoint: "POST /v1/account_links",
        account_create_result: accountCreateResult,
        account_link_result: "failed",
        account_id: accountId,
        stripe_error: se,
        stripe_key_tail: keyTail,
        stripe_account_in_use: stripeAccountInfo,
        message: se.message,
      }, 200);
    }
  } catch (e: any) {
    const msg = e?.message ?? "Onboarding failed";
    console.error("[stripe-connect-onboard][UNCAUGHT]", step, msg, e);
    return fail("UNEXPECTED", `Unexpected error at step "${step}": ${msg}`, { step });
  }
});
