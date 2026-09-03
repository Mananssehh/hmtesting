// Endpoint-level tests for the D2 tip-checkout lifecycle branches.
// Everything external is mocked: a local HTTP server stands in for the
// Supabase REST/auth/functions API and the Stripe signature is generated
// locally. No live Stripe call, no real email, no live rows.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import Stripe from "https://esm.sh/stripe@17.5.0?target=denonext";

const WEBHOOK_SECRET = "whsec_test_secret_for_checkout_lifecycle";
const MOCK_PORT = 8797;
const FN_PORT = 8796;

interface TipRow {
  id: string;
  status: string;
  stripe_checkout_session_id: string;
  stripe_payment_intent_id: string | null;
  checkout_expires_at: string | null;
  failure_reason?: string | null;
}

const mock = {
  tips: [] as TipRow[],
  failUpdate: false,
  emails: [] as Record<string, unknown>[],
};

function matches(row: TipRow, params: URLSearchParams) {
  for (const [k, v] of params) {
    if (!v.startsWith("eq.")) continue;
    const want = v.slice(3);
    // deno-lint-ignore no-explicit-any
    const got = (row as any)[k];
    if (k === "select" || k === "order" || k === "limit") continue;
    if (String(got) !== want) return false;
  }
  return true;
}

const mockServer = Deno.serve({ port: MOCK_PORT }, async (req) => {
  const url = new URL(req.url);
  const p = url.pathname;

  if (p.startsWith("/rest/v1/dj_tips")) {
    const params = new URLSearchParams(url.search);
    params.delete("select");
    if (req.method === "PATCH") {
      if (mock.failUpdate) return Response.json({ message: "db down" }, { status: 500 });
      const body = await req.json();
      const hit = mock.tips.filter((r) => matches(r, params));
      for (const r of hit) Object.assign(r, body);
      return Response.json(hit.map((r) => ({ id: r.id })));
    }
    if (req.method === "GET") {
      const hit = mock.tips.filter((r) => matches(r, params));
      const wantsObject = (req.headers.get("Accept") ?? "").includes("pgrst.object");
      if (wantsObject) {
        return hit.length ? Response.json({ id: hit[0].id }) : new Response(null, { status: 204 });
      }
      return Response.json(hit.map((r) => ({ id: r.id })));
    }
  }

  if (p.startsWith("/auth/v1/admin/users/")) {
    const u = { id: "11111111-1111-4111-8111-111111111111", email: "dj@decks.test" };
    return Response.json({ ...u, user: u });
  }
  if (p.startsWith("/rest/v1/profiles") || p.startsWith("/rest/v1/events")) {
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

Deno.env.set("STRIPE_SECRET_KEY", "sk_test_dummy_key_for_local_tests");
Deno.env.set("STRIPE_WEBHOOK_SECRET_PLATFORM", WEBHOOK_SECRET);
Deno.env.set("SUPABASE_URL", `http://localhost:${MOCK_PORT}`);
Deno.env.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test-key");
Deno.env.set("SUPABASE_ANON_KEY", "anon-test-key");

const originalServe = Deno.serve.bind(Deno);
let fnServer: { shutdown: () => Promise<void> } | null = null;
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

async function post(type: string, object: Record<string, unknown>) {
  const payload = JSON.stringify({
    id: `evt_${type}`,
    type,
    livemode: false,
    data: { object },
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
  await res.text();
  return res.status;
}

function seed(status = "pending"): TipRow {
  const row: TipRow = {
    id: "22222222-2222-4222-8222-222222222222",
    status,
    stripe_checkout_session_id: "cs_test_1",
    stripe_payment_intent_id: null,
    checkout_expires_at: null,
  };
  mock.tips = [row];
  mock.emails = [];
  mock.failUpdate = false;
  return row;
}

const opts = { sanitizeOps: false, sanitizeResources: false };

Deno.test({
  name: "completed + paid -> succeeded, expiry stored",
  ...opts,
  async fn() {
    const row = seed();
    const status = await post("checkout.session.completed", {
      id: "cs_test_1",
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_test_1",
      expires_at: 1800000000,
    });
    assertEquals(status, 200);
    assertEquals(row.status, "succeeded");
    assertEquals(row.stripe_payment_intent_id, "pi_test_1");
    assertEquals(row.checkout_expires_at, new Date(1800000000 * 1000).toISOString());
  },
});

Deno.test({
  name: "completed but unpaid (delayed payment) stays pending",
  ...opts,
  async fn() {
    const row = seed();
    const status = await post("checkout.session.completed", {
      id: "cs_test_1",
      status: "complete",
      payment_status: "unpaid",
      payment_intent: "pi_test_1",
    });
    assertEquals(status, 200);
    assertEquals(row.status, "pending");
    assertEquals(mock.emails.length, 0);
  },
});

Deno.test({
  name: "async_payment_succeeded -> succeeded",
  ...opts,
  async fn() {
    const row = seed();
    const status = await post("checkout.session.async_payment_succeeded", {
      id: "cs_test_1",
      status: "complete",
      payment_status: "paid",
      payment_intent: "pi_test_1",
    });
    assertEquals(status, 200);
    assertEquals(row.status, "succeeded");
  },
});

Deno.test({
  name: "async_payment_failed -> failed",
  ...opts,
  async fn() {
    const row = seed();
    const status = await post("checkout.session.async_payment_failed", {
      id: "cs_test_1",
      status: "complete",
      payment_status: "unpaid",
    });
    assertEquals(status, 200);
    assertEquals(row.status, "failed");
  },
});

Deno.test({
  name: "session expired -> expired",
  ...opts,
  async fn() {
    const row = seed();
    const status = await post("checkout.session.expired", {
      id: "cs_test_1",
      status: "expired",
      payment_status: "unpaid",
      expires_at: 1800000000,
    });
    assertEquals(status, 200);
    assertEquals(row.status, "expired");
  },
});

Deno.test({
  name: "expired never downgrades an already succeeded tip",
  ...opts,
  async fn() {
    const row = seed("succeeded");
    const status = await post("checkout.session.expired", {
      id: "cs_test_1",
      status: "expired",
      payment_status: "unpaid",
    });
    assertEquals(status, 200);
    assertEquals(row.status, "succeeded");
  },
});

Deno.test({
  name: "duplicate expired delivery is idempotent and still 200",
  ...opts,
  async fn() {
    const row = seed();
    const payload = {
      id: "cs_test_1",
      status: "expired",
      payment_status: "unpaid",
    };
    assertEquals(await post("checkout.session.expired", payload), 200);
    assertEquals(await post("checkout.session.expired", payload), 200);
    assertEquals(row.status, "expired");
  },
});

Deno.test({
  name: "unknown session id: no match, sanitized log, still 200",
  ...opts,
  async fn() {
    seed();
    const status = await post("checkout.session.expired", {
      id: "cs_unknown",
      status: "expired",
      payment_status: "unpaid",
    });
    assertEquals(status, 200);
    assertEquals(mock.tips[0].status, "pending");
  },
});

Deno.test({
  name: "database failure on expiry returns retryable 500",
  ...opts,
  async fn() {
    seed();
    mock.failUpdate = true;
    const status = await post("checkout.session.expired", {
      id: "cs_test_1",
      status: "expired",
      payment_status: "unpaid",
    });
    assertEquals(status, 500);
    assertEquals(mock.tips[0].status, "pending");
    mock.failUpdate = false;
  },
});

Deno.test({
  name: "teardown",
  ...opts,
  async fn() {
    await fnServer?.shutdown();
    await mockServer.shutdown();
  },
});
