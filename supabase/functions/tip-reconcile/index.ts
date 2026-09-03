// Reconciles pending dj_tips rows against Stripe.
//
// DRY RUN BY DEFAULT: with no `apply: true` in the body this function only
// reports proposed counts and never writes a row.
//
// Classification uses the real Stripe state, never local heuristics:
//   session.status         -> open | complete | expired
//   session.payment_status -> paid | unpaid | no_payment_required
//   payment_intent.status  -> when a PI exists (delayed payment methods)
//
// Admin-only: caller must hold the `admin` role.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { corsHeaders, getStripe, json } from "../_shared/stripe.ts";

export type Resolution = "expired" | "succeeded" | "failed" | "pending_live" | "unresolved";

export interface SessionView {
  status?: string | null;
  payment_status?: string | null;
  payment_intent_status?: string | null;
  payment_intent_id?: string | null;
  expires_at?: number | null;
}

/** Pure classifier — unit tested without Stripe. */
export function classify(view: SessionView | null): Resolution {
  if (!view) return "unresolved";
  const { status, payment_status, payment_intent_status } = view;

  if (payment_status === "paid" || payment_status === "no_payment_required") return "succeeded";
  if (payment_intent_status === "succeeded") return "succeeded";

  if (status === "expired") {
    // An expired session can still have a PI that later succeeded (async).
    return payment_intent_status === "processing" ? "unresolved" : "expired";
  }
  if (status === "open") return "pending_live";
  if (status === "complete") {
    // Complete but unpaid == delayed payment method still in flight or failed.
    if (payment_intent_status === "processing" || payment_intent_status === "requires_action") return "pending_live";
    if (
      payment_intent_status === "canceled" ||
      payment_intent_status === "requires_payment_method"
    ) return "failed";
    return "unresolved";
  }
  return "unresolved";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const anon = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } },
  );
  const { data: claims } = await anon.auth.getClaims(authHeader.replace("Bearer ", ""));
  const userId = claims?.claims?.sub as string | undefined;
  if (!userId) return json({ error: "Unauthorized" }, 401);

  const { data: isAdmin, error: roleErr } = await admin.rpc("has_role", {
    _user_id: userId,
    _role: "admin",
  });
  if (roleErr) {
    console.error("[tip-reconcile] role check failed", roleErr.message);
    return json({ error: "role_check_failed" }, 500);
  }
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  const body = await req.json().catch(() => ({}));
  const apply = body?.apply === true;
  const limit = Math.min(Math.max(Number(body?.limit ?? 500), 1), 1000);

  const { data: rows, error: rowsErr } = await admin
    .from("dj_tips")
    .select("id, status, stripe_checkout_session_id, created_at, gross_amount_cents")
    .eq("status", "pending")
    .order("created_at", { ascending: true })
    .limit(limit);
  if (rowsErr) {
    console.error("[tip-reconcile] pending lookup failed", rowsErr.message);
    return json({ error: "db_lookup_failed" }, 500);
  }

  const stripe = getStripe();
  const counts: Record<Resolution | "no_session_id", number> = {
    expired: 0,
    succeeded: 0,
    failed: 0,
    pending_live: 0,
    unresolved: 0,
    no_session_id: 0,
  };
  const changes: Array<{ id: string; from: string; to: Resolution }> = [];
  // Sanitized diagnostics for rows we refuse to classify. No amounts, no
  // user ids, no Stripe session ids — only the state that drove the decision.
  const unresolvedDetails: Array<{
    tip_id: string;
    age_days: number;
    retrieve_failed: boolean;
    session_status: string | null;
    payment_status: string | null;
    payment_intent_status: string | null;
  }> = [];


  for (const row of rows ?? []) {
    if (!row.stripe_checkout_session_id) {
      counts.no_session_id += 1;
      continue;
    }
    let view: SessionView | null = null;
    try {
      const s: any = await stripe.checkout.sessions.retrieve(row.stripe_checkout_session_id, {
        expand: ["payment_intent"],
      });
      const pi = s.payment_intent;
      view = {
        status: s.status ?? null,
        payment_status: s.payment_status ?? null,
        payment_intent_status: pi && typeof pi === "object" ? pi.status ?? null : null,
        payment_intent_id: pi ? (typeof pi === "string" ? pi : pi.id) : null,
        expires_at: typeof s.expires_at === "number" ? s.expires_at : null,
      };
    } catch (e) {
      console.warn("[tip-reconcile] session retrieve failed", {
        tip_id: row.id,
        message: (e as Error).message,
      });
    }

    const resolution = classify(view);
    counts[resolution] += 1;
    if (resolution === "unresolved") {
      unresolvedDetails.push({
        tip_id: row.id,
        age_days: Math.floor(
          (Date.now() - new Date(row.created_at as string).getTime()) / 86400000,
        ),
        retrieve_failed: view === null,
        session_status: view?.status ?? null,
        payment_status: view?.payment_status ?? null,
        payment_intent_status: view?.payment_intent_status ?? null,
      });
    }
    if (resolution === "pending_live" || resolution === "unresolved") continue;
    changes.push({ id: row.id, from: row.status, to: resolution });


    if (apply) {
      const patch: Record<string, unknown> = { status: resolution };
      if (view?.payment_intent_id) patch.stripe_payment_intent_id = view.payment_intent_id;
      if (view?.expires_at) {
        patch.checkout_expires_at = new Date(view.expires_at * 1000).toISOString();
      }
      if (resolution === "failed") patch.failure_reason = "reconciled_unpaid";
      const { error: upErr } = await admin
        .from("dj_tips").update(patch).eq("id", row.id).eq("status", "pending");
      if (upErr) {
        console.error("[tip-reconcile] update failed", { tip_id: row.id, message: upErr.message });
        return json({ error: "db_update_failed", applied_before_failure: changes.length }, 500);
      }
    }
  }

  return json({
    dry_run: !apply,
    inspected: rows?.length ?? 0,
    counts,
    proposed_changes: apply ? undefined : changes.length,
    applied: apply ? changes.length : 0,
  });
});
