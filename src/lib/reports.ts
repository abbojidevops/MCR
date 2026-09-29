import { db } from '@/db/repository';

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

  const startIso = startOfDay.toISOString();
  const endIso = endOfDay.toISOString();

  const calls = db.getCallRecords(accountId).filter((c) => c.created_at >= startIso && c.created_at <= endIso);
  const jobs = db.getJobs(accountId).filter((j) => j.created_at >= startIso && j.created_at <= endIso);
  const conversations = db.getConversations(accountId).filter((cv) => cv.created_at >= startIso && cv.created_at <= endIso);

  const missedCallsCount = calls.length;
  const textBacksSent = calls.filter((c) => c.text_back_status === 'sent').length;
  const customersResponded = conversations.length;
  const qualifiedJobsCount = jobs.length;
  const bookedJobsCount = jobs.filter((j) => j.status === 'BOOKED').length;

  const potentiallyRecoveredRevenue = jobs.reduce((sum, j) => sum + (j.estimated_value || 0), 0);
  const actualBookedRevenue = jobs
    .filter((j) => j.status === 'BOOKED')
    .reduce((sum, j) => sum + (j.actual_value || j.estimated_value || 0), 0);

  const summaryText = `TODAY'S MISSED-CALL REPORT for ${businessName}:
• Missed calls: ${missedCallsCount}
• Text-backs sent: ${textBacksSent}
• Customers responded: ${customersResponded}
• Qualified jobs: ${qualifiedJobsCount}
• Booked: ${bookedJobsCount}
• Estimated opportunity value: $${potentiallyRecoveredRevenue.toFixed(2)}`;

  return {
    date: targetDate.toLocaleDateString(),
    businessName,
    missedCallsCount,
    textBacksSent,
    customersResponded,
    qualifiedJobsCount,
    bookedJobsCount,
    potentiallyRecoveredRevenue,
    actualBookedRevenue,
    summaryText,
  };
}

export function generateWeeklyReport(accountId: string, referenceDate: Date = new Date()): WeeklyRecoveryReport {
  const profile = db.getBusinessProfile(accountId);
  const businessName = profile?.business_name || 'Business';

  const sevenDaysAgo = new Date(referenceDate.getTime() - 7 * 24 * 60 * 60 * 1000);
  const startIso = sevenDaysAgo.toISOString();
  const endIso = referenceDate.toISOString();

  const calls = db.getCallRecords(accountId).filter((c) => c.created_at >= startIso && c.created_at <= endIso);
  const jobs = db.getJobs(accountId).filter((j) => j.created_at >= startIso && j.created_at <= endIso);
  const conversations = db.getConversations(accountId).filter((cv) => cv.created_at >= startIso && cv.created_at <= endIso);

  const missedCallsCount = calls.length || 1; // avoid division by 0
  const recoveredConversationsCount = conversations.length;
  const qualifiedJobsCount = jobs.length;
  const bookedJobsCount = jobs.filter((j) => j.status === 'BOOKED').length;
  const deadLeadsCount = jobs.filter((j) => j.status === 'DEAD').length;

  const responseRatePercent = Math.min(100, Math.round((recoveredConversationsCount / missedCallsCount) * 100));
  const recoveryRatePercent = Math.min(100, Math.round((bookedJobsCount / (qualifiedJobsCount || 1)) * 100));

  const estimatedRecoveredValue = jobs.reduce((sum, j) => sum + (j.estimated_value || 0), 0);
  const actualBookedValue = jobs
    .filter((j) => j.status === 'BOOKED')
    .reduce((sum, j) => sum + (j.actual_value || j.estimated_value || 0), 0);

  const summaryText = `Last week ${businessName} received ${missedCallsCount} missed calls.
${recoveredConversationsCount} customers responded to automatic text-back.
${qualifiedJobsCount} became structured qualified job opportunities.
${bookedJobsCount} were marked booked.
Your estimated recovered opportunity value: $${estimatedRecoveredValue.toLocaleString()}.`;

  return {
    startDate: sevenDaysAgo.toLocaleDateString(),
    endDate: referenceDate.toLocaleDateString(),
    businessName,
    missedCallsCount: calls.length,
    recoveredConversationsCount,
    qualifiedJobsCount,
    bookedJobsCount,
    deadLeadsCount,
    responseRatePercent,
    recoveryRatePercent,
    estimatedRecoveredValue,
    actualBookedValue,
    summaryText,
  };
}
