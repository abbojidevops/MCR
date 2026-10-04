import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { verifyPassword } from '@/lib/auth/password';
import { isLoginRateLimited, recordFailedLogin, resetLoginRateLimit } from '@/lib/auth/rate-limiter';
import { setSessionCookie } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const { email, password } = body || {};

    // 1. Validation: Email
    if (!email || typeof email !== 'string' || !email.trim()) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    // 2. Validation: Empty password MUST answer 400 (not 401, not 500)
    if (!password || typeof password !== 'string' || password.length === 0) {
      return NextResponse.json({ error: 'Password is required' }, { status: 400 });
    }

    const clientIp =
      req.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
      req.headers.get('x-real-ip') ||
      '127.0.0.1';
    const normalizedEmail = email.trim().toLowerCase();

    // 3. Rate limiting check (per source IP and per email)
    const rateLimit = isLoginRateLimited(clientIp, normalizedEmail);
    if (rateLimit.limited) {
      return NextResponse.json(
        {
          error: 'Too many failed login attempts. Please try again later.',
          retryAfterSeconds: rateLimit.retryAfterSeconds,
        },
        {
          status: 429,
          headers: {
            'Retry-After': String(rateLimit.retryAfterSeconds || 60),
          },
        }
      );
    }

    // 4. Lookup credential in user_credentials table
    const credential = db.findCredentialByEmail(normalizedEmail);
    if (!credential) {
      recordFailedLogin(clientIp, normalizedEmail);
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // 5. Verify password using scrypt
    const isMatch = await verifyPassword(password, credential.password_hash);
    if (!isMatch) {
      recordFailedLogin(clientIp, normalizedEmail);
      return NextResponse.json({ error: 'Invalid email or password' }, { status: 401 });
    }

    // 6. Reset rate limit counters on success
    resetLoginRateLimit(clientIp, normalizedEmail);

    // 7. Find account details
    const account = db.getAccount(credential.account_id);
    const isDemo = !!account?.is_demo;

    // 8. Issue httpOnly session cookie
    const response = NextResponse.json({
      success: true,
      accountId: credential.account_id,
      userId: credential.user_id,
      email: credential.email,
      isDemo,
    });

    return setSessionCookie(response, {
      accountId: credential.account_id,
      userId: credential.user_id,
      role: 'owner',
      isDemo,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
