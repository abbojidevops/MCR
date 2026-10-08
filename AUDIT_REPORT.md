# MCR — Authenticated Dashboard QA & Improvement Report

**Branch:** `arena/e10e84e6-mcr` (commit `0a1528d`)
**Date:** 2026-10-08
**Live preview:** production build of this branch, `next start -p 3100`
**Status:** committed and pushed. **No PR opened, nothing merged** — the branch is
yours to review in the live preview first.

---

## 1. What was done

Every authenticated route was walked end to end against a running production
build (`npx next start`), with real tenant sessions (Apex owner, CoolBreeze
owner, platform operator) rather than mocked data. The audit then produced fixes,
which were re-verified live.

| | |
|---|---|
| Routes audited | 15 (8 tenant dashboard, 5 operator console, login surfaces, marketing/legal cross-checks) |
| Files changed | 33 (+2 976 / −941) |
| New files | 8 |
| Regression tests added | 26 (`tests/audit-fixes.test.ts`) |
| `npx tsc --noEmit` | clean |
| `npm run build` | clean (48/48 pages) |
| `npm test` | **271 / 274 pass** — see §7 for the 3 pre-existing failures |

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

### Known remaining gaps (not fixed — out of scope or needs a product decision)

- Focus is not trapped inside modals and is not restored to the trigger on close.
- No skip-to-content link.
- Colour contrast on the dark operator console (`slate-950` / `slate-400`) was
  not measured.
- `/admin` still renders both the new shell nav *and* its original emoji link
  row — redundant but harmless.
- `dashboard-readability` and other existing suites were not extended for the
  new surfaces beyond the honesty checks in §7.

---

## 7. Test results

```
npx tsc --noEmit   → clean
npm run build      → clean, 48/48 pages generated
npm test           → 271 / 274 pass
```

### The 3 failures are a pre-existing environmental baseline, not a regression

| Test | Reason |
|---|---|
| `PG-2: Live Database Engine Connectivity & Schema Structure` | requires PostgreSQL at `127.0.0.1:5433` |
| `PG-3: Dual-Persistence Operations & Cascade Lifecycle` | idem |
| `PG-5: Application Dual-Persistence Writes Actually Reach PostgreSQL` | idem |

This sandbox has no `postgres`, `psql`, `pg_ctl`, `initdb` or `docker` binary and
no `/usr/lib/postgresql`. These three suites cannot run here and failed before
any of my changes. Run them against the docker-compose stack to confirm.

### New regression suite — `tests/audit-fixes.test.ts` (26 cases, all passing)

| Group | Covers |
|---|---|
| `SET-1…6` | Privileged fields never tenant-editable; partition behaviour; non-object payloads; **live PATCH mass-assignment returns 400 and mutates nothing**; allow-listed field succeeds; `forwarding_configured` stays writable |
| `DEMO-1…6` | Production with no flag withholds credentials; explicit flag and staging-named envs expose them; local dev exposes them; falsy values do not unlock; the login form embeds no literal credentials |
| `OPS-1…4` | `/admin/login` rewrite; anonymous HTML redirect carries `?next=` and API callers keep 401; operator-login posts to the admin API and handles 503/429; every admin surface offers sign-out |
| `HON-1…10` | Dead settings controls gone; real billing field names; every catch sets an error toast; jobs timeline is timestamp-derived and asserts no fabricated events; dedupe copy matches the enforced window; forwarding labelled self-reported; carrier matrix has no fabricated benchmarks; concierge has no fake dispatch; billing discloses gateway state; risk counts are derived |

Wired into the `npm test` glob and available as `npm run test:audit`.

> The suite sets `NODE_ENV=test`, so `db.saveToFile()` short-circuits and the
> tests never write to `data/mcr_db.json`.

---

## 8. Persistence findings you should know about

- `db.saveToFile()` writes `data/mcr_db.json` on every mutation and
  `loadFromFile()` restores on boot — file persistence works.
- **PostgreSQL dual-persistence only covers `accounts`.**
  `src/db/repository.ts` dual-writes only in `createAccount` (INSERT … ON
  CONFLICT) and `deleteAccount` (DELETE). `src/db/postgres.ts` contains **no
  `business_profiles` SQL at all**, and `src/db/schema.sql`'s
  `business_profiles` table already lacks `custom_emergency_keywords`,
  `crm_webhook_url` and `average_ticket`, which the app already persists
  file-only.
  **Consequence:** any new optional `BusinessProfile` field is safe to add
  (file-only), but do not assume a profile change reaches PostgreSQL. This is
  why the dead intake toggles were removed rather than persisted — wiring them
  up would have been a lie.
- `getPostgresPersistenceStatus` does **not** exist in `src/db/postgres.ts`; the
  health route uses a different helper. Re-verify before touching it.

---

## 9. Live preview

The production build of this branch is running on port **3100**.

| Surface | URL | Session |
|---|---|---|
| Tenant sign-in | `/login` | demo credentials shown (this env sets `DEMO_MODE=true`) |
| Operator sign-in | `/operator-login` | `ADMIN_PASSWORD` from `.env.local` |
| Dashboard | `/dashboard` | Apex owner |
| Settings | `/dashboard/settings` | check Hours, Intake, TCPA, Billing tabs |
| Billing | `/dashboard/billing` | 68 / 200 calls, live-payments notice |
| Jobs | `/dashboard/jobs` | activity timeline, dialog a11y, CSV export |
| Carrier forwarding | `/dashboard/forwarding` | "Self-Reported" badge |
| Operator console | `/admin` | fleet overview, then Carrier Matrix / Concierge / Risks |

`.env.local` is gitignored and was **not** committed. It must exist for the
preview to run; see `.env.example` for the variable matrix. `NODE_ENV=development`
was removed from it so the build runs in production mode.

---

## 10. Recommended follow-ups (not done)

1. **Pick one support address.** `COMPANY_INFO.email` (`support@getmcr.com`) now
   wins everywhere except the privacy policy's `privacy@mcr-recovery.com`.
   Confirm which domain is real and align the privacy policy.
2. **Decide the demo-credentials policy for production.** Either set
   `MCR_DEMO_MODE=true` on staging, or accept that staging sign-in needs real
   seeded credentials.
3. **PostgreSQL profile persistence.** Either add `business_profiles` SQL and the
   missing columns, or document in the UI that profile settings are file-backed
   only.
4. **Modal focus management** — trap focus and restore it on close.
5. **Colour-contrast audit** of the operator console.
6. **Business-hours storage**, if day-of-week routing is actually wanted: the
   `business_hours` table exists in `src/db/schema.sql:94` but has no repository
   method and no consumer.
