/**
 * MCR — Secret & Credential Strength Policy
 *
 * Single source of truth for the operator-secret requirements that staging and
 * production deployments are held to. Both `scripts/staging-preflight.ts` and
 * `scripts/staging-requirements.ts` (and anything else that gates a deploy) must
 * import from here so a requirement can never drift between tools.
 *
 * Requirements implemented:
 *  - ADMIN_PASSWORD: at least 12 characters containing uppercase, lowercase, and
 *    numeric characters.
 *  - SESSION_SECRET: at least 32 bytes (256 bits) of entropy. Length alone is not
 *    enough: "aaaaaaaa..." is 32+ characters but trivially guessable, so a
 *    character-class entropy estimate is enforced too. `openssl rand -hex 32`
 *    yields 64 hex characters == 256 bits and satisfies this exactly.
 */

export const ADMIN_PASSWORD_MIN_LENGTH = 12;
export const SESSION_SECRET_MIN_BYTES = 32;
export const SESSION_SECRET_MIN_BITS = SESSION_SECRET_MIN_BYTES * 8; // 256
export const SESSION_SECRET_MIN_CHARS = 32;

export interface AdminPasswordValidation {
  ok: boolean;
  errors: string[];
}

export interface SessionSecretValidation {
  ok: boolean;
  /** Estimated entropy in bits. */
  bits: number;
  chars: number;
  error?: string;
}

/**
 * Validates the operator password policy (length + character-class complexity).
 */
export function validateAdminPassword(password?: string | null): AdminPasswordValidation {
  const errors: string[] = [];

  if (!password || password.trim().length === 0) {
    errors.push('ADMIN_PASSWORD must be configured in environment');
    return { ok: false, errors };
  }

  if (password.length < ADMIN_PASSWORD_MIN_LENGTH) {
    errors.push(`ADMIN_PASSWORD must be at least ${ADMIN_PASSWORD_MIN_LENGTH} characters long`);
  }
  if (!/[A-Z]/.test(password) || !/[a-z]/.test(password) || !/[0-9]/.test(password)) {
    errors.push('ADMIN_PASSWORD must contain uppercase, lowercase, and numeric characters');
  }

  return { ok: errors.length === 0, errors };
}

/** Length of the smallest repeating unit, or the full length when aperiodic. */
function smallestRepeatingUnitLength(value: string): number {
  for (let period = 1; period <= value.length; period++) {
    if (value.length % period !== 0) continue;
    const unit = value.slice(0, period);
    if (unit.repeat(value.length / period) === value) return period;
  }
  return value.length;
}

/** Detects the effective alphabet of a secret. */
function detectAlphabetSize(secret: string): number {
  // Encoded random bytes use only their encoding's alphabet; assuming the full
  // printable set would overstate them (64 hex chars are 4 bits/char, not ~5).
  if (/^[0-9a-f]+$/i.test(secret)) return 16;
  if (/^[A-Za-z0-9+/=_-]+$/.test(secret)) return 64;

  let alphabetSize = 0;
  if (/[a-z]/.test(secret)) alphabetSize += 26;
  if (/[A-Z]/.test(secret)) alphabetSize += 26;
  if (/[0-9]/.test(secret)) alphabetSize += 10;
  const symbols = new Set(
    secret.split('').filter((c) => !/[a-zA-Z0-9]/.test(c) && !/\s/.test(c))
  ).size;
  if (symbols > 0) alphabetSize += 33;

  return alphabetSize;
}

/**
 * Estimates the entropy of a secret in bits.
 *
 * Uses the encoding's alphabet (hex → 16 symbols, base64url → 64, otherwise the
 * union of the character classes present) and the smallest repeating unit, then
 * applies Shannon's per-character bound log2(alphabetSize). Values built from
 * fewer than 12 distinct characters are scaled down, so long-but-patterned
 * strings such as "aaaa…" or "abcdabcd…" cannot pass on length alone.
 *
 * This is a heuristic floor, not proof of randomness: it does not detect
 * dictionary words or keyboard walks. `openssl rand -hex 32` scores exactly
 * 256 bits (64 characters × 4 bits).
 */
export function estimateSecretEntropyBits(secret: string): number {
  if (!secret) return 0;

  const alphabetSize = detectAlphabetSize(secret);
  if (alphabetSize <= 1) return 0;

  const effectiveLength = smallestRepeatingUnitLength(secret);
  const distinct = new Set(secret).size;
  const distinctFactor = distinct >= 12 ? 1 : distinct / 12;

  return effectiveLength * Math.log2(alphabetSize) * distinctFactor;
}

/**
 * Validates SESSION_SECRET: minimum length AND minimum estimated entropy.
 */
export function validateSessionSecret(secret?: string | null): SessionSecretValidation {
  const value = secret ?? '';
  const chars = value.length;
  const bits = estimateSecretEntropyBits(value);

  if (!value || value.trim().length === 0) {
    return {
      ok: false,
      bits: 0,
      chars: 0,
      error: 'SESSION_SECRET must be configured in environment',
    };
  }

  if (chars < SESSION_SECRET_MIN_CHARS) {
    return {
      ok: false,
      bits,
      chars,
      error: 'SESSION_SECRET must be at least 32 characters long for cryptographically secure cookies',
    };
  }

  // +0.5 tolerance keeps exact-boundary values (64 hex chars == 256 bits) passing
  // despite floating point representation of log2.
  if (bits + 0.5 < SESSION_SECRET_MIN_BITS) {
    return {
      ok: false,
      bits,
      chars,
      error:
        `SESSION_SECRET must contain at least ${SESSION_SECRET_MIN_BYTES} bytes (${SESSION_SECRET_MIN_BITS} bits) of entropy; ` +
        `this value is ${chars} characters but only ~${Math.round(bits)} bits because it uses a limited alphabet — ` +
        'generate one with `openssl rand -hex 32`',
    };
  }

  return { ok: true, bits, chars };
}

/**
 * Confirms the deployment keeps all live third-party processing disabled.
 * Returns the list of variables that would enable live processing.
 */
export function findLiveProcessingSwitches(env: Record<string, string | undefined>): string[] {
  const enabled: string[] = [];

  if (env.TWILIO_MOCK_MODE !== 'true') {
    enabled.push('TWILIO_MOCK_MODE is not "true"');
  }
  if (env.NEXT_PUBLIC_TWILIO_LIVE === 'true') {
    enabled.push('NEXT_PUBLIC_TWILIO_LIVE=true');
  }
  if (env.NEXT_PUBLIC_STRIPE_LIVE === 'true') {
    enabled.push('NEXT_PUBLIC_STRIPE_LIVE=true');
  }
  if (env.STRIPE_SECRET_KEY && env.STRIPE_SECRET_KEY.trim()) {
    enabled.push('STRIPE_SECRET_KEY is configured');
  }
  if (env.STRIPE_WEBHOOK_SECRET && env.STRIPE_WEBHOOK_SECRET.trim()) {
    enabled.push('STRIPE_WEBHOOK_SECRET is configured');
  }
  if (env.TWILIO_AUTH_TOKEN && env.TWILIO_AUTH_TOKEN.trim()) {
    enabled.push('TWILIO_AUTH_TOKEN is configured');
  }
  if (env.TWILIO_ACCOUNT_SID && env.TWILIO_ACCOUNT_SID.trim()) {
    enabled.push('TWILIO_ACCOUNT_SID is configured');
  }
  if (env.CARRIER_WEBHOOK_SECRET && env.CARRIER_WEBHOOK_SECRET.trim()) {
    enabled.push('CARRIER_WEBHOOK_SECRET is configured');
  }

  return enabled;
}

/**
 * Validates NEXT_PUBLIC_APP_URL as the public staging domain.
 */
export function validatePublicAppUrl(
  appUrl?: string | null
): { ok: boolean; error?: string; isLocalhost: boolean } {
  const value = (appUrl || '').trim();

  if (!value) {
    return {
      ok: false,
      isLocalhost: false,
      error:
        'NEXT_PUBLIC_APP_URL must be set to the deployed staging domain (e.g. https://<service>.up.railway.app)',
    };
  }
  if (!/^https:\/\//i.test(value)) {
    const isLocalhost = /^http:\/\/(localhost|127\.0\.0\.1|\[::1\])/i.test(value);
    return {
      ok: false,
      isLocalhost,
      error: isLocalhost
        ? 'NEXT_PUBLIC_APP_URL is still localhost; set it to the deployed staging domain'
        : 'NEXT_PUBLIC_APP_URL must be an absolute https:// URL',
    };
  }
  if (value.length > 2048) {
    return { ok: false, isLocalhost: false, error: 'NEXT_PUBLIC_APP_URL is implausibly long' };
  }

  return { ok: true, isLocalhost: false };
}
