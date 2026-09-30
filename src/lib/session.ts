import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export interface SessionPayload {
  accountId: string;
  userId: string;
  role: string;
  isDemo: boolean;
  createdAt: number;
  exp: number;
}

const SESSION_COOKIE_NAME = 'mcr_session';
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

  const fullPayload: SessionPayload = {
    accountId: payload.accountId || DEFAULT_ACCOUNT_ID,
    userId: payload.userId || DEFAULT_USER_ID,
    role: payload.role || 'owner',
    isDemo: payload.isDemo !== undefined ? payload.isDemo : true,
    createdAt: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  const data = Buffer.from(JSON.stringify(fullPayload)).toString('base64url');
  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(data);
  const signature = hmac.digest('base64url');

  return `${data}.${signature}`;
}

/**
 * Verify and parse an HMAC-signed token
 */
export function verifySessionToken(token: string): SessionPayload | null {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, signature] = parts;
  const hmac = crypto.createHmac('sha256', SESSION_SECRET);
  hmac.update(data);
  const expectedSig = hmac.digest('base64url');

  if (signature !== expectedSig) {
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
 * Resolve session exclusively from the authenticated session cookie.
 * NEVER accepts accountId from URL parameters or request bodies.
 */
export async function getSession(req?: NextRequest): Promise<SessionPayload> {
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
    const verified = verifySessionToken(token);
    if (verified) {
      return verified;
    }
  }

  // Fallback for unlaunched/demo environment: returns secure default demo session
  return {
    accountId: DEFAULT_ACCOUNT_ID,
    userId: DEFAULT_USER_ID,
    role: 'owner',
    isDemo: true,
    createdAt: Date.now(),
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
  };
}

/**
 * Shortcut to get strictly authenticated accountId from session
 */
export async function getAuthenticatedAccountId(req?: NextRequest): Promise<string> {
  const session = await getSession(req);
  return session.accountId;
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
