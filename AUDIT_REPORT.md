# MCR — Authenticated Dashboard QA & Improvement Report

**Branch:** `arena/e10e84e6-mcr`
**Date:** 2026-10-13
**Live preview:** production build of this branch, `next start -p 3100`
**Status:** PR #4 remains open and unmerged. Review the live preview before merging.

---

## 1. What was done

Every authenticated route was walked end to end against a running production
build (`npx next start`), with real tenant sessions (Apex owner, CoolBreeze
owner, platform operator) rather than mocked data. The audit then produced fixes,
which were re-verified live.

| | |
|---|---|
| Routes audited | 22 (10 tenant dashboard, 5 operator console, 7 public/legal) |
| Regression coverage | 60 new or updated checks across the audit, modal, and PostgreSQL-profile suites |
| `npx tsc --noEmit` | clean |
| `npm run build` | clean (Next.js 16.4.0, 46/46 pages) |
| `npm audit` | no known vulnerabilities |
| `npm test` | **307 / 310 pass; 3 skipped** — live PostgreSQL checks skip when the local server is unavailable |

---

## 2. Critical security finding (confirmed exploit, now fixed)

### 2.1 `/api/settings` PATCH — mass assignment / privilege escalation

`src/app/api/settings/route.ts` passed the client-supplied `updates` object
straight into `db.updateBusinessProfile()`, and
`src/db/repository.ts:339-345` does `Object.assign(profile, updates)` with no
field allow-list.

**This was exploited against the running staging app and confirmed.** Any
authenticated tenant could:

- set `account_id` to another tenant's id — breaking tenant isolation and
  orphaning their own profile;
- flip `is_demo` — unlocking the simulator path and the metric-exclusion
  treatment that comes with it;
- overwrite `forwarding_configured`, `crm_webhook_url`, `crm_webhook_secret`.

**Fix.** New `src/lib/settings-fields.ts` holds an explicit
`TENANT_EDITABLE_PROFILE_FIELDS` allow-list and a `partitionSettingsUpdates()`
helper. PATCH now partitions the payload and, if *any* field falls outside the
allow-list, returns `400 {error, rejectedFields, editableFields}` and mutates
**nothing**.

`forwarding_configured` is deliberately kept writable —
`src/app/dashboard/forwarding/page.tsx` PATCHes it legitimately.

**Live re-verification after the fix** (CoolBreeze owner session attempting to
hijack the Apex profile):

```
PATCH /api/settings  {"updates":{"business_name":"HIJACKED",
                                 "account_id":"acc-apex-plumbing",
                                 "is_demo":true,"ein":"99-9999999"}}
→ HTTP 400
  {"rejectedFields":["account_id","is_demo","ein"], ...}
→ profile after: business_name "CoolBreeze Heating & Air",
                 account_id "acc-coolbreeze-hvac", is_demo false
```

Regression coverage: `SET-1` … `SET-6` in `tests/audit-fixes.test.ts`.

> **Note on the exploit test.** The first live attempt corrupted the CoolBreeze
> profile in memory. Restoring `data/mcr_db.json` from backup was **not**
> sufficient — the running process kept serving the corrupted in-memory state
> until it was restarted. Restore the file *and* restart the process.

---

## 3. Honesty defects fixed

The recurring theme: the UI asserted things the system had not done.

| # | Surface | Defect | Resolution |
|---|---|---|---|
| 3.1 | Settings → Hours | `openTime`/`closeTime` inputs and a "Weekly Schedule" grid that were never sent by `handleSaveHours` (no `business_hours` repository method exists) | Removed. Replaced with an accurate description: text-backs run 24/7 and the only time-based rule is the TCPA 8 AM–9 PM local quiet-hours window from `src/lib/quiet-hours.ts` |
| 3.2 | Settings → Intake | `collectAddress` / `collectPhotos` / `emergencyKeywordAlerts` toggles were never persisted by `handleSaveIntake` | Removed. The tab now renders the *actual* question sequence from `TRADE_TEMPLATES[trade].questions`, labelled "Set By Trade" |
| 3.3 | Settings → Compliance | Unconditional **"100% Protected"** badge; hardcoded **"A2P 10DLC Registration In Progress"** card | Badge → "Guardrails Active". The registration card is gone; the tab links to the real registration-status tracker |
| 3.4 | Settings → Compliance | Link labelled *"Open Full TCPA Compliance Audit Log"* pointing at a page that has no audit log | Relabelled *"View A2P 10DLC Registration Status"* |
| 3.5 | Settings → Billing | Read `usage.calls_processed` and `currentPlan.call_cap`, which `/api/billing` does not return. Live values are `calls_count: 68`, `included_calls: 200`; the page showed its hardcoded fallbacks `68` and `600` (11.3%) | Reads `usage.calls_count` / `currentPlan.included_calls` / `usagePercent`. Live: **68 / 200, 34%** |
| 3.6 | Settings → Billing | "Active Subscription" and a "CURRENT" badge on Business were hardcoded regardless of the real `plan_id` (`pro`) | Both now derive from `currentPlan` |
| 3.7 | `/dashboard/compliance` | `EIN / Tax ID: Verified` shown whenever `profile.ein` was absent | Shows **"Not on file"** when absent |
| 3.8 | `/dashboard/jobs` | The activity timeline asserted *"Auto Text-Back: Dispatched in <30 seconds"*, *"Customer Responded: Problem & service address captured"* and *"Owner Notified: Lead alert SMS pushed"* for **every** job, whether or not those events occurred | Every entry now derives from a timestamp that exists on the `JobCard` record (`first_call_time`, `text_back_time`, `qualified_time`, `contacted_time`, `booked_time`, `completed_time`, `dead_time`), with a `timelineSteps` count driving a "No further activity recorded" fallback |
| 3.9 | `/dashboard/forwarding` | **"Live"** badge implied MCR had verified the carrier network; the simulated test call reported *"Verification Call Succeeded!"* | Badge → **"Self-Reported"**; the simulated call states plainly that it exercises MCR handling only and does not prove the star code is active |
| 3.10 | `/api/billing` + `/dashboard/billing` | The UI implied a live Stripe gateway while `STRIPE_SECRET_KEY` is empty | GET now returns `billing: {liveGateway, gateway, mode, notice}`. The page shows a persistent amber *"Live payments disabled"* notice, and plan changes / portal opens report *"recorded locally, no charge processed"* instead of pretending a checkout ran |
| 3.11 | `/admin/carrier-matrix` | Per-carrier rollover timings (18.4 s, 20.1 s, …) and caller-ID verdicts were fabricated, and a **"Live Validation"** button always passed | Rewritten against the real `CARRIER_GUIDES`, explicitly labelled *"reference material, not test evidence"* with a note that only dialing from a handset can confirm rollover |
| 3.12 | `/admin/concierge` | Hardcoded pilot rows, an "Advance Mode" button that only mutated local state while reporting success, and a **"Dispatch Concierge SMS"** button that mutated nothing | Rewritten to render live `/api/admin/fleet` telemetry, with an honest explanation that this deployment has no manual concierge dispatch queue |
| 3.13 | `/admin/risks` | Hardcoded "6" high/critical risks, "100% Mitigations Architected", and a "Concierge Validation Gate Pending (0/3)" card claiming 0 paying pilots | Counts derived from the register; unearned claims removed; subtitle now reads *"manually maintained internal planning register — not live system telemetry"* |
| 3.14 | `/login` | Demonstration credentials (`demo@apexplumbing.com` / `ApexDemo2026!Secure`) were printed unconditionally on every deployment | Gated by `src/lib/demo-mode.ts`. See §4 |
| 3.15 | Dashboard help modal | Claimed a **"24/7 Concierge Hotline: +1 (800) 555-MCR1"** that contradicts `COMPANY_INFO.supportHours` (Mon–Fri 8 AM–8 PM EST) | Replaced with the real support hours and email |
| 3.16 | Dashboard + Settings | Hardcoded `support@mcr-recovery.com` disagreeing with the canonical `COMPANY_INFO.email` (`support@getmcr.com`) | All app surfaces now read `COMPANY_INFO`. The only remaining `@mcr-recovery.com` address is `privacy@` on the privacy policy — left alone because inventing a replacement legal contact would be worse than the inconsistency. **Flagged for you to decide** |
| 3.17 | `/dashboard/missed-calls`, `/dashboard` | "Deduplicated (called within last **4** hours)" contradicted the 2-hour window enforced in `db.recordCall()` | Corrected to 2 hours in both places, and on the public `/compliance` page |
| 3.18 | `src/app/admin/page.tsx` | `handleToggleForwarding` and `handleTriggerDigest` silently no-op'd on a non-success response; `handleSimulateCall` reported `data.error` without checking `res.ok` | All three validate `res.ok` and surface the failure |

### Save-handler silence

Every save handler in `src/app/dashboard/settings/page.tsx`
(`handleSaveProfile`, `handleSaveHours`, `handleSaveIntake`,
`handleAddCannedReply`, the webhook save, the webhook test) plus
`handleSaveActualValue` in `src/app/dashboard/page.tsx` set a success toast but
`console.error`-only on failure — every failure was a silent no-op. All now set
a dismissible `role="alert"` error toast with the HTTP status.

---

## 4. Demo credential gating (`MCR_DEMO_MODE`)

`src/lib/demo-mode.ts` is the single source of truth.

| Deployment state | Demo box on `/login` |
|---|---|
| `NODE_ENV=production`, no flag | **Hidden** — treated as real production |
| `MCR_DEMO_MODE=true` (or legacy `DEMO_MODE=true`) | Shown |
| `MCR_ENVIRONMENT` / `APP_ENV` / `RAILWAY_ENVIRONMENT` / `VERCEL_ENV` = `staging` / `demo` / `dev` / `preview` / `test` | Shown |
| `NODE_ENV` not `production` (local `npm run dev`) | Shown |

`GET /api/auth/demo-credentials` returns `{exposed:false, reason}` when withheld
and never returns credential material in that case. `src/app/login/page.tsx` is
now a server component (`force-dynamic`) that decides per request, so flipping
the flag does not require a rebuild.

> **Operator action required.** The deployed staging app runs `NODE_ENV=production`
> with no demo flag, so **after this change the demo box disappears from the login
> screen** until you set `MCR_DEMO_MODE=true`. This is intentional. Documented in
> `.env.example` and `docs/RAILWAY_STAGING.md` → *"Demo credential disclosure"*.
> Falsy values (`false`, `0`, `no`, `off`, empty) correctly do **not** unlock it.

---

## 5. Operator console reachability

`/admin/*` was unreachable from a browser: nothing posted to `/api/admin/login`
and the middleware returned raw JSON `401` for HTML navigations.

- `/admin/login` is `rewrite`d onto a new public **`/operator-login`** screen
  (password sign-in, 429-specific copy, and a persistent amber notice when
  `ADMIN_PASSWORD` is unset and the middleware answers 503).
- Anonymous HTML `GET /admin/*` now redirects to `/operator-login?next=<path>`.
- API callers keep the `401` + `WWW-Authenticate` contract.
- New `src/app/admin/admin-shell.tsx` adds operator-console navigation
  (Fleet / Concierge / Carrier Matrix / Risk Register / Launch Gate) and a
  **Sign Out** button. The server-side `role === 'admin'` guard in
  `src/app/admin/layout.tsx` is unchanged.

---

## 6. UX / accessibility

Applied across the dashboard and console:

- **Loading, error, and retry states** on every page that fetches: `reports`,
  `missed-calls`, `jobs`, `inbox`, `settings`, `billing`, `compliance`,
  `forwarding`, `admin`, `concierge`. Previously only `launch-gate` had them.
- **Every failure is reported.** See §3.
- **Modals** (`Record Completed Job Revenue`, job detail, help) get
  `role="dialog"`, `aria-modal`, `aria-labelledby`, Escape-to-close, and
  backdrop-click-close; labels are associated via `htmlFor`/`id`.
- **Navigation**: `aria-current="page"` on active links, `isActiveRoute()`
  highlights sub-routes, `aria-hidden` on decorative icons,
  `aria-expanded`/`aria-haspopup` on the hamburger, notifications and mobile
  "More".
- **Tables** get `<caption>` and `scope="col"`; three distinct empty states
  (loading / never-received / no-match) on `missed-calls`.
- **Keyboard access**: Kanban cards are `<button>`s; conversation-list items are
  `role="button"` + `tabIndex` + Enter/Space activation; carrier selection is a
  labelled `role="group"` with `aria-pressed`.
- **CSV export** now `fetch`es the file and parses `content-disposition` for the
  filename, instead of pointing an `<a download>` at a URL that could return a
  JSON error page and navigate the tab to it.
- Toasts are dismissible with `aria-label`ed close buttons; `type="button"` on
  every non-submit control.

### Remaining gaps after the follow-up passes

Modal focus management and console contrast were addressed in §§11.2–11.3, and
a site-wide skip-to-content link is covered in §18. The existing
`dashboard-readability` and other suites still have limited assertions for new
surfaces beyond the honesty checks in §7.

---

## 7. Test results

```
npx tsc --noEmit   → clean
npm run build      → clean on Next.js 16.4.0 / Tailwind CSS 4.3.3, 46/46 pages
npm audit          → 0 vulnerabilities
npm test           → 307 / 310 pass; 3 skipped when local PostgreSQL is unavailable
```

### Live PostgreSQL checks are environment-dependent

| Test | Local result |
|---|---|
| `PG-2: Live Database Engine Connectivity & Schema Structure` | skipped if PostgreSQL is not reachable at `127.0.0.1:5433` |
| `PG-3: Dual-Persistence Operations & Cascade Lifecycle` | skipped under the same missing-server condition |
| `PG-5: Application Dual-Persistence Writes Actually Reach PostgreSQL` | skipped under the same missing-server condition |

There is no PostgreSQL server in this sandbox. The profile-persistence behavior
is covered here with a fake pool. CI runs the three live checks against its
PostgreSQL 16 service; connection/authentication errors still fail rather than
being hidden as skips.

### Regression suites

- `tests/audit-fixes.test.ts`: **47/47 passing** — tenant-editable settings,
  access routing, honest email reporting, and WCAG contrast.
- `tests/modal-focus.test.ts`: **7/7 passing** — jsdom runtime checks for focus
  entry, tab cycling, Escape, focus restoration and accessible naming.
- `tests/postgres-profile-persistence.test.ts`: **6/6 passing** — initial
  account/profile write, targeted settings update, database-to-cache hydration,
  failed-write behavior, API error reporting, and schema/migration coverage.
- `tests/custom-intake-keywords.test.ts`: **4/4 passing**; the old after-hours
  save test now verifies that unsupported controls are rejected without changing
  profile data.

The suites are wired into `npm test`. Tests set `NODE_ENV=test`, so
`db.saveToFile()` short-circuits and the tests never write to
`data/mcr_db.json`.

---

## 8. Persistence findings you should know about

- The repository still uses `data/mcr_db.json` for general application state.
  This pass does **not** claim that every MCR table has moved to PostgreSQL.
- Business profiles now have a real PostgreSQL persistence path when a valid
  `DATABASE_URL` is configured. `business_profiles` stores the profile fields
  used by settings, including emergency keywords, intake question, CRM webhook
  settings, demo status and average ticket. Idempotent `ALTER TABLE ... ADD
  COLUMN IF NOT EXISTS` statements upgrade databases created by older releases.
- `scripts/migrate-to-postgres.ts` now imports those profile values from the JSON
  store, not only the business name, trade and phone numbers.
- New signup waits for the account and its profile to reach PostgreSQL. Profile
  saves update the database first, then refresh the in-memory/file copy. A failed
  database save returns an error and does not change the local profile or claim
  success.
- Authenticated tenant requests load the current profile from PostgreSQL into the
  request process before reading it. Operator fleet and tenant-specific actions
  hydrate the profiles they use; Twilio voice/SMS and CRM webhook handlers also
  read the saved profile.
- With no valid PostgreSQL configuration, local development still uses the JSON
  file store.

**Business-hours decision:** do not add a weekly schedule or new after-hours
messaging behavior yet. This changes when customer texts and calls are handled,
so it needs product rules and testing beyond a storage-only change. The Settings
page now says plainly that weekly hours and separate after-hours messages are
unavailable; the misleading toggle and save button are gone, and the API rejects
those old fields. The existing `business_hours` SQL table remains unused; no
hours are stored or applied.

---

## 9. Live preview

The production build of this branch is running on port **3100** (Next.js 16.4.0,
Tailwind CSS 4.3.3). The latest login, settings, and access-boundary smoke checks
passed after the framework update.

| Surface | URL | Session |
|---|---|---|
| Tenant sign-in | `/login` | demo credentials shown (the ignored preview `.env.local` sets `MCR_DEMO_MODE=true`) |
| Operator sign-in | `/operator-login` | `ADMIN_PASSWORD` from `.env.local` |
| Dashboard | `/dashboard` | CoolBreeze owner |
| Settings | `/dashboard/settings` | check Hours, Intake, TCPA, Billing tabs |
| Billing | `/dashboard/billing` | 68 / 200 calls, live-payments notice |
| Jobs | `/dashboard/jobs` | activity timeline, dialog a11y, CSV export |
| Carrier forwarding | `/dashboard/forwarding` | "Self-Reported" badge |
| Operator console | `/admin` | fleet overview, then Carrier Matrix / Concierge / Risks |

`.env.local` is gitignored and was **not** committed. It must exist for the
preview to run; see `.env.example` for the variable matrix. `NODE_ENV=development`
was removed from it so the build runs in production mode.

---

## 10. Access-flow pass (follow-up commit `b8082e1`)

You asked for the whole path — first click to working dashboard — to be clean
and predictable. That is a second commit on top of the audit fixes.

### Fixed

| # | Issue | Fix |
|---|---|---|
| 10.1 | **Open redirect on both sign-in screens.** `?next=` came from the URL and was pushed into the router unvalidated, so `?next=https://evil.example` turned our own login screen into a redirector | New `src/lib/safe-redirect.ts` accepts only same-origin relative paths inside known app surfaces, and never re-enters the auth flow just completed. Used by tenant login, operator login, and the already-signed-in redirect |
| 10.2 | **`?next=` was silently discarded.** The middleware correctly bounced an anonymous visitor to `/login?next=/dashboard/reports`, but the form always did `router.push('/dashboard')` | Honoured end to end. Verified live: `/login?next=/dashboard/jobs` lands on `/dashboard/jobs`; a hostile `next` falls back to the role default |
| 10.3 | Admins and tenants landed in the same place after sign-in | Role from the login response routes admins to `/admin`, tenants to `/dashboard` |
| 10.4 | `/onboarding` was unguarded — a signed-in tenant could start a second account | Server-side guard redirects to their own dashboard |
| 10.5 | **Signup lost all progress on refresh.** 12 steps, no persistence | Draft persisted to `localStorage` and restored on mount, with a named step rail replacing the bare "Step 3 of 12". The password is never written to browser storage |
| 10.6 | **A failed signup navigated to `/dashboard`.** The old catch block did `router.push('/dashboard')` on a network error, leaving the customer signed out with no account and no explanation; API errors used `alert()` | `role="alert"` banner with the HTTP status, draft retained so the customer can retry |
| 10.7 | Three separate auth layouts with different branding | New `src/components/auth/auth-shell.tsx` — one brand mark, one footer, one set of legal links, one support contact. Operator sign-in keeps its deliberately distinct dark theme to signal "restricted console" |
| 10.8 | Default Next.js 404 | Branded `src/app/not-found.tsx` with routes back into the app and a support contact |

### Honesty fixes on the dashboard chrome

- **The notification bell showed fabricated alerts.** "🚨 Water Heater Rupture — Emergency customer at 123 Main St" and "📞 Missed Call Recovered" were hardcoded and presented as real. It now renders this tenant's actual emergency-flagged jobs from `/api/jobs`, links each to its job card, and has an honest "No emergency alerts" empty state.
- **The "DEMO ACCOUNT" badge was hardcoded**, so every real customer saw it. It now follows the session's real `isDemo` flag.
- The sign-in screen states plainly that password reset is by email, rather than implying a self-service flow that does not exist.

### Verified live

Signup creates the account, sets the session, and lands on the dashboard;
duplicate email → `409`; weak password → `400` with usable copy. All 22 routes
(10 tenant, 5 operator, 7 public) return the expected status, and the 404 page
renders.

10 new regression tests (`ACC-1`…`ACC-10`), 36/36 in the audit suite.

---

---

## 11. Operator polish pass (commit `a5dcf05`)

Two defects were found while reviewing the operator console, both of the same
class as the rest of this audit: the product claiming something it does not do.

### 11.1 Email dispatch reported delivery for messages never sent

At the time of the original audit, `EmailService.sendEmail()` only logged the
message, returned `{ success: true, messageId }`, and had no mail transport.
The UI also showed a green "Weekly recovery digest dispatched" message. A
customer could reasonably believe an email had reached their inbox when it had
never left the application.

The initial repair added an explicit no-transport outcome and changed the
reports UI to show a warning instead of claiming delivery. Section 15 records
the later implementation of optional SMTP and the updated acceptance-only
status. **This section is historical; do not use its original `delivered`
field or old provider-key list as current configuration guidance.**

Self-service password reset remains unavailable. SMTP alone does not provide a
secure reset-token lifecycle, expiry, rate limits, or a working reset page, so
no reset flow is claimed or stubbed.

### 11.2 Dialogs had no focus management

The app had three hand-rolled overlays (`role="dialog"`) and none of them
managed focus. Focus stayed on the page behind the dialog, Tab walked straight
out into the background, and closing left focus nowhere — every dialog
unusable without a mouse.

New `src/components/modal.tsx` handles the six things a bespoke overlay almost
always gets wrong: `role="dialog"` + `aria-modal` + a programmatic accessible
name; focus moves in on open; Tab / Shift+Tab cycle inside; Escape closes;
focus returns to the opener; background scroll is locked and restored. All
three surfaces were migrated onto it, and the job dialog's status-change
buttons moved into its `footer` slot.

Verified at runtime rather than by reading source.
`tests/modal-focus.test.ts` drives the real DOM contract through jsdom:

- focus moves into the dialog on open
- eight consecutive Tab presses never reach the page behind it and never land
  on a disabled control
- Tab wraps last→first, Shift+Tab wraps first→last
- focus returns to the opener on close
- the accessible name resolves to the dialog's heading

### 11.3 Text and icon contrast below WCAG AA

`scripts/contrast-audit.py` resolves every Tailwind colour pair in the operator
console, tenant dashboard and public surfaces to real sRGB and computes the
WCAG ratio. It now reads Tailwind 4's installed OKLCH theme tokens directly, so
the audit stays aligned with the actual CSS palette. It judges text against 1.4.3 (4.5:1) and icon-only tiles against
1.4.11 (3:1) — judging icons at the text bar produces false positives that hide
the real failures.

Of 268 measurable pairs, 15 were below threshold:

| Pair | Before | After | Count |
|---|---|---|---|
| white on `emerald-600` (button labels) | 3.77:1 | `emerald-700` 5.48:1 | 8 |
| white on `amber-600` | 3.19:1 | `amber-700` 5.02:1 | 1 |
| `slate-400` on `slate-100` | 2.34:1 | `slate-600` 6.92:1 | 1 |
| `slate-400` on white | 2.56:1 | `slate-500` 4.76:1 | 1 |
| `slate-500` on `slate-100` | 4.34:1 | `slate-600` 6.92:1 | 2 |
| `red-600` on `red-50` | 4.41:1 | `red-700` 5.91:1 | 1 |
| `amber-600` icon on `amber-100` | 2.86:1 | `amber-700` 4.51:1 | 1 |

The most common failure was the product's own primary green button: white on
`emerald-600` is 3.77:1 — acceptable for a large icon, below the bar for the
12px bold label on it.

The ratios above record the original Tailwind 3 palette audit. After the
framework upgrade, the checker was switched to Tailwind 4's actual OKLCH tokens
and all 268 current pairs still pass; the updated live result is recorded in §14.

The audit is proven non-vacuous: reverting one fix makes it report that exact
pair again. `CONTRAST-1/2/3` lock it in — the script must exit clean, must
measure 200+ pairs under both thresholds, and the contrast maths for each fixed
pair is re-derived independently so a palette regression is caught even if the
script is weakened.


---

## 12. Profile persistence and business-hours decision

The recommendation was to make tenant profile settings durable wherever MCR is
configured with PostgreSQL, while keeping the existing JSON store as the local
fallback. This pass implements that limited guarantee end to end:

1. Added the missing profile columns and safe upgrades for existing databases.
2. Expanded the file-to-PostgreSQL migration to copy the full profile.
3. Added account/profile persistence for new signups and awaited writes for
   tenant settings, CRM webhook configuration and operator forwarding changes.
4. Hydrated profiles from PostgreSQL before tenant API, operator fleet/tenant
   actions, and external telephony/webhook handlers read the synchronous cache.
5. Added tests proving that a failed database write does not update the local
   profile or return a successful save.

The other decision was to **not** build calendar-aware business hours yet. The
existing Settings tab suggested an after-hours message could be customized, but
the runtime never used those fields. That control was removed instead of making
an unreviewed change to customer messaging/routing. The tab now explains what
works today and what is unavailable. A future business-hours feature needs an
explicit product rule before storage or routing is added.

## 13. Recommended follow-ups (not done)

1. **Pick one support address.** `COMPANY_INFO.email` (`support@getmcr.com`) now
   wins everywhere except the privacy policy's `privacy@mcr-recovery.com`.
   Confirm which domain is real and align the privacy policy.
2. **Decide the demo-credentials policy for production.** Either set
   `MCR_DEMO_MODE=true` on staging, or accept that staging sign-in needs real
   seeded credentials.
3. **Remaining PostgreSQL coverage.** Profile persistence is done in §12; new
   signup credentials are now persisted and login checks PostgreSQL first (§20).
   Other application state remains file-backed unless separately migrated.
4. ~~**Modal focus management** — trap focus and restore it on close.~~
   **Done** in §11.2 (`7bc7ceb`).
5. ~~**Colour-contrast audit** of the operator console.~~ **Done** in §11.3
   (`a5dcf05`), 15 pairs fixed, now enforced by `CONTRAST-1/2/3`.
6. **Weekly business-hour scheduling** remains unavailable by design for now;
   define the operational rules before adding a schedule or after-hours messages.
7. **Self-service password reset** remains unavailable. The SMTP transport
   added in §15 can send configured transactional mail, and new credentials now
   persist to PostgreSQL (§20), but a secure reset still needs expiring one-time
   tokens with durable storage, rate limits, a working reset page, and a reliable
   strategy to invalidate existing sessions after a password change. No
   password-reset email is claimed or sent.


---

## 14. Security and toolchain modernization (2026-10-13)

To keep the product current without a blind dependency sweep, the framework and
styling toolchain were upgraded to their current stable major versions, then
built and tested against the full app:

- Next.js **16.4.0** and React **19.3.0**, running on the production-matched
  Node.js 22 runtime.
- Tailwind CSS **4.3.3**, its official PostCSS plugin, and `tailwind-merge`
  **3.7.0**. The custom design tokens now live beside the global CSS instead of
  in a legacy Tailwind 3 config.
- Migrated `src/middleware.ts` to Next 16's `src/proxy.ts` convention and kept
  the existing route protection, redirects, rewrites, and API 401/503 behavior.
- Updated CI to use reproducible `npm ci` installs on Node 22, run `npm audit`
  before tests, and restrict the workflow token to read-only repository access.
- Updated the contrast checker to convert Tailwind 4's shipped OKLCH palette to
  sRGB before calculating WCAG contrast. **268 pairs checked; no failures.**
- `npm audit` now reports **0 vulnerabilities** across production and development
  dependencies. The toolchain's full major-version changes pass the production
  build and the focused access, deployment, persistence, and dialog test suites.
- PostgreSQL engine tests now **skip only when the local server is unreachable**;
  actual authentication/database failures remain failures. CI has a PostgreSQL
  service and still runs the live checks.

Validation at the time of the modernization pass: `npm run lint` clean;
`npm run build` clean with 46/46 pages; `npm test` 307 of 310 passing and 3
skipped locally for the unavailable PostgreSQL server; `npm audit` clean;
`npm run deploy:check` passed.

## 15. SMTP transport and truthful transactional email (2026-10-13)

The weekly report now has a provider-neutral SMTP transport using Nodemailer.
Sending remains disabled unless the operator supplies **both** `SMTP_URL` and
`EMAIL_FROM`; no credentials, sender address, or support domain are guessed or
committed. Production `smtp://` connections require STARTTLS, `smtps://` starts
with TLS, and the SMTP connection is closed after each send attempt. Only the
weekly report dispatch is currently wired to send through this service; the
other existing templates are not hooked up to application events.

The result reports whether the SMTP server accepted the recipient for
processing. It does **not** claim inbox delivery: spam filtering, later bounces,
and final recipient delivery are outside this app's visibility. If SMTP is
missing, invalid, rejects the recipient, or errors, the weekly report UI shows
that outcome instead of a green sent message. No provider message ID is made up
when no SMTP server was contacted.

The email path was hardened before enabling real sending:

- The templates no longer invent verification tokens, MCR phone numbers,
  carrier details, brand IDs, payment amounts, trial dates/statistics, or
  carrier deactivation codes. Missing facts are omitted or labelled unavailable.
- Email verification is explicitly non-sendable until a real token lifecycle and
  confirmation route exist; it cannot produce a dead `/verify` link.
- Dynamic template values are HTML-escaped and email subjects are normalized
  to prevent markup injection and header-line injection.
- The preview endpoint no longer inserts sample tokens or fake payment values.
- The compliance dashboard shows "Not assigned" instead of synthetic pending
  brand/campaign SIDs.
- Weekly dispatch no longer falls back to `contractor@example.com` or a sample
  caller ID. Missing account recipient or MCR caller ID now fails before any
  part of a combined dispatch is sent. Demo sessions cannot trigger external
  SMS or email, protecting seeded sample accounts from live dispatch.
- API/UI results distinguish mock SMS and SMTP acceptance from confirmed
  recipient delivery.

**Verification (2026-10-13):** all nine email-service tests use an injected
fake SMTP transport; no live mail server or credentials were available, so
external delivery was not attempted. The full suite passed **321 of 324 tests**,
with 3 PostgreSQL checks skipped because no local PostgreSQL server was
available. `npm run lint`, the production build (46/46 pages), `npm audit` (0
vulnerabilities), and `npm run deploy:check` all passed. The preview returned
HTTP 200 for `/` and `/api/health`; unauthenticated email-preview requests
returned 401. Weekly dispatch remains log-only without operator SMTP
configuration; the email-preview route only renders HTML and never sends. SMTP
acceptance in a future deployment still will not confirm inbox delivery. Email
verification and self-service password reset remain unimplemented.

## 16. Runtime session-signing secret enforcement (2026-10-13)

Removed the predictable built-in session-signing key from both the server signer
and Next.js proxy verifier. Both now resolve `SESSION_SECRET` when a session is
signed or checked, using the shared `validateSessionSecret` policy in production.
There is no application fallback: a missing key or a key below the existing
256-bit entropy policy fails closed. Protected admin/dashboard pages and
session-authenticated APIs return a clear 503 configuration error, and session
issuance returns 503 without setting a cookie. The public sign-in screens remain
reachable so operators can correct the runtime configuration. The public
`/api/health` readiness check now returns a generic 503 when authentication
configuration is unavailable, without exposing the cause or any secret, so a
broken deployment cannot be marked healthy.

Secret validation is request-time rather than module-import/build-time. A
separate production build from a clean temporary copy with all `.env*` files
excluded and `SESSION_SECRET` unset compiled successfully (46/46 pages). Test
and security-probe code now supplies an explicit test-only key instead of
relying on an application default. `.env.example` leaves the value blank and
points operators to `openssl rand -hex 32`; the runbook explains the 503
behavior and runtime requirement.

**Verification (2026-10-13):** `npm test` passed **325 tests**, with 3 PostgreSQL
checks skipped because no local server was available; `npm run lint` and
`npm run deploy:check` passed. The live preview returned 200 for `/` and
`/api/health`; anonymous protected API requests returned 401 with a configured
key, the dashboard redirected to sign-in, and the admin route remained locked.
The local `.env.local` contents were not inspected or recorded. PR #4 remains
open for the user's preview review.

## 17. Operator login policy, throttling, and bounded limiter state (2026-10-13)

The production operator boundary and `/api/admin/login` now apply the existing
`validateAdminPassword` policy at request time. Missing or weak `ADMIN_PASSWORD`
configuration fails with 503, without disclosing the supplied value. This closes
the gap where deployment pre-flight enforced password strength but a direct
production start could still accept a weak operator password.

Failed operator-password attempts are throttled at five per observed client IP
per 15-minute window. The operator limiter uses its own bucket so those failures
do not consume a tenant's login allowance. The shared in-memory tenant/operator
rate-limit maps drop expired attempts when a key is checked/updated and cap each
store at 10,000 keys, which prevents rotating email/IP identifiers from growing
a process without bound.
These counters remain **process-local** and reset on restart; they are not a
distributed limit across replicas, so production edge/gateway controls remain
useful for multi-replica deployments.

`.env.example` no longer supplies a weak-looking admin password placeholder.
The runbook documents the policy and the process-local rate-limit limitation.
`/api/health` returns its existing minimal generic 503 when either the session
secret or admin password is unavailable/weak; it does not reveal which value is
wrong.

**Verification (2026-10-13):** `npm run deploy:check` passed all 332 tests
(329 passed; 3 PostgreSQL checks skipped because no local server was available),
all seven green security probes, and the red-probe regression check. `npm run
lint` passed. A production build with `.env.local` moved aside and no auth secrets
in the build environment completed successfully (46/46 pages). The production
preview returned HTTP 200 for `/` and `/api/health`; anonymous admin-page access
redirected to `/operator-login`, the protected admin API returned 401, and an
incorrect operator password returned 401. GitHub CI run
[38390667775](https://github.com/abbojidevops/MCR/actions/runs/38390667775)
passed type-checking, the test suite, staging pre-flight, production build, and
the deployment/hygiene/security gate. PR #4 remains open and unmerged for the
user's preview review.

## 18. Site-wide skip-to-content access (2026-10-14)

Added a first-in-keyboard-order "Skip to main content" link in the root layout.
It is visually hidden until focused, then becomes a high-contrast fixed link.
Each app surface now provides a programmatically focusable `<main id="main-content">`
target: landing page, tenant dashboard, operator console, sign-in/onboarding,
public legal/compliance pages, and the 404 page. This closes the skip-link gap
noted earlier in §6.

`tests/skip-link.test.ts` adds A11Y-SKIP-1/2 and is included in `npm test`.
**Verification:** `npm run test:skip-link` passed 2/2; `npm run lint` passed;
`npm run deploy:check` passed 334 tests (331 passed, 3 PostgreSQL checks skipped
because no local server was available), all seven green security probes, and the
red-probe check. The production build completed with 46/46 pages. Live production
HTML on `/`, `/login`, `/operator-login`, `/compliance`, `/terms`, and `/privacy`
contains both the keyboard skip link and its focusable main target; anonymous
`/dashboard` still redirects to sign-in. The preview is available for review.

## 19. Operator console navigation cleanup (2026-10-14)

Removed the duplicate Carrier Matrix, Launch Gates, Risk Matrix, and Concierge
links from the fleet-overview toolbar. These destinations remain in the shared
operator navigation; the overview keeps its useful Refresh and Client Dashboard
actions. `OPS-5` in `tests/audit-fixes.test.ts` protects that navigation contract.

**Verification:** `npm run test:audit` passed 51/51; `npm run lint` passed;
`npm run deploy:check` passed 335 tests (332 passed, 3 PostgreSQL checks skipped
because no local server was available), all seven green security probes, and the
red-probe check. The production build completed with 46/46 pages and no auth
secrets in its environment. The live preview returned HTTP 200 for `/` and
`/api/health`; anonymous `/admin` still redirects to operator sign-in. `OPS-5`
asserts the section routes remain in the shared admin shell and are not duplicated
in the overview toolbar. GitHub CI run
[38566703022](https://github.com/abbojidevops/MCR/actions/runs/38566703022)
passed type-checking, the test suite, staging pre-flight, production build, and
the deployment/hygiene/security gate.

## 20. PostgreSQL-backed signup credentials (2026-10-14)

New onboarding now awaits the credential write to `user_credentials` before it
returns success. When PostgreSQL is configured, the email-uniqueness check and
sign-in lookup query PostgreSQL first. The account parent is ensured without
overwriting its existing status or plan, and the credential insert uses
`ON CONFLICT (email) DO NOTHING`; a race is reported as HTTP 409. Failed SQL
writes do not update the local credential cache or issue a session. Login fails
closed if its PostgreSQL query errors instead of using a potentially stale local
hash.

A successful query with no row can still use a legacy file credential that has
never been confirmed as PostgreSQL-backed. This preserves seeded and pre-migration
accounts on existing deployments. Credential IDs confirmed in PostgreSQL are
marked in the JSON state so a later missing SQL row does not revive that cached
hash. For existing tenants, run `npm run db:migrate:postgres` against the existing
`data/mcr_db.json` before retiring the file-backed compatibility path. The rest
of application state continues to use its existing file-backed/read-through
behavior; this change does not make PostgreSQL the universal repository.

`tests/postgres-auth-credentials.test.ts` adds four fake-PostgreSQL checks:
write-before-cache, SQL-first reads and legacy fallback, an onboarding-to-login
round trip through SQL, and fail-closed behavior after a write error. The tests
use an injected `pg.Pool` query seam and do not contact a real database.

**Verification (2026-10-14):** `npm run lint` passed; `npm run test:postgres-auth`
passed 4/4; `npm run test:auth` passed 12/12; `npm test` passed **339 tests**
(336 passed, 3 live-PostgreSQL checks skipped because no local server was
available). `npm run deploy:check` passed, including all seven green probes and
the red-probe check. A production build with runtime auth secrets blank generated
46/46 pages. The production preview returned HTTP 200 for `/`, `/api/health`, and
`/login`; anonymous `/admin` was refused with HTTP 401. GitHub CI verification is
pending. PR #4 remains open and unmerged for the user's preview review.
