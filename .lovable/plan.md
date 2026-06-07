# Decks Launch Readiness Board

Goal: smallest set of work to safely launch publicly, then unlock Stripe. No auto-refund mechanics — disclosures + acknowledgement instead.

## Priority categories

- **P0** — Required before public launch (free points only)
- **P1** — Required before Stripe is turned on
- **P2** — Recommended within ~30 days of launch
- **P3** — Nice-to-have / defer until data justifies it

---

## Audit results

| # | Item | Status | Category | Effort |
|---|---|---|---|---|
| 1 | `/terms` page | Missing | P0 | S |
| 2 | `/privacy` page | Missing | P0 | S |
| 3 | `/dmca` page + takedown email | Missing | P0 | S |
| 4 | `/contact` page | Missing | P0 | XS |
| 5 | `/trust-safety` page (community rules, reporting, enforcement) | Missing | P0 | S |
| 6 | `/refund-policy` page ("Purchases are final, boosts = visibility only") | Missing | P1 | XS |
| 7 | Site-wide footer with links to all six pages | Missing | P0 | XS |
| 8 | Support email (`support@linku99.com`) shown on Contact + footer | Missing | P0 | XS |
| 9 | Nickname profanity check on write (already have `profanity.ts`, not wired into nickname update) | Partial | P0 | XS |
| 10 | Request rate limits (`cooldown_seconds`, `recent_request_count`) | Done | — | — |
| 11 | Boost rate limits / per-request cap | Partial — boosts validated, no per-window cap | P1 | S |
| 12 | User reporting flow (report request / report user → `reports` table → DJ + admin view) | Missing | P1 | M |
| 13 | Transaction history (already in Profile "Recent activity") | Done | — | — |
| 14 | Checkout acknowledgement modal (3 checkboxes, stored consent row) | Missing | P1 | S |
| 15 | Stripe purchase caps (per-day spend ceiling, first-purchase smaller cap) | Missing | P1 | S |
| 16 | Fraud protections (Turnstile/hCaptcha on auth + boost, IP velocity) | Missing | P1 | M |
| 17 | Account deletion ("Delete my account" → RPC + cascade) | Missing | P2 | M |
| 18 | Data export ("Download my data") | Missing | P2 | S |
| 19 | Cookie banner / cookie policy | Missing | P2 | S |
| 20 | CSP / security headers in `vercel.json` | Missing | P2 | XS |
| 21 | RLS gap: `bridge_pair_attempts` has no policies | Open | P2 | XS |
| 22 | Auto-refund credits on DJ reject / event end | Not building | P3 | — |

Effort: XS <30m · S ~1h · M ~half-day

---

## Counts

- **P0 launch blockers: 6** (terms, privacy, dmca, contact, trust-safety, footer+support email — nickname profanity is bundled in)
- **P1 Stripe blockers: 5** (refund policy, checkout acknowledgement, boost caps, reporting flow, fraud protections — purchase caps optional but recommended)
- **P2 within 30 days: 5**
- **P3 deferred: 1**

---

## P0 implementation plan (this build)

### 1. Legal/trust pages

Create static React pages under `src/pages/legal/`:

- `Terms.tsx` — service terms, virtual-currency clause ("Points and Boosts are a virtual item with no monetary value, non-refundable, non-transferable, non-redeemable for cash"), DJ discretion clause, age 13+ (16+ EU), governing law placeholder.
- `Privacy.tsx` — data collected (email, nickname, requests, IP for abuse), processors (Lovable Cloud / Supabase, iTunes, Spotify), retention, user rights, contact.
- `DMCA.tsx` — Decks stores metadata only, no audio hosted/streamed; takedown procedure; designated agent email `dmca@linku99.com`; repeat-infringer policy.
- `Contact.tsx` — `support@linku99.com`, response window, link to Trust & Safety for reports.
- `TrustSafety.tsx` — community rules, what's banned, reporting flow, enforcement ladder, appeal email.
- `RefundPolicy.tsx` — stub now (P1 needs it live before Stripe), states: boosts increase visibility only; DJs are not required to play any track; all purchases final; chargeback policy.

Routes added in `src/App.tsx`:

```text
/terms /privacy /dmca /contact /trust-safety /refund-policy
```

Each page wrapped with `<SEO>` (title, description, canonical) and a single H1.

### 2. Footer component

New `src/components/SiteFooter.tsx`:

- Columns: Product · Legal · Support
- Links to all six pages + `mailto:support@linku99.com`
- Copyright + "Decks © {year}"
- Mounted on `Landing`, `Join`, `EventPage`, `Profile`, `PublicProfile`, `Auth`, `Connect` (every guest/public surface). DJ workspace pages stay clean.

### 3. Nickname profanity check

In `src/pages/Profile.tsx` `saveName()` and in `Join.tsx` nickname submit:

- Run `containsProfanity` + `looksSpammy` from `src/lib/profanity.ts` before the Supabase update.
- Reject with toast: "Please choose a different nickname."

### 4. Support email surfacing

- Footer `mailto:` link.
- Contact page primary CTA.
- Auth page small text: "Need help? support@linku99.com".

### Out of scope for this build

- Account deletion, data export, cookie banner, CSP headers, reports table, checkout modal, Stripe caps, Turnstile — all P1/P2, tracked above.
- Auto-refund mechanics — explicitly **not building** (P3). Policy stance: boosts consumed on use, DJ has full discretion, purchases final.

---

## After P0 ships

Suggested launch sequence:

1. Ship P0 → publish → run real DJ event with free points only.
2. Collect 2–4 weeks of usage data (chargeback signal would be N/A here since no money yet, but watch request abuse, nickname abuse, support volume).
3. Build P1 stack (refund policy live copy, checkout acknowledgement modal + `purchase_consents` table, boost caps, reporting flow, Turnstile) → enable Stripe.
4. P2 cleanup (account deletion, data export, cookie banner, CSP, RLS gap).

---

## Technical notes

- Acknowledgement modal (P1) will write a `purchase_consents` row `{ user_id, version, accepted_at, ip }` and gate the Stripe checkout call. Versioned so future ToS changes re-prompt.
- `reports` table (P1) shape: `{ id, reporter_id, event_id, target_type ('request'|'user'|'nickname'), target_id, reason, status, created_at }` with RLS: reporter inserts own; DJ of event reads/updates; admin reads all.
- Boost cap (P1): per-user-per-event window check inside `boost_request` RPC.
- CSP (P2): add `Content-Security-Policy` header in `vercel.json` allowing self + Supabase + Lovable + iTunes/Spotify image CDNs.

Approve to build the P0 set (legal pages + footer + nickname profanity + support email).
