import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { setSessionCookie } from '@/lib/session';

/**
 * Platform Operator / Admin Authentication Endpoint
 * 
 * Strict boundary controls:
 * - If ADMIN_PASSWORD is unset or empty in the environment, responds with 503 Service Unavailable.
 * - Authenticates against ADMIN_PASSWORD using constant-time equality check.
 * - Issues httpOnly session cookie with role: 'admin'.
 */
export async function POST(req: NextRequest) {
  // 1. Check environment secret presence
  const adminPassword = process.env.ADMIN_PASSWORD;
  if (!adminPassword || adminPassword.trim() === '') {
    return NextResponse.json(
      {
        error: 'Service Unavailable: ADMIN_PASSWORD environment variable is not configured',
        status: 503,
      },
      { status: 503 }
    );
  }

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

    // 2. Constant-time password verification
    const inputBuf = Buffer.from(password, 'utf-8');
    const secretBuf = Buffer.from(adminPassword, 'utf-8');

    const isMatch =
      inputBuf.length === secretBuf.length &&
      crypto.timingSafeEqual(inputBuf, secretBuf);

    if (!isMatch) {
      return NextResponse.json(
        { error: 'Unauthorized: Invalid admin credentials' },
        { status: 401 }
      );
    }

    // 3. Issue admin session
    const response = NextResponse.json({
      success: true,
      role: 'admin',
      message: 'Operator session established',
    });

    return setSessionCookie(response, {
      accountId: 'acc-admin',
      userId: 'usr-platform-admin',
      role: 'admin',
      isDemo: false,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error' },
      { status: 500 }
    );
  }
}
