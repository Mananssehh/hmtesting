// Creates (or reuses) a Stripe Connect Express account for the calling DJ
// and returns a Stripe-hosted onboarding URL.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, json } from "../_shared/stripe.ts";
import Stripe from "https://esm.sh/stripe@17.5.0?target=denonext";

function fail(code: string, message: string, extra: Record<string, unknown> = {}, status = 200) {
  console.error("[stripe-connect-onboard][FAIL]", code, message, extra);
  return json({ error_code: code, error: message, message, ...extra }, status);
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
    console.log("[stripe-connect-onboard] stripe key present:", hasKey, "test:", isTest, "live:", isLive);
    if (!hasKey) {
      return fail("STRIPE_NOT_CONFIGURED", "Stripe isn't configured on the server yet.");
    }
    if (!isTest) {
      return fail(
        "STRIPE_KEY_INVALID",
        isLive
          ? "Live Stripe keys are blocked in this build. Use a sk_test_ key."
          : "Invalid Stripe key format. Expected an sk_test_ key.",
      );
    }
    const stripe = new Stripe(stripeKey, {
      apiVersion: "2024-12-18.acacia",
      httpClient: Stripe.createFetchHttpClient(),
    });

    step = "parse_body";
    const body = await req.json().catch(() => ({}));
    const origin = req.headers.get("origin") ?? "";
    const returnUrl = (body.return_url as string) || `${origin}/dj?stripe=return`;
    const refreshUrl = (body.refresh_url as string) || `${origin}/dj?stripe=refresh`;

    step = "lookup_existing_account";
    const { data: existing, error: existingErr } = await admin
      .from("dj_payout_accounts")
      .select("stripe_account_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (existingErr) {
      return fail("DB_LOOKUP_FAILED", "Couldn't read your payout record.", { detail: existingErr.message });
    }

    let accountId = existing?.stripe_account_id as string | undefined;
    console.log("[stripe-connect-onboard] existing account:", accountId ?? "(none)");

    if (!accountId) {
      step = "stripe_create_account";
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
        console.log("[stripe-connect-onboard] created account:", accountId);

        step = "db_upsert_account";
        const { error: upsertErr } = await admin.from("dj_payout_accounts").upsert({
          user_id: userId,
          stripe_account_id: accountId,
          charges_enabled: acct.charges_enabled,
          payouts_enabled: acct.payouts_enabled,
          details_submitted: acct.details_submitted,
          livemode: acct.livemode,
          last_synced_at: new Date().toISOString(),
        });
        if (upsertErr) {
          return fail("DB_INSERT_FAILED", "Couldn't save your payout record.", {
            detail: upsertErr.message,
            stripe_account_id: accountId,
          });
        }
      } catch (e: any) {
        const msg = e?.raw?.message || e?.message || String(e);
        const code = e?.code || e?.raw?.code;
        const type = e?.type || e?.raw?.type;
        console.error("[stripe-connect-onboard] accounts.create failed", { msg, code, type });
        const connectDisabled = /signed up for Connect|Connect.+not.+enabled|review the.+Connect/i.test(msg);
        return fail(
          connectDisabled ? "STRIPE_CONNECT_NOT_ENABLED" : "STRIPE_ACCOUNT_CREATE_FAILED",
          connectDisabled
            ? "Stripe Connect isn't enabled on this Stripe account. Enable Connect at dashboard.stripe.com/test/connect, then try again."
            : `Couldn't create your Stripe Express account: ${msg}`,
          { stripe_code: code, stripe_type: type },
        );
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
      return json({ url: link.url, account_id: accountId });
    } catch (e: any) {
      const msg = e?.raw?.message || e?.message || String(e);
      return fail("STRIPE_LINK_FAILED", `Couldn't create onboarding link: ${msg}`, {
        stripe_code: e?.code,
      });
    }
  } catch (e: any) {
    const msg = e?.message ?? "Onboarding failed";
    console.error("[stripe-connect-onboard][UNCAUGHT]", step, msg, e);
    return fail("UNEXPECTED", `Unexpected error at step "${step}": ${msg}`, { step });
  }
});
