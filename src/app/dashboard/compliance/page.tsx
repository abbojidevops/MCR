'use client';

import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  CheckCircle,
  AlertCircle,
  Clock,
  ArrowRight,
  Send,
  FileText,
  RotateCw,
} from 'lucide-react';
import { ComplianceRegistration } from '@/types';
import { COMPLIANCE_STATES, isCarrierVerifiedRegistration } from '@/lib/compliance-machine';

export default function CompliancePage() {
  const [compliance, setCompliance] = useState<ComplianceRegistration | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchCompliance = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch('/api/compliance');
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Failed to load compliance status (HTTP ${res.status})`);
      }
      const data = await res.json();
      setCompliance(data.compliance || null);
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'Unable to load compliance status.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCompliance();
  }, []);

  const handleAdvanceStatus = async () => {
    setIsAdvancing(true);
    setErrorMsg(null);
    try {
      const res = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance_status',
        }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCompliance(data.compliance);
      } else {
        setErrorMsg(data.error || 'Customer cannot self-certify carrier registration status.');
      }
    } catch (err: any) {
      setErrorMsg(err.message || 'Request failed');
    } finally {
      setIsAdvancing(false);
    }
  };

  const currentStatus = compliance?.status || 'signed_up';
  const currentStateObj = COMPLIANCE_STATES.find((s) => s.status === currentStatus) || COMPLIANCE_STATES[0];

  if (loadError) {
    return (
      <div className="space-y-6 max-w-4xl">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">A2P 10DLC Telecom Compliance</h1>
        </div>
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800"
        >
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-rose-600" aria-hidden="true" />
          <h2 className="font-bold text-base">Compliance status could not be loaded.</h2>
          <p className="mt-1 text-xs text-rose-700">{loadError}</p>
          <button
            type="button"
            onClick={fetchCompliance}
            className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">A2P 10DLC Telecom Compliance</h1>
          <p className="text-xs text-slate-500">
            Carrier registration workflow with The Campaign Registry (TCR) for high-deliverability business SMS.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchCompliance}
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RotateCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {loading && !compliance && (
        <div className="space-y-4" aria-hidden="true">
          <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
        </div>
      )}

      {/* Compliance State Pipeline */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Carrier Status</div>
            <div className="mt-1 flex items-center gap-2">
              <span
                className={`flex h-3 w-3 rounded-full ${
                  currentStatus === 'sms_live' ? 'bg-emerald-500' : 'bg-amber-500'
                }`}
              ></span>
              <span className="text-lg font-bold text-slate-900">{currentStateObj.label}</span>
            </div>
          </div>

          <button
            type="button"
            disabled={isAdvancing || currentStatus === 'sms_live'}
            onClick={handleAdvanceStatus}
            className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-700 disabled:opacity-40"
          >
            <RotateCw className={`h-3.5 w-3.5 ${isAdvancing ? 'animate-spin' : ''}`} />
            {isAdvancing ? 'Advancing...' : 'Advance Next State (Admin/Sim)'}
          </button>
        </div>

        {errorMsg && (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
            <span className="font-bold">Carrier Security Rule: </span>
            {errorMsg}
          </div>
        )}

        <div className="mt-3 flex items-center justify-between text-[11px] text-slate-400">
          <div>
            Carrier provenance:{' '}
            <span className="font-semibold text-slate-600">
              {compliance?.carrier_source || (compliance?.last_updated_by ? compliance.last_updated_by.replace('_', ' ') : 'unverified')}
            </span>
          </div>
          <div>
            {isCarrierVerifiedRegistration(compliance, false) ? (
              <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                <CheckCircle className="h-3 w-3" /> Carrier Verified (TCR Approved)
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 font-medium text-amber-600">
                <Clock className="h-3 w-3" /> Carrier Verification Pending
              </span>
            )}
          </div>
        </div>

        {/* Step-by-step progress visual */}
        <div className="mt-6 space-y-4">
          {COMPLIANCE_STATES.filter((s) => s.status !== 'rejected').map((step) => {
            const isCompleted = step.stepNumber <= currentStateObj.stepNumber;
            const isCurrent = step.status === currentStatus;

            return (
              <div
                key={step.status}
                className={`flex items-start gap-4 rounded-xl p-3.5 transition ${
                  isCurrent
                    ? 'border border-blue-200 bg-blue-50/70'
                    : isCompleted
                    ? 'bg-slate-50'
                    : 'opacity-50'
                }`}
              >
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                    isCompleted ? 'bg-emerald-600 text-white' : 'bg-slate-200 text-slate-600'
                  }`}
                >
                  {isCompleted ? '✓' : step.stepNumber}
                </div>
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-xs text-slate-900">{step.label}</span>
                    {isCurrent && (
                      <span className="rounded bg-blue-100 px-2 py-0.5 text-[10px] font-bold text-blue-700 uppercase">
                        Current Stage
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 text-xs text-slate-500">{step.description}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* TCR Registry Identifiers & Sample Messages */}
      <div className="grid gap-6 sm:grid-cols-2">
        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 text-xs">
          <h2 className="font-bold text-sm text-slate-900">Registered Entity Details</h2>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <span className="text-slate-500">Legal Business Name:</span>
            <span className="font-semibold text-slate-800">{compliance?.legal_name}</span>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <span className="text-slate-500">EIN / Tax ID:</span>
            <span className="font-semibold text-slate-800">
              {compliance?.ein ? compliance.ein : 'Not on file'}
            </span>
          </div>
          <div className="flex justify-between border-b border-slate-100 pb-2">
            <span className="text-slate-500">TCR Brand SID:</span>
            <span className="font-mono text-slate-800">{compliance?.brand_sid || 'BN_pending'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-500">Campaign SID:</span>
            <span className="font-mono text-slate-800">{compliance?.campaign_sid || 'CM_pending'}</span>
          </div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3 text-xs">
          <h2 className="font-bold text-sm text-slate-900">Safeguards & Suppression</h2>
          <div className="flex items-center gap-2 text-slate-700">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <span>Automatic STOP / UNSUBSCRIBE suppression</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <span>TCPA Quiet Hours Enforcement (8 AM – 9 PM)</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <span>No link shorteners in automated SMS</span>
          </div>
          <div className="flex items-center gap-2 text-slate-700">
            <CheckCircle className="h-4 w-4 text-emerald-600" />
            <span>Immutable consent audit logging</span>
          </div>
        </div>
      </div>
    </div>
  );
}
