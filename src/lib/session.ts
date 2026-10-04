import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/db/repository';

export interface SessionPayload {
  accountId: string;
  userId: string;
  role: string;
  isDemo: boolean;
  createdAt: number;
  exp: number;
}

export const SESSION_COOKIE_NAME = 'mcr_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'mcr-prod-secret-signing-key-f928a30d8c11e7';
const DEFAULT_ACCOUNT_ID = 'acc-apex-plumbing';
const DEFAULT_USER_ID = 'usr-demo-owner';

/**
 * Sign a payload into an HMAC-signed token
 */
export function createSessionToken(payloadOrAccountId?: string | Partial<SessionPayload>): string {
  const payload: Partial<SessionPayload> =
    typeof payloadOrAccountId === 'string'
      ? { accountId: payloadOrAccountId }
      : payloadOrAccountId || {};

  const accId = payload.accountId || DEFAULT_ACCOUNT_ID;
  const acc = db.getAccount(accId);

  const fullPayload: SessionPayload = {
    accountId: accId,
    userId: payload.userId || (accId === DEFAULT_ACCOUNT_ID ? DEFAULT_USER_ID : `usr-${accId.replace('acc-', '')}`),
    role: payload.role || 'owner',
    isDemo: payload.isDemo !== undefined ? payload.isDemo : (acc ? !!acc.is_demo : false),
    createdAt: Date.now(),
    exp: payload.exp || Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  const data = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(data);
  const signature = hmac.digest('base64url');

  return `${data}.${signature}`;
}

/**
 * Verify and parse an HMAC-signed token.
 * Checks HMAC signature, expiration, and server-side revocation list.
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, signature] = parts;

  // Check if session has been revoked server-side
  if (db.isSessionRevoked(signature)) {
    return null;
  }

  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(data);
  const expectedSig = hmac.digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSig);
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const raw = Buffer.from(data, 'base64url').toString('utf-8');
    const parsed = JSON.parse(raw) as SessionPayload;
    if (parsed.exp && parsed.exp < Date.now()) {
      return null; // Expired
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Invalidate a session token server-side
 */
export function revokeSessionToken(token: string): void {
  if (!token || typeof token !== 'string') return;
  const parts = token.split('.');
  if (parts.length === 2) {
    db.revokeSession(parts[1]);
  } else {
    db.revokeSession(token);
  }
}

/**
 * Resolve session exclusively from the authenticated session cookie or bearer header.
 * NEVER falls back to demo account for unauthenticated requests.
 * Returns null if no valid, unrevoked session is found.
 */
export async function getSession(req?: NextRequest): Promise<SessionPayload | null> {
  let token: string | undefined;

  if (req) {
    // 1. Check cookies in request
    token = req.cookies.get(SESSION_COOKIE_NAME)?.value;

    // 2. Fallback to Authorization: Bearer <token>
    if (!token) {
      const authHeader = req.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }
  }

  if (token) {
    return verifySessionToken(token);
  }

  return null;
}

/**
 * Shortcut to get strictly authenticated accountId from session.
 * Returns null if not authenticated.
 */
export async function getAuthenticatedAccountId(req?: NextRequest): Promise<string | null> {
  const session = await getSession(req);
  return session ? session.accountId : null;
}

/**
 * Attach signed session cookie to an outgoing response
 */
export function setSessionCookie(res: NextResponse, payload: Partial<SessionPayload>): NextResponse {
  const token = createSessionToken(payload);
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: token,
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
  return res;
}

/**
 * Clear session cookie on logout
 */
export function clearSessionCookie(res: NextResponse): NextResponse {
  res.cookies.set({
    name: SESSION_COOKIE_NAME,
    value: '',
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
    expires: new Date(0),
  });
  return res;
}

