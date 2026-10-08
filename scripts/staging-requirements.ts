/**
 * MCR — Railway Staging Requirements Verifier
 *
 * Codifies the exact requirements a Railway staging deployment must satisfy, so
 * "is staging configured correctly?" is an executable question instead of a
 * checklist someone has to remember. Complements the two neighbouring tools:
 *
 *   staging:preflight  — repo topology + secret strength (run before pushing)
 *   staging:requirements — this: the 7 staging requirements, including LIVE checks
 *                          against the provisioned database and the mounted volume
 *   staging:smoke      — HTTP behaviour of the deployed service
 *
 *   npm run staging:requirements
 *
 * Live checks (database version, schema presence, volume writability) run when the
 * corresponding inputs are available; each result is reported as PASS / WARN /
 * FAIL with the action required, and the dashboard-only steps are printed at the
 * end. It never prints secret values.
 */
import fs from 'fs';
import path from 'path';
import { isIPv4 } from 'net';
import { Client } from 'pg';
import {
  validateAdminPassword,
  validateSessionSecret,
  validatePublicAppUrl,
  findLiveProcessingSwitches,
  SESSION_SECRET_MIN_BYTES,
} from '../src/lib/security/secret-strength';
import { runStagingPreflight } from './staging-preflight';
import { resolveDataDirectory } from './db-init.mjs';

export type RequirementStatus = 'pass' | 'warn' | 'fail';

export interface RequirementResult {
  id: string;
  requirement: string;
  status: RequirementStatus;
  detail: string;
}

export interface StagingRequirementsReport {
  ok: boolean;
  results: RequirementResult[];
  manualSteps: string[];
  errors: string[];
}

export interface StagingRequirementsOptions {
  /** Skip live database/volume checks (repo-only verification). */
  skipLiveChecks?: boolean;
  /** Override the directory treated as the persistent data mount. */
  dataDir?: string;
  /** Connection timeout for the live database checks (ms). */
  dbTimeoutMs?: number;
}

const REQUIRED_PG_MAJOR = 16;

const REQUIRED_TABLES = [
  'accounts',
  'business_profiles',
  'user_credentials',
  'compliance_registrations',
  'jobs',
  'conversations',
  'call_records',
  'consent_logs',
];

/** Parses the major version out of a PostgreSQL version string. */
export function parsePostgresMajorVersion(versionString: string): number | null {
  const match = (versionString || '').match(/(\d+)(?:\.\d+)?/);
  if (!match) return null;
  const major = Number(match[1]);
  return Number.isFinite(major) ? major : null;
}

/** Extracts the hostname from a DATABASE_URL without throwing on malformed input. */
export function databaseHostname(databaseUrl?: string): string | null {
  if (!databaseUrl) return null;
  try {
    return new URL(databaseUrl).hostname || null;
  } catch {
    return null;
  }
}

async function checkDatabase(
  env: Record<string, string | undefined>,
  options: StagingRequirementsOptions
): Promise<RequirementResult[]> {
  const results: RequirementResult[] = [];
  const databaseUrl = env.DATABASE_URL;

  if (!databaseUrl) {
    results.push({
      id: 'postgres-16',
      requirement: 'PostgreSQL 16 provisioned',
      status: 'warn',
      detail:
        'DATABASE_URL is not set in this shell, so the server version cannot be verified. In Railway: New → Database → Add PostgreSQL (keep major version 16).',
    });
    results.push({
      id: 'schema-initialized',
      requirement: 'Schema applied (pre-deploy ran db-init)',
      status: 'warn',
      detail:
        'Cannot verify without a reachable DATABASE_URL. Railway runs `node scripts/db-init.mjs` as the pre-deploy step.',
    });
    return results;
  }

  const client = new Client({
    connectionString: databaseUrl,
    connectionTimeoutMillis: options.dbTimeoutMs ?? 5000,
  });

  try {
    await client.connect();
  } catch (err: any) {
    results.push({
      id: 'postgres-16',
      requirement: 'PostgreSQL 16 provisioned',
      status: 'fail',
      detail: `DATABASE_URL is set but the database is unreachable: ${err?.message}`,
    });
    results.push({
      id: 'schema-initialized',
      requirement: 'Schema applied (pre-deploy ran db-init)',
      status: 'fail',
      detail: 'Cannot verify schema: database unreachable',
    });
    return results;
  }

  try {
    const versionResult = await client.query('SHOW server_version;');
    const versionString = versionResult.rows?.[0]?.server_version ?? '';
    const major = parsePostgresMajorVersion(versionString);

    if (major === REQUIRED_PG_MAJOR) {
      results.push({
        id: 'postgres-16',
        requirement: 'PostgreSQL 16 provisioned',
        status: 'pass',
        detail: `Server reports PostgreSQL ${versionString}`,
      });
    } else if (major === null) {
      results.push({
        id: 'postgres-16',
        requirement: 'PostgreSQL 16 provisioned',
        status: 'warn',
        detail: `Could not parse the server version ("${versionString}")`,
      });
    } else {
      results.push({
        id: 'postgres-16',
        requirement: 'PostgreSQL 16 provisioned',
        status: 'fail',
        detail: `Server reports PostgreSQL ${versionString}; staging requires major version ${REQUIRED_PG_MAJOR}`,
      });
    }

    // Schema presence: proves the pre-deploy step actually applied the schema.
    const tableResult = await client.query(
      `SELECT table_name FROM information_schema.tables WHERE table_schema = 'public';`
    );
    const present = new Set(
      (tableResult.rows || []).map((r: any) => String(r.table_name).toLowerCase())
    );
    const missing = REQUIRED_TABLES.filter((t) => !present.has(t));

    if (missing.length === 0) {
      results.push({
        id: 'schema-initialized',
        requirement: 'Schema applied (pre-deploy ran db-init)',
        status: 'pass',
        detail: `All ${REQUIRED_TABLES.length} core tables present (${present.size} tables total) — "PostgreSQL schema initialized successfully"`,
      });
    } else {
      results.push({
        id: 'schema-initialized',
        requirement: 'Schema applied (pre-deploy ran db-init)',
        status: 'fail',
        detail: `Missing tables: ${missing.join(', ')} — the pre-deploy schema step did not complete`,
      });
    }
  } catch (err: any) {
    results.push({
      id: 'schema-initialized',
      requirement: 'Schema applied (pre-deploy ran db-init)',
      status: 'fail',
      detail: `Schema inspection failed: ${err?.message}`,
    });
  } finally {
    await client.end().catch(() => {});
  }

  return results;
}

function checkVolume(options: StagingRequirementsOptions): RequirementResult {
  const dir = options.dataDir || resolveDataDirectory();
  const uid = typeof process.getuid === 'function' ? process.getuid() : null;

  try {
    fs.mkdirSync(dir, { recursive: true });
    const probe = path.join(dir, `.mcr-write-probe-${process.pid}`);
    fs.writeFileSync(probe, 'ok', 'utf-8');
    fs.unlinkSync(probe);

    const uidDetail = uid === null ? 'current process' : `uid ${uid}`;
    const uidNote =
      uid !== null && uid !== 1001
        ? ' (note: the container runs as UID 1001 — a result recorded from outside the container does not prove the mount is writable there)'
        : '';

    return {
      id: 'volume',
      requirement: 'Persistent volume at /app/data writable by UID 1001',
      status: 'pass',
      detail: `${dir} is writable by ${uidDetail}${uidNote}`,
    };
  } catch (err: any) {
    return {
      id: 'volume',
      requirement: 'Persistent volume at /app/data writable by UID 1001',
      status: 'fail',
      detail:
        `${dir} is NOT writable (${err?.message}). Attach a Railway volume mounted at ${dir} and ensure it is ` +
        'writable by UID 1001; a volume mount supplies its own ownership, so the image chown does not apply to it.',
    };
  }
}

/**
 * Evaluates every staging requirement against the supplied environment.
 * Never includes secret values in its output.
 */
export async function runStagingRequirements(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
  options: StagingRequirementsOptions = {}
): Promise<StagingRequirementsReport> {
  const results: RequirementResult[] = [];

  // 1. Secrets: ADMIN_PASSWORD policy
  const admin = validateAdminPassword(env.ADMIN_PASSWORD);
  results.push({
    id: 'admin-password',
    requirement: 'ADMIN_PASSWORD ≥ 12 chars with upper, lower and digit',
    status: admin.ok ? 'pass' : 'fail',
    detail: admin.ok
      ? 'Satisfies the configured policy (value not printed)'
      : admin.errors.join('; '),
  });

  // 2. Secrets: SESSION_SECRET entropy (>= 32 bytes / 256 bits)
  const session = validateSessionSecret(env.SESSION_SECRET);
  results.push({
    id: 'session-secret',
    requirement: `SESSION_SECRET with ≥ ${SESSION_SECRET_MIN_BYTES} random bytes of entropy`,
    status: session.ok ? 'pass' : 'fail',
    detail: session.ok
      ? `~${Math.round(session.bits)} bits of entropy over ${session.chars} characters (e.g. \`openssl rand -hex 32\`)`
      : session.error || 'SESSION_SECRET is not strong enough',
  });

  // 3. Public URL must be the final HTTPS staging domain
  const appUrl = validatePublicAppUrl(env.NEXT_PUBLIC_APP_URL);
  results.push({
    id: 'app-url',
    requirement: 'NEXT_PUBLIC_APP_URL set to the final Railway HTTPS domain',
    status: appUrl.ok ? 'pass' : 'fail',
    detail: appUrl.ok ? env.NEXT_PUBLIC_APP_URL || '' : appUrl.error || 'invalid URL',
  });

  // 4. DATABASE_URL wiring (Railway reference variable)
  const dbUrl = env.DATABASE_URL;
  if (!dbUrl) {
    results.push({
      id: 'database-url',
      requirement: 'DATABASE_URL=${{Postgres.DATABASE_URL}}',
      status: 'fail',
      detail:
        'DATABASE_URL is not set. In Railway, add the variable DATABASE_URL with the reference value ${{Postgres.DATABASE_URL}} (the name must match your PostgreSQL service).',
    });
  } else {
    const host = databaseHostname(dbUrl);
    const isInternal = Boolean(host && /\.railway\.internal$/i.test(host));
    const looksPlaceholder = /\$\{\{|\$\(|<[^>]+>/.test(dbUrl);
    results.push({
      id: 'database-url',
      requirement: 'DATABASE_URL=${{Postgres.DATABASE_URL}}',
      status: looksPlaceholder ? 'warn' : 'pass',
      detail: looksPlaceholder
        ? 'DATABASE_URL still contains a template placeholder; resolve it before deploying'
        : isInternal
          ? 'Points at the Railway private network host (.railway.internal)'
          : `Set and pointing at host "${host}" (value not printed)`,
    });
  }

  // 5. Live third-party processing must stay disabled
  const liveSwitches = findLiveProcessingSwitches(env);
  results.push({
    id: 'live-processing-off',
    requirement: 'Live Twilio, Stripe and carrier processing disabled',
    status: liveSwitches.length === 0 ? 'pass' : 'fail',
    detail:
      liveSwitches.length === 0
        ? 'TWILIO_MOCK_MODE=true and no live Twilio/Stripe/carrier credentials configured'
        : `Live processing would be enabled by: ${liveSwitches.join(', ')}`,
  });

  // 6. Repo topology (deploy path, manifests, app-level hardening)
  const preflight = runStagingPreflight(env as Record<string, string>);
  results.push({
    id: 'repo-topology',
    requirement: 'Repo deploy path verified (Dockerfile builder, db-init pre-deploy, /api/health)',
    status: preflight.ok ? 'pass' : 'fail',
    detail: preflight.ok
      ? `${preflight.passedChecks.length} pre-flight checks passed`
      : preflight.errors.join('; '),
  });

  // 7/8. Live checks: PostgreSQL version, schema presence, volume writability
  if (options.skipLiveChecks) {
    results.push({
      id: 'live-checks',
      requirement: 'Live database and volume checks',
      status: 'warn',
      detail: 'Skipped by request (--skip-live)',
    });
  } else {
    results.push(...(await checkDatabase(env, options)));
    results.push(checkVolume(options));
  }

  const errors = results.filter((r) => r.status === 'fail').map((r) => `${r.id}: ${r.detail}`);

  const manualSteps = [
    'Railway → New Project → Deploy from GitHub repo (select this repository); let it read railway.json.',
    `Railway → New → Database → Add PostgreSQL, keeping major version ${REQUIRED_PG_MAJOR}.`,
    'Railway → service → Variables → DATABASE_URL = ${{Postgres.DATABASE_URL}} (use your database service name).',
    'Railway → service → Variables → ADMIN_PASSWORD (≥12 chars, upper + lower + digit).',
    'Railway → service → Variables → SESSION_SECRET = output of `openssl rand -hex 32` (≥32 random bytes).',
    'Railway → service → Variables → NEXT_PUBLIC_APP_URL = the final https://<service>.up.railway.app domain.',
    'Railway → service → Variables → TWILIO_MOCK_MODE=true. Leave STRIPE_*, TWILIO_AUTH_TOKEN and CARRIER_WEBHOOK_SECRET unset so live processing stays off.',
    'Railway → service → Settings → Volumes → attach a volume mounted at /app/data that is writable by UID 1001.',
    'Do not set PORT or NODE_ENV on the service: the image already runs NODE_ENV=production and Railway injects PORT.',
    'Confirm the deploy log shows "PostgreSQL schema initialized successfully."',
    'Actions → Staging Smoke Verification → Run workflow with the deployed URL.',
  ];

  return { ok: errors.length === 0, results, manualSteps, errors };
}

// Direct CLI Execution
if (process.argv[1] && process.argv[1].endsWith('staging-requirements.ts')) {
  const skipLive = process.argv.includes('--skip-live');

  console.log('\n🧭 [MCR] Verifying Railway staging requirements...\n');

  runStagingRequirements(process.env as Record<string, string | undefined>, {
    skipLiveChecks: skipLive,
  }).then((report) => {
    const icon: Record<RequirementStatus, string> = { pass: '✅', warn: '⚠️ ', fail: '❌' };
    for (const r of report.results) {
      console.log(`  ${icon[r.status]} [${r.status.toUpperCase()}] ${r.requirement}`);
      console.log(`       ${r.detail}`);
    }

    console.log('\n  ── Manual Railway dashboard steps ──');
    report.manualSteps.forEach((step, i) => console.log(`   ${i + 1}. ${step}`));

    const failures = report.results.filter((r) => r.status === 'fail').length;
    const warnings = report.results.filter((r) => r.status === 'warn').length;

    console.log(
      `\nRequirements Result: ${
        report.ok ? '✅ ALL REQUIREMENTS SATISFIED' : '❌ REQUIREMENTS NOT MET'
      }`
    );
    console.log(
      `Passed: ${report.results.filter((r) => r.status === 'pass').length} | Warnings: ${warnings} | Failures: ${failures}\n`
    );

    if (!report.ok) {
      process.exit(1);
    }
  });
}
