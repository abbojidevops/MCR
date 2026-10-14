import { NextRequest, NextResponse } from 'next/server';
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
    const simulatedExclusions = getSimulatedExclusions(accountId);

    return NextResponse.json({
      ...metrics,
      simulatedExclusions,
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
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
