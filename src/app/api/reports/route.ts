import { NextRequest, NextResponse } from 'next/server';
import { generateDailySummary, generateWeeklyReport } from '@/lib/reports';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || 'acc-apex-plumbing';
    const type = searchParams.get('type') || 'both';

    const daily = type === 'weekly' ? null : generateDailySummary(accountId);
    const weekly = type === 'daily' ? null : generateWeeklyReport(accountId);

    return NextResponse.json({ daily, weekly });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
