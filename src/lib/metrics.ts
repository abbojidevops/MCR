import { db } from '@/db/repository';
import { JobCard, Contact, CallRecord, Conversation } from '@/types';

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

export interface UnifiedMCRMetrics {
  periodLabel: string;
  rangePreset: DateRangePreset;
  startDateIso: string;
  endDateIso: string;
  businessName: string;
  trade: string;
  subscriptionMonthlyDollars: number;
  // Core KPI counts
  missedCallsCount: number;
  textsDeliveredCount: number;
  customersRespondedCount: number;
  qualifiedLeadsCount: number;
  bookedJobsCount: number;
  completedJobsCount: number;
  deadJobsCount: number;
  // Financial metrics (Strictly separated)
  confirmedActualRevenue: number;
  pipelineEstimatedValue: number;
  potentialMissedCallValue: number;
  // Ratio metrics
  recoveryRatePercent: number;
  softwareReturnMultiple: number | null;
  // Funnel
  funnel: FunnelStage[];
  // Action lists
  needsAttention: AttentionItem[];
  recentLeads: RecoveredJobAttribution[];
  recoveredJobsList: RecoveredJobAttribution[];
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

export function computeMetrics(
  accountId: string = 'acc-apex-plumbing',
  options: DateFilterOptions = {}
): UnifiedMCRMetrics {
  const profile = db.getBusinessProfile(accountId);
  const businessName = profile?.business_name || 'Your Business';
  const trade = profile?.trade || 'plumbing';

  const subInfo = db.getSubscription(accountId);
  const plan = subInfo?.plan || (subInfo?.subscription ? db.getPlans().find((p) => p.id === subInfo.subscription?.plan_id) : null);
  const subscriptionMonthlyDollars = plan ? plan.monthly_price_cents / 100 : 149;

  const preset = options.preset || 'month';
  const now = new Date();

  let start: Date;
  let end: Date = new Date();
  let periodLabel = '';

  switch (preset) {
    case 'today': {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
      end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);
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
    case 'month':
    default: {
      start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
      periodLabel = `${now.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })} (Current Month)`;
      break;
    }
  }

  if (options.startDate) {
    start = new Date(options.startDate);
  }
  if (options.endDate) {
    end = new Date(options.endDate);
  }

  const startIso = start.toISOString();
  const endIso = end.toISOString();

  // Load raw records directly from repository
  const allCalls = db.getCallRecords(accountId);
  const allJobs = db.getJobs(accountId);
  const allConvs = db.getConversations(accountId);

  // Filter strictly by date interval
  const callsInPeriod = allCalls.filter((c) => c.created_at >= startIso && c.created_at <= endIso);
  const jobsInPeriod = allJobs.filter((j) => j.created_at >= startIso && j.created_at <= endIso);
  const convsInPeriod = allConvs.filter((cv) => cv.created_at >= startIso && cv.created_at <= endIso);

  // Fallback for demo when today is empty: if today or yesterday has no records, fallback to all available
  const effectiveCalls = callsInPeriod.length > 0 ? callsInPeriod : allCalls;
  const effectiveJobs = jobsInPeriod.length > 0 ? jobsInPeriod : allJobs;
  const effectiveConvs = convsInPeriod.length > 0 ? convsInPeriod : allConvs;

  // Single source counts
  const missedCallsCount = effectiveCalls.length;
  const textsDeliveredCount = effectiveCalls.filter((c) => c.text_back_status === 'sent').length;
  const customersRespondedCount = effectiveConvs.length;
  const qualifiedLeadsCount = effectiveJobs.length;

  const bookedJobs = effectiveJobs.filter((j) => j.status === 'BOOKED' || j.status === 'COMPLETED');
  const bookedJobsCount = bookedJobs.length;

  const completedJobs = effectiveJobs.filter((j) => j.status === 'COMPLETED');
  const completedJobsCount = completedJobs.length;

  const deadJobsCount = effectiveJobs.filter((j) => j.status === 'DEAD').length;

  // Revenue definitions: Strictly separated
  // 1. Confirmed Actual Revenue: confirmed actual_value on completed/booked jobs
  const confirmedActualRevenue = effectiveJobs
    .filter((j) => j.status === 'COMPLETED' || (j.status === 'BOOKED' && j.actual_value !== undefined))
    .reduce((sum, j) => sum + (j.actual_value || 0), 0);

  // 2. In-Pipeline Estimated Value: leads still in progress (NEW or CONTACTED)
  const pipelineEstimatedValue = effectiveJobs
    .filter((j) => j.status === 'NEW' || j.status === 'CONTACTED')
    .reduce((sum, j) => sum + (j.estimated_value || 0), 0);

  // 3. Potential Missed Call Value: early opportunity estimate ($650 average ticket * total missed calls)
  const potentialMissedCallValue = missedCallsCount * 650;

  // Recovery Rate: (Booked + Completed jobs) / eligible missed calls
  const recoveryRatePercent =
    missedCallsCount > 0
      ? Number(Math.min(100, (bookedJobsCount / missedCallsCount) * 100).toFixed(1))
      : 0;

  // Software Return: Confirmed Actual Revenue / Subscription cost
  const softwareReturnMultiple =
    subscriptionMonthlyDollars > 0 && confirmedActualRevenue > 0
      ? Number((confirmedActualRevenue / subscriptionMonthlyDollars).toFixed(1))
      : null;

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
      conversionFromPrev: bookedJobsCount > 0 ? Number(((completedJobsCount / bookedJobsCount) * 100).toFixed(0)) : 0,
    },
    {
      key: 'actual_revenue',
      label: 'ACTUAL REVENUE',
      count: completedJobsCount,
      conversionFromPrev: 100,
      valueDollars: confirmedActualRevenue,
    },
  ];

  // "Needs Your Attention" Section:
  // Only show leads requiring human action, prioritized by:
  // 1. Emergency leads not closed/completed
  // 2. Customers waiting for callback / response (NEW status)
  // 3. Contacted leads needing booking
  const needsAttention: AttentionItem[] = allJobs
    .filter((j) => j.status !== 'DEAD' && j.status !== 'COMPLETED')
    .sort((a, b) => {
      if (a.is_emergency && !b.is_emergency) return -1;
      if (!a.is_emergency && b.is_emergency) return 1;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    })
    .map((job) => {
      const contact = job.contact || db.getContact(job.contact_id);
      const customerName = contact?.full_name?.trim() ? contact.full_name : 'Unknown Caller';

      let recommendedAction = 'Call back to schedule estimate';
      if (job.is_emergency) {
        recommendedAction = 'URGENT: Call immediately to dispatch emergency technician';
      } else if (job.status === 'NEW') {
        recommendedAction = 'Review qualified intake and call customer';
      } else if (job.status === 'CONTACTED') {
        recommendedAction = 'Follow up with pricing estimate & confirm booking';
      } else if (job.status === 'BOOKED') {
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
        priority: (job.is_emergency ? 'Emergency' : job.status === 'NEW' ? 'High' : 'Normal') as 'Emergency' | 'High' | 'Normal',
        status: job.status,
        recommendedAction,
        timeSince: formatRelativeTime(job.created_at),
        createdAt: job.created_at,
        isEmergency: job.is_emergency,
      };
    })
    .slice(0, 5);

  // Traceable Recovered Jobs Attribution List
  const recoveredJobsList: RecoveredJobAttribution[] = allJobs
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
    })
    .sort((a, b) => new Date(b.createdDate).getTime() - new Date(a.createdDate).getTime());

  const recentLeads = recoveredJobsList.slice(0, 6);

  return {
    periodLabel,
    rangePreset: preset,
    startDateIso: startIso,
    endDateIso: endIso,
    businessName,
    trade,
    subscriptionMonthlyDollars,
    missedCallsCount,
    textsDeliveredCount,
    customersRespondedCount,
    qualifiedLeadsCount,
    bookedJobsCount,
    completedJobsCount,
    deadJobsCount,
    confirmedActualRevenue,
    pipelineEstimatedValue,
    potentialMissedCallValue,
    recoveryRatePercent,
    softwareReturnMultiple,
    funnel,
    needsAttention,
    recentLeads,
    recoveredJobsList,
  };
}
