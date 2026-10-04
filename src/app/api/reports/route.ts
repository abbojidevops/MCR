import { NextRequest, NextResponse } from 'next/server';
import { computeMetrics, DateRangePreset } from '@/lib/metrics';
import { generateDailySummary, generateWeeklyReport } from '@/lib/reports';
import { requireTenantAuth } from '@/lib/authz';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const { searchParams } = new URL(req.url);
    const range = (searchParams.get('range') || 'month') as DateRangePreset;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;

    const metrics = computeMetrics(accountId, { 
      preset: range,
      startDate,
      endDate
    });
    const daily = generateDailySummary(accountId);
    const weekly = generateWeeklyReport(accountId);

    return NextResponse.json({
      metrics,
      daily,
      weekly,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
