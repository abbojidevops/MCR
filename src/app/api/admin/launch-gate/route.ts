import { NextRequest, NextResponse } from 'next/server';
import { evaluateLaunchGates } from '@/lib/launch-gate';

export const dynamic = 'force-dynamic';

export async function GET(_req: NextRequest) {
  try {
    const report = evaluateLaunchGates();
    return NextResponse.json(report, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      { error: error?.message || 'Failed to evaluate launch gates' },
      { status: 500 }
    );
  }
}
