# DECKS — Current-State Audit (read-only, evidence-based)

Evidence: repo at commit `092154e`, build log `build OK` (2026-09-02T21:17Z), live backend queries (pg_policies, pg_constraint, row counts), security scan, and edge-function source. Nothing was modified.

## 1. Architecture (implemented)

| Layer | Actual |
|---|---|
| Frontend | React 18 + Vite 5 + TS + Tailwind + shadcn/Radix, react-router-dom 6.30.4, TanStack Query, recharts, qrcode.react, sonner, zod |
| Backend | Lovable Cloud (Supabase): Postgres + Auth + Realtime + 18 edge functions |
| Auth | Email/password, Google OAuth, anonymous sign-in + anonymous→permanent upgrade (`upgrade_anonymous_profile`), roles in `user_roles` + `has_role()` |
| DB | 28 public tables, RLS enabled on all 28; 60+ functions; triggers for points, vote counts, event lifecycle |
| Storage | No buckets exist. Album art = external URLs only |
| Payments | Stripe Connect destination charges, **live keys** (`sk_live_` accepted), 30% platform fee in `_shared/stripe.ts` (`PLATFORM_FEE_BPS = 3000`) |
| Music | `music-search` edge fn (Spotify creds + cache table + rate limiting). Apple/YouTube/SoundCloud = **link-out only** (`src/lib/searchLinks.ts`), not search providers |
| Email | Resend + pgmq queue + cron dispatch, 10 transactional templates |
| Bridge | Desktop app not in this repo. Contract = `bridge-pair`, `now-playing-ingest` (X-Ingest-Token), `bridge-event-snapshot` (Bearer ingest_token) |
| Hosting | Lovable deploy (linku99.com); `vercel.json` present but unused/stale |

Planned-only: storage buckets, boosts (flag `ENABLE_BOOSTS=false`), Apple/YT/SC metadata providers.

## 2. Route inventory

| Route | User | Data | Status |
|---|---|---|---|
| `/` Landing | public | static | WORKING |
| `/auth`, `/auth/callback`, `/forgot-password`, `/reset-password` | all | Supabase auth | WORKING |
| `/join` | guest | events, ensure_profile | WORKING |
| `/event/:code` (1156 lines) | guest | requests, votes, tips, now_playing realtime | WORKING |
| `/dj` dashboard | DJ | events | WORKING |
| `/dj/onboarding` | DJ | claim_dj_role | WORKING |
| `/dj/:id` manage (961 lines) | DJ | queue, moderation, bridge, focus mode | WORKING |
| `/dj/:id/analytics` | DJ | aggregates | PARTIALLY WORKING |
| `/dj/:id/dev` | DJ | ingest test panel | DEV TOOL IN PROD |
| `/dj/archive`, `/dj/earnings`, `/dj/errors` | DJ | archive, dj_tips, error_logs | PARTIALLY WORKING |
| `/profile`, `/profile/activity`, `/users/:id` | guest | profile RPCs | WORKING |
| `/admin/reports` | admin | reports | WORKING (client-guarded) |
| `/connect`, `/unsubscribe`, 7 legal pages, `/.lovable/oauth/consent` | public | static/RPC | WORKING |

No route uses mock data. UI-only surfaces: none found; placeholders are input placeholders only.

## 3. Verified feature status (highlights)

WORKING: signup/login/Google, password reset, DJ self-serve onboarding, event CRUD + start/end (`set_event_ended_at`, `sync_event_active`), QR + room code, anonymous join + upgrade, Spotify search w/ cache + circuit breaker, requests, votes (unique `(song_request_id,user_id)`), moderation/blocklist/bans, queue ordering, focus mode, CSV export (`src/lib/csv.ts`), archive, reports, error logging.

PARTIALLY WORKING:
- **Tips**: checkout + webhook work, but **168 `pending` rows vs 129 `succeeded`** in `dj_tips` — abandoned checkouts are never expired. `check_tip_cap` counts `pending`, so abandoned sessions consume a guest's $100/24h and $100/event caps.
- **Bridge**: pairing/ingest/snapshot implemented; all 10 `event_integrations` rows have `last_seen_at` older than 24h → no live Bridge session verifiable from this project. Desktop app UNVERIFIED.
- **Analytics/recap**: computed client-side per page; no persisted recap object.
- **Notifications**: toasts only. No push/email event notifications.

NOT IMPLEMENTED: boosts (flagged off, `boost_purchases` empty of succeeded rows), storage-hosted media, Apple/YouTube/SoundCloud search.

## 4. Flow verdicts

1. DJ signup → event → QR → start: **works end to end**. INSERT policy correctly requires `auth.uid() = dj_id AND has_role(auth.uid(),'dj')`.
2. Guest join → search → request → vote: **works**; server-side cooldown enforced inside the INSERT policy via `recent_request_count`. Gap: no duplicate-title guard, only a time cooldown, so the same song can be requested repeatedly by different guests or after cooldown.
3. DJ moderation → queue: **works** (DJ-owner UPDATE/DELETE policies scoped by `events.dj_id`).
4. Bridge → Now Playing: **code-complete, unverified live**.
5. Tip → revenue: **works when the guest completes checkout**; pending-row leakage inflates nothing in Earnings (UI filters to succeeded) but blocks caps.
6. End event → recap/archive: **works**, recap is recomputed rather than snapshotted.

## 5. Data integrity

Good: unique constraints on `votes(request,user)`, `event_participants(event,user)`, `now_playing(event)`, `user_roles(user,role)`, `dj_tips.stripe_payment_intent_id`, `dj_tips.stripe_checkout_session_id` (payment idempotency is real). FKs on all child tables. RLS on 28/28 tables.

Issues:
- `events` SELECT is `true` for `public` — anon can enumerate **every event including `dj_id`**. MEDIUM.
- `song_requests` SELECT is `true` for `public` — full cross-event read including `requested_by` UUIDs. MEDIUM.
- `profiles` public policy exposes `points`/`is_premium` for `is_public = true` (default true). Security scanner rates this **error**. HIGH.
- `event_integrations` policies use role `public` rather than `authenticated`; safe only because of the `auth.uid()` subquery. LOW.
- `ingest_token` is never rotated automatically and pairing codes are single-use/5-min (good), but a leaked token is valid indefinitely until `regenerate_ingest_token` is called manually. MEDIUM.
- 168 stale `pending` tips = data hygiene + cap-lock bug. HIGH.

## 6. Security classification

| Sev | Finding | Location |
|---|---|---|
| HIGH | `profiles` public SELECT leaks `points`/`is_premium` | policy "Public profiles are viewable by anyone" |
| HIGH | Pending tips never expire → cap lockout + dirty revenue table | `dj_tips`, `check_tip_cap`, `stripe-webhook` |
| MEDIUM | `/dj/:id/dev` dev tooling reachable in production | `src/pages/DJDevTools.tsx` |
| MEDIUM | Admin/DJ page guards are client-side only (data is still RLS-protected) | `AdminReports.tsx`, `ErrorMonitor.tsx` |
| MEDIUM | Global public read on `events` and `song_requests` | RLS |
| MEDIUM | Bridge ingest tokens have no expiry/rotation policy | `event_integrations` |
| LOW | Rate limiting exists only for `music-search`; join/request/vote/tip endpoints have no IP limiter | `rate_limit_logs` used in 1 function |
| LOW | Stale `vercel.json` conflicting with actual hosting | repo root |
| LOW | 5 Supabase linter warnings (mutable `search_path`, SECURITY DEFINER exposure) | DB functions |

No secrets are exposed in client code; only the publishable anon key is in `.env`. Webhook signatures are verified against both platform and Connect secrets before processing.

## 7. Payments

Stripe Connect Express destination charges, **live mode**. Fee: `Math.floor(gross * 0.30)` platform, remainder to DJ — the 70/30 split is implemented exactly. Confirmation happens only in `stripe-webhook` (signature-verified, idempotent via unique Stripe IDs), handling `checkout.session.completed`, `payment_intent.succeeded/failed`, `charge.succeeded/refunded`, `refund.*`, `charge.dispute.created/closed`, `account.updated`. Earnings UI reads `dj_tips` filtered to succeeded minus refunds. Verdict: **safe for production except the pending-row lifecycle**.

## 8. Bridge

Pair with 6-digit code (5-min TTL, single claim, IP rate-limited 10 fails/10 min) → returns `event_id` + `ingest_token` + ingest URL. Ingest authenticates by `X-Ingest-Token`, updates `last_seen_at` heartbeat. Snapshot endpoint uses Bearer ingest_token and returns event, queue, trending, tips, and resolved `guest_nickname`. Recommended polling 4s. Schema matches the contract. Desktop repo behaviour: UNVERIFIED.

## 9. Code quality

`EventPage.tsx` (1156) and `DJEventManage.tsx` (961) are oversized and fragile. Only one test file exists (`BoostDialog.test.tsx`) and it covers a disabled feature. Boost code paths are dead-but-retained behind `ENABLE_BOOSTS`. Build passes, no TS errors.

## 10. Executive summary

| Area | Completion | Evidence |
|---|---|---|
| Frontend/UI | 90% | 23 pages, all wired to live data |
| Backend | 85% | 18 functions, all deployed |
| Database | 88% | 28 tables, RLS everywhere, good constraints |
| Auth | 95% | full flows incl. anon upgrade |
| Guest experience | 88% | join→request→vote→tip complete |
| DJ experience | 85% | manage/moderate/focus/archive complete |
| Bridge | 70% | contract complete, live session unverified |
| Payments | 80% | live + verified webhooks, pending leak |
| Analytics | 65% | live but recomputed, no recap snapshot |
| Security | 70% | 1 high scanner finding, thin rate limiting |
| Testing | 10% | one test, for a disabled feature |
| **Production readiness** | **~78%** | usable, with 2 HIGH blockers |

Production blockers: (1) profiles points/premium exposure, (2) pending-tip expiry + cap lockout, (3) remove or gate `/dj/:id/dev`.

## Proposed remediation roadmap (awaiting your approval — no code changed yet)

- **Phase 0 (Small–Medium)**: restrict the public `profiles` policy to non-sensitive columns; expire `dj_tips` pending rows (webhook `checkout.session.expired` + cutoff) and exclude expired ones from `check_tip_cap`; gate `/dj/:id/dev` behind an admin role or dev build.
- **Phase 1 (Medium)**: narrow `events`/`song_requests` public SELECT to the joined event; add duplicate-song guard per event.
- **Phase 2 (Medium)**: pending-tip reconciliation job + refund/dispute display in Earnings.
- **Phase 3 (Medium)**: Bridge token rotation on event end, stale-connection UI, live pairing verification.
- **Phase 4 (Large)**: persist post-event recap snapshots; split `EventPage`/`DJEventManage`; add flow tests.
- **Phase 5 (Small)**: remove `vercel.json`, clear Supabase linter warnings, launch checklist.

**Recommended immediate next step:** fix the `dj_tips` pending-row lifecycle. It is the only defect currently affecting paying users — abandoned checkouts silently consume real guests' tip caps and lock them out of tipping for 24 hours.
