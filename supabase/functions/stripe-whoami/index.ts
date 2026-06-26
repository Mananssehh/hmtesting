// Public diagnostic: inspects STRIPE_SECRET_KEY shape and calls Stripe.
// Never prints the full key.
import Stripe from "https://esm.sh/stripe@17.5.0?target=denonext";

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function jsonResp(body: unknown, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { ...cors, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: cors });

  const raw = Deno.env.get("STRIPE_SECRET_KEY") ?? "";
  const trimmed = raw.trim();

  const shape = {
    present: raw.length > 0,
    starts_with_sk_live: trimmed.startsWith("sk_live_"),
    starts_with_sk_test: trimmed.startsWith("sk_test_"),
    length: trimmed.length,
    last4: trimmed.slice(-4),
    raw_length: raw.length,
    has_leading_space: raw.length > 0 && raw[0] !== trimmed[0],
    has_trailing_whitespace: raw.length !== trimmed.length && raw.trimEnd().length !== raw.length,
    has_newline: /\r|\n/.test(raw),
    has_internal_whitespace: /\s/.test(trimmed),
    read_at: new Date().toISOString(),
  };

  if (!shape.present) {
    return jsonResp({ shape, error: "STRIPE_SECRET_KEY not set" }, 200);
  }

  // Use trimmed key for the API call so a stray newline doesn't itself cause the error.
  const stripe = new Stripe(trimmed, {
    apiVersion: "2024-12-18.acacia",
    httpClient: Stripe.createFetchHttpClient(),
  });

  try {
    const acct = await stripe.accounts.retrieve();
    const url = new URL(req.url);
    const probeId = url.searchParams.get("account");
    let probe: any = null;
    if (probeId) {
      try {
        const a = await stripe.accounts.retrieve(probeId);
        probe = {
          id: a.id,
          livemode: (a as any).livemode ?? null,
          type: a.type,
          charges_enabled: a.charges_enabled,
          payouts_enabled: a.payouts_enabled,
          details_submitted: a.details_submitted,
          country: a.country,
          email: a.email,
        };
      } catch (e: any) {
        probe = { error: e?.message, code: e?.code, type: e?.type };
      }
    }
    return jsonResp({
      shape,
      stripe_ok: true,
      account: {
        id: acct.id,
        email: acct.email,
        country: acct.country,
        type: acct.type,
        livemode: (acct as any).livemode ?? null,
        details_submitted: acct.details_submitted,
        charges_enabled: acct.charges_enabled,
      },
      probe,
    });
  } catch (e: any) {
    return jsonResp({
      shape,
      stripe_ok: false,
      stripe_error: {
        http_status: e?.statusCode ?? null,
        type: e?.type ?? null,
        code: e?.code ?? null,
        message: e?.message ?? String(e),
        request_id: e?.requestId ?? null,
      },
    });
  }
});
