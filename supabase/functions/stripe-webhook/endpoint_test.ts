// Endpoint-level proof that the webhook answers HTTP 200 on success and a
// retryable HTTP 500 on a database failure.
//
// Everything external is mocked: a local HTTP server stands in for the
// Supabase REST/auth/functions API, and the Stripe signature is generated
// locally with a test secret. No live Stripe call, no real email, no live rows.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import Stripe from "https://esm.sh/stripe@17.5.0?target=denonext";

const WEBHOOK_SECRET = "whsec_test_secret_for_local_verification";
const MOCK_PORT = 8799;
const FN_PORT = 8798;

// ---------------------------------------------------------------- mock backend
interface MockState {
  row: { user_id: string; payouts_enabled: boolean } | null;
  failLookup: boolean;
  emails: Array<Record<string, unknown>>;
}
const mock: MockState = { row: null, failLookup: false, emails: [] };

const mockServer = Deno.serve({ port: MOCK_PORT }, async (req) => {
  const url = new URL(req.url);
  const p = url.pathname;
  if (Deno.env.get("MOCK_TRACE")) console.log("MOCK", req.method, p + url.search);

  if (p.startsWith("/rest/v1/dj_payout_accounts")) {
    if (req.method === "GET") {
      if (mock.failLookup) {
        return Response.json({ message: "connection reset" }, { status: 500 });
      }
      const rows = mock.row ? [mock.row] : [];
      const wantsObject = (req.headers.get("Accept") ?? "").includes(
        "pgrst.object",
      );
      if (wantsObject) {
        return rows.length
          ? Response.json(rows[0])
          : new Response(null, { status: 204 });
      }
      return Response.json(rows);
    }
    if (req.method === "PATCH") {
      const body = await req.json();
      const filterPayouts = url.searchParams.get("payouts_enabled");
      let matched = !!mock.row;
      if (matched && filterPayouts === "eq.false") {
        matched = mock.row!.payouts_enabled === false;
      }
      if (matched && mock.row) {
        mock.row = { ...mock.row, ...body };
      }
      const returned = matched && mock.row ? [{ user_id: mock.row.user_id }] : [];
      return Response.json(returned);
    }
  }

  if (p.startsWith("/auth/v1/admin/users/")) {
    const u = { id: "11111111-1111-4111-8111-111111111111", email: "dj@decks.test" };
    return Response.json({ ...u, user: u });
  }

  if (p.startsWith("/rest/v1/profiles")) {
    const rows = [{ nickname: "Nova" }];
    const wantsObject = (req.headers.get("Accept") ?? "").includes("pgrst.object");
    return wantsObject ? Response.json(rows[0]) : Response.json(rows);
  }

  if (p.startsWith("/functions/v1/send-transactional-email")) {
    mock.emails.push(await req.json());
    return Response.json({ success: true, queued: true });
  }

  return Response.json({}, { status: 200 });
});

// -------------------------------------------------------------- boot function
Deno.env.set("STRIPE_SECRET_KEY", "sk_test_dummy_key_for_local_tests");
Deno.env.set("STRIPE_WEBHOOK_SECRET_PLATFORM", WEBHOOK_SECRET);
Deno.env.set("SUPABASE_URL", `http://localhost:${MOCK_PORT}`);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("SUPABASE_ANON_KEY", "anon-test-key");

const originalServe = Deno.serve.bind(Deno);
let fnServer: { shutdown: () => Promise<void> } | null = null;
// Pin the function's server to a dedicated port.
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (handler: any) => {
  const s = originalServe({ port: FN_PORT }, handler);
  fnServer = s;
  return s;
};
await import("./index.ts");
// deno-lint-ignore no-explicit-any
(Deno as any).serve = originalServe;

const stripe = new Stripe("sk_test_dummy_key_for_local_tests", {
  apiVersion: "2024-12-18.acacia",
  httpClient: Stripe.createFetchHttpClient(),
});

async function postEvent(payoutsEnabled: boolean) {
  const payload = JSON.stringify({
    id: "evt_test_1",
    type: "account.updated",
    livemode: false,
    data: {
      object: {
        id: "acct_TEST123",
        charges_enabled: true,
        details_submitted: true,
        livemode: false,
        payouts_enabled: payoutsEnabled,
      },
    },
  });
  const header = await stripe.webhooks.generateTestHeaderStringAsync({
    payload,
    secret: WEBHOOK_SECRET,
  });
  const res = await fetch(`http://localhost:${FN_PORT}/`, {
    method: "POST",
    headers: { "stripe-signature": header, "content-type": "application/json" },
    body: payload,
  });
  const body = await res.text();
  return { status: res.status, body };
}

Deno.test({
  name: "endpoint returns 200 and queues one activation email",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  mock.row = { user_id: "11111111-1111-4111-8111-111111111111", payouts_enabled: false };
  mock.failLookup = false;
  mock.emails = [];

  const res = await postEvent(true);
  assertEquals(res.status, 200);
  assertEquals(mock.emails.length, 1);
  assertEquals(
    (mock.emails[0] as { templateName: string }).templateName,
    "dj-stripe-connected",
  );
  assertEquals(
    (mock.emails[0] as { idempotencyKey: string }).idempotencyKey,
    "dj-stripe-connected:acct_TEST123",
  );
  assertEquals(mock.row?.payouts_enabled, true);

  // Redelivery of the same event: still 200, no duplicate email.
  const again = await postEvent(true);
  assertEquals(again.status, 200);
  assertEquals(mock.emails.length, 1);
  },
});

Deno.test({
  name: "endpoint returns retryable 500 when the database lookup fails",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
  mock.row = { user_id: "11111111-1111-4111-8111-111111111111", payouts_enabled: false };
  mock.failLookup = true;
  mock.emails = [];

  const res = await postEvent(true);
  assertEquals(res.status, 500);
  assertEquals(mock.emails.length, 0);
  assertEquals(mock.row?.payouts_enabled, false);

  mock.failLookup = false;
  },
});

Deno.test({
  name: "teardown",
  sanitizeOps: false,
  sanitizeResources: false,
  async fn() {
    await fnServer?.shutdown();
    await mockServer.shutdown();
  },
});
