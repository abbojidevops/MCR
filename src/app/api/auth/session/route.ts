import { NextRequest, NextResponse } from 'next/server';
import { setSessionCookie } from '@/lib/session';
import { db } from '@/db/repository';
import { requireTenantAuth } from '@/lib/authz';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { session, accountId } = auth;
    const profile = db.getBusinessProfile(accountId);

    return NextResponse.json({
      session,
      businessName: profile?.business_name || 'Apex Plumbing & Rooter',
      isDemo: session.isDemo,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // 1. Authenticate caller session
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { session, accountId } = auth;


    const body = await req.json().catch(() => ({}));
    const { resetToClean } = body;

    // Reject any arbitrary account switching payloads
    if (body.targetAccount) {
      return NextResponse.json(
        { error: 'Forbidden: Client-supplied account switching is disallowed' },
        { status: 403 }
      );
    }

    if (resetToClean) {
      // Only demo seed account is permitted to reset to a clean onboarding slate
      if (!session.isDemo) {
        return NextResponse.json(
          { error: 'Forbidden: Destructive reset cannot be performed on non-demo tenant accounts' },
          { status: 403 }
        );
      }

      const created = db.createAccount(
        'My Service Business',
        'plumbing',
        '+12175550199',
        'Business Owner',
        'Verizon Wireless'
      );
      await db.persistAccountAndBusinessProfile(created.account.id);

      const response = NextResponse.json({
        success: true,
        accountId: created.account.id,
        isDemo: false,
      });

      return setSessionCookie(response, {
        accountId: created.account.id,
        isDemo: false,
        role: 'owner',
      });
    }

    return NextResponse.json({
      success: true,
      accountId: session.accountId,
      isDemo: session.isDemo,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
