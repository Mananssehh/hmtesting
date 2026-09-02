# D1 — Repair the Stripe payout-activation confirmation email

Scope is strictly the `account.updated` path of the Stripe webhook. No other audit finding is touched.

## The defect

In `supabase/functions/stripe-webhook/index.ts`, the `account.updated` handler reads the previous payout state with `.select("dj_id, payouts_enabled")` from `dj_payout_accounts`. That table's owner column is `user_id`, so the query errors, the result is discarded, `prev?.dj_id` is always falsy, and the `dj-stripe-connected` email is never queued. The error is swallowed and Stripe still receives a 200.

## The fix

1. Select `user_id, payouts_enabled`; guard on `prev?.user_id`; pass `prev.user_id` to the email-address and nickname lookups.
2. Keep the idempotency key `dj-stripe-connected:${acct.id}` and the existing account-status synchronization.
3. Surface errors: a failed read or a failed status write returns a real HTTP 500 so Stripe retries, instead of acknowledging success with no email.

## Ordering, single-winner claim, and error handling

Today the sync update runs before the email attempt. If email queueing failed after `payouts_enabled` was already flipped to `true`, the Stripe retry would read `prev.payouts_enabled = true`, see no transition, and lose the activation email permanently. Concurrent duplicate deliveries have the mirror problem: both read `false` and both send.

New order inside the handler:

```text
1. read previous row (user_id, payouts_enabled)
     error   => HTTP 500 (retryable, logged)
     no row  => log stripe_account_id only, no email, HTTP 200
2. write charges_enabled, details_submitted, livemode, last_synced_at
     error   => HTTP 500 (retryable)
3. no false->true transition:
     write payouts_enabled as reported; error => HTTP 500; done
4. transition: ATOMIC CLAIM
     UPDATE ... SET payouts_enabled = true
       WHERE stripe_account_id = X AND payouts_enabled = false
       RETURNING user_id
     error       => HTTP 500
     0 rows back => another delivery already owns the email; no email; HTTP 200
     1 row back  => this delivery owns the email
5. queue dj-stripe-connected for prev.user_id
     error => revert payouts_enabled to false, HTTP 500 (retry re-sends)
6. HTTP 200
```

Both status writes are error-checked; every failure path returns a real retryable HTTP 500 from the endpoint, never a silent 200.

## Email idempotency — verified behaviour, not assumed

Inspection of `supabase/functions/process-email-queue/index.ts` shows the queue deduplicates on `payload.message_id` (a fresh UUID per invocation) against `email_send_log`; `idempotency_key` is only forwarded to the send API. So the `dj-stripe-connected:${acct.id}` key alone does **not** provably stop a second queued email from this webhook. That is exactly why the single-winner database claim in step 4 is the enforced guarantee; the key is preserved and remains the provider-side second layer.

No schema migration is required — the claim uses the existing `payouts_enabled` column.

## Tests

New `supabase/functions/stripe-webhook/account_updated_test.ts` (mocked store/email — no real email, no live Stripe, no live rows):

- false -> true: exactly one `dj-stripe-connected` email, correct `user_id`, key `dj-stripe-connected:<acct id>`.
- false -> false and true -> true: no email.
- missing payout-account row: no email, safe completion, log contains only the Stripe account id.
- lookup failure: retryable failure, no email, no status write.
- either status write failing: retryable failure.
- same webhook delivered twice sequentially: one email.
- two handlers racing on the same `false` state (concurrent `Promise.all` against one shared fake store): one email.
- email queue failure: retryable failure and `payouts_enabled` reverted to false.

New `supabase/functions/stripe-webhook/endpoint_test.ts`: drives the real `Deno.serve` endpoint over HTTP with a locally signed Stripe test signature and a mock Supabase REST/auth/functions server, asserting HTTP 200 on success and HTTP 500 on a database failure — proving retry behaviour through the outer endpoint, not just the helper. If the outer endpoint cannot be exercised safely offline, that is reported explicitly rather than skipped silently.

## Technical notes

- `supabase/functions/stripe-webhook/index.ts`: the `account.updated` case delegates to a new `account-updated.ts` (injectable store + email deps) and returns 500 when the result is retryable. Signature verification, payment math, and every other event branch stay unchanged.
- Verification: `deno check` on the function, the new Deno tests, `bunx vitest run`, production `vite build`, and a final diff review.
- Nothing is deployed and no live rows are touched; deployment waits for separate approval.
