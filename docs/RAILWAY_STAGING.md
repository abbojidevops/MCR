# MCR — Railway Staging Deployment Guide

This guide covers deploying **MCR** to **Railway** as a staging environment, verifying
it after the deploy, and rolling back. It is the reference for `railway.json` and the
`npm run staging:preflight` / `npm run staging:smoke` verification pair.

---

## 1. Staging Topology

```text
GitHub (main) ──push──▶ Railway Service "mcr-saas-app"
                             │  builder: DOCKERFILE (repository ./Dockerfile)
                             │
                             ├─ preDeployCommand: node scripts/db-init.mjs
                             │     • validates src/db/schema.sql syntax
                             │     • refuses burned/default DATABASE_URL passwords
                             │     • applies schema (idempotent, single transaction)
                             │
                             ├─ startCommand: npm start   (next start, NODE_ENV=production)
                             │
                             └─ healthcheckPath: /api/health  (timeout 30s, ON_FAILURE restarts)

Railway Managed PostgreSQL 16 ──DATABASE_URL──▶ injected into the service at runtime
```

Key properties:

* The container image contains **no secrets**; every credential is injected by Railway at runtime.
* The schema is applied by the **pre-deploy command**, not by the platform. A deploy that
  skips it would boot against an empty database, so the staging pre-flight fails loudly if
  `scripts/db-init.mjs` is missing from the deploy config.
* Railway injects its own `PORT`; the Dockerfile's `ENV PORT=3000` is only a local default.
  The container binds `0.0.0.0` and the image healthcheck probes `${PORT}`.
* `railway.json` pins `build.builder = DOCKERFILE` so Railway never auto-detects a
  different build than docker-compose / Render.

---

## 2. Provisioning (one-time)

1. **Create the project** in the Railway dashboard: *New Project → Deploy from GitHub repo*
   and select the MCR repository.
2. **Add managed PostgreSQL**: *New → Database → Add PostgreSQL*. Keep the default
   **PostgreSQL 16** major version. Railway creates a service (commonly named `Postgres`).
3. **Confirm the service config**: Railway reads `railway.json` from the repository root
   automatically (`Dockerfile` builder, pre-deploy schema init, `npm start`, healthcheck
   `/api/health`, `ON_FAILURE` restarts with 5 retries).
4. **Point the service at the database** by setting `DATABASE_URL` as a reference to the
   Postgres service (Railway variable-reference syntax — the service name must match yours):

   ```text
   DATABASE_URL = ${{Postgres.DATABASE_URL}}
   ```

   Railway's generated Postgres password is high-entropy, so it passes MCR's
   burned-password validator. Never hand-write a weak password here.

---

## 3. Environment Variables (Railway → Service → Variables)

### Required

| Variable | Value / How to generate | Enforced by |
| :--- | :--- | :--- |
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (reference) | `scripts/db-init.mjs` fails the deploy if unset in production |
| `ADMIN_PASSWORD` | `openssl rand -base64 24` — must be ≥ 12 chars with upper, lower **and** numeric characters | pre-flight error; `/admin` returns 503 when unset |
| `SESSION_SECRET` | `openssl rand -hex 32` — at least 32 random bytes (256 bits). Length alone is not accepted: a long but patterned value is rejected | pre-flight error; signs session cookies |
| `NEXT_PUBLIC_APP_URL` | The staging domain, e.g. `https://mcr-saas-app-staging.up.railway.app` | pre-flight warning when absent/relative |

### Staging telephony (simulation)

| Variable | Value |
| :--- | :--- |
| `TWILIO_MOCK_MODE` | `true` for staging (no carrier spend, full end-to-end simulation) |
| `TWILIO_ACCOUNT_SID` / `TWILIO_AUTH_TOKEN` / `TWILIO_PHONE_NUMBER` | Leave blank while in mock mode; set only when staging is pointed at a real Twilio number |
| `CARRIER_WEBHOOK_SECRET` | `openssl rand -hex 32` — A2P 10DLC callbacks fail closed (503) without it |

### Optional

| Variable | Purpose |
| :--- | :--- |
| `STRIPE_SECRET_KEY` / `STRIPE_WEBHOOK_SECRET` / `STRIPE_PRICE_*` | Only needed to exercise live billing |
| `CLOUDFLARE_TUNNEL_SECRET` | When staging is fronted by a Cloudflare Zero-Trust tunnel |
| `ALERT_WEBHOOK_URL` / `ADMIN_NOTIFICATION_EMAIL` | Owner/operator alerting |
| `NEXT_PUBLIC_STRIPE_LIVE` / `NEXT_PUBLIC_TWILIO_LIVE` / `NEXT_PUBLIC_POSTGRES_LIVE` | Launch-gate live-state overrides used by `/admin/launch-gate` |

**Do not set** `PORT` manually (Railway injects it) and **do not** set `NODE_ENV`
(the image already runs `NODE_ENV=production`).

---

### Staging data persistence (read this before you expect data to survive)

| Behaviour | Detail |
| :--- | :--- |
| **Schema on a fresh database** | The pre-deploy step creates all **36 tables**. A newly provisioned managed PostgreSQL contains **no rows**: the seeded demo tenants live in the file store that ships inside the image, not in SQL. |
| **Reads** | Tenant reads are served from the in-memory/file store (`data/mcr_db.json`), not from SQL. |
| **Writes** | Account creates/deletes are dual-persisted to PostgreSQL *in addition to* the file store. Operator `/api/health` exposes the truth under `checks.database.persistence` (`configured`, `poolAvailable`, `lastPersistError`). |
| **Container filesystem** | Ephemeral. Without a volume, staging tenant data created through the UI is lost on the next deploy/restart and the image re-seeds itself. |

**Required for staging:** attach a Railway volume mounted at `/app/data`
(service → *Settings → Volumes*) that is **writable by UID 1001** — the image runs as the
non-root `nextjs` user. Note that a volume mount supplies its own ownership, so the image's
`chown -R nextjs:nodejs /app` does **not** apply to the mounted path.

Verify it from inside the deployment (Railway → service → ⋯ → *Shell*, or
`railway run npm run staging:requirements`):

```bash
npm run staging:requirements     # reports the volume requirement as PASS/FAIL with the fix
id -u                            # should print 1001; the mount must accept writes from it
```

The pre-deploy step (`db-init.mjs`) also probes the directory and prints
`✓ Data directory /app/data is writable (uid 1001)`. If it is not writable it warns loudly
(and fails the deploy when `MCR_REQUIRE_PERSISTENT_DATA=true`). At runtime, a non-writable
mount makes the app log `Failed to write repository file` /
`Repository file storage fallback to in-memory` and continue from memory — no crash, but no
durable state either, and tenant data is lost on the next redeploy. An empty volume is safe:
the repository re-seeds `data/mcr_db.json` on first boot.
Escape hatch for deliberate ephemeral runs: `MCR_SKIP_DATA_DIR_CHECK=true`.

> **Known limitation / follow-up:** the durable fix is to make the repository's read path
> PostgreSQL-backed rather than file-backed, so the volume becomes unnecessary and SQL is the
> single source of truth. Until then, treat PostgreSQL on staging as the migration target and
> audit trail, and keep the volume attached.

---

## 3a. The Staging Requirement Set (enforced by `staging:requirements`)

| # | Requirement | Enforced by | Failure behaviour |
| :-- | :--- | :--- | :--- |
| 1 | PostgreSQL **16** | `staging:requirements` queries `server_version` | FAIL naming the detected major version |
| 2 | `DATABASE_URL=${{Postgres.DATABASE_URL}}` | requirements + pre-flight | FAIL if unset; WARN if an unresolved placeholder |
| 3 | `ADMIN_PASSWORD` ≥ 12 chars with upper, lower **and** digit | pre-flight + requirements + `/admin` 503 boundary | FAIL; the admin boundary returns 503 when unset |
| 4 | `SESSION_SECRET` ≥ 32 random bytes (256 bits) | pre-flight + requirements (length **and** entropy) | FAIL with the `openssl rand -hex 32` hint |
| 5 | `NEXT_PUBLIC_APP_URL` = final HTTPS Railway domain | requirements + pre-flight (WARN) | FAIL when absent, localhost or non-HTTPS |
| 6 | `TWILIO_MOCK_MODE=true`, live processing off | requirements (`findLiveProcessingSwitches`) | FAIL, listing each switch that would enable live processing |
| 7 | Volume mounted at `/app/data`, writable by UID 1001 | `db-init.mjs` probe + requirements live check | loud warning at pre-deploy; FAIL in the requirements report |
| 8 | Schema applied by the pre-deploy step | requirements checks the 8 core tables | FAIL if the schema step did not run |

Run it with the staging values exported (`npm run staging:requirements`) or in the deployed
container's shell. It prints PASS/WARN/FAIL per requirement plus the numbered Railway
dashboard steps, and never prints secret values.

---

## 4. Pre-Deploy Verification (run locally before pushing)

```bash
# 0. Requirements verifier: codifies the 7 staging requirements below, including
#    LIVE checks (PostgreSQL major version, schema presence, volume writability)
#    and prints the dashboard-only steps. Run it after setting the staging values:
npm run staging:requirements

# 1. Full unit/integration suite, type-check, hygiene invariance and security probes
npm run lint
npm test
npm run deploy:check

# 2. Staging topology + secret-strength pre-flight (same checks Railway will exercise)
ADMIN_PASSWORD='<staging admin password>' \
SESSION_SECRET='<staging session secret>' \
DATABASE_URL='${{Postgres.DATABASE_URL}} equivalent, e.g. postgresql://u:p@host:5432/mcr_db' \
NEXT_PUBLIC_APP_URL='https://<your-staging-domain>' \
TWILIO_MOCK_MODE=true \
npm run staging:preflight
```

Expected result: `✅ READY FOR DEPLOYMENT` with 0 errors. Warnings about mock telephony are
expected for staging.

---

## 5. Deploy & Verify

1. Push to the branch Railway tracks (staging should track `main` or an explicit staging branch).
2. In the Railway deploy logs, confirm the pre-deploy phase ran:
   * `[db-init] Validating schema SQL syntax...`
   * `✓ Schema SQL syntax validated.`
   * `✓ PostgreSQL schema initialized successfully.`
3. Confirm the deployment went live: Railway reports the service as **Active** after
   `/api/health` returns `200`.
4. Run the post-deploy smoke verifier against the staging URL. Add `--wait` when you run
   it straight after a deploy: it polls `/api/health` (up to 120s by default, or
   `--wait=SECONDS`) until the container is serving, then runs every check, so a
   still-booting service is not reported as a broken one.

   ```bash
   npm run staging:smoke -- https://<your-staging-domain> --wait
   ```

   Without `--wait` the verifier fails fast on a single attempt (useful for monitoring an
   already-running service); `STAGING_SMOKE_WAIT_SECONDS=<n>` sets the window without a flag.

   If you would rather not run it from a local checkout, use the
   **Staging Smoke Verification** workflow (*Actions → Staging Smoke Verification → Run workflow*)
   and pass the staging URL. It runs the same command on a GitHub-hosted runner, records the
   result in the repository, needs no secrets, and never enables live processing. The workflow is
   manual-only by design, so it cannot run on push or on a schedule.

   It proves, against the live staging service:

   * `/api/health` returns the minimal `{status, timestamp, version}` payload (no posture leakage)
   * the application itself serves the baseline security headers (`X-Frame-Options: DENY`,
     `X-Content-Type-Options: nosniff`, 1-year HSTS) without relying on an edge provider
   * anonymous `/dashboard` traffic is redirected to `/login`
   * the operator boundary (`/api/admin/fleet`) is refused fail-closed (401, or 503 when
     `ADMIN_PASSWORD` is missing)

   Result should read `✅ STAGING SERVICE VERIFIED` with 0 errors.

5. Optional deeper check: sign in at `/login` with a seeded fixture account and walk the
   dashboard, inbox, and test-mode simulator.

---

## 6. Rollback

1. Railway → service → **Deployments** → select the last known-good deployment → **Redeploy**.
2. Schema changes are applied with `CREATE TABLE IF NOT EXISTS` / idempotent statements, so
   rollback does not require a down-migration for additive changes.
3. If a bad deploy corrupted data, restore PostgreSQL from the Railway database backup
   (Railway → Postgres service → **Backups**) before rolling the app back.

---

## 7. Live Processing Is Off on Staging (By Design)

Staging runs with `TWILIO_MOCK_MODE=true` and **no** Stripe credentials. Both webhook
families fail closed, so no real carrier or billing event can be processed until the
credentials below are added deliberately:

| Endpoint | Without live credentials |
| :--- | :--- |
| `POST /api/webhooks/stripe` | **503** — processing disabled; forged/unsigned payloads cannot mutate subscription state |
| `POST /api/webhooks/twilio/voice` / `.../sms` | **503** — no `TWILIO_AUTH_TOKEN` configured |
| `POST /api/compliance` (carrier callbacks) | **503** — no `CARRIER_WEBHOOK_SECRET` configured |

To enable live processing later: set `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`,
`TWILIO_PHONE_NUMBER` and `TWILIO_MOCK_MODE=false` for telephony; set
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` and `NEXT_PUBLIC_STRIPE_LIVE=true` for
billing. Signature verification switches itself on with those values — there is no
separate toggle to remember.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
| :--- | :--- | :--- |
| Deploy fails with `FATAL: DATABASE_URL is required in production deployment` | `DATABASE_URL` not set on the service | Add the `${{Postgres.DATABASE_URL}}` reference |
| Deploy fails with `Refusing to start with burned or default database password` | A weak/known password is in `DATABASE_URL` or `POSTGRES_PASSWORD` | Rotate to the Railway-generated password; never use `mcr_password`, `postgres`, `root`, etc. |
| Deploy fails with `Database execution failed: permission denied to create extension` | Custom schema change reintroduced an extension-backed object | MCR's schema must not depend on extensions; use core `gen_random_uuid()` if UUIDs are ever needed |
| Healthcheck never goes green (502/`Application failed to respond`) | The server bound to `127.0.0.1` or a hardcoded port | Keep `HOSTNAME=0.0.0.0` and let Railway inject `PORT` (already configured in the image) |
| `/admin` returns `503 Service Unavailable` | `ADMIN_PASSWORD` missing on the service | Set `ADMIN_PASSWORD` (≥ 12 chars, upper + lower + digit) |
| `/api/webhooks/*` returns `503` for carrier callbacks | `CARRIER_WEBHOOK_SECRET` not configured | Set a 32-byte hex secret; the endpoint fails closed by design |
| Every tenant query fails right after a deploy | Schema was never applied (pre-deploy command removed) | Restore `deploy.preDeployCommand` in `railway.json`; `npm run staging:preflight` blocks this case |
| Tenant created through onboarding disappears after a redeploy | Ephemeral container filesystem; staging has no volume and reads are file-backed | Attach a volume at `/app/data` (writable by uid 1001), or move development work to a database-backed read path |
| Operator `/api/health` shows `storageEngine: postgresql` but the SQL `accounts` table stays empty | Dual-persistence writes failing silently (historically: the production bundle could not resolve `require('./postgres')` named exports, so the write no-opped while the API returned 200) | Fixed by static imports in `src/db/repository.ts`; `checks.database.persistence.lastPersistError` and the `PG-5` test now surface any regression |

---

## 9. References

* [`railway.json`](../railway.json) — Railway config-as-code for this repository
* [`scripts/staging-preflight.ts`](../scripts/staging-preflight.ts) — topology & secret pre-flight
* [`scripts/staging-smoke.ts`](../scripts/staging-smoke.ts) — post-deploy smoke verifier
* [`RUNBOOK.md`](../RUNBOOK.md) — production operations, telephony and compliance runbook
