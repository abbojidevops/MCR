import { NextRequest, NextResponse } from 'next/server';
import { getSession, SessionPayload } from '@/lib/session';
import { db } from '@/db/repository';

export interface AuthenticatedContext {
  session: SessionPayload;
  accountId: string;
  userId: string;
  role: string;
  isDemo: boolean;
}

/**
 * Enforce tenant authentication on API routes.
 * Derives account identity strictly from the verified session cookie.
 * Returns 401 Unauthorized if the caller is anonymous or has an invalid/revoked session.
 */
export async function requireTenantAuth(
  req: NextRequest
): Promise<AuthenticatedContext | NextResponse> {
  const session = await getSession(req);

  if (!session || !session.accountId) {
    return NextResponse.json(
      {
        error: 'Unauthorized: Authentication required',
        status: 401,
      },
      { status: 401 }
    );
  }

  try {
    // PostgreSQL is the durable copy when configured. Hydrate the request
    // process's sync repository cache before downstream handlers read profiles.
    await db.hydrateBusinessProfileFromPostgres(session.accountId);
  } catch (err: any) {
    console.error('[Tenant profile load failed]', err?.message || err);
    return NextResponse.json(
      { error: 'Your saved account settings are temporarily unavailable. Please try again.' },
      { status: 503 }
    );
  }

  return {
    session,
    accountId: session.accountId,
    userId: session.userId,
    role: session.role,
    isDemo: !!session.isDemo,
  };
}

/**
 * Enforce platform operator / admin role on API routes.
 * Returns 403 Forbidden if caller does not possess role: 'admin'.
 */
export async function requireAdminAuth(
  req: NextRequest
): Promise<AuthenticatedContext | NextResponse> {
  const session = await getSession(req);

  if (!session || session.role !== 'admin') {
    return NextResponse.json(
      {
        error: 'Forbidden: Admin operator credentials required',
        status: 403,
      },
      { status: 403 }
    );
  }

  return {
    session,
    accountId: session.accountId,
    userId: session.userId,
    role: session.role,
    isDemo: !!session.isDemo,
  };
}
