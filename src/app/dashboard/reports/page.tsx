'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  TrendingUp,
  Download,
  Calendar,
  CheckCircle,
  PhoneCall,
  DollarSign,
  Share2,
  Clock,
  ArrowUpRight,
  Info,
  Award,
  Sparkles,
  ClipboardList,
} from 'lucide-react';
import { UnifiedMCRMetrics, DateRangePreset, RecoveredJobAttribution } from '@/lib/metrics';
import { DailySummaryReport, WeeklyRecoveryReport } from '@/lib/reports';

export default function ReportsPage() {
  const [range, setRange] = useState<DateRangePreset>('month');
  const [metrics, setMetrics] = useState<UnifiedMCRMetrics | null>(null);
  const [weekly, setWeekly] = useState<WeeklyRecoveryReport | null>(null);
  const [daily, setDaily] = useState<DailySummaryReport | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchReports = async (selectedRange: DateRangePreset = range) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/reports?accountId=acc-apex-plumbing&range=${selectedRange}`);
      const data = await res.json();
      if (data.metrics) setMetrics(data.metrics);
      if (data.weekly) setWeekly(data.weekly);
      if (data.daily) setDaily(data.daily);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReports(range);
  }, [range]);

  if (loading && !metrics) {
    return (
      <div className="space-y-6 animate-pulse">
        <div className="h-16 bg-slate-200 rounded-2xl w-2/3"></div>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <div className="h-28 bg-slate-200 rounded-2xl"></div>
          <div className="h-28 bg-slate-200 rounded-2xl"></div>
          <div className="h-28 bg-slate-200 rounded-2xl"></div>
          <div className="h-28 bg-slate-200 rounded-2xl"></div>
        </div>
        <div className="h-64 bg-slate-200 rounded-2xl"></div>
      </div>
    );
  }

  const m = metrics!;

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">
              Recovery &amp; Revenue Reports
            </h1>
            <span className="rounded-full bg-blue-100 text-blue-700 px-2.5 py-0.5 text-[11px] font-bold">
              Single Source of Truth
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-0.5">
            Transparent ROI accounting strictly separating confirmed revenue from potential pipeline.
          </p>
        </div>

        {/* Date Filter Selector (Section 10) */}
        <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-slate-200 bg-white p-1 text-xs shadow-xs">
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
      </div>

      {/* Selected Period Banner */}
      <div className="rounded-2xl border border-blue-200/80 bg-blue-50/50 p-4 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
        <div className="flex items-center gap-2 text-blue-900">
          <Calendar className="h-4 w-4 text-blue-600 shrink-0" />
          <span className="font-bold">Active Reporting Period:</span>
          <span className="font-extrabold text-blue-700 underline decoration-blue-300">
            {m.periodLabel}
          </span>
        </div>
        <div className="text-[11px] text-blue-800">
          Showing identical metrics to your live Dashboard.
        </div>
      </div>

      {/* ---------------- 4 KPI CARDS (MATCHES DASHBOARD EXACTLY) ---------------- */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Missed Calls
          </span>
          <div className="mt-2 text-3xl font-black text-slate-900">{m.missedCallsCount}</div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">Eligible unanswered calls</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Leads Recovered
          </span>
          <div className="mt-2 text-3xl font-black text-indigo-600">{m.customersRespondedCount}</div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">{m.qualifiedLeadsCount} qualified leads</p>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
            Booked Jobs
          </span>
          <div className="mt-2 text-3xl font-black text-blue-600">{m.bookedJobsCount}</div>
          <p className="mt-1 text-[11px] text-slate-500 font-medium">
            {m.completedJobsCount} completed • {m.recoveryRatePercent}% rate
          </p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-950">
            Confirmed Actual Revenue
          </span>
          <div className="mt-2 text-3xl font-black text-emerald-700">
            ${m.confirmedActualRevenue.toLocaleString()}
          </div>
          <p className="mt-1 text-[11px] text-emerald-800 font-medium">
            Completed invoice amounts
          </p>
        </div>
      </div>

      {/* Software Return / Financial Reconciliation Banner */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-100 pb-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Software Return on Investment
            </div>
            <h2 className="text-xl font-black text-slate-900 mt-1">
              {m.softwareReturnMultiple !== null && m.softwareReturnMultiple > 0 ? (
                <>
                  <span className="text-emerald-600 font-black">{m.softwareReturnMultiple}× Software Return</span> for {m.periodLabel}
                </>
              ) : (
                'Pending completed job revenue'
              )}
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Calculated as: Confirmed Actual Revenue (${m.confirmedActualRevenue}) ÷ Subscription (${m.subscriptionMonthlyDollars}/mo).
            </p>
          </div>

          <div className="flex items-center gap-6">
            <div>
              <div className="text-[10px] text-slate-400 font-bold uppercase">Pipeline Value</div>
              <div className="text-lg font-black text-blue-700">${m.pipelineEstimatedValue.toLocaleString()}</div>
            </div>
            <div className="border-l border-slate-200 pl-6">
              <div className="text-[10px] text-slate-400 font-bold uppercase">Potential Value</div>
              <div className="text-lg font-black text-slate-600">${m.potentialMissedCallValue.toLocaleString()}</div>
            </div>
          </div>
        </div>

        {/* ---------------- SECTION 16: REPORT ATTRIBUTION TABLE ---------------- */}
        <div className="pt-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900">
              Section 16: Recovered Jobs Attribution Table
            </h3>
            <span className="text-xs text-slate-500">
              {m.recoveredJobsList.length} Total Recovered Jobs
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Every recovered job is directly traceable from the original missed call to completed revenue.
          </p>

          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
                <tr>
                  <th className="py-3 px-3.5">Customer</th>
                  <th className="py-3 px-3.5">Issue</th>
                  <th className="py-3 px-3.5">Recovery Source</th>
                  <th className="py-3 px-3.5">Status</th>
                  <th className="py-3 px-3.5">Estimated Value</th>
                  <th className="py-3 px-3.5">Actual Revenue</th>
                  <th className="py-3 px-3.5 text-right">Completed Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {m.recoveredJobsList.map((job) => (
                  <tr key={job.id} className="hover:bg-slate-50/80">
                    <td className="py-3 px-3.5">
                      <div className="font-bold text-slate-900">{job.customerName}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{job.phone}</div>
                    </td>
                    <td className="py-3 px-3.5 max-w-xs truncate text-slate-700 font-medium">
                      {job.issue}
                    </td>
                    <td className="py-3 px-3.5 text-slate-500 text-[11px]">
                      {job.recoverySource}
                    </td>
                    <td className="py-3 px-3.5">
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
                    <td className="py-3 px-3.5 font-bold text-slate-800">
                      ${job.estimatedValue}
                    </td>
                    <td className="py-3 px-3.5 font-bold">
                      {job.actualRevenue !== undefined ? (
                        <span className="text-emerald-600">${job.actualRevenue}</span>
                      ) : (
                        <span className="text-slate-300 font-normal">—</span>
                      )}
                    </td>
                    <td className="py-3 px-3.5 text-right font-medium text-slate-600 text-[11px]">
                      {job.completedDate || (job.status === 'COMPLETED' ? job.createdDate : 'In Progress')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>

      {/* Daily Flash Summary (Section 18) */}
      {daily && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <h3 className="text-sm font-bold text-slate-900">Today&apos;s 6:00 PM Flash Summary Preview</h3>
            </div>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded">
              Automated Dispatch SMS
            </span>
          </div>

          <div className="rounded-xl bg-slate-900 p-4 font-mono text-xs text-emerald-400">
            <pre className="whitespace-pre-wrap leading-relaxed">{daily.summaryText}</pre>
          </div>
        </div>
      )}
    </div>
  );
}
