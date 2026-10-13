import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { setSessionCookie } from '@/lib/session';
import { isLoginRateLimited, recordFailedLogin, resetLoginRateLimit } from '@/lib/auth/rate-limiter';
import { getAdminPasswordConfigurationError } from '@/lib/security/admin-password';
import { resolveClientIp } from '@/lib/security/client-ip';

/**
 * Platform Operator / Admin Authentication Endpoint
 * 
 * Strict boundary controls:
 * - Missing or weak production ADMIN_PASSWORD configuration responds with 503.
 * - Failed passwords are rate-limited per observed client IP (5 attempts / 15 minutes).
 * - Authenticates against ADMIN_PASSWORD using constant-time equality check.
 * - Issues httpOnly session cookie with role: 'admin'.
 */
export async function POST(req: NextRequest) {
  // 1. Refuse missing or weak production configuration before checking credentials.
  const configurationError = getAdminPasswordConfigurationError();
  if (configurationError) {
    return NextResponse.json(
      { error: `Service Unavailable: ${configurationError}`, status: 503 },
      { status: 503 }
    );
  }
  const adminPassword = process.env.ADMIN_PASSWORD as string;

  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const { password } = body || {};
    if (!password || typeof password !== 'string') {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    const clientIp = resolveClientIp(req);
    const rateLimit = isLoginRateLimited(clientIp, undefined, 'admin');
    if (rateLimit.limited) {
      const retryAfterSeconds = rateLimit.retryAfterSeconds || 60;
      return NextResponse.json(
        {
          error: 'Too many failed admin login attempts. Please try again later.',
          retryAfterSeconds,
        },
        { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
      );
    }

    // 2. Constant-time password verification
    const inputBuf = Buffer.from(password, 'utf-8');
    const secretBuf = Buffer.from(adminPassword, 'utf-8');

    const isMatch =
      inputBuf.length === secretBuf.length &&
      crypto.timingSafeEqual(inputBuf, secretBuf);

    if (!isMatch) {
      recordFailedLogin(clientIp, undefined, 'admin');
      return NextResponse.json(
        { error: 'Unauthorized: Invalid admin credentials' },
        { status: 401 }
      );
    }

    // 3. Issue admin session; a correct password is not a successful login if
    // session signing is misconfigured and no authenticated cookie is created.
    const response = NextResponse.json({
      success: true,
      role: 'admin',
      message: 'Operator session established',
    });
    const sessionResponse = setSessionCookie(response, {
      accountId: 'acc-admin',
      userId: 'usr-platform-admin',
      role: 'admin',
      isDemo: false,
    });

    if (sessionResponse.status < 400) {
      resetLoginRateLimit(clientIp, undefined, 'admin');
    }

    return sessionResponse;
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
