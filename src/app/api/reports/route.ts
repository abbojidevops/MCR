import { NextRequest, NextResponse } from 'next/server';
import { computeMetrics, DateRangePreset } from '@/lib/metrics';
import { generateDailySummary, generateWeeklyReport } from '@/lib/reports';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || 'acc-apex-plumbing';
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
