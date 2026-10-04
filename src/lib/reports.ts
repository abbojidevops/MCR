import { db } from '@/db/repository';
import { computeMetrics } from '@/lib/metrics';

export interface DailySummaryReport {
  date: string;
  businessName: string;
  missedCallsCount: number;
  textBacksSent: number;
  customersResponded: number;
  qualifiedJobsCount: number;
  bookedJobsCount: number;
  potentiallyRecoveredRevenue: number;
  actualBookedRevenue: number;
  summaryText: string;
}

export interface WeeklyRecoveryReport {
  startDate: string;
  endDate: string;
  businessName: string;
  missedCallsCount: number;
  recoveredConversationsCount: number;
  qualifiedJobsCount: number;
  bookedJobsCount: number;
  deadLeadsCount: number;
  responseRatePercent: number;
  recoveryRatePercent: number;
  estimatedRecoveredValue: number;
  actualBookedValue: number;
  summaryText: string;
}

export function generateDailySummary(accountId: string, targetDate: Date = new Date()): DailySummaryReport {
  const profile = db.getBusinessProfile(accountId);
  const businessName = profile?.business_name || 'Business';

  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const metrics = computeMetrics(accountId, {
    startDate: startOfDay.toISOString(),
    endDate: endOfDay.toISOString(),
  });

  const potentiallyRecoveredRevenue = metrics.pipelineEstimatedValue + metrics.bookedRevenue + metrics.confirmedRevenue;
  const actualBookedRevenue = metrics.confirmedRevenue;

  const summaryText = `TODAY'S MISSED-CALL REPORT for ${businessName}:
• Missed calls: ${metrics.missedCallsCount}
• Text-backs sent: ${metrics.textsDeliveredCount}
• Customers responded: ${metrics.customersRespondedCount}
• Qualified jobs: ${metrics.qualifiedLeadsCount}
• Booked: ${metrics.bookedJobsCount}
• Estimated opportunity value: $${potentiallyRecoveredRevenue.toFixed(2)}`;

  return {
    date: targetDate.toLocaleDateString(),
    businessName,
    missedCallsCount: metrics.missedCallsCount,
    textBacksSent: metrics.textsDeliveredCount,
    customersResponded: metrics.customersRespondedCount,
    qualifiedJobsCount: metrics.qualifiedLeadsCount,
    bookedJobsCount: metrics.bookedJobsCount,
    potentiallyRecoveredRevenue,
    actualBookedRevenue,
    summaryText,
  };
}

export function generateWeeklyReport(accountId: string, referenceDate: Date = new Date()): WeeklyRecoveryReport {
  const profile = db.getBusinessProfile(accountId);
  const businessName = profile?.business_name || 'Business';

  const sevenDaysAgo = new Date(referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const metrics = computeMetrics(accountId, {
    startDate: sevenDaysAgo.toISOString(),
    endDate: referenceDate.toISOString(),
  });

  const responseRatePercent = metrics.missedCallsCount > 0
    ? Math.min(100, Math.round((metrics.customersRespondedCount / metrics.missedCallsCount) * 100))
    : 0;

  const summaryText = `Last week ${businessName} received ${metrics.missedCallsCount} missed calls.
${metrics.customersRespondedCount} customers responded to automatic text-back.
${metrics.qualifiedLeadsCount} became structured qualified job opportunities.
${metrics.bookedJobsCount} were marked booked.
Your estimated recovered opportunity value: $${metrics.totalPotentialValue.toLocaleString()}.`;

  return {
    startDate: sevenDaysAgo.toLocaleDateString(),
    endDate: referenceDate.toLocaleDateString(),
    businessName,
    missedCallsCount: metrics.missedCallsCount,
    recoveredConversationsCount: metrics.customersRespondedCount,
    qualifiedJobsCount: metrics.qualifiedLeadsCount,
    bookedJobsCount: metrics.bookedJobsCount,
    deadLeadsCount: metrics.deadJobsCount,
    responseRatePercent,
    recoveryRatePercent: metrics.recoveryRatePercent,
    estimatedRecoveredValue: metrics.totalPotentialValue,
    actualBookedValue: metrics.confirmedRevenue,
    summaryText,
  };
}
