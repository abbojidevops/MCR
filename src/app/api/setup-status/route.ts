import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { requireTenantAuth } from '@/lib/authz';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const profile = db.getBusinessProfile(accountId);
    const compliance = db.getCompliance(accountId);
    const forwardingConfigured = profile?.forwarding_configured ?? false;
    const complianceStatus = compliance?.status || 'signed_up';
    const textBackLive = complianceStatus === 'sms_live';

    return NextResponse.json({
      accountId,
      businessName: profile?.business_name || 'Business',
      forwardingConfigured,
      complianceStatus,
      textBackLive,
      onboardingComplete: !!profile,
      compliance,
      profile,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
