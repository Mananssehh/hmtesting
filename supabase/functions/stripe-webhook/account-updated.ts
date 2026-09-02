// account.updated handling for the Stripe webhook.
//
// Extracted from index.ts so the activation-email flow is unit-testable with
// mocks (no live Stripe, no real email, no live database rows).
//
// Reliability contract:
//   1. Read the previous payout state. A read error is RETRYABLE (HTTP 500) —
//      it must never be acknowledged as success while silently skipping email.
//   2. Sync the non-activation status fields. A write error is RETRYABLE.
//   3. On a false -> true payouts_enabled transition, atomically CLAIM the
//      activation by flipping payouts_enabled only where it is still false.
//      Exactly one concurrent delivery can win the claim, so at most one email
//      is ever queued.
//   4. If queueing the email fails, revert the claim and report a retryable
//      failure, so a Stripe retry can send it again (flag is back to false).
//   5. Non-activation cases simply persist payouts_enabled as reported.

export interface PayoutAccountRow {
  user_id: string;
  payouts_enabled: boolean;
}

export interface PayoutStore {
  /** Previous stored state for a connected account. */
  getPrevious(
    stripeAccountId: string,
  ): Promise<{ data: PayoutAccountRow | null; error: unknown | null }>;
  /** Sync everything except payouts_enabled. Reports rows actually affected. */
  syncStatus(
    stripeAccountId: string,
    fields: {
      charges_enabled: boolean;
      details_submitted: boolean;
      livemode: boolean;
      last_synced_at: string;
    },
  ): Promise<{ affected: number; error: unknown | null }>;
  /** Atomic claim: set payouts_enabled = true only if it is currently false. */
  claimActivation(
    stripeAccountId: string,
  ): Promise<{ claimed: boolean; error: unknown | null }>;
  /** Unconditional write of payouts_enabled (also used to revert a claim). */
  setPayoutsEnabled(
    stripeAccountId: string,
    value: boolean,
  ): Promise<{ affected: number; error: unknown | null }>;
}

export interface AccountUpdatedDeps {
  store: PayoutStore;
  getUserEmail: (userId: string) => Promise<string | null>;
  getNickname: (userId: string) => Promise<string | null>;
  sendEmail: (opts: {
    templateName: string;
    recipientEmail: string | null | undefined;
    idempotencyKey: string;
    templateData: Record<string, unknown>;
  }) => Promise<void>;
}

export interface StripeAccountLike {
  id: string;
  charges_enabled?: boolean;
  payouts_enabled?: boolean;
  details_submitted?: boolean;
  livemode?: boolean;
}

export interface AccountUpdatedResult {
  /** false => caller must answer HTTP 500 so Stripe retries. */
  ok: boolean;
  outcome:
    | "no_account_row"
    | "emailed"
    | "already_claimed"
    | "no_transition"
    | "lookup_failed"
    | "sync_failed"
    | "claim_failed"
    | "email_failed";
  emailQueued: boolean;
}

function errMessage(e: unknown): string {
  return (e as { message?: string })?.message ?? String(e);
}

export async function handleAccountUpdated(
  acct: StripeAccountLike,
  deps: AccountUpdatedDeps,
): Promise<AccountUpdatedResult> {
  const { store } = deps;
  const accountId = acct.id;

  const { data: prev, error: prevError } = await store.getPrevious(accountId);
  if (prevError) {
    // Explicit, visible, retryable — the original code swallowed this.
    console.error("[stripe-webhook] account.updated lookup failed", {
      stripe_account_id: accountId,
      error: errMessage(prevError),
    });
    return { ok: false, outcome: "lookup_failed", emailQueued: false };
  }

  if (!prev) {
    // Unknown connected account: nothing to sync, nothing to email.
    // Log the Stripe account id only — no private account details.
    console.warn("[stripe-webhook] account.updated for unknown payout account", {
      stripe_account_id: accountId,
    });
    return { ok: true, outcome: "no_account_row", emailQueued: false };
  }

  const { affected: syncAffected, error: syncError } = await store.syncStatus(
    accountId,
    {
      charges_enabled: !!acct.charges_enabled,
      details_submitted: !!acct.details_submitted,
      livemode: !!acct.livemode,
      last_synced_at: new Date().toISOString(),
    },
  );
  if (syncError || syncAffected !== 1) {
    console.error("[stripe-webhook] account.updated status sync failed", {
      stripe_account_id: accountId,
      rows_affected: syncAffected,
      error: syncError ? errMessage(syncError) : "no row affected",
    });
    return { ok: false, outcome: "sync_failed", emailQueued: false };
  }

  const activating = !!acct.payouts_enabled && !prev.payouts_enabled;

  if (!activating) {
    const { affected, error } = await store.setPayoutsEnabled(
      accountId,
      !!acct.payouts_enabled,
    );
    if (error || affected !== 1) {
      console.error("[stripe-webhook] account.updated payouts write failed", {
        stripe_account_id: accountId,
        rows_affected: affected,
        error: error ? errMessage(error) : "no row affected",
      });
      return { ok: false, outcome: "sync_failed", emailQueued: false };
    }
    return { ok: true, outcome: "no_transition", emailQueued: false };
  }

  // Atomic single-winner claim across concurrent deliveries.
  const { claimed, error: claimError } = await store.claimActivation(accountId);
  if (claimError) {
    console.error("[stripe-webhook] account.updated activation claim failed", {
      stripe_account_id: accountId,
      error: errMessage(claimError),
    });
    return { ok: false, outcome: "claim_failed", emailQueued: false };
  }
  if (!claimed) {
    // Another delivery already flipped the flag and owns the email.
    return { ok: true, outcome: "already_claimed", emailQueued: false };
  }

  try {
    const djEmail = await deps.getUserEmail(prev.user_id);
    const djName = (await deps.getNickname(prev.user_id)) ?? "there";
    await deps.sendEmail({
      templateName: "dj-stripe-connected",
      recipientEmail: djEmail,
      idempotencyKey: `dj-stripe-connected:${accountId}`,
      templateData: { djName },
    });
  } catch (e) {
    // Revert the claim so a Stripe retry re-attempts the email.
    const { affected: revertAffected, error: revertError } = await store
      .setPayoutsEnabled(accountId, false);
    if (revertError || revertAffected !== 1) {
      // Sanitized: Stripe account id only, no account holder details.
      console.error(
        "[stripe-webhook] CRITICAL: failed to revert activation claim — activation email may be permanently lost for this account",
        {
          stripe_account_id: accountId,
          rows_affected: revertAffected,
          error: revertError ? errMessage(revertError) : "no row affected",
        },
      );
    }
    console.error("[stripe-webhook] activation email queueing failed", {
      stripe_account_id: accountId,
      error: errMessage(e),
    });
    return { ok: false, outcome: "email_failed", emailQueued: false };
  }

  return { ok: true, outcome: "emailed", emailQueued: true };
}

/** Supabase-backed PayoutStore. */
// deno-lint-ignore no-explicit-any
export function createPayoutStore(admin: any): PayoutStore {
  return {
    async getPrevious(stripeAccountId) {
      const { data, error } = await admin
        .from("dj_payout_accounts")
        .select("user_id, payouts_enabled")
        .eq("stripe_account_id", stripeAccountId)
        .maybeSingle();
      return {
        data: (data as PayoutAccountRow | null) ?? null,
        error: error ?? null,
      };
    },
    async syncStatus(stripeAccountId, fields) {
      const { error } = await admin
        .from("dj_payout_accounts")
        .update(fields)
        .eq("stripe_account_id", stripeAccountId);
      return { error: error ?? null };
    },
    async claimActivation(stripeAccountId) {
      const { data, error } = await admin
        .from("dj_payout_accounts")
        .update({ payouts_enabled: true })
        .eq("stripe_account_id", stripeAccountId)
        .eq("payouts_enabled", false)
        .select("user_id");
      if (error) return { claimed: false, error };
      return { claimed: Array.isArray(data) && data.length > 0, error: null };
    },
    async setPayoutsEnabled(stripeAccountId, value) {
      const { error } = await admin
        .from("dj_payout_accounts")
        .update({ payouts_enabled: value })
        .eq("stripe_account_id", stripeAccountId);
      return { error: error ?? null };
    },
  };
}
