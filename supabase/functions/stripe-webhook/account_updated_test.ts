// Focused tests for the account.updated activation-email flow.
// Fully mocked: no live Stripe, no real email, no live database rows.
import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  type AccountUpdatedDeps,
  handleAccountUpdated,
  type PayoutStore,
} from "./account-updated.ts";

interface FakeRow {
  user_id: string;
  payouts_enabled: boolean;
  charges_enabled?: boolean;
  details_submitted?: boolean;
  livemode?: boolean;
  last_synced_at?: string;
}

interface SentEmail {
  templateName: string;
  recipientEmail: string | null | undefined;
  idempotencyKey: string;
  templateData: Record<string, unknown>;
}

function makeHarness(opts: {
  row?: FakeRow | null;
  lookupError?: unknown;
  syncError?: unknown;
  claimError?: unknown;
  emailThrows?: boolean;
}) {
  const state: { row: FakeRow | null } = { row: opts.row ?? null };
  const emails: SentEmail[] = [];
  const calls = { sync: 0, claim: 0, setPayouts: 0 };

  const store: PayoutStore = {
    getPrevious() {
      if (opts.lookupError) {
        return Promise.resolve({ data: null, error: opts.lookupError });
      }
      // Snapshot, mirroring a real read.
      return Promise.resolve({
        data: state.row
          ? { user_id: state.row.user_id, payouts_enabled: state.row.payouts_enabled }
          : null,
        error: null,
      });
    },
    syncStatus(_id, fields) {
      calls.sync++;
      if (opts.syncError) return Promise.resolve({ error: opts.syncError });
      if (state.row) state.row = { ...state.row, ...fields };
      return Promise.resolve({ error: null });
    },
    claimActivation() {
      calls.claim++;
      if (opts.claimError) {
        return Promise.resolve({ claimed: false, error: opts.claimError });
      }
      // Atomic conditional update: only the first caller wins.
      if (state.row && state.row.payouts_enabled === false) {
        state.row = { ...state.row, payouts_enabled: true };
        return Promise.resolve({ claimed: true, error: null });
      }
      return Promise.resolve({ claimed: false, error: null });
    },
    setPayoutsEnabled(_id, value) {
      calls.setPayouts++;
      if (state.row) state.row = { ...state.row, payouts_enabled: value };
      return Promise.resolve({ error: null });
    },
  };

  const deps: AccountUpdatedDeps = {
    store,
    getUserEmail: () => Promise.resolve("dj@decks.test"),
    getNickname: () => Promise.resolve("Nova"),
    sendEmail: (e) => {
      if (opts.emailThrows) return Promise.reject(new Error("queue down"));
      emails.push(e);
      return Promise.resolve();
    },
  };

  return { state, emails, calls, deps };
}

const acct = (payouts: boolean) => ({
  id: "acct_TEST123",
  charges_enabled: true,
  details_submitted: true,
  livemode: true,
  payouts_enabled: payouts,
});

Deno.test("false -> true queues exactly one dj-stripe-connected email", async () => {
  const h = makeHarness({ row: { user_id: "user-1", payouts_enabled: false } });
  const res = await handleAccountUpdated(acct(true), h.deps);

  assertEquals(res.ok, true);
  assertEquals(res.outcome, "emailed");
  assertEquals(h.emails.length, 1);
  assertEquals(h.emails[0].templateName, "dj-stripe-connected");
  assertEquals(h.emails[0].recipientEmail, "dj@decks.test");
  assertEquals(h.emails[0].idempotencyKey, "dj-stripe-connected:acct_TEST123");
  assertEquals(h.emails[0].templateData, { djName: "Nova" });
  assertEquals(h.state.row?.payouts_enabled, true);
});

Deno.test("false -> false sends no email", async () => {
  const h = makeHarness({ row: { user_id: "user-1", payouts_enabled: false } });
  const res = await handleAccountUpdated(acct(false), h.deps);
  assertEquals(res.ok, true);
  assertEquals(res.outcome, "no_transition");
  assertEquals(h.emails.length, 0);
});

Deno.test("true -> true sends no duplicate email", async () => {
  const h = makeHarness({ row: { user_id: "user-1", payouts_enabled: true } });
  const res = await handleAccountUpdated(acct(true), h.deps);
  assertEquals(res.ok, true);
  assertEquals(res.outcome, "no_transition");
  assertEquals(h.emails.length, 0);
});

Deno.test("missing payout-account row: safe, no email, no writes", async () => {
  const h = makeHarness({ row: null });
  const res = await handleAccountUpdated(acct(true), h.deps);
  assertEquals(res.ok, true);
  assertEquals(res.outcome, "no_account_row");
  assertEquals(h.emails.length, 0);
  assertEquals(h.calls.sync, 0);
  assertEquals(h.calls.claim, 0);
});

Deno.test("lookup failure is retryable and writes nothing", async () => {
  const h = makeHarness({
    row: { user_id: "user-1", payouts_enabled: false },
    lookupError: { message: "connection reset" },
  });
  const res = await handleAccountUpdated(acct(true), h.deps);
  assertEquals(res.ok, false);
  assertEquals(res.outcome, "lookup_failed");
  assertEquals(h.emails.length, 0);
  assertEquals(h.calls.sync, 0);
  assertEquals(h.state.row?.payouts_enabled, false);
});

Deno.test("status-sync write failure is retryable", async () => {
  const h = makeHarness({
    row: { user_id: "user-1", payouts_enabled: false },
    syncError: { message: "write failed" },
  });
  const res = await handleAccountUpdated(acct(true), h.deps);
  assertEquals(res.ok, false);
  assertEquals(res.outcome, "sync_failed");
  assertEquals(h.emails.length, 0);
  assertEquals(h.state.row?.payouts_enabled, false);
});

Deno.test("activation-claim write failure is retryable", async () => {
  const h = makeHarness({
    row: { user_id: "user-1", payouts_enabled: false },
    claimError: { message: "deadlock" },
  });
  const res = await handleAccountUpdated(acct(true), h.deps);
  assertEquals(res.ok, false);
  assertEquals(res.outcome, "claim_failed");
  assertEquals(h.emails.length, 0);
});

Deno.test("repeated delivery of the same webhook queues one email", async () => {
  const h = makeHarness({ row: { user_id: "user-1", payouts_enabled: false } });
  const first = await handleAccountUpdated(acct(true), h.deps);
  const second = await handleAccountUpdated(acct(true), h.deps);
  assertEquals(first.outcome, "emailed");
  assertEquals(second.ok, true);
  assertEquals(second.outcome, "no_transition");
  assertEquals(h.emails.length, 1);
});

Deno.test("concurrent duplicate deliveries queue at most one email", async () => {
  const h = makeHarness({ row: { user_id: "user-1", payouts_enabled: false } });
  const [a, b] = await Promise.all([
    handleAccountUpdated(acct(true), h.deps),
    handleAccountUpdated(acct(true), h.deps),
  ]);
  assertEquals(h.emails.length, 1);
  const outcomes = [a.outcome, b.outcome].sort();
  assertEquals(outcomes, ["already_claimed", "emailed"]);
  assertEquals(a.ok && b.ok, true);
});

Deno.test("email queue failure reverts the claim and is retryable", async () => {
  const h = makeHarness({
    row: { user_id: "user-1", payouts_enabled: false },
    emailThrows: true,
  });
  const res = await handleAccountUpdated(acct(true), h.deps);
  assertEquals(res.ok, false);
  assertEquals(res.outcome, "email_failed");
  assertEquals(h.emails.length, 0);
  // Reverted, so the Stripe retry still sees a false -> true transition.
  assertEquals(h.state.row?.payouts_enabled, false);

  // Simulate the retry with a working queue.
  const retry = makeHarness({ row: { user_id: "user-1", payouts_enabled: false } });
  const res2 = await handleAccountUpdated(acct(true), retry.deps);
  assertEquals(res2.outcome, "emailed");
  assertEquals(retry.emails.length, 1);
});
