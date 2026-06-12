
# Decks Tips Pivot — Implementation Plan

This is a large, multi-area change. Calling it out before I start writing code so we agree on scope and the irreversible behavioral changes (especially queue ordering).

## 1. Critical behavioral change: tips do NOT affect the queue

Today `boost` directly influences ranking. Found in `src/pages/EventPage.tsx`:

```
score = (upvotes - downvotes) + (boost * 2)   // line ~334
secondary sort uses boost desc                 // line ~337
TRENDING uses boost momentum                   // line ~342
dominating/battle detection uses boost         // lines 271-301
```

The spec requires tips never affect placement. I will:

- Change the queue score to `upvotes - downvotes`, then created_at asc. DJ actions (status, played_at) already short-circuit ordering — unchanged.
- Trending: switch to recent upvote velocity only (no boost term).
- Remove the "dominating" / "boost battle" overlays (`DominatingBanner`, `BoostFX`, `BoostActivityStrip`, `useBoostFeed`) from the guest event view. They're tied to boost mechanics and conflict with the tips-don't-affect-playback promise.
- DB column `song_requests.boost` is **left in place** (used by historical analytics + future boost flag). It just stops being read by the sort. Aggregated `total_boosts` in `get_public_profile` will be renamed in the UI to "Tips sent" — value still comes from the same column for now.

If you'd rather keep the dominating/battle FX (rebranded as "Top Tipped"), say so and I'll keep them as pure visual flair with no ordering effect.

## 2. Rename UI Boost → Tip (guest-facing only)

Files to update (text + component renames where it makes sense):

- `src/components/BoostDialog.tsx` → `TipDialog.tsx`. "Boost the Vibe" → "Tip the DJ". Pack labels become dollar amounts ($1/$3/$5/$10/$20). Custom min $1, max $50. Mandatory disclaimer + acknowledge checkbox required before the Tip button enables.
- `src/components/SongRequestCard.tsx` — "Boost" button → "Tip DJ", rocket icon → `HandCoins` (lucide).
- `src/pages/EventPage.tsx` — copy, SEO description, modal labels.
- `src/pages/Earnings.tsx` → "Tip earnings", stats: Total tips, Today, Week, Month, Tip count.
- `src/pages/Profile.tsx` / `PublicProfile.tsx` — "Boosts" stat → "Tips".
- `src/pages/Analytics.tsx` — chart/table labels.
- `src/pages/Landing.tsx`, `src/pages/Auth.tsx`, `src/pages/Join.tsx`, `signup.tsx` email, legal pages (`Terms`, `Privacy`, `RefundPolicy`, `TrustSafety`) — replace user-facing "boost" copy.
- Internal vars (`boostTarget`, `useBoostFeed`, `BoostFX`) stay named as-is in code where their files are deleted/kept behind the flag; no functional impact.

DB column names, RPC names (`boost_request`, `boost` column), and `boost_purchases` table are **not** renamed — too risky for a copy change. They're hidden behind the feature flag layer.

## 3. Feature flag

New `src/lib/featureFlags.ts`:
```ts
export const ENABLE_TIPS = true;
export const ENABLE_BOOSTS = false;
```

`TipDialog` reads `ENABLE_TIPS`. Old `BoostDialog` is removed from the EventPage import chain. Re-enabling boosts later = flip the flag and swap dialog import; no schema work needed.

## 4. New limits + server enforcement

Update `public.check_boost_purchase_cap` (renamed conceptually, function name kept):
- max single: 2000¢ → **5000¢ ($50)**
- max 24h: 5000¢ → **10000¢ ($100)**
- max per event: keep count cap but also enforce **10000¢ ($100) sum per event**

Add a new column `boost_purchases.event_id` is already present. Sum by event_id over status in ('pending','succeeded').

`src/lib/purchaseCaps.ts` constants updated to match. Client pre-check shows the friendly message; server is source of truth.

Stripe stays OFF. No checkout edge function is enabled. The cap function is still called by the consent modal so the UX is real.

## 5. Mandatory disclaimer

Exact text, shown in TipDialog and CheckoutConsentModal:

> Tips support the DJ. Tips do not affect song placement and do not guarantee playback, prioritization, or any specific action by the DJ.

Acknowledge checkbox required. `purchase_consents` row continues to be written on confirm (already implemented).

## 6. Analytics fields

`boost_purchases` already has: user_id, event_id, amount_cents, status, created_at. The DJ id is derivable via `events.dj_id`. I'll add a view `public.tip_analytics` joining those so future reporting is one query. No new write paths.

## 7. Removed surfaces

- `BoostFX`, `BoostActivityStrip`, `DominatingBanner`, `useBoostFeed` removed from EventPage. Files stay on disk in case ENABLE_BOOSTS flips back, but unused.
- Boost-history list (if any in profile) relabeled "Tip history".

## 8. Acceptance checks I will run after implementation

- grep audit: zero guest-facing "Boost"/"boost" strings outside DB internals and the disabled boost code path. Report attached.
- `EventPage` ordering test: a request with boost=0 and 5 upvotes beats a request with boost=100 and 0 upvotes.
- Cap function:
  - $1, $20, $50 single → allowed
  - $51 single → blocked ("exceeds single-purchase limit")
  - 5 × $20 in one event → allowed; 6th → blocked at $100 event cap
  - $101 in 24h across events → blocked
- ENABLE_BOOSTS=true flip restores Tip→Boost label and re-mounts FX components (smoke test only).
- Stripe checkout edge function: not created.

## Files touched (estimate)

- New: `src/components/TipDialog.tsx`, `src/lib/featureFlags.ts`, migration for cap function + tip_analytics view.
- Edited: `EventPage.tsx`, `SongRequestCard.tsx`, `Earnings.tsx`, `Profile.tsx`, `PublicProfile.tsx`, `Analytics.tsx`, `Landing.tsx`, `Auth.tsx`, `Join.tsx`, legal pages, signup email, `purchaseCaps.ts`, `CheckoutConsentModal.tsx`.
- Removed from render tree (files kept): `BoostDialog`, `BoostFX`, `BoostActivityStrip`, `DominatingBanner`, `useBoostFeed`.

Approve and I'll ship it in one batch. Speak up now if you want the dominating/battle FX rebranded instead of removed, or if any DB rename is required.
