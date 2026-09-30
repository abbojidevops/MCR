import { NextRequest, NextResponse } from 'next/server';
import { computeMetrics, DateRangePreset } from '@/lib/metrics';
import { generateDailySummary, generateWeeklyReport } from '@/lib/reports';
import { getAuthenticatedAccountId } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // Derive account identity exclusively from authenticated session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const { searchParams } = new URL(req.url);
    const range = (searchParams.get('range') || 'month') as DateRangePreset;

    const metrics = computeMetrics(accountId, { preset: range });
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
