import { NextRequest, NextResponse } from 'next/server';
import { getSession, SessionPayload } from '@/lib/session';

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

  return {
    session,
    accountId: session.accountId,
    userId: session.userId,
    role: session.role,
    isDemo: !!session.isDemo,
  };
}
