/**
 * MCR — Staging Post-Deploy Smoke Verifier
 *
 * Run this immediately after a Railway staging deploy goes live. It proves the
 * deployed service is actually reachable and behaving, which a green build log or
 * a passing /api/health probe alone does not:
 *
 *   1. Public health payload is minimal and leaks no internal posture.
 *   2. Baseline security headers are served by the application itself (so the
 *      Railway container is protected even without a Vercel/Cloudflare edge).
 *   3. The /dashboard auth boundary redirects anonymous visitors to /login.
 *   4. The /admin operator boundary is fail-closed (401 unauthorized, or 503 when
 *      ADMIN_PASSWORD is not configured).
 *
 * Usage:
 *   npm run staging:smoke -- https://mcr-staging.up.railway.app
 *   npm run staging:smoke -- https://mcr-staging.up.railway.app --wait        # poll up to 120s for readiness
 *   npm run staging:smoke -- https://mcr-staging.up.railway.app --wait=300    # custom window
 *   STAGING_BASE_URL=https://mcr-staging.up.railway.app npm run staging:smoke
 */
import { fileURLToPath } from 'url';

export interface SmokeCheckResult {
  ok: boolean;
  passedChecks: string[];
  warnings: string[];
  errors: string[];
}

export interface SmokeCheckOptions {
  /**
   * Seconds to poll /api/health for readiness before running the checks.
   * 0/undefined keeps the previous behaviour (single attempt, fail fast).
   * Useful right after a deploy, when the container may still be starting.
   */
  waitSeconds?: number;
  /** Delay between readiness polls (default 5000ms). */
  pollIntervalMs?: number;
  /** Injectable sleep so the polling logic is unit testable without real delays. */
  sleepImpl?: (ms: number) => Promise<void>;
  /** Optional progress sink (defaults to stdout when running from the CLI). */
  onProgress?: (message: string) => void;
}

export interface StagingReadinessResult {
  ready: boolean;
  attempts: number;
  lastStatus?: number;
  lastError?: string;
}

export type FetchLike = (input: string, init?: any) => Promise<Response>;

const REQUEST_TIMEOUT_MS = 10000;
const DEFAULT_WAIT_SECONDS = 120;
const DEFAULT_POLL_INTERVAL_MS = 5000;

function normalizeBaseUrl(rawUrl: string): { url?: string; error?: string } {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { error: 'No staging base URL provided (pass a URL argument or set STAGING_BASE_URL)' };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return { error: `Staging base URL must be absolute and start with http:// or https:// (received "${trimmed}")` };
  }
  return { url: trimmed.replace(/\/+$/, '') };
}

async function safeFetch(fetchImpl: FetchLike, url: string, init: any = {}) {
  return fetchImpl(url, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) });
}

/**
 * Polls /api/health until the deployed service answers 200 (the same signal the
 * Railway healthcheck uses), or the window expires. Distinguishes "still waking
 * up" from "never came up" so a fresh deploy can be verified without guesswork.
 */
export async function waitForStagingReadiness(
  baseUrl: string,
  options: SmokeCheckOptions = {},
  fetchImpl: FetchLike = fetch as unknown as FetchLike
): Promise<StagingReadinessResult> {
  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.error || !normalized.url) {
    return { ready: false, attempts: 0, lastError: normalized.error };
  }

  const totalSeconds = options.waitSeconds ?? DEFAULT_WAIT_SECONDS;
  const intervalMs = options.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS;
  const sleep = options.sleepImpl ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const deadline = Date.now() + Math.max(0, totalSeconds) * 1000;

  let attempts = 0;
  let lastStatus: number | undefined;
  let lastError: string | undefined;

  for (;;) {
    attempts++;
    try {
      const res = await safeFetch(fetchImpl, `${normalized.url}/api/health`, { method: 'GET' });
      lastStatus = res.status;
      lastError = undefined;
      if (res.status === 200) {
        return { ready: true, attempts, lastStatus };
      }
    } catch (err: any) {
      lastStatus = undefined;
      lastError = err?.message || String(err);
    }

    const remainingMs = deadline - Date.now();
    if (remainingMs <= 0) break;
    options.onProgress?.(
      `  … waiting for ${normalized.url}/api/health (attempt ${attempts}: ${
        lastStatus ? `HTTP ${lastStatus}` : lastError
      }), ${Math.ceil(remainingMs / 1000)}s remaining`
    );
    await sleep(Math.min(intervalMs, remainingMs));
  }

  return { ready: false, attempts, lastStatus, lastError };
}

/**
 * Executes the staging smoke suite against a deployed base URL.
 * `fetchImpl` is injectable so the checks can be unit tested without a live server.
 */
export async function runStagingSmokeCheck(
  baseUrl: string,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
  options: SmokeCheckOptions = {}
): Promise<SmokeCheckResult> {
  const passedChecks: string[] = [];
  const warnings: string[] = [];
  const errors: string[] = [];

  const normalized = normalizeBaseUrl(baseUrl);
  if (normalized.error || !normalized.url) {
    return { ok: false, passedChecks, warnings, errors: [normalized.error as string] };
  }
  const base = normalized.url;

  if (/^http:\/\//i.test(base) && !/localhost|127\.0\.0\.1/i.test(base)) {
    warnings.push('Staging URL uses plain http:// — staging deployments must be served over https://');
  }

  // 0. Optional readiness gate: after a fresh deploy the container may still be
  // starting, which would otherwise surface as four confusing failures.
  const waitSeconds = options.waitSeconds ?? 0;
  if (waitSeconds > 0) {
    const readiness = await waitForStagingReadiness(base, options, fetchImpl);
    if (!readiness.ready) {
      errors.push(
        `Staging service did not become healthy within ${waitSeconds}s of polling /api/health ` +
          `(attempts: ${readiness.attempts}, last: ${
            readiness.lastStatus ? `HTTP ${readiness.lastStatus}` : readiness.lastError
          })`
      );
      return { ok: false, passedChecks, warnings, errors };
    }
    passedChecks.push(
      `Staging service became healthy after ${readiness.attempts} readiness ${
        readiness.attempts === 1 ? 'attempt' : 'attempts'
      }`
    );
  }

  // 1. Public health endpoint: reachable, minimal payload, no posture leakage
  try {
    const res = await safeFetch(fetchImpl, `${base}/api/health`, { method: 'GET' });
    if (res.status !== 200) {
      errors.push(`GET /api/health returned ${res.status}; expected 200 for the platform healthcheck`);
    } else {
      const body: any = await res.json();
      const keys = Object.keys(body || {}).sort();
      if (JSON.stringify(keys) !== JSON.stringify(['status', 'timestamp', 'version'])) {
        errors.push(
          `GET /api/health public payload must expose exactly {status, timestamp, version}; received keys: ${keys.join(', ')}`
        );
      } else if (body.status !== 'healthy') {
        errors.push(`GET /api/health reported status "${body.status}" instead of "healthy"`);
      } else {
        passedChecks.push('Public /api/health returns the minimal healthy payload with no posture leakage');
      }
    }
  } catch (err: any) {
    errors.push(`GET /api/health failed: ${err.message}`);
  }

  // 2. Application-level security headers (must not depend on the edge provider)
  try {
    const res = await safeFetch(fetchImpl, `${base}/api/health`, { method: 'GET' });
    const getHeader = (name: string) => res.headers?.get?.(name) ?? null;

    const xfo = getHeader('x-frame-options');
    const nosniff = getHeader('x-content-type-options');
    const hsts = getHeader('strict-transport-security');

    if (xfo !== 'DENY') {
      errors.push(`Missing/weak X-Frame-Options header on staging response (received "${xfo}")`);
    } else if (nosniff !== 'nosniff') {
      errors.push(`Missing/weak X-Content-Type-Options header on staging response (received "${nosniff}")`);
    } else if (!hsts || !/max-age=\d{6,}/i.test(hsts)) {
      errors.push(`Missing/weak Strict-Transport-Security header on staging response (received "${hsts}")`);
    } else {
      passedChecks.push('Baseline security headers served by the application (platform independent)');
    }
  } catch (err: any) {
    errors.push(`Security header probe failed: ${err.message}`);
  }

  // 3. Anonymous dashboard access must be redirected to /login by middleware
  try {
    const res = await safeFetch(fetchImpl, `${base}/dashboard`, { method: 'GET', redirect: 'manual' });
    const location = res.headers?.get?.('location') || '';
    const isRedirectToLogin =
      res.status >= 300 && res.status < 400 && /\/login$/.test(location.replace(/\?.*$/, ''));

    if (!isRedirectToLogin) {
      errors.push(
        `Anonymous GET /dashboard must redirect to /login; received ${res.status} (location: "${location}")`
      );
    } else {
      passedChecks.push('Anonymous /dashboard access is redirected to /login by middleware');
    }
  } catch (err: any) {
    errors.push(`Anonymous /dashboard probe failed: ${err.message}`);
  }

  // 4. Operator boundary must be fail-closed for anonymous callers
  try {
    const res = await safeFetch(fetchImpl, `${base}/api/admin/fleet`, { method: 'GET', redirect: 'manual' });
    if (res.status === 401 || res.status === 503) {
      passedChecks.push(`Anonymous /api/admin/fleet is refused fail-closed (HTTP ${res.status})`);
      if (res.status === 503) {
        warnings.push(
          'Anonymous /api/admin/fleet returned 503: ADMIN_PASSWORD is not configured in this environment. Set it before exercising operator flows.'
        );
      }
    } else {
      errors.push(
        `Anonymous /api/admin/fleet must be refused with 401/503; received ${res.status}. Operator boundary may be exposed.`
      );
    }
  } catch (err: any) {
    errors.push(`Operator boundary probe failed: ${err.message}`);
  }

  return { ok: errors.length === 0, passedChecks, warnings, errors };
}

/** Parses `--wait` / `--wait=<seconds>` / STAGING_SMOKE_WAIT_SECONDS. */
export function resolveWaitSeconds(argv: string[], env: Record<string, string | undefined> = process.env): number {
  const waitFlag = argv.find((a) => a === '--wait' || a.startsWith('--wait='));

  if (waitFlag) {
    const inline = waitFlag.includes('=') ? waitFlag.split('=')[1] : '';
    if (!inline) return DEFAULT_WAIT_SECONDS;
    const parsed = Number(inline);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_WAIT_SECONDS;
  }

  const envValue = env.STAGING_SMOKE_WAIT_SECONDS;
  if (envValue !== undefined && envValue !== '') {
    const parsed = Number(envValue);
    if (Number.isFinite(parsed) && parsed >= 0) return parsed;
  }

  return 0;
}

// Direct CLI Execution
if (process.argv[1] && process.argv[1].endsWith('staging-smoke.ts')) {
  const args = process.argv.slice(2);
  const target = args.find((a) => !a.startsWith('--')) || process.env.STAGING_BASE_URL || '';
  const waitSeconds = resolveWaitSeconds(args);

  console.log('\n🔎 [MCR] Running Staging Post-Deploy Smoke Verifier...\n');
  console.log(`  Target: ${target || '(none provided)'}`);
  console.log(`  Readiness wait: ${waitSeconds > 0 ? `${waitSeconds}s` : 'disabled (single attempt)'}\n`);

  runStagingSmokeCheck(target, fetch as unknown as FetchLike, {
    waitSeconds,
    onProgress: (message) => console.log(message),
  }).then((result) => {
    result.passedChecks.forEach((c) => console.log(`  ✅ [PASS] ${c}`));
    result.warnings.forEach((w) => console.log(`  ⚠️ [WARN] ${w}`));
    result.errors.forEach((e) => console.log(`  ❌ [FAIL] ${e}`));

    console.log(
      `\nSmoke Result: ${result.ok ? '✅ STAGING SERVICE VERIFIED' : '❌ STAGING VERIFICATION FAILED'}`
    );
    console.log(
      `Checks Passed: ${result.passedChecks.length} | Warnings: ${result.warnings.length} | Errors: ${result.errors.length}\n`
    );

    if (!result.ok) {
      process.exit(1);
    }
  });
}
