# Audit result — current guest flow

Findings from the codebase:

- `src/pages/Join.tsx` calls `supabase.auth.signInAnonymously({ options: { data: { nickname } } })` for every guest who isn't already signed in.
- There is no localStorage/sessionStorage UUID anywhere — `rg` finds zero references.
- `handle_new_user` trigger fires on every `auth.users` insert (including anonymous), so every guest already has:
  - a real `auth.uid()`
  - a `profiles` row keyed on that uid (nickname = entered nickname, 15 starter points)
  - a `user_roles` row with role `guest`
- All gameplay tables (`song_requests.requested_by`, `votes.user_id`, `event_participants.user_id`, `dj_tips.user_id`, `reports.reporter_id`, `points_transactions.user_id`) reference that same uid.
- DJ role is only granted by the existing `claim_dj_role()` RPC, never by signup.

**Conclusion: Path A — Supabase Anonymous Auth.** No merge architecture is needed. We just upgrade the anonymous user in place.

# Plan — Anonymous → Permanent upgrade

## 1. Backend (one migration)

Add an `upgrade_anonymous_profile(p_nickname text)` SECURITY DEFINER RPC that:
- Verifies `auth.uid()` exists and the caller is no longer anonymous (`(auth.jwt() ->> 'is_anonymous')::boolean = false`).
- Updates `profiles.nickname` if a non-empty nickname is provided (reusing the `app.bypass_profile_guard` flag like `ensure_profile`).
- Returns the refreshed profile JSON.
- Never touches `user_roles` — role stays `guest` / `user`. DJ role still requires `claim_dj_role()`.

No data migration, no row copies, no deletes. The `auth.users` row is the same one — Supabase flips `is_anonymous` to false and attaches the email identity. All foreign keys keep pointing at the same uid.

## 2. Frontend

### `src/components/UpgradeAccountDialog.tsx` (new)
Email + password form (reuses `emailSchema` / `passwordSchema`). On submit:
1. `supabase.auth.updateUser({ email, password })` — this is the official Supabase anonymous-upgrade call. It keeps the same uid and sends a confirmation email to the new address.
2. Call `upgrade_anonymous_profile` with the current nickname so the profile is stamped as permanent.
3. `refreshProfile()` + toast "Account created — your nickname, points, and history are saved."

### `src/pages/EventPage.tsx` + `src/components/AppHeader.tsx`
Add a "Create account to save progress" entry point visible only when `user && session?.user?.is_anonymous === true`. Opens the dialog above. Keep the existing "Continue as Guest" path untouched.

### `src/pages/Auth.tsx`
When a signed-in anonymous user lands on `/auth`, route the signup form through `updateUser` (upgrade) instead of `signUp` (which would create a second user). Sign-in tab stays as-is. No DJ role assignment anywhere — `djIntent` continues to redirect to `/dj/onboarding` which uses `claim_dj_role()`.

### `src/contexts/AuthContext.tsx`
Expose `isAnonymous = session?.user?.is_anonymous ?? false` so UI can branch cleanly.

## 3. Acceptance

- Guest joins event → has profile, nickname, points, requests, votes, tips, reports.
- Guest taps "Create account", enters email+password → same uid, same profile row, same points, same history. No duplicate auth user, no duplicate profile.
- New account has role `guest` only. DJ role still requires onboarding.
- Existing email/password signup flow for brand-new (never-visited) visitors is unchanged.

## Technical notes

- Supabase's `updateUser({ email, password })` on an anonymous session is the documented upgrade path; it preserves `auth.uid()` and only flips `is_anonymous` to false once the email is confirmed. Because the uid is preserved, no row migration is required.
- Email confirmation behavior depends on the project's auth settings; we won't change those here.
- The `upgrade_anonymous_profile` RPC is essentially a thin wrapper that re-asserts the nickname; it exists so the client has one call to make after `updateUser` succeeds and so future profile-stamping logic (e.g. marking `upgraded_at`) has a home.

## Files touched

- `supabase/migrations/<timestamp>_upgrade_anonymous_profile.sql` (new)
- `src/contexts/AuthContext.tsx` (expose `isAnonymous`)
- `src/components/UpgradeAccountDialog.tsx` (new)
- `src/components/AppHeader.tsx` (entry point when anonymous)
- `src/pages/Auth.tsx` (branch signup → updateUser when anonymous)

## Out of scope

- No merge RPC, no row copying, no anonymous-profile deletion (Path B fallback is not needed).
- No changes to DJ onboarding or `claim_dj_role()`.
- No schema changes to gameplay tables.
