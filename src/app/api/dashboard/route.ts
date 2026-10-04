import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { computeMetrics, getSimulatedExclusions, DateRangePreset } from '@/lib/metrics';
import { requireTenantAuth } from '@/lib/authz';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const { searchParams } = new URL(req.url);
    const range = (searchParams.get('range') || 'month') as DateRangePreset;

    const metrics = computeMetrics(accountId, { preset: range });
    const profile = db.getBusinessProfile(accountId);
    const simulatedExclusions = getSimulatedExclusions(accountId);
    const compliance = db.getCompliance(accountId);

    return NextResponse.json({
      ...metrics,
      simulatedExclusions,
      setupStatus: {
        textBackLive: compliance?.status === 'sms_live',
        complianceStatus: compliance?.status || 'signed_up',
        forwardingConfigured: profile?.forwarding_configured ?? false,
      },
      summary: metrics.summary,
      forwardingStatus: metrics.forwardingStatus,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
