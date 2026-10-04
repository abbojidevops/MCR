'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle,
  HelpCircle,
  Rocket,
  ShieldCheck,
  XCircle,
  RefreshCw,
} from 'lucide-react';
import { LaunchGateReport, GateResult } from '@/lib/launch-gate';

export default function LaunchGatePage() {
  const [report, setReport] = useState<LaunchGateReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchReport = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/launch-gate', { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      setReport(data);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch launch gate report');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchReport();
  }, []);

  const gates: GateResult[] = report?.gates || [];
  const automatedGates = gates.filter((g) => !g.isManual);
  const manualGates = gates.filter((g) => g.isManual);
  const passedCount = report?.passedAutomatedGates ?? 0;
  const totalAutomated = report?.totalAutomatedGates ?? 0;
  const pct = report?.automatedReadinessPercent ?? 0;
  const isLaunchReady = report?.isLaunchReady ?? false;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 sm:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        {/* Top Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">V1 Production Launch Gate Checklist</h1>
              <span className="text-xs text-slate-400">Section 68 Formal Launch Criteria (Live Database Evidence)</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={fetchReport}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} /> Refresh Gates
            </button>
            <Link
              href="/admin"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
            </Link>
          </div>
        </div>

        {/* Mandatory Header Disclaimer */}
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span>
            <strong>Audit Guarantee:</strong> Every automated gate reads live state and names its evidence (tenant, record ID, timestamp). File or route presence cannot satisfy any gate. Offline/manual gates are strictly excluded from pass score.
          </span>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/50 bg-red-950/40 p-4 text-xs text-red-200">
            Error loading gates: {error}
          </div>
        )}

        {/* Dynamic Status Banner */}
        <div
          className={`rounded-2xl border p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
            isLaunchReady
              ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200'
              : 'border-red-500/50 bg-red-950/40 text-red-200'
          }`}
        >
          <div>
            <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Live Computed Launch Gate Status</span>
            <div className="mt-1 text-2xl font-extrabold text-white">
              {passedCount} of {totalAutomated} Automated Gates Cleared ({pct}%)
            </div>
            <p className="mt-1 text-xs text-slate-300">
              {isLaunchReady
                ? 'All automated compliance, authentication, billing, and validation requirements have been satisfied.'
                : `${totalAutomated - passedCount} automated gates remain blocked or unverified. ${manualGates.length} offline/manual gates excluded from pass calculation.`}
            </p>
          </div>

          {isLaunchReady ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-xs text-white shrink-0">
              <CheckCircle className="h-4 w-4" /> LAUNCH APPROVED
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-red-600/90 border border-red-500 px-4 py-2 font-bold text-xs text-white shrink-0">
              <XCircle className="h-4 w-4" /> LAUNCH BLOCKED ({totalAutomated - passedCount} AUTOMATED PENDING)
            </div>
          )}
        </div>

        {/* Automated Gates Section */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-200">Automated Production Gates (Live Evidence)</h2>
              <p className="text-xs text-slate-400">Evaluated in real-time from database records, credentials, and configuration.</p>
            </div>
            <span className="text-xs font-mono text-slate-400">
              {passedCount} Passed · {totalAutomated - passedCount} Blocked
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {automatedGates.map((g) => {
              const isPassed = g.status === 'passed';

              return (
                <div
                  key={g.id}
                  className={`flex flex-col justify-between rounded-xl border p-4 transition ${
                    isPassed
                      ? 'border-emerald-800/80 bg-emerald-950/20'
                      : 'border-red-900/60 bg-red-950/20'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold ${
                            isPassed ? 'bg-emerald-500 text-slate-950' : 'bg-red-500 text-white'
                          }`}
                        >
                          {isPassed ? '✓' : '✕'}
                        </div>
                        <span className="font-bold text-xs text-white truncate">{g.label}</span>
                      </div>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 uppercase shrink-0">
                        {g.category}
                      </span>
                    </div>

                    <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">{g.description}</p>

                    <div className="mt-2 text-[10px] font-mono">
                      {isPassed ? (
                        <span className="text-emerald-400">✓ {g.statusReason}</span>
                      ) : (
                        <span className="text-red-400">✕ {g.statusReason}</span>
                      )}
                    </div>
                  </div>

                  {g.evidence && (
                    <div className="mt-3 rounded-lg border border-slate-800 bg-slate-900/90 p-2 text-[10px] font-mono text-slate-300 space-y-0.5">
                      {g.evidence.tenantId && (
                        <div>
                          <span className="text-slate-500">Tenant:</span> {g.evidence.tenantId}
                        </div>
                      )}
                      {g.evidence.recordId && (
                        <div>
                          <span className="text-slate-500">Record:</span> {g.evidence.recordId}
                        </div>
                      )}
                      {g.evidence.timestamp && (
                        <div>
                          <span className="text-slate-500">Timestamp:</span> {g.evidence.timestamp}
                        </div>
                      )}
                      <div>
                        <span className="text-slate-500">Evidence:</span> {g.evidence.details}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Manual Gates Section */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-bold text-slate-200">Manual Verification Gates (Excluded from Pass Count)</h2>
              <p className="text-xs text-slate-400">
                Requires human sign-off or external carrier certification. Strictly marked isManual: true.
              </p>
            </div>
            <span className="text-xs font-mono text-amber-400">
              {manualGates.length} Manual Gates
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {manualGates.map((g) => (
              <div
                key={g.id}
                className="flex flex-col justify-between rounded-xl border border-amber-900/60 bg-amber-950/20 p-4"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <div className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-bold bg-amber-500 text-slate-950">
                        ?
                      </div>
                      <span className="font-bold text-xs text-white truncate">{g.label}</span>
                    </div>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-amber-400 uppercase shrink-0">
                      MANUAL
                    </span>
                  </div>

                  <p className="mt-2 text-[11px] text-slate-400 leading-relaxed">{g.description}</p>

                  <div className="mt-2 text-[10px] font-mono text-amber-400">
                    ⚠ {g.statusReason}
                  </div>
                </div>

                <div className="mt-3 rounded border border-amber-800/40 bg-amber-950/40 px-2 py-1 text-[9px] font-mono text-amber-300">
                  Status: manual (never defaults to passed)
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
