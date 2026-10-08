'use client';

import React, { useState, useEffect } from 'react';
import Modal from '@/components/modal';
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
  FlaskConical,
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
  const [valueModalError, setValueModalError] = useState<string | null>(null);

  const fetchDashboardStats = async (selectedRange: DateRangePreset = range) => {
    try {
      setLoading(true);
      const res = await fetch(`/api/dashboard/stats?range=${selectedRange}`);
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

  // Allow keyboard users to dismiss the Record Completed Revenue dialog.
  useEffect(() => {
    if (!valueModalOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setValueModalOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [valueModalOpen]);

  const handleSaveActualValue = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJobId || !enteredActualValue) return;

    setSavingValue(true);
    try {
      const res = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: selectedJobId,
          actualValue: Number(enteredActualValue),
          status: 'COMPLETED',
        }),
      });
      const resData = await res.json().catch(() => null);
      if (!res.ok || !resData?.success) {
        setValueModalError(
          resData?.error ||
            `Could not record the completed revenue (HTTP ${res.status}). Nothing was saved.`
        );
        return;
      }
      setValueModalError(null);
      setValueModalOpen(false);
      setEnteredActualValue('');
      fetchDashboardStats(range);
    } catch (err: any) {
      console.error(err);
      setValueModalError(err?.message || 'Network error — nothing was saved.');
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
      {/* Sample Data Demonstration Banner (Part 3.1) */}
      {(data.isDemo || (data as any).is_demo) && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="rounded-md bg-amber-200/90 px-2 py-0.5 text-[10px] font-black uppercase tracking-wider text-amber-950">
              Sample Data
            </span>
            <span className="font-semibold text-slate-800">
              You&apos;re viewing demonstration records. Real activity will appear once your carrier call forwarding is live.
            </span>
          </div>
          <button
            onClick={async () => {
              try {
                await fetch('/api/auth/session', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ resetToClean: true }),
                });
                window.location.reload();
              } catch (e) {
                console.error(e);
              }
            }}
            className="self-start sm:self-center shrink-0 rounded-lg border border-amber-400 bg-white px-3 py-1 font-bold text-amber-900 hover:bg-amber-100 transition shadow-2xs"
          >
            Clear sample data
          </button>
        </div>
      )}

      {/* 80% Usage Soft Cap Notice (Part 3.5) */}
      {(data as any).usageWarning && (
        <div className="rounded-2xl border border-amber-300 bg-amber-50/80 p-4 text-xs text-amber-900 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
            <span>
              <strong>Call Volume Notice:</strong> You&apos;ve used 32 of 40 calls this month. Additional calls are $0.35 each, or upgrade to Pro for $149/mo (200 calls).
            </span>
          </div>
          <Link
            href="/dashboard/settings"
            className="shrink-0 rounded-lg bg-amber-700 px-3 py-1 font-bold text-white hover:bg-amber-800"
          >
            Upgrade Plan
          </Link>
        </div>
      )}

      {/* Simulation Exclusion Disclosure (Criterion 6) */}
      {(data as any)?.simulatedExclusions?.disclosure && (
        <div className="rounded-2xl border border-blue-200 bg-blue-50/80 p-3.5 text-xs text-blue-900 flex items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2">
            <FlaskConical className="h-4 w-4 text-blue-600 shrink-0" />
            <span>
              <strong>Simulator Activity:</strong> {(data as any).simulatedExclusions.disclosure}.
            </span>
          </div>
          <Link
            href="/dashboard/test-mode"
            className="shrink-0 text-blue-700 font-bold hover:underline"
          >
            View Simulator
          </Link>
        </div>
      )}

      {/* Hero Header */}
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
              {data.missedCallsCount === 0 && data.bookedJobsCount === 0 ? (
                <span className="text-slate-600">No calls yet — awaiting your first forwarded missed call.</span>
              ) : (
                <>
                  You&apos;ve recovered{' '}
                  <span className="text-emerald-700 font-extrabold underline decoration-emerald-400 decoration-2 underline-offset-4">
                    {data.bookedJobsCount} booked jobs
                  </span>{' '}
                  ({data.completedJobsCount} completed) generating{' '}
                  <span className="text-emerald-700 font-extrabold">${data.confirmedActualRevenue.toLocaleString()}</span>{' '}
                  in confirmed revenue.
                </>
              )}
            </div>
          </div>

          {/* Date Range Selector */}
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
              onClick={() => {
                setValueModalError(null);
                setValueModalOpen(true);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 transition"
            >
              <PlusCircle className="h-3.5 w-3.5" />
              <span>Record Job Revenue</span>
            </button>
          </div>
        </div>
      </div>

      {/* Primary KPI Cards */}
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
            Active unclosed leads · Based on ${data.averageTicketAssumption || 650} estimated average trade ticket
          </p>
        </div>

        {/* Card 5: Confirmed Actual Revenue */}
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-sm">
          <div className="flex items-center justify-between text-emerald-800">
            <div className="flex items-center gap-1">
              <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-950">
                Confirmed Revenue
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

      {/* Software Return Multiple & Recovery Rate */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Gross Revenue Multiple on Software Cost Card */}
        <div className="sm:col-span-2 rounded-2xl border border-blue-200 bg-gradient-to-r from-slate-900 via-blue-950 to-slate-900 text-white p-6 shadow-md">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-blue-300">
                <Sparkles className="h-3 w-3" /> Software Return Multiple
              </div>
              <h2 className="mt-2 text-xl sm:text-2xl font-black tracking-tight">
                {data.softwareReturnMultiple !== null && data.softwareReturnMultiple > 0 ? (
                  <>
                    <span className="text-emerald-400 font-extrabold">Revenue recovered per $1 of subscription: {data.revenuePerSubscriptionDollar || data.softwareReturnMultiple}×</span>
                    <span className="block text-sm sm:text-base font-semibold text-slate-300 mt-1">
                      · At a 40% gross margin: <strong className="text-white">{data.marginAdjustedMultiple || (data.softwareReturnMultiple * 0.4).toFixed(1)}×</strong> software cost
                    </span>
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
                      ${data.confirmedActualRevenue.toLocaleString()} ÷ ${data.subscriptionMonthlyDollars} = {data.revenuePerSubscriptionDollar || data.softwareReturnMultiple}×
                    </span>
                  </div>
                )}
              </div>
            </div>
            <button
              onClick={() => {
                setValueModalError(null);
                setValueModalOpen(true);
              }}
              className="self-start sm:self-center shrink-0 rounded-xl bg-emerald-500 hover:bg-emerald-600 px-4 py-2.5 text-xs font-bold text-slate-950 shadow-md transition"
            >
              + Record Job Revenue
            </button>
          </div>
        </div>

        {/* Recovery Rate Card */}
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

      {/* Recovery Funnel */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
          <div>
            <h2 className="text-base font-bold text-slate-900">Recovery Funnel</h2>
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

      {/* Needs Your Attention Section */}
      <div className="rounded-2xl border-2 border-red-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-red-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-red-100 text-red-600 font-bold">
              <Flame className="h-4 w-4 text-red-600 animate-pulse" />
            </span>
            <h2 className="text-base font-extrabold text-slate-900">NEEDS YOUR ATTENTION</h2>
          </div>
          <span className="text-xs font-bold text-red-700 bg-red-50 px-2.5 py-0.5 rounded-full border border-red-200">
            {data.needsAttention.length} Leads Requiring Human Action
          </span>
        </div>

        {data.needsAttention.length === 0 ? (
          <div className="p-6 text-center text-slate-500 text-xs">
            <CheckCircle className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-slate-800">
              {data.missedCallsCount === 0 ? 'No calls yet' : 'All caught up!'}
            </p>
            <p className="mt-0.5 text-slate-400">
              {data.missedCallsCount === 0
                ? 'When missed calls occur, leads requiring immediate attention will appear here.'
                : 'No uncontacted emergency leads or unanswered customer queries.'}
            </p>
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

                {/* Quick Action Buttons */}
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

      {/* Recent Leads & Revenue Attribution */}
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
                {data.recentLeads.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-8 text-center text-slate-500 font-medium">
                      No calls yet — captured leads will appear here once calls are received.
                    </td>
                  </tr>
                ) : (
                  data.recentLeads.map((job) => (
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
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Revenue Breakdown & Gap Analysis (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <DollarSign className="h-4 w-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">Revenue Reconciliation</h3>
            </div>
            <div className="space-y-2 text-xs">
              <div className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-emerald-950">1. Confirmed Completed Revenue</span>
                  <strong className="text-sm font-black text-emerald-700">
                    ${data.confirmedRevenue !== undefined ? data.confirmedRevenue.toLocaleString() : data.confirmedActualRevenue.toLocaleString()}
                  </strong>
                </div>
                <p className="text-[10px] text-emerald-800 mt-0.5">
                  Completed &amp; invoiced jobs only ({data.completedJobsCount} job).
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-indigo-50/70 border border-indigo-200">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-indigo-950">2. Booked Revenue</span>
                  <strong className="text-sm font-black text-indigo-700">
                    ${(data.bookedRevenue ?? 0).toLocaleString()}
                  </strong>
                </div>
                <p className="text-[10px] text-indigo-800 mt-0.5">
                  Scheduled on calendar, awaiting service completion ({data.bookedJobsCount} {data.bookedJobsCount === 1 ? 'job' : 'jobs'}).
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-blue-50/70 border border-blue-200">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-blue-950">3. In-Pipeline Estimated Value</span>
                  <strong className="text-sm font-black text-blue-700">
                    ${(data.pipelineEstimatedValue ?? 0).toLocaleString()}
                  </strong>
                </div>
                <p className="text-[10px] text-blue-800 mt-0.5">
                  Active unclosed leads in qualification ({data.qualifiedLeadsCount} {data.qualifiedLeadsCount === 1 ? 'job' : 'jobs'}). Based on ${data.averageTicketAssumption || 650} estimated average trade ticket.
                </p>
              </div>

              <div className="p-2.5 rounded-xl bg-slate-100/80 border border-slate-300">
                <div className="flex justify-between items-center">
                  <span className="font-bold text-slate-800">4. Total Potential Recovered</span>
                  <strong className="text-sm font-black text-slate-900">
                    ${(data.totalPotentialValue ?? 0).toLocaleString()}
                  </strong>
                </div>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Potential revenue if all pipeline opportunities close (${(data.qualifiedLeadsCount || 0) + (data.bookedJobsCount || 0) + (data.completedJobsCount || 0)} jobs total).
                </p>
              </div>
            </div>
          </div>

          {/* Text-Back Gap Breakdown (Part 3.8) */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-2">
              <Clock className="h-4 w-4 text-slate-500" />
              <h3 className="text-sm font-bold text-slate-900">Text-Back Suppression Reasons</h3>
            </div>
            <p className="text-[11px] text-slate-500">
              Clear attribution why certain missed calls were not sent an immediate SMS:
            </p>
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span className="text-slate-600">Deduplicated (called within last 2 hours)</span>
                <span className="font-bold text-slate-900">{data.textBackGapAnalysis?.suppressedDedupe || 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span className="text-slate-600">Caller opted out (TCPA STOP on file)</span>
                <span className="font-bold text-slate-900">{data.textBackGapAnalysis?.suppressedOptOut || 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span className="text-slate-600">Outside quiet hours (queued for 8:00 AM)</span>
                <span className="font-bold text-slate-900">{data.textBackGapAnalysis?.suppressedQuietHours || 0}</span>
              </div>
              <div className="flex items-center justify-between p-2 rounded-lg bg-slate-50">
                <span className="text-slate-600">Delivery failure (landline or VoIP no SMS)</span>
                <span className="font-bold text-slate-900">{data.textBackGapAnalysis?.failedDelivery || 0}</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Record Completed Revenue Modal */}
      <Modal
        open={valueModalOpen}
        onClose={() => setValueModalOpen(false)}
        title="Record Completed Job Revenue"
        description="When a job is marked completed, enter the confirmed invoice amount so it enters your confirmed actual revenue metrics."
        footer={
          <>
            <button
              type="button"
              onClick={() => setValueModalOpen(false)}
              className="flex-1 rounded-xl border border-slate-200 py-2.5 font-bold text-slate-600 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              form="record-revenue-form"
              disabled={savingValue}
              className="flex-1 rounded-xl bg-emerald-700 hover:bg-emerald-800 py-2.5 font-bold text-white shadow-sm disabled:opacity-50"
            >
              {savingValue ? 'Saving...' : 'Confirm Revenue'}
            </button>
          </>
        }
      >
        {valueModalError && (
          <div
            role="alert"
            className="mb-4 rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-semibold text-rose-800"
          >
            {valueModalError}
          </div>
        )}

        <form id="record-revenue-form" onSubmit={handleSaveActualValue} className="space-y-3 text-xs">
          <div>
            <label htmlFor="record-revenue-job" className="block text-slate-600 font-bold mb-1">
              Select Recovered Job
            </label>
            <select
              id="record-revenue-job"
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
            <label htmlFor="record-revenue-amount" className="block text-slate-600 font-bold mb-1">
              Confirmed Completed Amount ($)
            </label>
            <input
              id="record-revenue-amount"
              type="number"
              min="0"
              step="10"
              required
              placeholder="0.00"
              value={enteredActualValue}
              onChange={(e) => setEnteredActualValue(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2 text-sm font-bold text-slate-900 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </form>
      </Modal>
    </div>
  );
}
