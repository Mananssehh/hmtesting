# Progressive Guest Signup Prompts

Encourage guests to convert to full accounts after they've engaged with multiple events, without breaking the frictionless first-time flow.

## How the counter works

We already have everything we need:

- Guests sign in via `supabase.auth.signInAnonymously()` in `Join.tsx`. Each guest gets a **persistent `auth.uid()`** in `localStorage`, surviving refresh, reconnect, re-entering the same event, or closing the tab.
- `event_participants` already has one row per `(event_id, user_id)`.
- **Unique events joined = `count(DISTINCT event_id) FROM event_participants WHERE user_id = auth.uid()`**. Refreshes / re-joins never increment it. No new counter column needed.

Because anonymous upgrade (`supabase.auth.updateUser` + `upgrade_anonymous_profile`) keeps the same `auth.uid()`, **all history — requests, votes, tips, points, participants, nickname — carries over automatically** when a guest signs up. Nothing to migrate.

## Configurable thresholds

New table `public.app_config (key text primary key, value jsonb, updated_at timestamptz)` seeded with:

```json
key = "guest_join_limits"
value = {
  "enabled": true,
  "prompt_at": 3,
  "require_at": 4,
  "bonus_points": 25
}
```

`bonus_points` is stored now so the reward can be turned on later without a migration. `enabled: false` disables the whole feature.

Exposed via `get_guest_join_limits() RETURNS jsonb` (`SECURITY DEFINER`, granted to `anon`+`authenticated`), so the client fetches thresholds at runtime. Changing the numbers = one `UPDATE`, no code deploy.

## Join gating flow (in `Join.tsx`)

On submit, if the user is signed-out OR anonymous, before joining:

1. Call `get_guest_event_count()` → distinct events for `auth.uid()` (0 for signed-out).
2. Fetch cached `get_guest_join_limits()`.
3. Decide:
   - `count + 1 < prompt_at` → join normally.
   - `count + 1 == prompt_at` → join, then flag EventPage to show the soft prompt once.
   - `count + 1 >= require_at` AND user is anonymous/signed-out → **show a blocking modal** (`GuestLimitReachedDialog`) with two buttons: **Create Account** → `/auth?mode=signup&next=/event/<CODE>&reason=guest_limit`, **Log In** → `/auth?next=/event/<CODE>&reason=guest_limit`. Do not auto-redirect; the user chooses. Cancel returns them to Join.
4. Signed-in non-anonymous users are never gated.

## Return-to-event after signup/login

`Auth.tsx` already honors `?next=/event/<CODE>`. We'll:
- Pass `next=/event/<CODE>` from both the block modal and the soft prompt CTA.
- After successful signup, login, or anonymous upgrade, the existing redirect sends them straight into the event — no re-entering the room code.
- Add a small "You're joining event <CODE>" banner on `Auth.tsx` when `next` starts with `/event/`.

## Soft prompt modal (3rd event)

New component `GuestUpgradePromptDialog.tsx`, mounted on EventPage, shown once per event when the flag is set. Copy:

> **Create your free Decks account**
> Save your requests, tips, points, favorite DJs, and event history.
> 🎁 Get **{bonus_points}** bonus points when you create your account.

CTAs: **Create account** (`/auth?mode=signup&next=<currentPath>`), **Not now** (dismiss). Dismissal stored in `sessionStorage` keyed by `event_id` so it never re-shows for that event this session. The bonus copy renders only when `bonus_points > 0`, so we can enable it later by editing config.

## Analytics

New table `public.guest_funnel_events (id, user_id, event_id nullable, event_type text, metadata jsonb, created_at)`, RLS: authenticated users can insert their own rows; only DJs/admins read. Instrument these events client-side via a tiny `logGuestFunnel(eventType, metadata)` helper:

- `guest_prompt_shown`
- `guest_prompt_dismissed`
- `guest_prompt_create_clicked`
- `guest_limit_shown`
- `guest_limit_create_clicked`
- `guest_limit_login_clicked`
- `guest_signup_completed` (fired from `Auth.tsx` when signup or anonymous upgrade succeeds and `reason=guest_limit` or a prompt-origin flag is set)

That gives us the funnel needed to tune `prompt_at`/`require_at` over time.

## Anonymous → account linking

Unchanged. Same `auth.uid()` after upgrade means `song_requests.requested_by`, `votes.user_id`, `dj_tips.user_id`, `event_participants.user_id`, `points_transactions.user_id`, and `profiles.id` all continue to resolve to that user. Future rewards, badges, favorite-DJ features keyed on `user_id` inherit automatically.

## Database changes (single migration)

1. `CREATE TABLE public.app_config (...)` + GRANTs + RLS (read: anon+authenticated allow-all; writes: service role only).
2. Seed `guest_join_limits` with `{enabled, prompt_at:3, require_at:4, bonus_points:25}`.
3. `CREATE FUNCTION public.get_guest_join_limits() RETURNS jsonb` — `SECURITY DEFINER`, `STABLE`.
4. `CREATE FUNCTION public.get_guest_event_count() RETURNS int` — `SECURITY DEFINER`, `STABLE`, returns 0 if `auth.uid()` is null.
5. `CREATE TABLE public.guest_funnel_events (...)` + GRANTs + RLS (insert: authenticated where `user_id = auth.uid()`; select: DJs/admins).

No changes to existing tables.

## Files touched

- **New:** `src/hooks/useGuestJoinLimits.ts`, `src/lib/guestFunnel.ts`, `src/components/GuestUpgradePromptDialog.tsx`, `src/components/GuestLimitReachedDialog.tsx`.
- **Edited:** `src/pages/Join.tsx` (gate logic + block modal), `src/pages/EventPage.tsx` (mount prompt modal when flag set), `src/pages/Auth.tsx` ("joining event X" banner + `guest_signup_completed` analytics).
- **Migration:** one migration for the schema above.

## Limitations

- Counter is tied to `auth.uid()` in `localStorage`. Clearing browser data, incognito, or switching devices before signup gives a fresh identity — counter resets. Inherent to anonymous auth; acceptable given the goal.
- The require-at-4 gate is a nudge, not a security boundary. A motivated user can bypass by clearing storage.
- `event_banned_guests` checks still apply and take precedence.

## Suggestions for later

- Wire actual `bonus_points` grant via `award_points` inside `upgrade_anonymous_profile` once we're ready to spend the credits.
- Add a `last_prompted_at` on `profiles` to coordinate future nudges (tip prompts, review prompts) so users aren't over-nagged.
- Materialize a `guest_activity_summary` for loyalty/badges once funnel data justifies it.
