import { NextRequest, NextResponse } from 'next/server';
import { clearSessionCookie, revokeSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    // 1. Invalidate session token server-side
    let token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      const authHeader = req.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }

    if (token) {
      revokeSessionToken(token);
    }

    // 2. Clear session cookie from response
    const response = NextResponse.json({
      success: true,
      message: 'Logged out successfully',
    });

    return clearSessionCookie(response);
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Logout failed' }, { status: 500 });
  }
}
