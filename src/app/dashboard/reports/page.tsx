'use client';

import React, { useState, useEffect } from 'react';
import {
  TrendingUp,
  Download,
  Calendar,
  CheckCircle,
  PhoneCall,
  DollarSign,
  Share2,
} from 'lucide-react';
import { WeeklyRecoveryReport, DailySummaryReport } from '@/lib/reports';

export default function ReportsPage() {
  const [weekly, setWeekly] = useState<WeeklyRecoveryReport | null>(null);
  const [daily, setDaily] = useState<DailySummaryReport | null>(null);

  useEffect(() => {
    const fetchReports = async () => {
      try {
        const res = await fetch('/api/reports?accountId=acc-apex-plumbing');
        const data = await res.json();
        if (data.weekly) setWeekly(data.weekly);
        if (data.daily) setDaily(data.daily);
      } catch (err) {
        console.error(err);
      }
    };
    fetchReports();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Weekly Recovered-Jobs Report</h1>
          <p className="text-xs text-slate-500">
            Measurable revenue metrics proving the ROI of missed-call recovery.
          </p>
        </div>

        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <Download className="h-3.5 w-3.5" /> Print / Export Report
        </button>
      </div>

      {weekly ? (
        <div className="space-y-6">
          {/* Executive Summary Card */}
          <div className="rounded-3xl border border-slate-800 bg-slate-900 p-6 text-white shadow-xl sm:p-8">
            <div className="flex items-center justify-between border-b border-slate-800 pb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-emerald-400" />
                <span className="font-bold text-sm text-slate-200">
                  {weekly.startDate} — {weekly.endDate} Performance Summary
                </span>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-xs font-bold text-emerald-400">
                {weekly.recoveryRatePercent}% Conversion
              </span>
            </div>

            <div className="mt-6 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Missed Calls</div>
                <div className="mt-1 text-3xl font-extrabold text-white">{weekly.missedCallsCount}</div>
                <div className="mt-1 text-xs text-slate-400">Forwarded by carrier</div>
              </div>

              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Responded to SMS</div>
                <div className="mt-1 text-3xl font-extrabold text-white">{weekly.recoveredConversationsCount}</div>
                <div className="mt-1 text-xs text-emerald-400 font-semibold">{weekly.responseRatePercent}% response rate</div>
              </div>

              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Qualified Jobs</div>
                <div className="mt-1 text-3xl font-extrabold text-white">{weekly.qualifiedJobsCount}</div>
                <div className="mt-1 text-xs text-slate-400">Address & details collected</div>
              </div>

              <div>
                <div className="text-xs text-slate-400 uppercase tracking-wider">Booked by Team</div>
                <div className="mt-1 text-3xl font-extrabold text-emerald-400">{weekly.bookedJobsCount}</div>
                <div className="mt-1 text-xs text-slate-400">Jobs confirmed won</div>
              </div>
            </div>

            <div className="mt-8 border-t border-slate-800 pt-6">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                  <span className="text-xs uppercase text-slate-400">Estimated Recovered Opportunity Value</span>
                  <div className="text-4xl font-extrabold text-emerald-400">
                    ${weekly.estimatedRecoveredValue.toLocaleString()}
                  </div>
                  <p className="text-xs text-slate-400 mt-1">
                    Actual confirmed booked revenue entered: <strong>${weekly.actualBookedValue.toLocaleString()}</strong>
                  </p>
                </div>

                <div className="rounded-2xl bg-slate-800/80 p-4 text-xs text-slate-300 max-w-md">
                  <div className="font-bold text-white mb-1">Executive Takeaway:</div>
                  <p className="italic leading-relaxed">{weekly.summaryText}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Daily Comparison breakdown */}
          {daily && (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="text-sm font-bold text-slate-900">Today&apos;s Daily Flash Report</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-4 text-xs">
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <span className="text-slate-500">Today Missed Calls:</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">{daily.missedCallsCount}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <span className="text-slate-500">Text-backs Sent:</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">{daily.textBacksSent}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <span className="text-slate-500">Qualified Today:</span>
                  <div className="text-xl font-bold text-slate-900 mt-1">{daily.qualifiedJobsCount}</div>
                </div>
                <div className="rounded-xl border border-slate-100 bg-slate-50 p-4">
                  <span className="text-slate-500">Est. Today Value:</span>
                  <div className="text-xl font-bold text-emerald-600 mt-1">
                    ${daily.potentiallyRecoveredRevenue.toLocaleString()}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rounded-2xl border border-slate-200 bg-white p-12 text-center text-xs text-slate-400">
          Loading report telemetry...
        </div>
      )}
    </div>
  );
}
