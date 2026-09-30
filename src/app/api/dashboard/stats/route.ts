import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { computeMetrics, DateRangePreset } from '@/lib/metrics';
import { getAuthenticatedAccountId } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // Derive account identity exclusively from session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const { searchParams } = new URL(req.url);
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
        confirmedRevenue: metrics.confirmedRevenue,
        bookedRevenue: metrics.bookedRevenue,
        pipelineEstimatedValue: metrics.pipelineEstimatedValue,
        totalPotentialValue: metrics.totalPotentialValue,
        confirmedActualRevenue: metrics.confirmedRevenue,
        potentialMissedCallValue: metrics.potentialMissedCallValue,
        revenuePerSubscriptionDollar: metrics.revenuePerSubscriptionDollar,
        marginAdjustedMultiple: metrics.marginAdjustedMultiple,
        grossMarginAssumption: metrics.grossMarginAssumption,
        softwareReturnMultiple: metrics.revenuePerSubscriptionDollar,
        reportedRecoveredRevenue: metrics.confirmedRevenue,
      },
      forwardingStatus: {
        configured: profile?.forwarding_configured ?? true,
        carrierName: profile?.carrier_name || 'Verizon Wireless',
        emergencyPhone: profile?.emergency_phone || '+12175550199',
        notificationPhone: profile?.notification_phone || '+12175550144',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
