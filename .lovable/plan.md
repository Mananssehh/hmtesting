# D1 — Repair the Stripe payout-activation confirmation email

Scope is strictly the `account.updated` path of the Stripe webhook. No other audit finding is touched.

## The defect

In `supabase/functions/stripe-webhook/index.ts`, the `account.updated` handler reads the previous payout state with `.select("dj_id, payouts_enabled")` from `dj_payout_accounts`. That table's owner column is `user_id`, so the query errors, the result is discarded, `prev?.dj_id` is always falsy, and the `dj-stripe-connected` email is never queued. The error is swallowed and Stripe still receives a 200.

## The fix

1. Select `user_id, payouts_enabled`; guard on `prev?.user_id`; pass `prev.user_id` to the email-address and nickname lookups.
2. Keep the idempotency key `dj-stripe-connected:${acct.id}` and the existing account-status synchronization exactly as they are.
3. Surface the lookup error: if the previous-state read fails, log it and return a 500 so Stripe retries, instead of acknowledging success with no email.

## Ordering so a transient email failure cannot suppress the email forever

Today the sync update would run before the email attempt. If the email queueing failed after `payouts_enabled` was already flipped to `true`, the Stripe retry would read `prev.payouts_enabled = true`, see no transition, and the activation email would be lost permanently.

New order inside the handler:

```text
1. read previous row (user_id, payouts_enabled)   -> error => 500 (retryable)
2. update all status fields EXCEPT the false->true
   payouts_enabled flip (charges_enabled,
   details_submitted, livemode, last_synced_at)
3. if activation transition: queue dj-stripe-connected
   -> error => 500 (retryable, payouts_enabled still false)
4. persist payouts_enabled = acct.payouts_enabled
5. return 200
```

Non-activation cases (no transition) write `payouts_enabled` in step 2 as before, so nothing else changes. Duplicate deliveries of the same webhook are safe: after a successful run `prev.payouts_enabled` is already `true`, so no second email; and the unchanged idempotency key is forwarded through the email queue to the provider as a second layer.

No schema migration is required.

## Tests

New Deno test file `supabase/functions/stripe-webhook/account-updated_test.ts`, exercising the extracted, injectable `handleAccountUpdated` logic with fake database/email/Stripe clients — no real email, no live Stripe:

- false -> true: exactly one `dj-stripe-connected` email queued, for the correct `user_id`, with key `dj-stripe-connected:<acct id>`.
- false -> false: no email.
- true -> true: no email.
- missing payout-account row: no email, handler completes safely.
- lookup failure: handler reports a retryable failure (500), no email, no status write.
- same webhook delivered twice: only one email queued.
- email-queue failure: retryable failure and `payouts_enabled` left unflipped, so the retry still sends.

## Technical notes

- `supabase/functions/stripe-webhook/index.ts` gains a small exported handler function for the `account.updated` case; signature verification, payment math, and every other event branch stay byte-identical.
- Verification: Deno check/tests for the function, `bunx vitest run` for the existing suite, a production `vite build`, and a final diff review for unrelated changes.
- Nothing is deployed and no live rows are touched; deployment waits for your approval.
