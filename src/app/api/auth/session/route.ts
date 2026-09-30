import { NextRequest, NextResponse } from 'next/server';
import { getSession, setSessionCookie, createSessionToken } from '@/lib/session';
import { db } from '@/db/repository';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    const profile = db.getBusinessProfile(session.accountId);

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
    const body = await req.json().catch(() => ({}));
    const { targetAccount, resetToClean } = body;

    let accountId = 'acc-apex-plumbing';
    let isDemo = true;

    if (resetToClean) {
      const created = db.createAccount('My Service Business', 'plumbing', '+12175550199', 'Owner', 'Verizon Wireless');
      accountId = created.account.id;
      isDemo = false;
    } else if (targetAccount) {
      accountId = targetAccount;
      isDemo = targetAccount === 'acc-apex-plumbing';
    }

    const response = NextResponse.json({
      success: true,
      accountId,
      isDemo,
    });

    return setSessionCookie(response, { accountId, isDemo });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
