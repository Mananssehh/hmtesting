# Decks UI Preview Handoff Document

Create one new documentation file — `docs/UI_PREVIEW_HANDOFF.md` — that fully describes the current Decks application so a brand-new Lovable design-sandbox project can work on UI without touching production behavior.

No production code, database, Edge Function, or deployment changes. The only file added is the doc.

## What the document will contain

All 22 sections you specified, written from what is actually in the repo (no invented facts):

1. Product overview — guest and DJ capabilities, DJ-stays-in-control model
2. Tech stack — React 18.3, Vite 5, TypeScript, Tailwind + shadcn/ui (Radix), Supabase JS 2.105, TanStack Query 5, react-router-dom 6.30.4, Stripe (via Edge Functions), lucide-react, qrcode.react, react-helmet-async, Lovable Cloud backend
3. Project structure — `src/pages`, `src/components` (35+ feature components + `ui/`), `src/hooks`, `src/lib`, `src/integrations/supabase`, `supabase/functions` (18 functions), `public/`, config files
4. Routes — every route in `App.tsx` with page, purpose, access level, data deps, side effects
5. Authentication — `AuthContext`, anonymous sessions, anonymous→auth upgrade preserving `auth.uid()`, profile RPC lookup, room-code preservation, redirect and expiry behavior
6. QR join flow — link → `/join?code=` → validation → session check → authenticated auto-navigate vs anonymous nickname path → guest funnel thresholds
7. Request flow — music search (debounced, cached, rate limited) → submission → duplicate handling → `song_requests` fields/status → realtime → card rendering
8. Voting — vote model, duplicate protection, optimistic updates, queue ranking rules (tips must never affect order)
9. Tips / payments — Stripe Connect Express, 30/70 split, checkout function, webhook events, caps, refunds/disputes, earnings surfaces
10. Realtime — channels subscribed per page, cleanup, reconnect, known churn issues
11. Database — tables the frontend reads: events, event_participants, song_requests, votes, profiles, dj_tips, dj_payout_accounts, event_integrations, now_playing, reports, app_config, guest_funnel_events (fields + relationships only, no data)
12. Edge Functions — all 18 with purpose, callers, contract; detailed section on `bridge-event-snapshot` and its `guest_nickname` resolution priority as deployed at 18d557d
13. Decks Bridge — pairing via `bridge-pair`, ingest token auth, snapshot polling, now-playing ingest, which UI is safe to restyle
14. Design system — tokens in `index.css` / `tailwind.config.ts`, colors, gradients, typography, radii, shadows, and a note on where values are centralized vs hardcoded in components
15. Safe to redesign — explicit list
16. Do not break — strict contract list
17. Known issues — confirmed open, recently fixed, unverified, polish (from the earlier audit; nothing invented)
18. Recent fixes — requester name mapping, guest_nickname payload, QR join auth fix, react-router-dom 6.30.4 security update
19. Production / Git state — repo `Mananssehh/hmtesting`, branch `main`, checkpoint `18d557d`, current HEAD `17b7b7a` ("Updated react-router-dom to 6.30.4"), clean tree status, production URLs (`hmtesting.lovable.app`, `linku99.com`)
20. Environment variable names only, grouped, with "never copy to a public/demo project" markings
21. UI Preview project rules — the exact may/must-not list you provided, plus read-only default
22. Copy-paste startup prompt for the new project

## Final report

After the file is written I'll report: file created, current HEAD commit, confirmation the tree is otherwise clean, any gaps the new project still needs, and the startup prompt pasted separately in chat.
