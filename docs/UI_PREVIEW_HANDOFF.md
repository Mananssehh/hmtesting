# Decks — UI Preview / Design Lab Handoff

> Purpose: give a brand-new Lovable project (with zero conversation history) everything it needs to
> redesign the Decks interface **without** breaking production behavior.
> Everything below was verified by reading the current repository. Where something could not be
> verified from source, it is explicitly marked `UNVERIFIED`.

---

## 1. Product Overview

Decks is a **live DJ request platform**. A DJ runs an event; the crowd joins via QR code or a
6-character room code and influences what gets played — but the DJ always keeps final control.

**Guests can:**
- scan a QR code / open a join link
- join an event with a room code
- choose a nickname (display-only)
- search and request songs
- upvote / downvote requests
- tip the DJ with real money (Stripe)
- see Now Playing
- see the live queue update in realtime

**DJs can:**
- create and manage events
- approve, reject, play, skip and remove requests
- monitor votes and trending songs
- receive tips (Stripe Connect Express payouts)
- see analytics, archive and earnings
- pair **Decks Bridge** (desktop companion) for live Now Playing detection

**Core product rule:** the crowd *influences* the queue; the DJ *controls* it. Tips never buy queue
position (see §8).

---

## 2. Tech Stack (from `package.json`)

| Area | Package / version |
| --- | --- |
| UI framework | `react` ^18.3.1, `react-dom` ^18.3.1 |
| Build tool | `vite` ^5.4.19 with `@vitejs/plugin-react-swc` ^3.11.0 |
| Language | `typescript` ^5.8.3 |
| Styling | `tailwindcss` ^3.4.17, `tailwindcss-animate`, `@tailwindcss/typography`, `tailwind-merge`, `clsx`, `class-variance-authority` |
| Component library | shadcn/ui on Radix primitives (`@radix-ui/react-*`, ~25 packages) in `src/components/ui/` |
| Backend / DB / auth / realtime | `@supabase/supabase-js` ^2.105.1 (Lovable Cloud managed backend) |
| Server data cache | `@tanstack/react-query` ^5.83.0 (provider mounted in `src/App.tsx`) |
| Routing | `react-router-dom` **6.30.4** (pinned, security-patched — see §18) |
| Forms / validation | `react-hook-form` ^7.61.1, `@hookform/resolvers`, `zod` ^3.25.76 |
| Toasts | `sonner` ^1.7.4 plus shadcn `use-toast` (both Toasters mounted in `App.tsx`) |
| Charts | `recharts` ^2.15.4 (Analytics, Earnings) |
| Icons | `lucide-react` ^0.462.0 |
| QR | `qrcode.react` ^4.2.0 |
| SEO / head | `react-helmet-async` ^3.0.0 (`src/components/SEO.tsx`) |
| Drawers / misc | `vaul`, `cmdk`, `embla-carousel-react`, `input-otp`, `react-day-picker`, `date-fns`, `react-resizable-panels`, `next-themes` |
| Lovable platform | `lovable-tagger`, `@lovable.dev/mcp-js`, `@lovable.dev/cloud-auth-js` |
| Tests | `vitest` ^3.2.4, `@testing-library/react`, `jsdom` |
| Payments | Stripe — **server-side only**, inside Supabase Edge Functions (`supabase/functions/_shared/stripe.ts`). There is **no** Stripe npm package in the frontend. |

**Animation:** no animation library (no framer-motion). All motion is CSS: Tailwind keyframes in
`tailwind.config.ts`, custom keyframes/utilities in `src/index.css`, and CSS transition tokens
(`--transition-base`, `--transition-spring`).

**Hosting:** `vercel.json` exists in the repo (SPA config). The live app is served on Lovable hosting
at `hmtesting.lovable.app` and custom domain `linku99.com`. Whether Vercel is *actively* used as a
second deploy target is `UNVERIFIED`.

---

## 3. Project Structure

```text
src/
  App.tsx                     route table + providers (QueryClient, Tooltip, Toasters, Router, Auth, ErrorBoundary)
  main.tsx                    React root
  index.css                   design tokens + global utilities (the design system lives here)
  App.css                     legacy/global leftovers
  contexts/AuthContext.tsx    session, profile, isDJ, isAnonymous, realtime profile refresh
  pages/                      one file per route (see §4)
  components/                 feature components (see below) + components/ui/ (shadcn primitives)
  hooks/                      useNowPlaying, useTrending, useBoostFeed, useGuestJoinLimits, use-mobile, use-toast
  lib/                        pure helpers: validation, profanity, roomCode, musicSearch, nowPlaying,
                              featureFlags, purchaseCaps, consent, guestFunnel, csv, searchLinks, errorLogger, utils
  lib/mcp/                    read-only MCP tool definitions exposed by the app
  integrations/supabase/      client.ts + types.ts  (AUTO-GENERATED — never edit)
supabase/
  config.toml                 edge function JWT settings (auto-generated)
  functions/                  18 Edge Functions (see §12)
  functions/_shared/          stripe.ts, email templates (auth + transactional)
public/                       robots.txt, sitemap.xml, site.webmanifest, placeholder.svg
docs/UI_PREVIEW_HANDOFF.md    this file
vercel.json, vite.config.ts, tailwind.config.ts, components.json, vitest.config.ts
```

**Most important files**

| File | Lines | What it does |
| --- | ---: | --- |
| `src/pages/EventPage.tsx` | 1156 | The guest experience. Event lookup by room code, participant row, song search + request, voting, queue sorting, tips entry point, realtime subscription with backoff. The single most complex file. |
| `src/pages/DJEventManage.tsx` | 961 | DJ live console: request moderation, Now Playing panel, Bridge pairing/monitor, tips panel, event controls. |
| `src/pages/Earnings.tsx` | 553 | DJ earnings, payout status/summary, tip history, charts. |
| `src/pages/DJDashboard.tsx` | 389 | DJ event list + create event. |
| `src/pages/Profile.tsx` | 318 | Guest/DJ profile, points, upgrade prompt. |
| `src/components/SongRequestCard.tsx` | 305 | Queue row: artwork, vote buttons, tip badge, movement arrows, DJ actions slot. Exports `SongRequestRow` type. |
| `src/components/TipDialog.tsx` | 297 | Tip amount selection, mandatory disclaimer consent, calls `tip-create-checkout`. |
| `src/components/TipsBoostsPanel.tsx` | 320 | DJ-side live tips feed + totals with its own realtime channel. |
| `src/components/BridgePairing.tsx` / `BridgeMonitor.tsx` | 288 / 199 | Decks Bridge pairing code UI and connection health. |
| `src/contexts/AuthContext.tsx` | 122 | Auth source of truth for the whole app. |
| `src/index.css` | — | All color/gradient/shadow/radius tokens. |

---

## 4. Routes (`src/App.tsx`)

Providers wrap everything: `QueryClientProvider → TooltipProvider → Toaster + Sonner → BrowserRouter → AuthProvider → ErrorBoundary → Routes`.

| Path | Component | Purpose | Access | Data / side effects |
| --- | --- | --- | --- | --- |
| `/` | `Landing` | Marketing landing, entry to join / DJ signup | public | static + CTA links |
| `/auth` | `Auth` | Login + signup (also the anonymous→permanent upgrade form) | public | `supabase.auth`, `upgrade_anonymous_profile` RPC, welcome email invoke |
| `/auth/callback`, `/auth/v1/callback` | `AuthCallback` | OAuth/PKCE + implicit callback handler | public | `exchangeCodeForSession`, redirects to `next` or `/` |
| `/forgot-password` | `ForgotPassword` | Send reset email | public | `supabase.auth.resetPasswordForEmail` |
| `/reset-password` | `ResetPassword` | Set new password from email link | recovery session | `supabase.auth.updateUser` |
| `/join` | `Join` | Room-code + nickname entry; QR landing (`/join?code=XXXXXX`) | public | anonymous sign-in, `ensure_profile` RPC, event lookup, guest limit gate |
| `/connect` | `Connect` | Bridge/desktop connect helper page | public | — |
| `/event/:code` | `EventPage` | The live guest room | any session (anonymous OK) | events, event_participants, song_requests, votes, now_playing, dj_tips; realtime |
| `/dj` | `DJDashboard` | DJ event list / create | DJ role | events |
| `/dj/onboarding` | `DJOnboarding` | Certification acceptance + `claim_dj_role()` | signed-in | RPC + welcome email |
| `/dj/:id` | `DJEventManage` | Live event console | DJ owner | song_requests, now_playing, tips, reports, integrations; realtime |
| `/dj/:id/dev` | `DJDevTools` | Ingest test panel / dev utilities | DJ owner | now-playing-ingest testing |
| `/dj/:id/analytics` | `Analytics` | Per-event analytics charts | DJ owner | aggregate reads |
| `/dj/archive` | `Archive` | Past events + summaries | DJ | events |
| `/dj/earnings` | `Earnings` | Tips, payouts, charts | DJ | dj_tips, `stripe-payout-summary` |
| `/dj/errors` | `ErrorMonitor` | Live error log viewer | DJ/admin | `error_logs` realtime channel |
| `/profile` | `Profile` | Profile + points + upgrade | signed-in | profiles |
| `/profile/activity` | `ActivityLedger` | Points ledger; supports `?returnTo=` to return to an event | signed-in | ledger reads |
| `/users/:userId` | `PublicProfile` | Public profile view | public | profiles |
| `/admin/reports` | `AdminReports` | Moderation reports | admin | reports |
| `/terms`, `/privacy`, `/dmca`, `/contact`, `/trust-safety`, `/refund-policy` | `pages/legal/*` | Legal pages via `LegalLayout` | public | static |
| `/unsubscribe` | `Unsubscribe` | Email unsubscribe landing | public | `handle-email-unsubscribe` |
| `/.lovable/oauth/consent` | `OAuthConsent` | Lovable OAuth consent screen | platform | — |
| `*` | `NotFound` | 404 | public | — |

Route protection is implemented **inside each page** (redirect on missing session/role), not with a
shared `<ProtectedRoute>` wrapper.

---

## 5. Authentication (`src/contexts/AuthContext.tsx`, `src/pages/Auth.tsx`)

`AuthProvider` exposes: `session`, `user`, `profile`, `isDJ`, `isAnonymous`, `loading`, `signOut`,
`refreshProfile`, `adjustProfilePoints`.

**Load sequence**
1. `supabase.auth.onAuthStateChange` sets session/user, then calls `loadProfile` inside
   `setTimeout(..., 0)` — deliberately deferred to avoid deadlocking the Supabase auth callback.
2. `supabase.auth.getSession()` runs once and **awaits** `loadProfile` before `setLoading(false)`,
   so route guards see an accurate `isDJ` on first render (prevents signed-in DJs bouncing to `/auth`).
3. `loadProfile` calls the `get_my_profile` RPC (points/`is_premium` are column-secured, so a plain
   `select` is not used) plus `user_roles` for the `dj` role. On the post-signup path it retries with
   backoff `[0, 250, 500, 1000, 1500]` because the `handle_new_user` trigger may lag.
4. A realtime channel `profile-${user.id}` listens for `profiles` UPDATE and re-fetches via RPC.

**Anonymous flow** — `Join.tsx` calls `supabase.auth.signInAnonymously({ options: { data: { nickname } } })`
when no session exists, then `ensure_profile(p_nickname)` (SECURITY DEFINER upsert) so the nickname is
guaranteed to exist even if the trigger missed. `isAnonymous` is derived from `user.is_anonymous === true`.

**Anonymous → authenticated upgrade (CRITICAL, `Auth.tsx` lines ~82–103)**
```ts
if (isAnonymous) {
  await supabase.auth.updateUser({ email, password });     // same auth.uid()
  await supabase.rpc("upgrade_anonymous_profile", { p_nickname });
  await refreshProfile();
}
```
This is **not** a new sign-up. `updateUser` converts the existing anonymous user in place, so
`auth.uid()` — and therefore the profile row, points, votes, requests and tip history — is preserved.
`Auth.tsx` also deliberately **does not redirect anonymous users away from `/auth`** (the redirect
effect returns early when `isAnonymous`) so they can reach the upgrade form. Never replace this with
`signUp()`; that would create a duplicate user and orphan all guest history.

**Room-code preservation** — `Auth.tsx` reads `?next=`, rejects anything not starting with `/` and
anything starting with `//` (open-redirect guard), and derives `joiningEventCode` from
`/event/:code` to show a "Joining event XXXXXX" chip. After login/signup it navigates to `nextPath`.

**Redirects** — signed-in, non-anonymous users are pushed to `nextPath` → `/dj` or `/dj/onboarding`
(when `role=dj`/`mode=dj`) → `fromPath` → `/`.

**Expired sessions** — `autoRefreshToken` and `persistSession` are on in
`src/integrations/supabase/client.ts` with `localStorage`. When refresh fails, `onAuthStateChange`
clears `profile`/`isDJ` and pages redirect to `/auth`.

**Do not change casually:** the deferred `loadProfile`, the awaited initial load, the anonymous
upgrade path, the `next` sanitization, and `src/integrations/supabase/client.ts` (auto-generated).

---

## 6. QR Join Flow (`src/pages/Join.tsx`)

```text
QR poster / share link
  → /join?code=XXXXXX
  → code uppercased into state; roomCodeSchema validated
  → wait for AuthContext loading === false
  → if session exists AND !isAnonymous AND profile loaded AND code valid:
        navigate(`/event/${code}`, { replace: true, state: { nickname } })   // auto-join, guarded by autoJoinedRef
  → otherwise show nickname form:
        nickname validated (nicknameSchema) + profanity/spam checked
        no session  -> supabase.auth.signInAnonymously({ data: { nickname } })
        always      -> rpc ensure_profile(p_nickname)
        events lookup by room_code -> must exist, is_active, requests_status !== "ended"
        guest join-limit gate (anonymous only) via fetchGuestEventCount / fetchGuestJoinLimits
             -> soft prompt or GuestLimitReachedDialog
        → navigate(/event/:code)
```
Notes:
- `autoJoinedRef` prevents double-navigation from re-renders.
- Nickname prefill happens once, only if the user has not typed (`hasEditedNickname`).
- Signed-in permanent accounts are **never** gated by guest limits.
- Console logs `[Join] QR route loaded` / `[Join] Existing authenticated user — auto-joining event`
  exist intentionally for field debugging.
- Recent fix: authenticated QR scanners used to be shown the signup form; they are now auto-joined.
  There is still a brief loading state while auth resolves (see §17).

---

## 7. Request Flow (`src/pages/EventPage.tsx`)

1. **Search** — `src/lib/musicSearch.ts` calls the `music-search` Edge Function; debounced 500 ms with
   a 2-character minimum, and it surfaces a `RateLimitedError` for graceful UI handling.
2. **Duplicate pre-check (client)** — `isAlreadyRequested(s)` (line ~901) matches an existing non-removed
   request by `source_song_id` **or** by `normalizeKey(title, artist)`. Matching results render as
   "already requested" instead of a request button.
3. **Second guard at submit** — before insert, the same normalized-key check runs again and shows
   `"Already requested — vote for it instead!"`.
4. **Requester name resolution** — live `profiles.nickname` read > in-memory `profile.nickname` >
   nav-state nickname > `"Guest"`. If the profile is missing/`Guest`, `ensure_profile` repairs it and
   the read is retried. The result is stored on the row as `requester_name`.
5. **Insert** into `song_requests` with: `event_id`, `requested_by`, `requester_name`, `title`, `artist`,
   `album`, `album_art`, `album_art_url`, `duration_ms`, `preview_url`, `explicit`, `source_platform`,
   `source_song_id`, `external_url` (falls back to an Apple Music search URL).
6. **Server-side duplicate protection** — a unique constraint returns Postgres `23505`, handled as
   "Already requested — vote for it!". A `42501` / RLS violation is surfaced as the cooldown message
   (`cooldown_seconds`, default 30) or "blocked by the DJ".
7. **Auto self-upvote** — after a successful insert, `votes.upsert({ song_request_id, user_id, value: 1 })`.
8. **Realtime** — the insert arrives back through the `song_requests` subscription and is appended to
   local state; `SongRequestCard` renders it.

**Status values seen in code:** `pending`, `approved`, `playing`, `played`, `skipped`, `removed`.

---

## 8. Voting & Queue Ranking

- **Model:** one row per (`song_request_id`, `user_id`) in `votes` with `value` of `+1` / `-1`;
  writes use `upsert`, which is the duplicate-vote protection. Denormalized `upvotes` / `downvotes`
  counters live on `song_requests`.
- **Optimistic updates:** `EventPage` computes `upDelta`/`downDelta`, applies them immediately
  (clamped at 0), and **rolls them back** on error. `myVotes` tracks the user's own vote per song.
- **Realtime:** the authoritative counters arrive via the `song_requests` UPDATE subscription.
- **Ranking (`visibleSongs`, ~line 307):**
  - Visible list excludes `removed`, `playing`, `played`, `skipped`.
  - `sort === "top"`: `netVotes = upvotes - downvotes`, descending; tie-break **oldest first** (FIFO
    fairness), then `id` for stability.
  - `sort === "trending"`: `useTrending` score descending, then newest first, then `id`.
  - **Tips are not a term in either comparator.** The code carries explicit comments to that effect,
    and `ENABLE_BOOSTS = false` in `src/lib/featureFlags.ts`.
- `useTrending` (`src/hooks/useTrending.ts`) keeps a rolling 5-minute history, re-evaluates every 15 s,
  and scores `recentBoost*4 + burst*3 + recentEvents*2 + max(0, up-down)*0.4 + recencyBoost`;
  `hotIds` = score ≥ 8.
- Movement arrows come from `prevRanks` keyed `${sort}:${id}`.

**Safe:** how vote buttons, counters, rank badges, "hot" treatment and sort tabs *look*.
**Not safe:** the comparators, the tie-break order, the optimistic delta/rollback logic, or adding any
tip/boost term to ranking.

---

## 9. Tips / Payments

- **Model:** Stripe Connect **Express**. DJs onboard their own account; the platform takes a fee and
  the remainder goes to the DJ (30% platform / 70% DJ as configured in the checkout function's
  `application_fee_amount`).
- **Frontend entry:** `TipDialog.tsx` — amount selection, a **mandatory disclaimer checkbox**
  (`CheckoutConsentModal.tsx`, `src/lib/consent.ts`), caps enforced via `src/lib/purchaseCaps.ts`
  (max $50 single / $100 per 24 h / $100 per event, also enforced server-side by `check_tip_cap`),
  then `supabase.functions.invoke("tip-create-checkout")` and a redirect to Stripe Checkout.
- **Return URLs** use the room code, not the UUID:
  `${origin}/event/${room_code}?tip=success` and `?tip=cancel` — so guests land back in the room.
- **Song linkage:** `song_request_id` is validated and written into Stripe metadata and onto the
  `dj_tips` row, which is what powers per-song tip badges.
- **Webhook (`stripe-webhook`)** handles: `checkout.session.completed`, `payment_intent.succeeded`,
  `payment_intent.payment_failed`, `charge.succeeded`, `charge.refunded`, `refund.created`,
  `refund.updated`, `charge.dispute.created`, `charge.dispute.closed`, `account.updated`.
  It verifies signatures with two separate secrets (platform + connect endpoints).
- **States on `dj_tips`:** `pending`, `succeeded`, plus failed/refunded/disputed handling; refunds and
  disputes are excluded from earnings totals.
- **Surfaces:** `TipsBoostsPanel.tsx` (DJ live feed + totals), tip badges on `SongRequestCard`,
  `PayoutStatusCard` / `PayoutSummaryCard` and `pages/Earnings.tsx`, and the Bridge snapshot `tips`
  block (§12).
- **Feature flags** (`src/lib/featureFlags.ts`): `ENABLE_TIPS = true`, `ENABLE_BOOSTS = false`,
  `ENABLE_LIVE_STRIPE = true`.
- No Stripe keys exist in frontend code; all Stripe calls are server-side.

---

## 10. Realtime Architecture

Every realtime channel in the app (verified by grep for `.channel(`):

| Channel | File | Listens to |
| --- | --- | --- |
| `event-${eventId}-${Date.now()}` | `pages/EventPage.tsx:216` | `song_requests` `*` filtered by `event_id`; `events` `UPDATE` filtered by `id` |
| `dj-event-${event.id}` | `pages/DJEventManage.tsx:103` | DJ-side request/event changes |
| `dj-tip-totals-${event.id}` | `pages/DJEventManage.tsx:146` | tip total updates |
| `dj-tips-${eventId}` | `components/TipsBoostsPanel.tsx:103` | live tip feed |
| `now-playing-${eventId}-${Date.now()}-${rand}` | `hooks/useNowPlaying.ts:37` | `now_playing` for the event |
| `profile-${user.id}` | `contexts/AuthContext.tsx:86` | `profiles` UPDATE for the signed-in user |
| `error_logs_live` | `pages/ErrorMonitor.tsx:35` | `error_logs` inserts |

**EventPage resilience pattern (the reference implementation):**
- `subscribe()` removes any prior channel first, then re-subscribes.
- The status callback resets `backoff = 1000` on `SUBSCRIBED`; on `CHANNEL_ERROR` / `TIMED_OUT` /
  `CLOSED` it schedules `refetch() + subscribe()` with exponential backoff capped at 30 s.
- `visibilitychange` (tab returns to foreground) and `online` both trigger `refetch() + subscribe()`.
- A `cancelled` flag plus `supabase.removeChannel` in cleanup prevents state writes after unmount.
- Unique channel names (`Date.now()` suffix) avoid collisions on rapid remount.

`reports` and `dj_tips` have `REPLICA IDENTITY FULL` and are in the `supabase_realtime` publication
(applied in an earlier migration) so DJ panels update live.

**Do not** move subscriptions into render bodies, drop the cleanup, or remove the visibility/online
refetch — those were added to fix stale-after-sleep bugs.

---

## 11. Database Tables Used by the Frontend

Fields listed are those the UI reads/writes. No values or secrets are included.

| Table | Purpose | Key fields used by UI |
| --- | --- | --- |
| `events` | An event/room | `id`, `name`, `venue`, `room_code`, `dj_id`, `dj_name`, `is_active`, `requests_status` (`active`/`paused`/`ended`), `cooldown_seconds`, `created_at`, `ended_at` |
| `event_participants` | Who is in the room | `event_id`, `user_id`, `nickname`, `last_seen_at` (2-minute window = "online") |
| `song_requests` | The queue | `id`, `event_id`, `requested_by`, `requester_name`, `title`, `artist`, `album`, `album_art`/`album_art_url`, `duration_ms`, `preview_url`, `explicit`, `source_platform`, `source_song_id`, `external_url`, `upvotes`, `downvotes`, `boost` (legacy, unused for ranking), `status`, `queue_position`, `created_at`, `played_at` |
| `votes` | One vote per user per request | `song_request_id`, `user_id`, `value` (+1/−1) |
| `profiles` | Display identity | `id`, `nickname` (**never unique — see below**), `points`, `is_premium`; read through `get_my_profile` RPC |
| `user_roles` | Role storage (separate table by design) | `user_id`, `role` (`dj`, admin roles); checked with `has_role()` |
| `dj_tips` | Tip records | `gross_amount_cents`, `net_amount_cents`, `currency`, `status`, `event_id`, `song_request_id`, `song_title`, `artist`, `guest_nickname`, `requested_by`, `created_at` |
| `dj_payout_accounts` | Stripe Connect state per DJ | onboarding/charges/payouts flags, account status |
| `event_integrations` | Decks Bridge pairing | `event_id`, `ingest_token` (unique per event), `source_type`, `last_seen_at` |
| `now_playing` | Current track per event | `title`, `artist`, `album_art`, `apple_url`, `spotify_url`, `source`, `status`, `started_at`, `now_playing_request_id` |
| `reports` | Moderation reports | reporter, target, reason, `event_id` |
| `app_config` | Guest-funnel thresholds etc. | key/value config read via RPC |
| `guest_funnel_events` | Guest conversion analytics | event name + metadata (`src/lib/guestFunnel.ts`) |
| `rate_limit_logs`, `song_metadata` | Music-search hardening: rate limiting + 7-day metadata cache | server-side only |
| `error_logs` | Client error capture (`src/lib/errorLogger.ts`) | message, stack, context |

**Nickname rule (project-wide, non-negotiable):** `profiles.nickname` is **display-only, Kahoot-style**.
There is deliberately **no global unique constraint** on it. Identity is always `user_id`. Only
profanity/spam checks apply (`src/lib/profanity.ts`).

RLS is enabled across these tables; the frontend relies on it (e.g. the request cooldown surfaces as a
`42501` error). Do not weaken or "simplify" policies from a UI project.

---

## 12. Edge Functions (`supabase/functions/`, 18 total)

| Function | Purpose | Frontend caller | Redesign risk |
| --- | --- | --- | --- |
| `music-search` | Provider-abstracted song search (Spotify/Apple) with per-user/IP rate limits, 7-day cache, in-flight dedupe, 5-min circuit breaker on 429 | `src/lib/musicSearch.ts` ← `EventPage` | Low — keep the debounce + `RateLimitedError` UI |
| `tip-create-checkout` | Creates Stripe Checkout with `application_fee_amount`, song metadata, room-code return URLs | `components/TipDialog.tsx` | Medium — do not change the payload |
| `stripe-webhook` | Payment/refund/dispute/account lifecycle → DB | none (Stripe → server) | None |
| `stripe-connect-onboard` / `stripe-connect-refresh` | Express onboarding + status refresh | `components/PayoutStatusCard.tsx` | Low |
| `stripe-payout-summary` | Payout/balance summary | `components/PayoutSummaryCard.tsx` | Low |
| `stripe-whoami` | Stripe env diagnostic | none | None |
| `bridge-pair` | Claims a 6-digit pairing code → returns `event_id`, `ingest_token`, function URL. Codes expire in 5 min, single use, 10 failed attempts / 10 min per IP | Decks Bridge (desktop) | **Do not touch** |
| `bridge-event-snapshot` | Read-only live snapshot for Decks Bridge (details below) | Decks Bridge (desktop) | **Do not touch** |
| `now-playing-ingest` | Bridge/helper posts track metadata with `X-Ingest-Token`; zod-validated | Decks Bridge, `DJDevTools` test panel | **Do not touch** |
| `send-transactional-email` | Queues transactional email (pgmq) | `Auth.tsx`, `DJOnboarding.tsx` | None |
| `process-email-queue`, `preview-transactional-email`, `auth-email-hook`, `handle-email-unsubscribe`, `handle-email-suppression` | Email pipeline, auth email templating, unsubscribe/suppression | mostly server / `/unsubscribe` | None |
| `mcp` | MCP server endpoint | Lovable platform | None |

### `bridge-event-snapshot` — full contract (as deployed at `18d557d`)

**Auth:** `Authorization: Bearer <ingest_token>` (preferred) or `{"ingest_token": "..."}` in a POST body.
Token length must be 16–128 chars. The token resolves to exactly one event via
`event_integrations.ingest_token`; the caller **can never pass an `event_id`**. Invalid token → `401`.
Each successful call updates `last_seen_at` (heartbeat).

**Response shape:**
```json
{
  "event":      { "id","name","venue","dj_name","room_code","status","guests_online",
                  "event_duration_seconds","created_at","ended_at" },
  "now_playing":{ "title","artist","artwork","started_at","status","source","request_id" } ,
  "queue":      [ { "request_id","song_id","title","artist","artwork","guest_nickname",
                    "vote_count","request_count","tip_total_cents","queue_position",
                    "request_status","created_at" } ],
  "trending":   [ /* same shape as queue rows, top 10 */ ],
  "tips":       { "total_cents","pending_cents","currency","recent":[ ... ] },
  "bridge":     { "paired","source_type","last_seen","last_sync" }
}
```
Details: queue = statuses `pending|approved|playing`, ordered by `queue_position` then `created_at`,
limit 200. `vote_count = upvotes - downvotes`. `guests_online` = participants with
`last_seen_at` within 2 minutes. Trending score = `votes + 2*(30-min vote velocity) + tip_dollars`,
top 10. Tip totals aggregate `dj_tips` over the last 24 h (`succeeded` → total, `pending` → pending).

### `guest_nickname` requester mapping (commit `18d557d` — "Fixed requester name mapping")

Implemented as a **batched** lookup (no N+1): unique `requested_by` UUIDs are collected from the queue,
then two parallel `IN (...)` queries load `event_participants(user_id, nickname)` for this event and
`profiles(id, nickname)`. The `publicName()` resolver priority is:

1. `event_participants.nickname` for this event
2. `profiles.nickname`
3. `song_requests.requester_name` (ignored when it is literally `"guest"`)
4. `null` — Decks Bridge applies its own "Guest" fallback

`guest_nickname` is present on **every** row of both `queue[]` and `trending[]`.
**This contract is frozen. The UI Preview project must not change it.**

---

## 13. Decks Bridge Integration

Decks Bridge is a **separate desktop application**. It is not in this repo; the website only exposes
the backend contract and the pairing/monitoring UI.

**Pairing:** the DJ opens `components/BridgePairing.tsx` in `DJEventManage`, which surfaces a 6-digit
code. Bridge POSTs it to `bridge-pair`, which returns `event_id`, the per-event `ingest_token` and the
function URL. Codes expire after 5 minutes and are single-use; failed attempts are IP-rate-limited.
Rotating the token (`regenerate_ingest_token` RPC) revokes Bridge access.

**Reading live data:** Bridge polls `bridge-event-snapshot` (~4 s recommended) with the ingest token —
event meta, now playing, queue with requester names, trending, tips and bridge heartbeat.

**Writing Now Playing:** Bridge/helpers POST to `now-playing-ingest` with `X-Ingest-Token`
(metadata only — never audio). The website reads `now_playing` via `hooks/useNowPlaying.ts`
and renders `NowPlayingDisplay` / `NowPlayingPanel`.

**Health:** `components/BridgeMonitor.tsx` shows pairing/heartbeat state from `event_integrations.last_seen_at`.

**Safe to restyle (Bridge is unaffected):** `BridgePairing`, `BridgeMonitor`, `NowPlayingDisplay`,
`NowPlayingPanel`, `IngestTestPanel` — as long as they keep calling the same RPCs/tables.
**Not safe:** anything altering the three functions above, the token model, or the JSON field names.

---

## 14. Current Design System

**Centralization:** tokens are **centralized** in `src/index.css` (`:root` dark + `.light` overrides)
and mapped through `tailwind.config.ts`. shadcn components in `src/components/ui/` consume the
semantic names. Some feature components still use ad-hoc opacity utilities
(e.g. `bg-secondary/60`, `bg-primary/10`) and bespoke glass classes — that is scattered but still
token-derived. **Rule: never hardcode hex or `text-white`/`bg-black` in components.**

**Dark-first palette (HSL tokens):**
- `--background 240 10% 6%`, `--card 240 8% 10%`, `--popover 240 9% 9%`, `--secondary/--muted 240 5-6% 14%`
- `--primary 322 70% 60%` (pink) with `--primary-glow 320 80% 72%`
- `--accent 190 60% 58%` (cyan), `--success 142 55% 50%`, `--destructive 0 70% 58%`
- Vote colors are their own tokens: `--vote-up 14 90% 56%` (warm orange/red), `--vote-down 142 55% 50%` (green)
- `--border 240 5% 18%`, `--input 240 5% 14%`, `--ring` = primary
- A `.light` theme exists (`--background 0 0% 99%`, `--primary 322 65% 52%`) plus sidebar tokens.

**Gradients:** `--gradient-primary` (pink→purple 135°), `--gradient-glow` (radial pink), `--gradient-hero`
(pink→cyan→transparent), `--gradient-card`, `--gradient-surface`.

**Shadows:** `--shadow-sm`, `--shadow-card`, `--shadow-elevated`, `--shadow-glow-sm`, `--shadow-glow`,
`--shadow-elegant` (pink-tinted).

**Radii:** `--radius: 1rem` base; components commonly use `rounded-lg`, `rounded-xl`, `rounded-2xl`,
`rounded-3xl` (auth card, panels).

**Motion:** `--transition-base` (0.2s ease-out) and `--transition-spring` (0.4s overshoot), plus
Tailwind/CSS keyframes (`animate-float`, `animate-spin`, accordion, etc.) and `tailwindcss-animate`.

**Patterns:** glass surfaces (`glass`, `glass-strong` utility classes), full-width mobile-first
containers, `container max-w-md` for auth-style pages, `Loader2` spinners for loading, sonner toasts
top-level, Radix dialogs/sheets for modals, `lucide-react` icons throughout (tips use
`CircleDollarSign`).

**Typography:** Tailwind default sans stack with explicit sizes (`text-[28px] sm:text-3xl`,
`text-[15px]`, `text-[11px]`) — there is no custom webfont import verified in the repo, so type is a
prime candidate for redesign.

---

## 15. Safe to Redesign

Visual-only changes that can keep behavior identical:
- Card layouts and hierarchy (`SongRequestCard`, dashboards, panels)
- Typography scale, font family, weights, letter-spacing
- Spacing, grid/stack rhythm, container widths
- Button, badge, chip and input appearance (shadcn variants in `components/ui/`)
- Tabs, segmented controls, sort toggles (labels and looks — not the comparators)
- Navigation presentation: `AppHeader`, `SiteFooter`, and adding a mobile bottom nav
- Modal/sheet/drawer styling (`TipDialog`, `ReportDialog`, `ModerationDialog`, upgrade dialogs)
- Loading states: replacing spinners with skeletons, removing full-page flashes
- Empty states, error states, toast styling
- Transitions, entrance animations, micro-interactions, hover/press feedback
- Color tokens and gradients (change them in `src/index.css`, not in components)
- Mobile responsiveness, touch target sizes, safe-area handling
- Marketing pages (`Landing`, legal pages), QR display (`EventQR`), logo presentation (`DecksLogo`)
- Charts styling in `Analytics` / `Earnings` (keep the data shape)

---

## 16. Do Not Break

Strict contracts the UI project must preserve:
1. Supabase authentication — `AuthContext` load order, deferred `loadProfile`, awaited initial session
2. Anonymous identity — `signInAnonymously` + `ensure_profile`, `isAnonymous` derivation
3. Anonymous→authenticated upgrade via `updateUser` + `upgrade_anonymous_profile` (same `auth.uid()`)
4. QR join logic in `Join.tsx`, including `autoJoinedRef` and the auto-join branch
5. Event-code preservation through `?next=` and the `//` open-redirect guard
6. Request creation payload and field names in `song_requests`
7. Duplicate protection: client `isAlreadyRequested`, submit-time recheck, `23505` handling
8. Queue ranking comparators and tie-breaks; tips/boosts must never affect order
9. Voting business logic: upsert model, optimistic delta + rollback, `myVotes`
10. Tips/payments: caps, mandatory disclaimer consent, `tip-create-checkout` payload, room-code return URLs, webhook handling
11. Realtime architecture: channel names, filters, backoff, visibility/online refetch, cleanup
12. Requester names: `requester_name` write path and the `publicName()` priority
13. `bridge-event-snapshot` JSON contract (field names, shapes, `guest_nickname`)
14. Decks Bridge pairing (`bridge-pair`) and ingest (`now-playing-ingest`) token model
15. Now Playing read path (`useNowPlaying`, `now_playing` table)
16. Event status handling (`is_active`, `requests_status`: active/paused/ended)
17. `profiles.nickname` must never gain a unique constraint
18. Never edit `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, or `supabase/config.toml`
19. RLS policies, GRANTs, database schema, and Edge Function code

---

## 17. Current Bugs / Known Issues

**Confirmed open (from the earlier repo audit — behavioral, still present):**
- Double-tap on the request button can fire two submissions before the duplicate guard resolves (P1).
- Full-page spinner flashes: `EventPage` and `Auth` return a whole-page `Loader2` while
  `authLoading || loading`, causing visible flashes on navigation (P1, and a prime redesign target).
- DJ dashboard data can be stale after the device sleeps on pages that lack the visibility/online
  refetch pattern that `EventPage` has (P1).
- Realtime channel churn: some subscriptions re-create on effect dependency changes (P1).
- Several async handlers set loading state without a `finally`, so a thrown error can leave a spinner
  stuck (P2).
- No global connection-status indicator when realtime drops (P2).

**Recently fixed:** see §18.

**Unverified concerns:**
- Whether Vercel is an active deployment target in addition to Lovable hosting.
- `boost` remains as a column and `useTrending` still reads boost deltas even though
  `ENABLE_BOOSTS = false`; with boosts off, trending is effectively driven by votes + recency.
  Whether the boost code path should be removed entirely is undecided.
- `BoostDialog.tsx`/`BoostFX.tsx`/`BoostActivityStrip.tsx` are dormant behind the flag.

**Visual polish items:** inconsistent loading treatments, ad-hoc opacity utilities instead of tokens,
no skeletons, no bottom navigation on mobile, mixed border-radius usage across panels.

*(Nothing above is invented; each item comes from source inspection or a recorded prior audit.)*

---

## 18. Recent Fixes

| Fix | Where |
| --- | --- |
| **Requester name mapping** — batched participant/profile lookup + `publicName()` priority | `supabase/functions/bridge-event-snapshot/index.ts` — commit `18d557d` "Fixed requester name mapping" |
| **`guest_nickname` in the Bridge payload** — now on every `queue[]` and `trending[]` row | same commit |
| **QR join auth flow** — authenticated users auto-join instead of seeing signup | `src/pages/Join.tsx` — commit `9160e39` "Fixed QR join auth flow logic" |
| **react-router-dom security update** — 6.30.1 → **6.30.4** (open-redirect / XSS advisories), binary `bun.lockb` replaced by text `bun.lock` | commit `17b7b7a` "Updated react-router-dom to 6.30.4" |
| **Realtime for DJ panels** — `REPLICA IDENTITY FULL` + publication for `reports`/`dj_tips`; `DJReportsPanel` refactored with `finally` + `Promise.allSettled` | `src/components/DJReportsPanel.tsx` |
| **Now Playing on Manage Event** — switched to `useNowPlaying(event.id)` | `src/pages/DJEventManage.tsx` |
| **Tips never affect ranking** — boost weight removed from sorting | `src/pages/EventPage.tsx` + DB |
| **Tip redirect** — success/cancel URLs use `room_code` | `supabase/functions/tip-create-checkout/index.ts` |
| **Activity/profile back navigation** — `?returnTo=` preserved | `AppHeader.tsx`, `Profile.tsx`, `ActivityLedger.tsx` |

---

## 19. Production / Git State

- **GitHub repository:** `Mananssehh/hmtesting`
- **Production branch:** `main`
- **Confirmed checkpoint commit:** `18d557d` — "Fixed requester name mapping" (present in history)
- **HEAD at the time this document was written:** `62078eb443c082a53b3b9fc406543b1abfd7aecf`
  (`62078eb` — "Update plan", 2026-08-11 01:22:45 +0000)
- **Recent history:** `62078eb` ← `17b7b7a` (react-router-dom 6.30.4) ← `50aebe1` ← **`18d557d`** ← `27f0c4b` ← `c42b9f5` ← `9160e39`
- **Current branch:** a Lovable working branch (`edit/edt-...`) tracking `main`
- **Working tree:** clean before this document was added; the only change in this task is
  `docs/UI_PREVIEW_HANDOFF.md`
- **GitHub sync:** the Lovable workspace repo was previously verified as committed and pushed with no
  unpushed commits; confirm GitHub mirroring of the current HEAD before importing into a new project.
- **Deployment targets:** Lovable hosting (primary). `vercel.json` exists; active Vercel usage is `UNVERIFIED`.
- **Production URLs:** `https://hmtesting.lovable.app` (published), `https://linku99.com` (custom domain),
  preview: `https://id-preview--c812bcc2-182a-4932-8846-f77db71763a7.lovable.app`

---

## 20. Environment Variables (names only)

**Frontend (`.env`, auto-generated by Lovable Cloud — never edit by hand):**
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY` (publishable/anon — safe in the client)
- `VITE_SUPABASE_PROJECT_ID`

**Server-side (Supabase Edge Function secrets — never in frontend code, never copied to a demo project):**

| Group | Names |
| --- | --- |
| Supabase | `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` ⛔, `SUPABASE_DB_URL` ⛔ |
| Stripe | `STRIPE_SECRET_KEY` ⛔, `STRIPE_WEBHOOK_SECRET_PLATFORM` ⛔, `STRIPE_WEBHOOK_SECRET_CONNECT` ⛔ |
| Email (Resend) | `RESEND_API_KEY` ⛔, plus auth-hook signing secret ⛔ |
| Music providers | Spotify client credentials used by `music-search` ⛔ |
| Lovable platform | `LOVABLE_API_KEY` ⛔ |

⛔ = **never** copy into a public, demo, or preview environment; these grant full backend, payment or
email-sending authority. (Exact secret names are managed in the Lovable Cloud secrets store; the list
above reflects usage found in function source. Any name not present in source is `UNVERIFIED`.)

---

## 21. UI Preview Project Rules

The UI Preview project is a **design sandbox**.

**It may:**
- change layout
- change styling
- change navigation presentation
- change cards
- change typography
- test animations
- test new mobile UX
- test new visual hierarchy

**It must NOT:**
- modify production database schema
- change RLS
- change production Edge Functions
- change payment logic
- change auth logic
- change queue ranking
- change voting business logic
- change Decks Bridge contracts
- deploy to production
- write destructive test data to production

If the preview connects to the production Supabase project, default to **read-only** behavior wherever
possible: prefer mock/fixture data for design work, never delete rows, never mutate `events`,
`song_requests`, `votes`, `dj_tips`, or `event_integrations`, and never trigger Stripe checkouts.

---

## UI Design Freedom Map

### GREEN — safe to redesign visually
- `src/index.css` design tokens (colors, gradients, shadows, radii, transitions) and `tailwind.config.ts`
- `src/components/ui/*` shadcn primitive styling and variants
- `AppHeader`, `SiteFooter`, `NavLink`, `DecksLogo`, `PlatformLinks`, `StartAsDjCta`, `PreviewButton`
- `pages/Landing`, all `pages/legal/*`, `NotFound`
- Presentation of `SongRequestCard`, `NowPlayingDisplay`, `NowPlayingPanel`, `EventQR`, `ArchivedEventSummary`
- All loading/empty/error visuals, skeletons, toasts, spinners
- Chart appearance in `Analytics` and `Earnings`
- Animations, transitions, mobile layout, bottom-nav introduction, spacing and typography everywhere

### YELLOW — UI may change, state wiring must be preserved
- `pages/EventPage.tsx` — restyle freely; keep search debounce, duplicate guards, insert payload, vote handlers, sort comparators and the realtime effect intact
- `pages/DJEventManage.tsx`, `DJDashboard`, `Archive`, `Analytics`, `Profile`, `ActivityLedger`, `PublicProfile`
- `pages/Join.tsx` — keep `autoJoinedRef`, the auto-join branch, validation and the guest-limit gate
- `pages/Auth.tsx`, `AuthCallback`, `ForgotPassword`, `ResetPassword` — keep the anonymous-upgrade branch and `next` sanitization
- `TipDialog`, `CheckoutConsentModal` — the disclaimer checkbox must remain mandatory and blocking
- `TipsBoostsPanel`, `PayoutStatusCard`, `PayoutSummaryCard`, `DJReportsPanel`, `DJSongActions`, `ModerationDialog`, `ReportDialog`
- `BridgePairing`, `BridgeMonitor`, `IngestTestPanel` — visuals only
- `GuestUpgradePromptDialog`, `GuestLimitReachedDialog`, `UpgradeAccountDialog` — thresholds and triggers unchanged
- `hooks/*` — may be refactored for presentation, but scores, windows and channel behavior stay

### RED — do not modify from the design sandbox
- `supabase/functions/**` (all 18 functions) — especially `bridge-event-snapshot`, `bridge-pair`,
  `now-playing-ingest`, `tip-create-checkout`, `stripe-webhook`
- Database schema, migrations, RLS policies, GRANTs, RPCs
  (`get_my_profile`, `ensure_profile`, `upgrade_anonymous_profile`, `claim_dj_role`, `has_role`,
  `check_tip_cap`, `get_guest_event_count`, `regenerate_ingest_token`)
- `src/integrations/supabase/client.ts`, `src/integrations/supabase/types.ts`, `.env`, `supabase/config.toml`
- Queue ranking comparators, vote write model, tip caps and fee split
- Auth session handling and the anonymous→authenticated upgrade
- `src/lib/featureFlags.ts` values, `src/lib/purchaseCaps.ts`, `src/lib/validation.ts`, `src/lib/profanity.ts`
- Any production deploy, publish, or data-writing operation

---

## New Lovable Project Startup Prompt

```
You are working on "Decks UI Lab" — a DESIGN PREVIEW sandbox for the Decks live DJ request platform.
This repository is a copy of production (GitHub: Mananssehh/hmtesting, branch main).

BEFORE YOU DO ANYTHING:
1. Read docs/UI_PREVIEW_HANDOFF.md in full. It documents the entire application: routes, auth,
   QR join flow, request flow, voting and queue ranking, tips/Stripe, realtime architecture,
   database tables, Edge Functions, the Decks Bridge contract, and the current design system.
2. Inspect the actual source before changing anything. Do not assume behavior — open the file.
   Key files: src/App.tsx, src/contexts/AuthContext.tsx, src/pages/EventPage.tsx,
   src/pages/Join.tsx, src/pages/Auth.tsx, src/pages/DJEventManage.tsx,
   src/components/SongRequestCard.tsx, src/index.css, tailwind.config.ts.
3. Read the "UI Design Freedom Map" section (GREEN / YELLOW / RED) and respect it strictly.

YOUR ROLE:
This is a UI/UX sandbox. Your job is visual and interaction design: layout, typography, spacing,
color tokens, cards, navigation, modals, skeletons, transitions, animation, mobile UX and visual
hierarchy.

HARD RULES:
- Preserve ALL business logic. Do not change queue ranking, voting logic, duplicate-request
  protection, tip caps or fee logic, auth/session handling, or the anonymous-to-authenticated
  upgrade (supabase.auth.updateUser + upgrade_anonymous_profile must keep the same auth.uid()).
- Do not modify Supabase schema, RLS, GRANTs, RPCs, or any file under supabase/functions/.
- Do not change the bridge-event-snapshot response contract, including guest_nickname resolution.
- Do not edit src/integrations/supabase/client.ts, types.ts, .env, or supabase/config.toml.
- Do not deploy to production and do not write or delete production data. If connected to the
  production backend, behave read-only and prefer mock data for design work.
- Change colors and gradients through the tokens in src/index.css — never hardcode hex values or
  text-white / bg-black in components.

HOW TO WORK:
- Work incrementally: one screen or one component group at a time, small reviewable diffs.
- Before any large redesign (a full page, the navigation model, or the token palette), describe the
  proposed direction and show it to me for approval BEFORE implementing it.
- After each change, state exactly which files changed and confirm no business logic was touched.

Start by reading docs/UI_PREVIEW_HANDOFF.md and then giving me a short summary of the current design
system and your top redesign opportunities. Do not change any code in that first response.
```
