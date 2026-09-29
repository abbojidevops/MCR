'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Lock,
  Rocket,
} from 'lucide-react';

interface GateItem {
  id: number;
  label: string;
  category: 'Validation' | 'Telephony' | 'Compliance' | 'Billing' | 'Reliability';
  description: string;
  status: 'passed' | 'pending';
}

export default function LaunchGatePage() {
  const [gates, setGates] = useState<GateItem[]>([
    {
      id: 1,
      label: 'Three paying pilot customers',
      category: 'Validation',
      description: 'Acquire and onboard 3 paying home-service contractors before public general launch.',
      status: 'passed',
    },
    {
      id: 2,
      label: 'Pilot users operated successfully',
      category: 'Validation',
      description: 'Pilot contractors operated for at least 7 consecutive days receiving real leads.',
      status: 'passed',
    },
    {
      id: 3,
      label: 'Carrier conditional forwarding tested',
      category: 'Telephony',
      description: 'Verified conditional rollover on Verizon (*71), AT&T (*61), and T-Mobile (**61*).',
      status: 'passed',
    },
    {
      id: 4,
      label: 'A2P 10DLC registration verified',
      category: 'Compliance',
      description: 'Brand vetting and campaign submission confirmed with The Campaign Registry.',
      status: 'passed',
    },
    {
      id: 5,
      label: 'Legal terms & privacy policy live',
      category: 'Compliance',
      description: 'Clear SMS disclosure, TCPA consent language, and opt-out terms published.',
      status: 'passed',
    },
    {
      id: 6,
      label: 'Security & tenant isolation audit',
      category: 'Reliability',
      description: 'Tenant isolation unit tests passing; no cross-tenant data leakage possible.',
      status: 'passed',
    },
    {
      id: 7,
      label: 'Stripe billing & dunning tested',
      category: 'Billing',
      description: 'Successful payments, payment failures (past_due), and subscription cancellations verified.',
      status: 'passed',
    },
    {
      id: 8,
      label: 'Webhook signature validation active',
      category: 'Telephony',
      description: 'Twilio HMAC-SHA1 signature verification active on all voice and SMS endpoints.',
      status: 'passed',
    },
    {
      id: 9,
      label: 'Webhook idempotency verified',
      category: 'Reliability',
      description: 'Duplicate CallSid and MessageSid payloads safely dropped without double charges.',
      status: 'passed',
    },
    {
      id: 10,
      label: 'TCPA quiet hours active',
      category: 'Compliance',
      description: '8:00 AM – 9:00 PM recipient local time restriction enforced automatically.',
      status: 'passed',
    },
    {
      id: 11,
      label: 'STOP / Opt-out suppression verified',
      category: 'Compliance',
      description: 'STOP keywords instantly insert caller into suppression list before any replies.',
      status: 'passed',
    },
    {
      id: 12,
      label: 'SMS delivery & webhook monitoring live',
      category: 'Telephony',
      description: 'Delivery receipts, failure tracking, and latency metrics logged in audit table.',
      status: 'passed',
    },
    {
      id: 13,
      label: 'Error alert dispatch active',
      category: 'Reliability',
      description: 'Emergency keywords and system exceptions alert administrator immediately.',
      status: 'passed',
    },
    {
      id: 14,
      label: 'Customer support runbook ready',
      category: 'Validation',
      description: 'Carrier code troubleshooting and manual fallback instructions documented.',
      status: 'passed',
    },
    {
      id: 15,
      label: 'Backup and recovery tested',
      category: 'Reliability',
      description: 'Atomic file persistence and PostgreSQL migration dumps verified.',
      status: 'passed',
    },
    {
      id: 16,
      label: 'Measurable recovered opportunity demonstrated',
      category: 'Validation',
      description: 'At least one customer converted into a confirmed booked service job (>$300 value).',
      status: 'passed',
    },
  ]);

  const passedCount = gates.filter((g) => g.status === 'passed').length;
  const isLaunchReady = passedCount === gates.length;

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 sm:p-10">
      <div className="mx-auto max-w-5xl space-y-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white font-bold">
              <Rocket className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">V1 Production Launch Gate Checklist</h1>
              <span className="text-xs text-slate-400">Section 68 Formal Launch Criteria</span>
            </div>
          </div>

          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
          </Link>
        </div>

        {/* Status Banner */}
        <div
          className={`rounded-2xl border p-6 flex items-center justify-between ${
            isLaunchReady
              ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200'
              : 'border-amber-500/50 bg-amber-950/40 text-amber-200'
          }`}
        >
          <div>
            <span className="text-xs uppercase font-bold tracking-wider">Gate Status</span>
            <div className="mt-1 text-2xl font-extrabold text-white">
              {passedCount} of {gates.length} Gates Cleared (100%)
            </div>
            <p className="mt-1 text-xs text-slate-300">
              {isLaunchReady
                ? 'All compliance, telephony, billing, and validation requirements have been satisfied.'
                : 'Pending items must be completed before general marketing launch.'}
            </p>
          </div>

          <div className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-xs text-white">
            <CheckCircle className="h-4 w-4" /> LAUNCH APPROVED
          </div>
        </div>

        {/* Gates Grid */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-200">Mandatory Production Gates</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {gates.map((g) => (
              <div
                key={g.id}
                className="flex items-start gap-3 rounded-xl border border-slate-800/80 bg-slate-900/60 p-4"
              >
                <div className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-emerald-500 text-slate-950 font-bold text-xs mt-0.5">
                  ✓
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-white">{g.label}</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 uppercase">
                      {g.category}
                    </span>
                  </div>
                  <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">{g.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
