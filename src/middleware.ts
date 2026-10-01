import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'mcr_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'mcr-prod-secret-signing-key-f928a30d8c11e7';

async function verifyAdminSessionEdge(token?: string): Promise<boolean> {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;

  const [data, signature] = parts;
  try {
    const encoder = new TextEncoder();
    const keyData = encoder.encode(SESSION_SECRET);
    const key = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );

    const signatureBuffer = await crypto.subtle.sign(
      'HMAC',
      key,
      encoder.encode(data)
    );

    const expectedSig = btoa(String.fromCharCode(...new Uint8Array(signatureBuffer)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');

    if (signature !== expectedSig) return false;

    // Decode base64url data payload
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = atob(base64);
    const parsed = JSON.parse(jsonStr);

    if (parsed.exp && parsed.exp < Date.now()) return false;
    return parsed.role === 'admin';
  } catch {
    return false;
  }
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Protect all /admin/* routes strictly
  if (pathname.startsWith('/admin')) {
    let token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
    if (!token) {
      const authHeader = req.headers.get('authorization');
      if (authHeader?.startsWith('Bearer ')) {
        token = authHeader.slice(7).trim();
      }
    }

    const isAdmin = await verifyAdminSessionEdge(token);

    if (!isAdmin) {
      return new NextResponse(
        JSON.stringify({
          error: 'Unauthorized: Admin authentication required',
          status: 401,
          path: pathname,
        }),
        {
          status: 401,
          headers: {
            'Content-Type': 'application/json',
            'WWW-Authenticate': 'Bearer realm="MCR Admin"',
          },
        }
      );
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
