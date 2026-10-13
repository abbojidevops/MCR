interface AttemptRecord {
  attempts: number[];
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const MAX_ATTEMPTS = 5; // Max 5 failed attempts allowed before throttling
export const MAX_TRACKED_RATE_LIMIT_KEYS = 10_000;

// These stores are process-local. Their cardinality is capped so rotating
// emails/IPs cannot grow a long-lived app process without bound.
const ipAttempts = new Map<string, AttemptRecord>();
const emailAttempts = new Map<string, AttemptRecord>();
const adminIpAttempts = new Map<string, AttemptRecord>();

export type LoginRateLimitScope = 'tenant' | 'admin';

function cleanOldAttempts(record: AttemptRecord, now: number): number[] {
  return record.attempts.filter((ts) => now - ts < WINDOW_MS);
}

/** Remove expired history and refresh the key's position in the bounded LRU map. */
function getFreshRecord(
  store: Map<string, AttemptRecord>,
  key: string,
  now: number
): AttemptRecord | undefined {
  const existing = store.get(key);
  if (!existing) return undefined;

  const attempts = cleanOldAttempts(existing, now);
  if (attempts.length === 0) {
    store.delete(key);
    return undefined;
  }

  const refreshed = { attempts };
  store.delete(key);
  store.set(key, refreshed);
  return refreshed;
}

function rememberRecord(store: Map<string, AttemptRecord>, key: string, record: AttemptRecord): void {
  store.delete(key);
  store.set(key, record);

  while (store.size > MAX_TRACKED_RATE_LIMIT_KEYS) {
    const oldestKey = store.keys().next().value;
    if (oldestKey === undefined) break;
    store.delete(oldestKey);
  }
}

function recordAttempt(store: Map<string, AttemptRecord>, key: string, now: number): void {
  const record = getFreshRecord(store, key, now) || { attempts: [] };
  record.attempts.push(now);
  rememberRecord(store, key, record);
}

function checkLimit(
  store: Map<string, AttemptRecord>,
  key: string,
  now: number,
  reason: string
): { limited: true; retryAfterSeconds: number; reason: string } | null {
  if (!key) return null;

  const record = getFreshRecord(store, key, now);
  if (!record || record.attempts.length < MAX_ATTEMPTS) return null;

  const oldest = record.attempts[0];
  const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
  return {
    limited: true,
    retryAfterSeconds: Math.max(retryAfterSeconds, 1),
    reason,
  };
}

/**
 * Check failed-login limits. Tenant sign-in is limited by IP and normalized
 * email; operator sign-in uses an independent IP bucket so it cannot consume a
 * tenant's attempts from the same address.
 */
export function isLoginRateLimited(
  ip: string,
  email?: string,
  scope: LoginRateLimitScope = 'tenant'
): { limited: boolean; retryAfterSeconds?: number; reason?: string } {
  const now = Date.now();
  const cleanIp = (ip || '').trim() || 'unknown';
  const ipStore = scope === 'admin' ? adminIpAttempts : ipAttempts;

  const ipLimit = checkLimit(
    ipStore,
    cleanIp,
    now,
    'Too many failed login attempts from this IP address'
  );
  if (ipLimit) return ipLimit;

  if (scope === 'admin') return { limited: false };

  const cleanEmail = (email || '').trim().toLowerCase();
  const emailLimit = checkLimit(
    emailAttempts,
    cleanEmail,
    now,
    'Too many failed login attempts for this account'
  );
  return emailLimit || { limited: false };
}

/**
 * Record a failed tenant or operator login. Only tenant attempts use an email
 * bucket; operator login has no user-supplied identifier besides the IP.
 */
export function recordFailedLogin(
  ip: string,
  email?: string,
  scope: LoginRateLimitScope = 'tenant'
): void {
  const now = Date.now();
  const cleanIp = (ip || '').trim() || 'unknown';
  const ipStore = scope === 'admin' ? adminIpAttempts : ipAttempts;
  recordAttempt(ipStore, cleanIp, now);

  if (scope === 'tenant') {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (cleanEmail) recordAttempt(emailAttempts, cleanEmail, now);
  }
}

/** Reset rate-limit records on successful authentication. */
export function resetLoginRateLimit(
  ip: string,
  email?: string,
  scope: LoginRateLimitScope = 'tenant'
): void {
  const cleanIp = (ip || '').trim() || 'unknown';
  const ipStore = scope === 'admin' ? adminIpAttempts : ipAttempts;
  ipStore.delete(cleanIp);

  if (scope === 'tenant') {
    const cleanEmail = (email || '').trim().toLowerCase();
    if (cleanEmail) emailAttempts.delete(cleanEmail);
  }
}

/** Clear all process-local rate-limit state (useful in test runner). */
export function clearAllRateLimits(): void {
  ipAttempts.clear();
  emailAttempts.clear();
  adminIpAttempts.clear();
}
