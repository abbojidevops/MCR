/**
 * MCR — Demo / Staging Mode Disclosure Policy
 *
 * Single source of truth for "is this deployment explicitly running in a demo or
 * staging context?". Public surfaces (most importantly the /login screen) use
 * this to decide whether demonstration credentials may be shown.
 *
 * Policy (see task requirement 14):
 *   - Demonstration credentials are shown ONLY when the deployment explicitly
 *     opts into demo/staging mode, or when it is a local non-production run.
 *   - They are NEVER shown for a production deployment that has not explicitly
 *     opted in. A production build with no explicit flag is treated as real
 *     production and must not leak working credentials on a public page.
 */

export interface DemoModeEnv {
  NODE_ENV?: string;
  MCR_DEMO_MODE?: string;
  DEMO_MODE?: string;
  MCR_ENVIRONMENT?: string;
  APP_ENV?: string;
  VERCEL_ENV?: string;
  RAILWAY_ENVIRONMENT?: string;
}

/** Environment names that unambiguously mean "this is not production". */
const STAGING_ENVIRONMENT_NAMES = ['staging', 'stage', 'demo', 'development', 'dev', 'preview', 'test'];

function isTruthy(value: string | undefined): boolean {
  return typeof value === 'string' && ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

/**
 * True only when the operator has explicitly declared a demo/staging deployment.
 * An explicit flag wins even under NODE_ENV=production, because an operator who
 * sets MCR_DEMO_MODE=true on a staging box is deliberately publishing demo data.
 */
export function hasExplicitDemoFlag(env: DemoModeEnv = process.env): boolean {
  return isTruthy(env.MCR_DEMO_MODE) || isTruthy(env.DEMO_MODE);
}

/** True when the named environment variable marks the deploy as non-production. */
export function hasStagingEnvironmentName(env: DemoModeEnv = process.env): boolean {
  const candidates = [env.MCR_ENVIRONMENT, env.APP_ENV, env.VERCEL_ENV, env.RAILWAY_ENVIRONMENT];
  return candidates.some(
    (value) => typeof value === 'string' && STAGING_ENVIRONMENT_NAMES.includes(value.trim().toLowerCase())
  );
}

/**
 * Decides whether demonstration credentials may be surfaced publicly.
 *
 * Never exposed when:
 *   - NODE_ENV is 'production' AND no explicit demo/staging declaration exists.
 *
 * Exposed when:
 *   - an explicit demo flag is set (MCR_DEMO_MODE / DEMO_MODE), or
 *   - the deployment is named staging/demo/dev/preview, or
 *   - NODE_ENV is not 'production' (local development / test runs).
 */
export function shouldExposeDemoCredentials(env: DemoModeEnv = process.env): boolean {
  const isProduction = env.NODE_ENV === 'production';

  if (hasExplicitDemoFlag(env)) return true;
  if (hasStagingEnvironmentName(env)) return true;
  if (!isProduction) return true;

  return false;
}

/** Human-readable reason used by the preflight and by tests. */
export function describeDemoModeDisclosure(env: DemoModeEnv = process.env): string {
  if (!shouldExposeDemoCredentials(env)) {
    return 'production deployment without an explicit demo flag — demonstration credentials are withheld';
  }
  if (hasExplicitDemoFlag(env)) {
    return 'explicit demo flag set (MCR_DEMO_MODE / DEMO_MODE)';
  }
  if (hasStagingEnvironmentName(env)) {
    return 'deployment is explicitly named staging/demo/preview';
  }
  return 'non-production runtime (local development)';
}
