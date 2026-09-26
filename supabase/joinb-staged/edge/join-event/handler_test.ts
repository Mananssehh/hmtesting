import { assert, assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { createHandler, DENIED, type JoinDeps } from "./handler.ts";

const UID = "00000000-0000-0000-0000-00000000000a";

function mk(over: Partial<JoinDeps> = {}, counts = { user: 0, ip: 0 }) {
  const calls: { join: unknown[][]; record: unknown[][]; logs: string[] } = {
    join: [], record: [], logs: [],
  };
  const deps: JoinDeps = {
    getUserId: async (t) => (t === "good" ? UID : null),
    countAttempts: async (by) => counts[by],
    recordAttempt: async (u, ip) => { calls.record.push([u, ip]); },
    joinTrusted: async (u, c, n) => {
      calls.join.push([u, c, n]);
      return { data: { ok: true, event: { id: "e1" } }, error: null };
    },
    log: (l) => calls.logs.push(l),
    now: () => 1_700_000_000_000,
    ...over,
  };
  return { h: createHandler(deps), calls };
}

const post = (body: unknown, token = "good", ip = "1.2.3.4") =>
  new Request("http://x/join-event", {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "x-forwarded-for": ip, "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });

Deno.test("missing token -> 401, no db call", async () => {
  const { h, calls } = mk();
  const r = await h(new Request("http://x", { method: "POST", body: "{}" }));
  assertEquals(r.status, 401); assertEquals(await r.json(), DENIED);
  assertEquals(calls.join.length, 0); assertEquals(calls.record.length, 0);
});

Deno.test("invalid token -> 401, no db call", async () => {
  const { h, calls } = mk();
  const r = await h(post({ code: "LIVE01" }, "bad"));
  assertEquals(r.status, 401); await r.text();
  assertEquals(calls.join.length, 0);
});

Deno.test("getUser throwing -> 401", async () => {
  const { h } = mk({ getUserId: () => Promise.reject(new Error("boom")) });
  const r = await h(post({ code: "LIVE01" })); assertEquals(r.status, 401); await r.text();
});

Deno.test("GET -> 405; OPTIONS -> ok", async () => {
  const { h } = mk();
  const g = await h(new Request("http://x", { method: "GET" })); assertEquals(g.status, 405); await g.text();
  const o = await h(new Request("http://x", { method: "OPTIONS" })); assertEquals(o.status, 200); await o.text();
});

Deno.test("trusted rpc called with verified id from getUser, logs join_path=trusted", async () => {
  const { h, calls } = mk();
  const r = await h(post({ code: "LIVE01", nickname: "Nick" }));
  assertEquals(r.status, 200); assertEquals((await r.json()).ok, true);
  assertEquals(calls.join, [[UID, "LIVE01", "Nick"]]);
  assertEquals(calls.logs, ["join_path=trusted"]);
  assertEquals(calls.record, [[UID, "1.2.3.4"]]);
});

Deno.test("nickname omitted -> null passed", async () => {
  const { h, calls } = mk();
  const r = await h(post({ code: "LIVE01" })); await r.text();
  assertEquals(calls.join[0][2], null);
});

Deno.test("body with user_id is rejected: 200 unavailable, counted, rpc never called", async () => {
  const { h, calls } = mk();
  const r = await h(post({ code: "LIVE01", user_id: "00000000-0000-0000-0000-0000000000ff" }));
  assertEquals(r.status, 200); assertEquals(await r.text(), JSON.stringify(DENIED));
  assertEquals(calls.join.length, 0); assertEquals(calls.record.length, 1);
});

Deno.test("malformed body / bad JSON -> identical 200 unavailable bytes", async () => {
  const { h } = mk();
  const a = await h(post({})); const b = await h(post("not json")); const c = await h(post({ code: "x".repeat(21) }));
  for (const r of [a, b, c]) { assertEquals(r.status, 200); assertEquals(await r.text(), JSON.stringify(DENIED)); }
});

Deno.test("db 'unavailable' is passed through byte-identical", async () => {
  const { h } = mk({ joinTrusted: async () => ({ data: DENIED, error: null }) });
  const r = await h(post({ code: "NOPE99" }));
  assertEquals(r.status, 200); assertEquals(await r.text(), JSON.stringify(DENIED));
});

Deno.test("11th attempt for one user -> 429, nothing recorded or called", async () => {
  const { h, calls } = mk({}, { user: 10, ip: 0 });
  const r = await h(post({ code: "LIVE01" }));
  assertEquals(r.status, 429); assertEquals(await r.json(), { ok: false, reason: "rate_limited" });
  assertEquals(calls.join.length, 0); assertEquals(calls.record.length, 0);
});

Deno.test("31st attempt for one IP -> 429", async () => {
  const { h } = mk({}, { user: 0, ip: 30 });
  const r = await h(post({ code: "LIVE01" })); assertEquals(r.status, 429); await r.text();
});

Deno.test("known open defect kept: successful join still records an attempt", async () => {
  const { h, calls } = mk();
  const r = await h(post({ code: "LIVE01" })); await r.text();
  assertEquals(calls.record.length, 1);
});

Deno.test("db error -> 500 generic, no error text leaked", async () => {
  const { h } = mk({ joinTrusted: async () => ({ data: null, error: { message: "secret detail xyz" } }) });
  const r = await h(post({ code: "LIVE01" }));
  assertEquals(r.status, 500);
  const t = await r.text();
  assertEquals(t, JSON.stringify({ ok: false, reason: "error" })); assert(!t.includes("secret"));
});

Deno.test("window passed to counters is 10 minutes", async () => {
  let since = "";
  const { h } = mk({ countAttempts: async (_b, _v, s) => { since = s; return 0; } });
  const r = await h(post({ code: "LIVE01" })); await r.text();
  assertEquals(since, new Date(1_700_000_000_000 - 600_000).toISOString());
});
