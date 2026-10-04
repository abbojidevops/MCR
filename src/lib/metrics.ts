import { db } from '@/db/repository';
import { JobCard, Contact, CallRecord, Conversation } from '@/types';
import { DEFAULT_GROSS_MARGIN, DEFAULT_AVERAGE_TICKET } from '@/lib/constants';

export type DateRangePreset = 'today' | 'yesterday' | 'week' | 'month' | 'last_month' | 'all';

export interface DateFilterOptions {
  preset?: DateRangePreset;
  startDate?: string;
  endDate?: string;
}

export interface FunnelStage {
  key: 'missed_calls' | 'text_backs' | 'responded' | 'qualified' | 'booked' | 'completed' | 'actual_revenue';
  label: string;
  count: number;
  conversionFromPrev: number;
  valueDollars?: number;
}

export interface AttentionItem {
  id: string;
  jobId: string;
  conversationId?: string;
  contactId: string;
  customerName: string;
  phone: string;
  address?: string;
  issue: string;
  priority: 'Emergency' | 'High' | 'Normal';
  status: string;
  recommendedAction: string;
  timeSince: string;
  createdAt: string;
  isEmergency: boolean;
}

export interface RecoveredJobAttribution {
  id: string;
  customerName: string;
  phone: string;
  address?: string;
  issue: string;
  recoverySource: string;
  status: string;
  isEmergency: boolean;
  estimatedValue: number;
  actualRevenue?: number;
  completedDate?: string;
  createdDate: string;
  timeSince: string;
}

export interface TextBackGapAnalysis {
  suppressedDedupe: number;    // Suppressed by 2-hour deduplication window
  suppressedOptOut: number;    // Blocked by STOP suppression
  suppressedQuietHours: number; // Queued outside 8am–9pm (delivering at 8:05am)
  failedDelivery: number;      // Carrier/telecom delivery issue
  totalUndelivered: number;
}

export interface UnifiedMCRMetrics {
  periodLabel: string;
  rangePreset: DateRangePreset;
  startDateIso: string;
  endDateIso: string;
  businessName: string;
  trade: string;
  isDemo: boolean;
  subscriptionMonthlyDollars: number;

  // Core KPI counts
  missedCallsCount: number;
  textsDeliveredCount: number;
  customersRespondedCount: number;
  qualifiedLeadsCount: number;
  bookedJobsCount: number;
  completedJobsCount: number;
  deadJobsCount: number;

  // --------------------------------------------------------------------------
  // PART 1.3: FOUR STRICTLY SEPARATED REVENUE FIGURES
  // Never sum confirmed and pipeline revenue into a single number!
  // --------------------------------------------------------------------------
  confirmedRevenue: number;         // 1. Completed jobs only ($1,207.50)
  bookedRevenue: number;            // 2. Booked, not yet completed ($650.00)
  pipelineEstimatedValue: number;   // 3. In-pipeline unclosed leads ($2,470.00)
  totalPotentialValue: number;      // 4. Total potential if everything closed ($4,327.50)

  // Legacy alias for confirmedRevenue so existing components continue to work
  confirmedActualRevenue: number;

  // Potential Missed Call Value estimate and basis
  potentialMissedCallValue: number;
  averageTicketAssumption: number;

  // Recovery Rate: (Booked + Completed) / Missed Calls
  recoveryRatePercent: number;

  // --------------------------------------------------------------------------
  // PART 1.4: REVENUE PER SUBSCRIPTION DOLLAR (NO "RETURN" OR "ROI" CLAIMS)
  // --------------------------------------------------------------------------
  revenuePerSubscriptionDollar: number | null; // e.g. 4.0× at $299/mo with $1,207.50 confirmed
  marginAdjustedMultiple: number | null;       // at 40% margin: 1.6×
  grossMarginAssumption: number;              // 0.40

  // Alias for backward compatibility
  softwareReturnMultiple: number | null;

  // --------------------------------------------------------------------------
  // PART 3.8: TEXT-BACK GAP BREAKDOWN
  // --------------------------------------------------------------------------
  textBackGapAnalysis: TextBackGapAnalysis;

  // Funnel
  funnel: FunnelStage[];

  // Action lists
  needsAttention: AttentionItem[];
  recentLeads: RecoveredJobAttribution[];
  recoveredJobsList: RecoveredJobAttribution[];

  // Convenience summary object
  summary: Record<string, any>;
  forwardingStatus: Record<string, any>;
}

function formatRelativeTime(dateStr: string): string {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  if (diffMs < 0) return 'Just now';
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return `${Math.max(1, mins)}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

/**
 * Effective helpers: Filter out any simulated activity from customer-facing calculations.
 * (Reference: simulation.ts, src/lib/metrics.ts effective* helpers)
 */
export function effectiveCallsForAccount(accountId: string): CallRecord[] {
  return db.getCallRecords(accountId).filter((c) => !c.is_simulated);
}

export function effectiveJobsForAccount(accountId: string): (JobCard & { contact?: Contact })[] {
  return db.getJobs(accountId).filter((j) => !j.is_simulated);
}

export function effectiveConversationsForAccount(accountId: string): Conversation[] {
  return db.getConversations(accountId).filter((cv) => !cv.is_simulated);
}

export function getSimulatedExclusions(accountId: string): {
  callsCount: number;
  jobsCount: number;
  conversationsCount: number;
  disclosure: string | null;
} {
  const allCalls = db.getCallRecords(accountId);
  const allJobs = db.getJobs(accountId);
  const allConvs = db.getConversations(accountId);

  const callsCount = allCalls.filter((c) => c.is_simulated).length;
  const jobsCount = allJobs.filter((j) => j.is_simulated).length;
  const conversationsCount = allConvs.filter((cv) => cv.is_simulated).length;

  let disclosure: string | null = null;
  if (callsCount > 0 || jobsCount > 0) {
    const callText = `${callsCount} simulated call${callsCount === 1 ? '' : 's'}`;
    const jobText = `${jobsCount} simulated job${jobsCount === 1 ? '' : 's'}`;
    disclosure = `${callText} and ${jobText} are excluded from these numbers`;
  }

  return { callsCount, jobsCount, conversationsCount, disclosure };
}

export function computeMetrics(
  accountId: string = 'acc-apex-plumbing',
  options: DateFilterOptions = {}
): UnifiedMCRMetrics {
  const profile = db.getBusinessProfile(accountId);
  const businessName = profile?.business_name || 'Your Business';
  const trade = profile?.trade || 'plumbing';
  const isDemo = profile?.is_demo !== undefined ? profile.is_demo : accountId === 'acc-apex-plumbing';

  const subInfo = db.getSubscription(accountId);
  // Round 2: Read strictly from account subscription ($149/mo for Pro tier)
  const subscriptionMonthlyDollars = subInfo.plan?.monthly_price_cents
    ? subInfo.plan.monthly_price_cents / 100
    : 149;

  // Date filtering logic
  const now = new Date();
  const preset = options.preset || (options.startDate || options.endDate ? 'month' : 'all');

  let start: Date;
  let end: Date = now;
  let periodLabel = '';

  switch (preset) {
    case 'today': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      periodLabel = `Today (${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`;
      break;
    }
    case 'yesterday': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate() - 1, 23, 59, 59, 999);
      periodLabel = `Yesterday (${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`;
      break;
    }
    case 'week': {
      start = new Date(now.getTime() - 7 * 86400000);
      periodLabel = `Last 7 Days (${start.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})`;
      break;
    }
    case 'last_month': {
      start = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
      periodLabel = start.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
      break;
    }
    case 'all': {
      start = new Date('2020-01-01T00:00:00Z');
      periodLabel = 'All Time';
      break;
    }
    case 'month': {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      periodLabel = `${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} (Current Month)`;
      break;
    }
    default: {
      start = new Date('2020-01-01T00:00:00Z');
      periodLabel = 'All Time';
      break;
    }
  }

  if (options.startDate || options.endDate) {
    if (options.startDate) {
      start = new Date(options.startDate);
    }
    if (options.endDate) {
      end = new Date(options.endDate);
    }
    const startStr = start.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    const endStr = end.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'UTC' });
    periodLabel = `${startStr} – ${endStr}`;
  }

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // Load records filtered strictly to exclude simulated records
  const allCalls = effectiveCallsForAccount(accountId);
  const allJobs = effectiveJobsForAccount(accountId);
  const allConvs = effectiveConversationsForAccount(accountId);

  // Filter strictly by date interval
  const callsInPeriod = allCalls.filter((c) => c.created_at >= startIso && c.created_at <= endIso);
  const jobsInPeriod = allJobs.filter((j) => j.created_at >= startIso && j.created_at <= endIso);
  const convsInPeriod = allConvs.filter((cv) => cv.created_at >= startIso && cv.created_at <= endIso);

  // Strict honest filtering: an empty period reports empty. Preset 'all' includes all records.
  const isAllTime = preset === 'all' && !options.startDate && !options.endDate;
  const effectiveCalls = isAllTime ? allCalls : callsInPeriod;
  const effectiveJobs = isAllTime ? allJobs : jobsInPeriod;
  const effectiveConvs = isAllTime ? allConvs : convsInPeriod;

  // Single source counts
  const missedCallsCount = effectiveCalls.length;
  const textsDeliveredCount = effectiveCalls.filter((c) => c.text_back_status === 'sent').length;
  const customersRespondedCount = effectiveConvs.length;
  const qualifiedLeadsCount = effectiveJobs.length;

  const bookedJobs = effectiveJobs.filter((j) => (j.status || '').toUpperCase() === 'BOOKED');
  const bookedJobsCount = bookedJobs.length;

  const completedJobs = effectiveJobs.filter((j) => (j.status || '').toUpperCase() === 'COMPLETED');
  const completedJobsCount = completedJobs.length;

  const deadJobsCount = effectiveJobs.filter((j) => (j.status || '').toUpperCase() === 'DEAD').length;

  // --------------------------------------------------------------------------
  // PART 1.3: FOUR STRICTLY SEPARATED REVENUE FIGURES
  // Rule: Never sum confirmed and pipeline revenue into a single number!
  // --------------------------------------------------------------------------

  // 1. Confirmed Revenue: COMPLETED jobs only
  const confirmedRevenue = effectiveJobs
    .filter((j) => (j.status || '').toUpperCase() === 'COMPLETED')
    .reduce((sum, j) => sum + (j.actual_value || 0), 0);

  // 2. Booked, not yet completed: BOOKED jobs only
  const bookedRevenue = effectiveJobs
    .filter((j) => (j.status || '').toUpperCase() === 'BOOKED')
    .reduce((sum, j) => sum + (j.actual_value || j.estimated_value || 0), 0);

  // 3. In-pipeline (unclosed leads): NEW or CONTACTED
  const pipelineEstimatedValue = effectiveJobs
    .filter((j) => {
      const s = (j.status || '').toUpperCase();
      return s === 'NEW' || s === 'CONTACTED';
    })
    .reduce((sum, j) => sum + (j.estimated_value || 0), 0);

  // 4. Total potential if everything closed: sum of all 3
  const totalPotentialValue = confirmedRevenue + bookedRevenue + pipelineEstimatedValue;

  // Alias for backward compatibility
  const confirmedActualRevenue = confirmedRevenue;

  const averageTicketAssumption = profile?.average_ticket || DEFAULT_AVERAGE_TICKET;

  // Potential Missed Call Value: early opportunity estimate ($650 average ticket * total missed calls)
  const potentialMissedCallValue = missedCallsCount * averageTicketAssumption;

  // Recovery Rate: (Booked + Completed jobs) / eligible missed calls
  const recoveryRatePercent =
    missedCallsCount > 0
      ? Number(Math.min(100, ((bookedJobsCount + completedJobsCount) / missedCallsCount) * 100).toFixed(1))
      : 0;

  // --------------------------------------------------------------------------
  // PART 1.4: REVENUE RECOVERED PER $1 OF SUBSCRIPTION
  // --------------------------------------------------------------------------
  const revenuePerSubscriptionDollar =
    subscriptionMonthlyDollars > 0 && confirmedRevenue > 0
      ? Number((confirmedRevenue / subscriptionMonthlyDollars).toFixed(1))
      : null;

  const marginAdjustedMultiple =
    subscriptionMonthlyDollars > 0 && confirmedRevenue > 0
      ? Number(((confirmedRevenue * DEFAULT_GROSS_MARGIN) / subscriptionMonthlyDollars).toFixed(1))
      : null;

  // Backward compatibility alias
  const softwareReturnMultiple = revenuePerSubscriptionDollar;

  // --------------------------------------------------------------------------
  // PART 3.8: TEXT-BACK GAP ANALYSIS (Why missed calls did not get a text-back)
  // --------------------------------------------------------------------------
  const suppressedDedupe = effectiveCalls.filter((c) => c.text_back_status === 'deduplicated').length;
  const suppressedOptOut = effectiveCalls.filter((c) => c.text_back_status === 'suppressed').length;
  const suppressedQuietHours = effectiveCalls.filter(
    (c) => c.text_back_status === 'pending' || (c as any).text_back_status === 'quiet_hours'
  ).length;
  const failedDelivery = effectiveCalls.filter((c) => (c as any).text_back_status === 'failed').length;
  const totalUndelivered = Math.max(0, missedCallsCount - textsDeliveredCount);

  const textBackGapAnalysis: TextBackGapAnalysis = {
    suppressedDedupe,
    suppressedOptOut,
    suppressedQuietHours,
    failedDelivery,
    totalUndelivered,
  };

  // Recovery Funnel (6 sequential stages)
  const funnel: FunnelStage[] = [
    {
      key: 'missed_calls',
      label: 'MISSED CALLS',
      count: missedCallsCount,
      conversionFromPrev: 100,
    },
    {
      key: 'text_backs',
      label: 'TEXT-BACKS',
      count: textsDeliveredCount,
      conversionFromPrev: missedCallsCount > 0 ? Number(((textsDeliveredCount / missedCallsCount) * 100).toFixed(0)) : 0,
    },
    {
      key: 'responded',
      label: 'RESPONDED',
      count: customersRespondedCount,
      conversionFromPrev: textsDeliveredCount > 0 ? Number(((customersRespondedCount / textsDeliveredCount) * 100).toFixed(0)) : 0,
    },
    {
      key: 'qualified',
      label: 'QUALIFIED',
      count: qualifiedLeadsCount,
      conversionFromPrev: customersRespondedCount > 0 ? Number(((qualifiedLeadsCount / customersRespondedCount) * 100).toFixed(0)) : 0,
    },
    {
      key: 'booked',
      label: 'BOOKED',
      count: bookedJobsCount,
      conversionFromPrev: qualifiedLeadsCount > 0 ? Number(((bookedJobsCount / qualifiedLeadsCount) * 100).toFixed(0)) : 0,
    },
    {
      key: 'completed',
      label: 'COMPLETED',
      count: completedJobsCount,
      conversionFromPrev: (bookedJobsCount + completedJobsCount) > 0 ? Number(((completedJobsCount / (bookedJobsCount + completedJobsCount)) * 100).toFixed(0)) : 0,
    },
    {
      key: 'actual_revenue',
      label: 'CONFIRMED REVENUE',
      count: completedJobsCount,
      conversionFromPrev: 100,
      valueDollars: confirmedRevenue,
    },
  ];

  // "Needs Your Attention" Section:
  // Only show leads requiring human action, prioritized by:
  // 1. Emergency leads not closed/completed
  // 2. Customers waiting for callback / response (NEW status)
  // 3. Contacted leads needing booking
  const needsAttention: AttentionItem[] = allJobs
    .filter((j) => (j.status || '').toUpperCase() !== 'DEAD' && (j.status || '').toUpperCase() !== 'COMPLETED')
    .sort((a, b) => {
      if (a.is_emergency && !b.is_emergency) return -1;
      if (!a.is_emergency && b.is_emergency) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .map((job) => {
      const contact = job.contact || db.getContact(job.contact_id);
      const customerName = contact?.full_name?.trim() ? contact.full_name : 'Unknown Caller';

      let recommendedAction = 'Call back to schedule estimate';
      const statusUpper = (job.status || '').toUpperCase();
      if (job.is_emergency) {
        recommendedAction = 'URGENT: Call immediately to dispatch emergency technician';
      } else if (statusUpper === 'NEW') {
        recommendedAction = 'Review qualified intake and call customer';
      } else if (statusUpper === 'CONTACTED') {
        recommendedAction = 'Follow up with pricing estimate & confirm booking';
      } else if (statusUpper === 'BOOKED') {
        recommendedAction = 'Technician assigned — confirm appointment arrival';
      }

      return {
        id: job.id,
        jobId: job.id,
        conversationId: job.conversation_id,
        contactId: job.contact_id,
        customerName,
        phone: contact?.phone_number || '',
        address: job.address || contact?.address,
        issue: job.problem || job.title,
        priority: (job.is_emergency ? 'Emergency' : statusUpper === 'NEW' ? 'High' : 'Normal') as 'Emergency' | 'High' | 'Normal',
        status: job.status,
        recommendedAction,
        timeSince: formatRelativeTime(job.created_at),
        createdAt: job.created_at,
        isEmergency: job.is_emergency,
      };
    })
    .slice(0, 5);

  // Traceable Recovered Jobs Attribution List
  const recoveredJobsList: RecoveredJobAttribution[] = effectiveJobs
    .map((job) => {
      const contact = job.contact || db.getContact(job.contact_id);
      const customerName = contact?.full_name?.trim() ? contact.full_name : 'Unknown Caller';

      return {
        id: job.id,
        customerName,
        phone: contact?.phone_number || '',
        address: job.address || contact?.address,
        issue: job.problem || job.title,
        recoverySource: job.recovery_source || 'Missed Call',
        status: job.status,
        isEmergency: job.is_emergency,
        estimatedValue: job.estimated_value,
        actualRevenue: job.actual_value,
        completedDate: job.completed_time ? new Date(job.completed_time).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined,
        createdDate: new Date(job.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        timeSince: formatRelativeTime(job.created_at),
      };
    });

  // Recent leads list
  const recentLeads = recoveredJobsList.slice(0, 6);

  return {
    periodLabel,
    rangePreset: preset,
    startDateIso: startIso,
    endDateIso: endIso,
    businessName,
    trade,
    isDemo,
    subscriptionMonthlyDollars,
    missedCallsCount,
    textsDeliveredCount,
    customersRespondedCount,
    qualifiedLeadsCount,
    bookedJobsCount,
    completedJobsCount,
    deadJobsCount,
    confirmedRevenue,
    bookedRevenue,
    pipelineEstimatedValue,
    totalPotentialValue,
    confirmedActualRevenue,
    potentialMissedCallValue,
    averageTicketAssumption,
    recoveryRatePercent,
    revenuePerSubscriptionDollar,
    marginAdjustedMultiple,
    grossMarginAssumption: DEFAULT_GROSS_MARGIN,
    softwareReturnMultiple,
    textBackGapAnalysis,
    funnel,
    needsAttention,
    recentLeads,
    recoveredJobsList,
    summary: {
      missedCallsCount,
      textsDeliveredCount,
      customersRespondedCount,
      qualifiedLeadsCount,
      bookedJobsCount,
      completedJobsCount,
      recoveryRatePercent,
      confirmedRevenue,
      bookedRevenue,
      pipelineEstimatedValue,
      totalPotentialValue,
      confirmedActualRevenue,
      potentialMissedCallValue,
      averageTicketAssumption,
      revenuePerSubscriptionDollar,
      marginAdjustedMultiple,
      grossMarginAssumption: DEFAULT_GROSS_MARGIN,
      softwareReturnMultiple,
      reportedRecoveredRevenue: confirmedRevenue,
    },
    forwardingStatus: {
      configured: profile?.forwarding_configured ?? (isDemo ? true : false),
      carrierName: profile?.carrier_name || (isDemo ? 'Verizon Wireless' : ''),
      emergencyPhone: profile?.emergency_phone || (isDemo ? '+12175550199' : ''),
      notificationPhone: profile?.notification_phone || (isDemo ? '+12175550144' : ''),
    },
  };
}

export const getRevenueMetrics = computeMetrics;
