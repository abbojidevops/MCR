import crypto from 'crypto';

const SCRYPT_N = 16384;
const SCRYPT_R = 8;
const SCRYPT_P = 1;
const KEY_LEN = 64;

export interface PasswordValidationResult {
  valid: boolean;
  reason?: string;
}

export function validatePasswordStrength(password: string): PasswordValidationResult {
  if (!password || typeof password !== 'string') {
    return { valid: false, reason: 'Password is required' };
  }
  if (password.length < 12) {
    return { valid: false, reason: 'Password must be at least 12 characters long' };
  }
  return { valid: true };
}

/**
 * Hash password using scrypt with per-user salt.
 * Formatted as: scrypt$16384$8$1$<salt_hex>$<hash_hex>
 */
export async function hashPassword(password: string): Promise<string> {
  const check = validatePasswordStrength(password);
  if (!check.valid) {
    throw new Error(check.reason);
  }

  const salt = crypto.randomBytes(16).toString('hex');

  return new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LEN,
      { N: SCRYPT_N, r: SCRYPT_R, p: SCRYPT_P, maxmem: 64 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) return reject(err);
        const hash = derivedKey.toString('hex');
        resolve(`scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`);
      }
    );
  });
}

/**
 * Synchronous version for tests / seeding
 */
export function hashPasswordSync(password: string, customSalt?: string): string {
  const salt = customSalt || crypto.randomBytes(16).toString('hex');
  const derivedKey = crypto.scryptSync(password, salt, KEY_LEN, {
    N: SCRYPT_N,
    r: SCRYPT_R,
    p: SCRYPT_P,
    maxmem: 64 * 1024 * 1024,
  });
  const hash = derivedKey.toString('hex');
  return `scrypt$${SCRYPT_N}$${SCRYPT_R}$${SCRYPT_P}$${salt}$${hash}`;
}

/**
 * Verify password against stored scrypt hash format: scrypt$N$r$p$salt$hash
 */
export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  if (!password || !storedHash) return false;

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, nStr, rStr, pStr, salt, expectedHashHex] = parts;
  const n = parseInt(nStr, 10);
  const r = parseInt(rStr, 10);
  const p = parseInt(pStr, 10);

  return new Promise((resolve) => {
    crypto.scrypt(
      password,
      salt,
      KEY_LEN,
      { N: n, r, p, maxmem: 64 * 1024 * 1024 },
      (err, derivedKey) => {
        if (err) return resolve(false);
        const derivedHashHex = derivedKey.toString('hex');
        const expectedBuf = Buffer.from(expectedHashHex, 'hex');
        const derivedBuf = Buffer.from(derivedHashHex, 'hex');
        if (expectedBuf.length !== derivedBuf.length) {
          return resolve(false);
        }
        resolve(crypto.timingSafeEqual(expectedBuf, derivedBuf));
      }
    );
  });
}

/**
 * Synchronous password verification for testing and offline evaluation.
 */
export function verifyPasswordSync(password: string, storedHash: string): boolean {
  if (!password || !storedHash) return false;

  const parts = storedHash.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, nStr, rStr, pStr, salt, expectedHashHex] = parts;
  const n = parseInt(nStr, 10);
  const r = parseInt(rStr, 10);
  const p = parseInt(pStr, 10);

  try {
    const derivedKey = crypto.scryptSync(password, salt, KEY_LEN, {
      N: n,
      r,
      p,
      maxmem: 64 * 1024 * 1024,
    });
    const derivedHashHex = derivedKey.toString('hex');
    const expectedBuf = Buffer.from(expectedHashHex, 'hex');
    const derivedBuf = Buffer.from(derivedHashHex, 'hex');
    if (expectedBuf.length !== derivedBuf.length) {
      return false;
    }
    return crypto.timingSafeEqual(expectedBuf, derivedBuf);
  } catch {
    return false;
  }
}

