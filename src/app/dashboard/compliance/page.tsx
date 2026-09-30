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
import { COMPLIANCE_STATES } from '@/lib/compliance-machine';

export default function CompliancePage() {
  const [compliance, setCompliance] = useState<ComplianceRegistration | null>(null);
  const [isAdvancing, setIsAdvancing] = useState(false);

  const fetchCompliance = async () => {
    try {
      const res = await fetch('/api/compliance');
      const data = await res.json();
      if (data.compliance) {
        setCompliance(data.compliance);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCompliance();
  }, []);

  const handleAdvanceStatus = async () => {
    setIsAdvancing(true);
    try {
      const res = await fetch('/api/compliance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'advance_status',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCompliance(data.compliance);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsAdvancing(false);
    }
  };

  const currentStatus = compliance?.status || 'signed_up';
  const currentStateObj = COMPLIANCE_STATES.find((s) => s.status === currentStatus) || COMPLIANCE_STATES[0];

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">A2P 10DLC Telecom Compliance</h1>
        <p className="text-xs text-slate-500">
          Carrier registration workflow with The Campaign Registry (TCR) for high-deliverability business SMS.
        </p>
      </div>

      {/* Compliance State Pipeline */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Current Carrier Status</div>
            <div className="mt-1 flex items-center gap-2">
              <span className="flex h-3 w-3 rounded-full bg-emerald-500"></span>
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
            {isAdvancing ? 'Advancing...' : 'Advance Next State (Sim)'}
          </button>
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
            <span className="font-semibold text-slate-800">{compliance?.ein || 'Verified'}</span>
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
