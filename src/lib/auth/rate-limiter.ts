interface AttemptRecord {
  attempts: number[];
}

const WINDOW_MS = 15 * 60 * 1000; // 15 minutes window
const MAX_ATTEMPTS = 5; // Max 5 failed attempts allowed before throttling

const ipAttempts = new Map<string, AttemptRecord>();
const emailAttempts = new Map<string, AttemptRecord>();

function cleanOldAttempts(record: AttemptRecord, now: number): number[] {
  return record.attempts.filter((ts) => now - ts < WINDOW_MS);
}

/**
 * Check if a login attempt is rate limited by IP or email
 */
export function isLoginRateLimited(
  ip: string,
  email: string
): { limited: boolean; retryAfterSeconds?: number; reason?: string } {
  const now = Date.now();
  const cleanIp = (ip || 'unknown').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  // Check IP throttle
  if (cleanIp && ipAttempts.has(cleanIp)) {
    const record = ipAttempts.get(cleanIp)!;
    record.attempts = cleanOldAttempts(record, now);
    if (record.attempts.length >= MAX_ATTEMPTS) {
      const oldest = record.attempts[0];
      const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
      return {
        limited: true,
        retryAfterSeconds: Math.max(retryAfterSeconds, 1),
        reason: 'Too many failed login attempts from this IP address',
      };
    }
  }

  // Check Email throttle
  if (cleanEmail && emailAttempts.has(cleanEmail)) {
    const record = emailAttempts.get(cleanEmail)!;
    record.attempts = cleanOldAttempts(record, now);
    if (record.attempts.length >= MAX_ATTEMPTS) {
      const oldest = record.attempts[0];
      const retryAfterSeconds = Math.ceil((WINDOW_MS - (now - oldest)) / 1000);
      return {
        limited: true,
        retryAfterSeconds: Math.max(retryAfterSeconds, 1),
        reason: 'Too many failed login attempts for this account',
      };
    }
  }

  return { limited: false };
}

/**
 * Record a failed login attempt for IP and Email
 */
export function recordFailedLogin(ip: string, email: string): void {
  const now = Date.now();
  const cleanIp = (ip || 'unknown').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  if (cleanIp) {
    const record = ipAttempts.get(cleanIp) || { attempts: [] };
    record.attempts = cleanOldAttempts(record, now);
    record.attempts.push(now);
    ipAttempts.set(cleanIp, record);
  }

  if (cleanEmail) {
    const record = emailAttempts.get(cleanEmail) || { attempts: [] };
    record.attempts = cleanOldAttempts(record, now);
    record.attempts.push(now);
    emailAttempts.set(cleanEmail, record);
  }
}

/**
 * Reset rate limit records on successful authentication
 */
export function resetLoginRateLimit(ip: string, email: string): void {
  const cleanIp = (ip || 'unknown').trim();
  const cleanEmail = (email || '').trim().toLowerCase();

  if (cleanIp) {
    ipAttempts.delete(cleanIp);
  }
  if (cleanEmail) {
    emailAttempts.delete(cleanEmail);
  }
}

/**
 * Clear all rate limiter state (useful in test runner)
 */
export function clearAllRateLimits(): void {
  ipAttempts.clear();
  emailAttempts.clear();
}
