import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { computeMetrics, DateRangePreset } from '@/lib/metrics';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || 'acc-apex-plumbing';
    const range = (searchParams.get('range') || 'month') as DateRangePreset;

    const metrics = computeMetrics(accountId, { preset: range });
    const profile = db.getBusinessProfile(accountId);

    return NextResponse.json({
      ...metrics,
      summary: {
        missedCallsCount: metrics.missedCallsCount,
        textsDeliveredCount: metrics.textsDeliveredCount,
        customersRespondedCount: metrics.customersRespondedCount,
        qualifiedLeadsCount: metrics.qualifiedLeadsCount,
        bookedJobsCount: metrics.bookedJobsCount,
        completedJobsCount: metrics.completedJobsCount,
        recoveryRatePercent: metrics.recoveryRatePercent,
        confirmedActualRevenue: metrics.confirmedActualRevenue,
        pipelineEstimatedValue: metrics.pipelineEstimatedValue,
        potentialMissedCallValue: metrics.potentialMissedCallValue,
        softwareReturnMultiple: metrics.softwareReturnMultiple,
        roiMultiple: metrics.softwareReturnMultiple, // backward compatibility
        reportedRecoveredRevenue: metrics.confirmedActualRevenue, // backward compatibility
      },
      forwardingStatus: {
        configured: profile?.forwarding_configured ?? false,
        carrierName: profile?.carrier_name || 'Verizon Wireless',
        emergencyPhone: profile?.emergency_phone || '+12175550199',
        notificationPhone: profile?.notification_phone || '+12175550144',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
