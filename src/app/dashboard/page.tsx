'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PhoneCall,
  MessageSquare,
  ClipboardList,
  CheckCircle,
  TrendingUp,
  AlertTriangle,
  Clock,
  ArrowRight,
  Phone,
  Flame,
  Wrench,
  DollarSign,
  Info,
  ChevronRight,
  PlusCircle,
  Settings,
  HelpCircle,
  Sparkles,
} from 'lucide-react';
import { JobCard } from '@/types';

interface DashboardStatsResponse {
  businessName: string;
  trade: string;
  subscriptionMonthlyDollars: number;
  summary: {
    missedCallsCount: number;
    textsDeliveredCount: number;
    customersRespondedCount: number;
    qualifiedLeadsCount: number;
    bookedJobsCount: number;
    recoveryRatePercent: number;
    reportedRecoveredRevenue: number;
    confirmedActualRevenue: number;
    pipelineEstimatedValue: number;
    potentialMissedCallValue: number;
    roiMultiple: number | null;
  };
  needsAttention: JobCard[];
  recentLeads: JobCard[];
  forwardingStatus: {
    configured: boolean;
    carrierName: string;
    emergencyPhone: string;
    notificationPhone: string;
  };
}

export default function DashboardOverviewPage() {
  const [data, setData] = useState<DashboardStatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal for Section 15: Add / Update Actual Job Value
  const [valueModalOpen, setValueModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [enteredActualValue, setEnteredActualValue] = useState<string>('');
  const [savingValue, setSavingValue] = useState(false);

  const fetchDashboardStats = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/dashboard/stats?accountId=acc-apex-plumbing');
      if (!res.ok) throw new Error('Failed to load dashboard metrics');
      const json = await res.json();
      setData(json);
      if (json.recentLeads && json.recentLeads.length > 0) {
        setSelectedJobId(json.recentLeads[0].id);
      }
    } catch (err: any) {
      setError(err.message || 'Error loading dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardStats();
  }, []);

  const handleSaveActualValue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId || !enteredActualValue) return;

    setSavingValue(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acc-apex-plumbing',
          jobId: selectedJobId,
          actualValue: Number(enteredActualValue),
          status: 'BOOKED',
        }),
      });
      const resData = await res.json();
      if (resData.success) {
        setValueModalOpen(false);
        setEnteredActualValue('');
        fetchDashboardStats();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingValue(false);
    }
  };

  // Greeting helper based on time of day
  const getGreeting = () => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 17) return 'Good afternoon';
    return 'Good evening';
  };

  if (loading && !data) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 bg-slate-200 rounded-2xl w-2/3"></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-28 bg-slate-200 rounded-2xl"></div>
          <div className="h-28 bg-slate-200 rounded-2xl"></div>
          <div className="h-28 bg-slate-200 rounded-2xl"></div>
          <div className="h-28 bg-slate-200 rounded-2xl"></div>
        </div>
        <div className="h-48 bg-slate-200 rounded-2xl"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-2xl border border-red-200 bg-red-50 p-6 text-center text-red-800">
        <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-red-600" />
        <h3 className="font-bold text-base">Something went wrong while loading your dashboard.</h3>
        <p className="text-xs text-red-600 mt-1">Please check your connection and try again.</p>
        <button
          onClick={fetchDashboardStats}
          className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  const { summary, needsAttention, recentLeads } = data;

  return (
    <div className="space-y-8">
      {/* ---------------- SECTION 3: DASHBOARD HERO ---------------- */}
      <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-blue-50/30 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
              Missed-Call Revenue Recovery System
            </div>
            <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              {getGreeting()}, {data.businessName} 👋
            </h1>
            <div className="mt-2 text-lg sm:text-xl font-extrabold text-emerald-700">
              You&apos;ve recovered{' '}
              <span className="underline decoration-emerald-400 decoration-2 underline-offset-4">
                {summary.bookedJobsCount} potential jobs
              </span>{' '}
              this month.
            </div>
            <p className="mt-1 text-xs sm:text-sm text-slate-500">
              Here&apos;s how MCR is turning missed calls into booked opportunities.
            </p>
          </div>

          {/* Quick Actions (Section 21) */}
          <div className="flex flex-wrap gap-2 pt-2 lg:pt-0">
            <Link
              href="/dashboard/missed-calls"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              <PhoneCall className="h-3.5 w-3.5 text-blue-600" />
              <span>Missed Calls</span>
            </Link>
            <Link
              href="/dashboard/inbox"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              <MessageSquare className="h-3.5 w-3.5 text-indigo-600" />
              <span>Open Inbox</span>
            </Link>
            <Link
              href="/dashboard/jobs?status=NEW"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50 transition"
            >
              <ClipboardList className="h-3.5 w-3.5 text-amber-600" />
              <span>New Leads</span>
            </Link>
            <button
              onClick={() => setValueModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 transition"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Add Job Value</span>
            </button>
            <Link
              href="/dashboard/settings"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-2 text-slate-600 shadow-sm hover:bg-slate-50 transition"
              title="Business Settings"
            >
              <Settings className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </div>

      {/* ---------------- SECTION 4: PRIMARY 4 KPI CARDS ---------------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {/* Card 1: Missed Calls */}
        <Link
          href="/dashboard/missed-calls"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-400 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Missed Calls</span>
            <div className="rounded-lg bg-red-50 p-2 text-red-600">
              <PhoneCall className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900">{summary.missedCallsCount}</div>
          <p className="mt-1 text-xs text-slate-500 font-medium">Calls your team didn&apos;t answer</p>
        </Link>

        {/* Card 2: Leads Recovered */}
        <Link
          href="/dashboard/inbox"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-400 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Leads Recovered</span>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-indigo-600">{summary.customersRespondedCount}</div>
          <p className="mt-1 text-xs text-slate-500 font-medium">Customers who responded</p>
        </Link>

        {/* Card 3: Jobs Booked */}
        <Link
          href="/dashboard/jobs"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-emerald-400 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Jobs Booked</span>
            <div className="rounded-lg bg-emerald-50 p-2 text-emerald-600">
              <CheckCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-emerald-600">{summary.bookedJobsCount}</div>
          <p className="mt-1 text-xs text-slate-500 font-medium">Recovered leads marked booked</p>
        </Link>

        {/* Card 4: Estimated Revenue Recovered */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/40 p-5 shadow-sm relative group">
          <div className="flex items-center justify-between text-emerald-800">
            <div className="flex items-center gap-1.5">
              <span className="text-xs font-bold uppercase tracking-wider text-emerald-900">
                Estimated Revenue Recovered
              </span>
              <div className="cursor-help text-emerald-600" title="Calculated from actual confirmed job invoices and estimated ticket sizes for recovered leads.">
                <Info className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="rounded-lg bg-emerald-100 p-2 text-emerald-700">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-emerald-700">
            {summary.reportedRecoveredRevenue > 0
              ? `$${summary.reportedRecoveredRevenue.toLocaleString()}`
              : 'Revenue tracking not configured'}
          </div>
          <p className="mt-1 text-xs text-emerald-800/80 font-medium">
            Based on reported/estimated job value
          </p>
        </div>
      </div>

      {/* ---------------- SECTION 5: ROI SECTION & SECTION 7: RECOVERY RATE ---------------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* ROI Card (Section 5) */}
        <div className="sm:col-span-2 rounded-2xl border border-blue-200 bg-gradient-to-r from-blue-900 to-slate-900 text-white p-6 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-widest text-blue-300">
                MCR IS WORKING FOR YOU
              </span>
              <h2 className="mt-1 text-2xl font-black tracking-tight">
                {summary.roiMultiple !== null && summary.roiMultiple > 0 ? (
                  <>
                    <span className="text-emerald-400 font-extrabold">{summary.roiMultiple}× ROI</span> on your
                    monthly software
                  </>
                ) : (
                  'ROI will appear once your first recovered job is recorded.'
                )}
              </h2>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-300">
                <div>
                  <span className="text-slate-400">MCR subscription:</span>{' '}
                  <strong className="text-white">${data.subscriptionMonthlyDollars}/month</strong>
                </div>
                <div>
                  <span className="text-slate-400">Reported recovered revenue:</span>{' '}
                  <strong className="text-emerald-400">${summary.reportedRecoveredRevenue.toLocaleString()}</strong>
                </div>
                {summary.roiMultiple !== null && (
                  <div>
                    <span className="text-slate-400">Revenue / subscription:</span>{' '}
                    <strong className="text-emerald-400 font-bold">{summary.roiMultiple}×</strong>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setValueModalOpen(true)}
              className="self-start sm:self-center shrink-0 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md transition"
            >
              + Record Job Value
            </button>
          </div>
        </div>

        {/* Recovery Rate Card (Section 7) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Recovery Rate</span>
              <div className="cursor-help text-slate-400" title="Calculated as: Booked jobs ÷ total missed calls. Reflects your team's measured conversion performance.">
                <Info className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900">{summary.recoveryRatePercent}%</div>
            <p className="mt-1 text-xs text-slate-500 font-medium">Booked jobs ÷ eligible missed calls</p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Team conversion rate</span>
            <span className="font-bold text-slate-700">{summary.bookedJobsCount} of {summary.missedCallsCount} calls</span>
          </div>
        </div>
      </div>

      {/* ---------------- SECTION 6: RECOVERY FUNNEL ---------------- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <h2 className="text-base font-bold text-slate-900">Missed Call Recovery Funnel</h2>
            <p className="text-xs text-slate-500">
              Live conversion progression from unanswered caller to booked revenue. Click any stage to inspect.
            </p>
          </div>
          <span className="text-xs font-bold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 self-start">
            {summary.recoveryRatePercent}% Overall Conversion
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 pt-2">
          {/* Funnel 1: Missed Calls */}
          <Link
            href="/dashboard/missed-calls"
            className="group flex flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-3 hover:border-blue-400 hover:bg-blue-50/40 transition"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-blue-600">
              1. Missed Calls
            </span>
            <span className="mt-2 text-2xl font-black text-slate-900">{summary.missedCallsCount}</span>
            <span className="mt-1 text-[11px] text-slate-500">Inbound calls</span>
          </Link>

          {/* Funnel 2: Texts Delivered */}
          <div className="flex flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              2. Texts Sent
            </span>
            <span className="mt-2 text-2xl font-black text-slate-900">{summary.textsDeliveredCount}</span>
            <span className="mt-1 text-[11px] text-emerald-600 font-medium">&lt;60s text-back</span>
          </div>

          {/* Funnel 3: Customers Responded */}
          <Link
            href="/dashboard/inbox"
            className="group flex flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-3 hover:border-indigo-400 hover:bg-indigo-50/40 transition"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-indigo-600">
              3. Responded
            </span>
            <span className="mt-2 text-2xl font-black text-indigo-600">{summary.customersRespondedCount}</span>
            <span className="mt-1 text-[11px] text-slate-500">Texted back</span>
          </Link>

          {/* Funnel 4: Qualified Leads */}
          <Link
            href="/dashboard/jobs"
            className="group flex flex-col rounded-xl border border-slate-200 bg-slate-50/70 p-3 hover:border-amber-400 hover:bg-amber-50/40 transition"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 group-hover:text-amber-600">
              4. Qualified
            </span>
            <span className="mt-2 text-2xl font-black text-slate-900">{summary.qualifiedLeadsCount}</span>
            <span className="mt-1 text-[11px] text-slate-500">Issue &amp; address</span>
          </Link>

          {/* Funnel 5: Booked Jobs */}
          <Link
            href="/dashboard/jobs"
            className="group flex flex-col rounded-xl border border-emerald-300 bg-emerald-50/60 p-3 hover:border-emerald-500 hover:bg-emerald-100/50 transition"
          >
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
              5. Booked Jobs
            </span>
            <span className="mt-2 text-2xl font-black text-emerald-700">{summary.bookedJobsCount}</span>
            <span className="mt-1 text-[11px] text-emerald-600 font-medium">Scheduled</span>
          </Link>

          {/* Funnel 6: Reported Job Value */}
          <div className="flex flex-col rounded-xl border border-emerald-400 bg-emerald-600 text-white p-3">
            <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-100">
              6. Recovered Value
            </span>
            <span className="mt-2 text-2xl font-black text-white">
              ${summary.reportedRecoveredRevenue.toLocaleString()}
            </span>
            <span className="mt-1 text-[11px] text-emerald-100 font-medium">In your pocket</span>
          </div>
        </div>
      </div>

      {/* ---------------- SECTION 8 & 9: 🔥 NEEDS YOUR ATTENTION SECTION ---------------- */}
      <div className="rounded-2xl border-2 border-red-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-red-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold">
              <Flame className="h-4 w-4 text-red-600 animate-pulse" />
            </span>
            <h2 className="text-base font-extrabold text-slate-900">Needs Your Attention</h2>
          </div>
          <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
            {needsAttention.length} Pending Actions
          </span>
        </div>

        {needsAttention.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-slate-800">All caught up!</p>
            <p className="mt-0.5 text-slate-400">No urgent emergency leads or unanswered customer queries.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {needsAttention.map((lead) => {
              const isEmergency = lead.is_emergency;
              return (
                <div
                  key={lead.id}
                  className={`rounded-2xl border p-4 transition-all ${
                    isEmergency
                      ? 'border-red-300 bg-red-50/40 ring-1 ring-red-200'
                      : 'border-slate-200 bg-slate-50/40 hover:bg-slate-50'
                  }`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-2">
                      {isEmergency ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-extrabold text-white uppercase tracking-wider">
                          <Flame className="h-3 w-3" /> EMERGENCY
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase">
                          New Lead
                        </span>
                      )}
                      <h3 className="font-extrabold text-sm text-slate-900">{lead.title}</h3>
                    </div>

                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-slate-400">Estimated Ticket:</span>
                      <strong className="text-slate-900 font-bold">${lead.estimated_value}</strong>
                    </div>
                  </div>

                  {lead.problem && (
                    <p className="mt-2 text-xs text-slate-700 bg-white/80 p-2.5 rounded-xl border border-slate-200">
                      <strong>Customer message:</strong> &ldquo;{lead.problem}&rdquo;
                    </p>
                  )}

                  <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 border-t border-slate-100 pt-2.5">
                    <div>
                      <strong>Caller:</strong> {lead.contact?.full_name || 'Homeowner'} ({lead.contact?.phone_number || 'Phone captured'})
                      {lead.address && <span className="ml-3">📍 {lead.address}</span>}
                    </div>

                    <div className="flex items-center gap-2">
                      {lead.contact?.phone_number && (
                        <a
                          href={`tel:${lead.contact.phone_number}`}
                          className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 font-bold text-white hover:bg-emerald-700 shadow-sm"
                        >
                          <Phone className="h-3.5 w-3.5" /> Call Customer
                        </a>
                      )}
                      <Link
                        href="/dashboard/inbox"
                        className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-50"
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-blue-600" /> Open Conversation
                      </Link>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ---------------- SECTION 10: RECENT RECOVERED LEADS & REVENUE BREAKDOWN ---------------- */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Recent Recovered Leads (8 cols) */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Recovered Leads</h2>
              <p className="text-xs text-slate-500">Opportunities captured automatically from missed calls.</p>
            </div>
            <Link
              href="/dashboard/jobs"
              className="text-xs font-bold text-blue-600 hover:text-blue-700 inline-flex items-center gap-1"
            >
              View All Jobs <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 text-[11px] font-bold uppercase text-slate-400">
                <tr>
                  <th className="py-2.5 px-3">Customer</th>
                  <th className="py-2.5 px-3">Issue</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Reported Value</th>
                  <th className="py-2.5 px-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {recentLeads.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{job.contact?.full_name || 'Homeowner'}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{job.contact?.phone_number}</div>
                    </td>
                    <td className="py-3 px-3 max-w-xs truncate text-slate-700 font-medium">
                      {job.problem || job.title}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          job.status === 'BOOKED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : job.status === 'CONTACTED'
                            ? 'bg-amber-100 text-amber-800'
                            : job.status === 'NEW'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900">
                      ${job.actual_value || job.estimated_value || '—'}
                    </td>
                    <td className="py-3 px-3 text-right">
                      <Link
                        href="/dashboard/jobs"
                        className="inline-flex items-center gap-1 rounded-lg bg-slate-100 hover:bg-slate-200 px-2.5 py-1 text-[11px] font-bold text-slate-700"
                      >
                        View Lead
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Section 15 & 18: Revenue Tracking & Today's Summary (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          {/* Revenue Breakdown (Section 15) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Revenue Attribution Breakdown</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center p-2 rounded-lg bg-emerald-50/70 border border-emerald-100">
                <div>
                  <span className="font-bold text-emerald-900">Confirmed Actual Revenue</span>
                  <p className="text-[10px] text-emerald-700">Completed invoice values</p>
                </div>
                <strong className="text-base font-black text-emerald-700">
                  ${summary.confirmedActualRevenue.toLocaleString()}
                </strong>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-blue-50/70 border border-blue-100">
                <div>
                  <span className="font-bold text-blue-900">In-Pipeline Estimated</span>
                  <p className="text-[10px] text-blue-700">Qualified leads waiting</p>
                </div>
                <strong className="text-base font-black text-blue-700">
                  ${summary.pipelineEstimatedValue.toLocaleString()}
                </strong>
              </div>

              <div className="flex justify-between items-center p-2 rounded-lg bg-slate-50 border border-slate-200">
                <div>
                  <span className="font-bold text-slate-700">Potential Missed Value</span>
                  <p className="text-[10px] text-slate-500">All missed calls × avg ticket</p>
                </div>
                <strong className="text-base font-black text-slate-700">
                  ${summary.potentialMissedCallValue.toLocaleString()}
                </strong>
              </div>
            </div>
          </div>

          {/* Section 18: Today's Recovery Summary */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Today&apos;s Recovery Summary</h3>
            </div>
            <div className="space-y-1.5 text-xs text-slate-600">
              <div className="flex justify-between">
                <span>Missed calls:</span>
                <strong className="text-slate-900">{summary.missedCallsCount}</strong>
              </div>
              <div className="flex justify-between">
                <span>Text-backs delivered:</span>
                <strong className="text-slate-900">{summary.textsDeliveredCount}</strong>
              </div>
              <div className="flex justify-between">
                <span>Customer responses:</span>
                <strong className="text-indigo-600">{summary.customersRespondedCount}</strong>
              </div>
              <div className="flex justify-between">
                <span>Qualified leads:</span>
                <strong className="text-slate-900">{summary.qualifiedLeadsCount}</strong>
              </div>
              <div className="flex justify-between">
                <span>Jobs booked:</span>
                <strong className="text-emerald-600 font-bold">{summary.bookedJobsCount}</strong>
              </div>
              <div className="flex justify-between border-t border-slate-100 pt-2 font-bold text-slate-900">
                <span>Reported value:</span>
                <span className="text-emerald-700">${summary.reportedRecoveredRevenue.toLocaleString()}</span>
              </div>
            </div>
            <Link
              href="/dashboard/reports"
              className="block w-full text-center rounded-xl border border-slate-200 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
            >
              View Full Reports
            </Link>
          </div>
        </div>
      </div>

      {/* ---------------- MODAL FOR SECTION 15: ADD / UPDATE ACTUAL JOB VALUE ---------------- */}
      {valueModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <DollarSign className="h-5 w-5 text-emerald-600" />
                <h3 className="font-bold text-slate-900">Record Completed Job Revenue</h3>
              </div>
              <button onClick={() => setValueModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Enter the confirmed actual invoice value for completed service jobs to accurately track your recovered ROI.
            </p>

            <form onSubmit={handleSaveActualValue} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Select Recovered Job</label>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {recentLeads.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.title} — {j.contact?.phone_number} (${j.actual_value || j.estimated_value})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Actual Completed Value ($)</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  required
                  placeholder="e.g. 850"
                  value={enteredActualValue}
                  onChange={(e) => setEnteredActualValue(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>

              <div className="pt-2 flex gap-2">
                <button
                  type="button"
                  onClick={() => setValueModalOpen(false)}
                  className="flex-1 rounded-xl border border-slate-200 py-2.5 font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingValue}
                  className="flex-1 rounded-xl bg-emerald-600 hover:bg-emerald-700 py-2.5 font-bold text-white shadow-sm disabled:opacity-50"
                >
                  {savingValue ? 'Saving...' : 'Confirm Revenue'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
