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
  Calendar,
  Check,
} from 'lucide-react';
import { UnifiedMCRMetrics, DateRangePreset, AttentionItem, RecoveredJobAttribution } from '@/lib/metrics';

export default function DashboardOverviewPage() {
  const [range, setRange] = useState<DateRangePreset>('month');
  const [data, setData] = useState<UnifiedMCRMetrics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modal for Section 15: Add / Update Actual Job Value
  const [valueModalOpen, setValueModalOpen] = useState(false);
  const [selectedJobId, setSelectedJobId] = useState<string>('');
  const [enteredActualValue, setEnteredActualValue] = useState<string>('');
  const [savingValue, setSavingValue] = useState(false);

  const fetchDashboardStats = async (selectedRange: DateRangePreset = range) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/dashboard/stats?accountId=acc-apex-plumbing&range=${selectedRange}`);
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
    fetchDashboardStats(range);
  }, [range]);

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
          status: 'COMPLETED',
        }),
      });
      const resData = await res.json();
      if (resData.success) {
        setValueModalOpen(false);
        setEnteredActualValue('');
        fetchDashboardStats(range);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSavingValue(false);
    }
  };

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
          onClick={() => fetchDashboardStats(range)}
          className="mt-4 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white hover:bg-red-700"
        >
          Try Again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* ---------------- SECTION 3: DASHBOARD HERO ---------------- */}
      <div className="rounded-3xl border border-slate-200/80 bg-gradient-to-br from-white via-slate-50 to-blue-50/30 p-6 sm:p-8 shadow-sm">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold uppercase tracking-wider text-blue-600">
                Missed-Call Revenue Recovery System
              </span>
              <span className="rounded-full bg-blue-100/70 text-blue-700 px-2 py-0.5 text-[10px] font-bold">
                {data.periodLabel}
              </span>
            </div>
            <h1 className="mt-1 text-2xl sm:text-3xl font-black tracking-tight text-slate-900">
              {getGreeting()}, {data.businessName} 👋
            </h1>
            <div className="mt-2 text-base sm:text-lg font-bold text-slate-800">
              You&apos;ve recovered{' '}
              <span className="text-emerald-700 font-extrabold underline decoration-emerald-400 decoration-2 underline-offset-4">
                {data.bookedJobsCount} booked jobs
              </span>{' '}
              ({data.completedJobsCount} completed) generating{' '}
              <span className="text-emerald-700 font-extrabold">${data.confirmedActualRevenue.toLocaleString()}</span>{' '}
              in confirmed revenue.
            </div>
          </div>

          {/* Date Range Selector (Section 10) */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-xs">
              {(
                [
                  { label: 'Today', value: 'today' },
                  { label: 'Yesterday', value: 'yesterday' },
                  { label: 'This Week', value: 'week' },
                  { label: 'This Month', value: 'month' },
                  { label: 'All Time', value: 'all' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.value}
                  onClick={() => setRange(tab.value)}
                  className={`rounded-lg px-2.5 py-1.5 font-bold transition text-xs ${
                    range === tab.value
                      ? 'bg-blue-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <button
              onClick={() => setValueModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Record Job Revenue</span>
            </button>
          </div>
        </div>
      </div>

      {/* ---------------- SECTION 4 & 11: PRIMARY KPI CARDS ---------------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {/* Card 1: Missed Calls */}
        <Link
          href="/dashboard/missed-calls"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-400 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Missed Calls</span>
            <div className="rounded-lg bg-red-50 p-2 text-red-600">
              <PhoneCall className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-slate-900">{data.missedCallsCount}</div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">Unanswered calls in period</p>
        </Link>

        {/* Card 2: Leads Recovered */}
        <Link
          href="/dashboard/inbox"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-indigo-400 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Leads Recovered</span>
            <div className="rounded-lg bg-indigo-50 p-2 text-indigo-600">
              <MessageSquare className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-indigo-600">{data.customersRespondedCount}</div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">Text-back conversations</p>
        </Link>

        {/* Card 3: Jobs Booked */}
        <Link
          href="/dashboard/jobs"
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-400 hover:shadow-md transition"
        >
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Jobs Booked</span>
            <div className="rounded-lg bg-blue-50 p-2 text-blue-600">
              <CheckCircle className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-blue-600">{data.bookedJobsCount}</div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">{data.completedJobsCount} already completed</p>
        </Link>

        {/* Card 4: Estimated Pipeline (Strictly separated) */}
        <div className="rounded-2xl border border-blue-200 bg-blue-50/30 p-5 shadow-sm">
          <div className="flex items-center justify-between text-blue-800">
            <span className="text-[11px] font-bold uppercase tracking-wider text-blue-900">
              Estimated Pipeline
            </span>
            <div className="rounded-lg bg-blue-100 p-2 text-blue-700">
              <ClipboardList className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-blue-800">
            ${data.pipelineEstimatedValue.toLocaleString()}
          </div>
          <p className="mt-1 text-[11px] text-blue-900/70 font-medium">
            Active unclosed leads
          </p>
        </div>

        {/* Card 5: Confirmed Actual Revenue (Section 8) */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <div className="flex items-center justify-between text-emerald-800">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-950">
                Actual Revenue
              </span>
              <div className="cursor-help text-emerald-700" title="Confirmed invoiced amount recorded for completed jobs. Never mixed with pipeline estimates.">
                <Info className="h-3.5 w-3.5" />
              </div>
            </div>
            <div className="rounded-lg bg-emerald-100 p-2 text-emerald-800">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="mt-3 text-3xl font-black text-emerald-700">
            ${data.confirmedActualRevenue.toLocaleString()}
          </div>
          <p className="mt-1 text-[11px] text-emerald-800 font-medium">
            Confirmed completed revenue
          </p>
        </div>
      </div>

      {/* ---------------- SECTION 12 & 13: SOFTWARE RETURN & RECOVERY RATE ---------------- */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Software Return Card (Section 13) */}
        <div className="sm:col-span-2 rounded-2xl border border-blue-200 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-300">
                <Sparkles className="h-3 w-3" /> Section 13: Software Return
              </div>
              <h2 className="mt-2 text-2xl font-black tracking-tight">
                {data.softwareReturnMultiple !== null && data.softwareReturnMultiple > 0 ? (
                  <>
                    <span className="text-emerald-400 font-extrabold">{data.softwareReturnMultiple}× Software Return</span> on your MCR subscription
                  </>
                ) : (
                  'Software return will calculate as soon as your first completed revenue is logged.'
                )}
              </h2>
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-300">
                <div>
                  <span className="text-slate-400">Subscription:</span>{' '}
                  <strong className="text-white">${data.subscriptionMonthlyDollars}/mo</strong>
                </div>
                <div>
                  <span className="text-slate-400">Confirmed Actual Revenue:</span>{' '}
                  <strong className="text-emerald-400">${data.confirmedActualRevenue.toLocaleString()}</strong>
                </div>
                {data.softwareReturnMultiple !== null && (
                  <div>
                    <span className="text-slate-400">Formula:</span>{' '}
                    <span className="font-mono text-xs text-emerald-300">
                      ${data.confirmedActualRevenue} ÷ ${data.subscriptionMonthlyDollars} = {data.softwareReturnMultiple}×
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => setValueModalOpen(true)}
              className="self-start sm:self-center shrink-0 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md transition"
            >
              + Record Job Revenue
            </button>
          </div>
        </div>

        {/* Recovery Rate Card (Section 12) */}
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between text-slate-500">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-400">Recovery Rate</span>
              <div
                className="cursor-help text-slate-400"
                title="Formula: (Booked + Completed Recovered Jobs) ÷ (Eligible Missed Calls). Reflects true conversion."
              >
                <Info className="h-4 w-4" />
              </div>
            </div>
            <div className="mt-3 text-3xl font-black text-slate-900">{data.recoveryRatePercent}%</div>
            <p className="mt-1 text-xs text-slate-500 font-medium">Booked jobs ÷ eligible missed calls</p>
          </div>
          <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs text-slate-500">
            <span>Measured conversion:</span>
            <span className="font-bold text-slate-900">
              {data.bookedJobsCount} of {data.missedCallsCount} calls
            </span>
          </div>
        </div>
      </div>

      {/* ---------------- SECTION 7: RECOVERY FUNNEL ---------------- */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <h2 className="text-base font-bold text-slate-900">Section 7: Recovery Funnel</h2>
            <p className="text-xs text-slate-500">
              Single-source conversion flow from initial missed call through completed revenue.
            </p>
          </div>
          <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 self-start">
            {data.recoveryRatePercent}% Overall Conversion
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2.5 pt-2">
          {data.funnel.map((stage, idx) => (
            <div
              key={stage.key}
              className={`flex flex-col rounded-xl border p-3 transition ${
                stage.key === 'actual_revenue'
                  ? 'border-emerald-500 bg-emerald-600 text-white'
                  : stage.key === 'completed'
                  ? 'border-emerald-300 bg-emerald-50/70 text-slate-900'
                  : 'border-slate-200 bg-slate-50/60 text-slate-900'
              }`}
            >
              <span
                className={`text-[9px] font-bold uppercase tracking-wider ${
                  stage.key === 'actual_revenue' ? 'text-emerald-100' : 'text-slate-400'
                }`}
              >
                {idx + 1}. {stage.label}
              </span>
              <span className="mt-2 text-2xl font-black">
                {stage.key === 'actual_revenue' ? `$${(stage.valueDollars || 0).toLocaleString()}` : stage.count}
              </span>
              <span
                className={`mt-1 text-[10px] font-medium ${
                  stage.key === 'actual_revenue' ? 'text-emerald-100' : 'text-slate-500'
                }`}
              >
                {idx === 0 ? 'Inbound' : `${stage.conversionFromPrev}% step`}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---------------- SECTION 6: 🔥 NEEDS YOUR ATTENTION SECTION ---------------- */}
      <div className="rounded-2xl border-2 border-red-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-red-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold">
              <Flame className="h-4 w-4 text-red-600 animate-pulse" />
            </span>
            <h2 className="text-base font-extrabold text-slate-900">NEEDS YOUR ATTENTION</h2>
          </div>
          <span className="text-xs font-bold text-red-600 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
            {data.needsAttention.length} Leads Requiring Human Action
          </span>
        </div>

        {data.needsAttention.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-slate-800">All caught up!</p>
            <p className="mt-0.5 text-slate-400">No uncontacted emergency leads or unanswered customer queries.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {data.needsAttention.map((item) => (
              <div
                key={item.id}
                className={`rounded-2xl border p-4 transition-all ${
                  item.isEmergency
                    ? 'border-red-300 bg-red-50/40 ring-1 ring-red-200'
                    : 'border-slate-200 bg-slate-50/50'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <div className="flex items-center gap-2">
                    {item.isEmergency ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2.5 py-0.5 text-[10px] font-extrabold text-white uppercase tracking-wider">
                        <Flame className="h-3 w-3" /> EMERGENCY
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 uppercase">
                        {item.status}
                      </span>
                    )}
                    <h3 className="font-extrabold text-sm text-slate-900">
                      {item.customerName}
                    </h3>
                    <span className="text-xs text-slate-400 font-mono">({item.phone})</span>
                  </div>

                  <span className="text-xs text-slate-400">Waiting: <strong>{item.timeSince}</strong></span>
                </div>

                <div className="mt-2 text-xs text-slate-800 bg-white p-2.5 rounded-xl border border-slate-200">
                  <div className="font-semibold text-slate-900">Issue: &ldquo;{item.issue}&rdquo;</div>
                  {item.address && (
                    <div className="text-slate-500 text-[11px] mt-0.5">📍 Address: {item.address}</div>
                  )}
                  <div className="text-blue-700 text-[11px] mt-1 font-semibold">
                    👉 Recommended Action: {item.recommendedAction}
                  </div>
                </div>

                {/* Section 6 Exact Three Buttons: CALL CUSTOMER, VIEW CONVERSATION, VIEW JOB */}
                <div className="mt-3 flex flex-wrap items-center justify-end gap-2 text-xs pt-1">
                  {item.phone && (
                    <a
                      href={`tel:${item.phone}`}
                      className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3.5 py-1.5 font-bold text-white hover:bg-emerald-700 shadow-xs"
                    >
                      <Phone className="h-3.5 w-3.5" /> CALL CUSTOMER
                    </a>
                  )}
                  <Link
                    href="/dashboard/inbox"
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <MessageSquare className="h-3.5 w-3.5 text-blue-600" /> VIEW CONVERSATION
                  </Link>
                  <Link
                    href="/dashboard/jobs"
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-300 bg-white px-3.5 py-1.5 font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <ClipboardList className="h-3.5 w-3.5 text-amber-600" /> VIEW JOB
                  </Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ---------------- SECTION 10 & 16: RECENT LEADS & REVENUE ATTRIBUTION ---------------- */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Recent Recovered Leads Table (8 cols) */}
        <div className="lg:col-span-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">Recent Recovered Leads</h2>
              <p className="text-xs text-slate-500">Live opportunities captured from missed calls in {data.periodLabel}.</p>
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
                  <th className="py-2.5 px-3">Recovery Source</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3 text-right">Value</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {data.recentLeads.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/60">
                    <td className="py-3 px-3">
                      <div className="font-bold text-slate-900">{job.customerName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{job.phone}</div>
                    </td>
                    <td className="py-3 px-3 max-w-xs truncate text-slate-700 font-medium">
                      {job.issue}
                    </td>
                    <td className="py-3 px-3 text-slate-500 text-[11px]">
                      {job.recoverySource}
                    </td>
                    <td className="py-3 px-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          job.status === 'COMPLETED'
                            ? 'bg-emerald-100 text-emerald-800'
                            : job.status === 'BOOKED'
                            ? 'bg-blue-100 text-blue-800'
                            : job.status === 'CONTACTED'
                            ? 'bg-amber-100 text-amber-800'
                            : job.status === 'DEAD'
                            ? 'bg-slate-100 text-slate-500'
                            : 'bg-indigo-100 text-indigo-800'
                        }`}
                      >
                        {job.status}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-900 text-right">
                      {job.actualRevenue !== undefined ? (
                        <span className="text-emerald-600">${job.actualRevenue}</span>
                      ) : (
                        <span>${job.estimatedValue} Est.</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Revenue Breakdown (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Revenue Definitions &amp; Breakdown</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-3 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-emerald-950">Confirmed Actual Revenue</span>
                  <strong className="text-base font-black text-emerald-700">
                    ${data.confirmedActualRevenue.toLocaleString()}
                  </strong>
                </div>
                <p className="text-[10px] text-emerald-800 mt-0.5">
                  Confirmed amount recorded for completed jobs.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-blue-50/70 border border-blue-200">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-blue-950">In-Pipeline Estimated Value</span>
                  <strong className="text-base font-black text-blue-700">
                    ${data.pipelineEstimatedValue.toLocaleString()}
                  </strong>
                </div>
                <p className="text-[10px] text-blue-800 mt-0.5">
                  Estimated value for active unclosed leads.
                </p>
              </div>

              <div className="p-3 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-700">Potential Missed Call Value</span>
                  <strong className="text-base font-black text-slate-700">
                    ${data.potentialMissedCallValue.toLocaleString()}
                  </strong>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Early opportunity estimate ({data.missedCallsCount} calls × $650).
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ---------------- MODAL FOR SECTION 15: RECORD COMPLETED REVENUE ---------------- */}
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
              When a job is marked completed, enter the confirmed invoice amount so it enters your confirmed actual revenue metrics.
            </p>

            <form onSubmit={handleSaveActualValue} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-600 font-bold mb-1">Select Recovered Job</label>
                <select
                  value={selectedJobId}
                  onChange={(e) => setSelectedJobId(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                >
                  {data.recentLeads.map((j) => (
                    <option key={j.id} value={j.id}>
                      {j.customerName} — {j.issue} (${j.actualRevenue || j.estimatedValue})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-slate-600 font-bold mb-1">Confirmed Completed Amount ($)</label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  required
                  placeholder="e.g. 1207.50"
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
