import { NextRequest, NextResponse } from 'next/server';

const SESSION_COOKIE_NAME = 'mcr_session';
const SESSION_SECRET = process.env.SESSION_SECRET || 'mcr-prod-secret-signing-key-f928a30d8c11e7';

/** Public operator sign-in route. `/admin/login` is rewritten onto this route so
 *  the URL stays intuitive while the page itself lives outside the admin shell
 *  (which 404s anonymous visitors by design). */
const OPERATOR_LOGIN_ROUTE = '/operator-login';

interface SessionEdgePayload {
  accountId: string;
  userId: string;
  role: string;
  isDemo: boolean;
  createdAt: number;
  exp: number;
}

async function verifySessionEdge(token?: string): Promise<SessionEdgePayload | null> {
  if (!token || typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;

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

    if (signature !== expectedSig) return null;

    // Decode base64url data payload
    const base64 = data.replace(/-/g, '+').replace(/_/g, '/');
    const jsonStr = atob(base64);
    const parsed = JSON.parse(jsonStr) as SessionEdgePayload;

    if (parsed.exp && parsed.exp < Date.now()) return null;
    return parsed;
  } catch {
    return null;
  }
}

/** JSON 401/503 body used for API callers (fetch/XHR), never for browsers. */
function jsonError(status: number, error: string, pathname: string, extraHeaders: Record<string, string> = {}) {
  return new NextResponse(
    JSON.stringify({ error, status, path: pathname }),
    {
      status,
      headers: { 'Content-Type': 'application/json', ...extraHeaders },
    }
  );
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Extract session token from cookie or Authorization header
  let token = req.cookies.get(SESSION_COOKIE_NAME)?.value;
  if (!token) {
    const authHeader = req.headers.get('authorization');
    if (authHeader?.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    }
  }

  // 0. `/admin/login` is the public operator sign-in screen. It is rewritten onto
  //    a route that lives outside the admin shell so it stays reachable while
  //    every other `/admin/*` path remains locked down.
  if (pathname === '/admin/login') {
    return NextResponse.rewrite(new URL(OPERATOR_LOGIN_ROUTE, req.url));
  }

  // 1. Protect all /admin/* routes strictly
  if (pathname.startsWith('/admin') || (pathname.startsWith('/api/admin') && pathname !== '/api/admin/login')) {
    const adminPassword = process.env.ADMIN_PASSWORD;
    if (!adminPassword || adminPassword.trim() === '') {
      return jsonError(
        503,
        'Service Unavailable: ADMIN_PASSWORD environment variable is not configured',
        pathname
      );
    }

    const session = await verifySessionEdge(token);
    if (!session || session.role !== 'admin') {
      // Browser navigations get a usable redirect to the operator sign-in screen
      // instead of a raw JSON blob. API callers keep the 401 contract.
      const accept = req.headers.get('accept') || '';
      const isDocumentNavigation =
        accept.includes('text/html') && req.method === 'GET' && !pathname.startsWith('/api/');
      if (isDocumentNavigation) {
        const loginUrl = new URL(OPERATOR_LOGIN_ROUTE, req.url);
        loginUrl.searchParams.set('next', pathname);
        return NextResponse.redirect(loginUrl);
      }
      return jsonError(401, 'Unauthorized: Admin authentication required', pathname, {
        'WWW-Authenticate': 'Bearer realm="MCR Admin"',
      });
    }
  }

  // 2. Protect all /dashboard/* routes: redirect anonymous visitors to /login
  if (pathname.startsWith('/dashboard')) {
    const session = await verifySessionEdge(token);
    if (!session || !session.accountId) {
      const loginUrl = new URL('/login', req.url);
      loginUrl.searchParams.set('next', pathname);
      return NextResponse.redirect(loginUrl);
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/dashboard/:path*', '/api/admin/:path*'],
};
