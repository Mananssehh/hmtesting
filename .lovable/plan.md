## Goal
Remove third-party social login (Apple, Google) from the auth UI while keeping email signup, login, magic link, and password reset intact. Backend OAuth config remains unchanged.

## What will change
1. `src/pages/Auth.tsx`
   - Remove imports: `GoogleButton`, `AppleButton`
   - Remove the "Or" divider section and the `<div className="space-y-3">` containing social buttons
   - Keep all email/password form logic, tabs, validation, DJ invite code fields, and redirect behavior exactly as-is

2. No backend changes — Supabase OAuth providers stay configured.

## Test checklist (post-implementation)
- New account signup with email/password
- Existing account login with email/password
- Magic link login (if enabled)
- Password reset flow
- Confirm auth page renders cleanly without social buttons