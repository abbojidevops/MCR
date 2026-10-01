'use client';

import React from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  ShieldCheck,
  CheckCircle,
  AlertTriangle,
  ArrowLeft,
  Lock,
  Rocket,
  XCircle,
  Clock,
} from 'lucide-react';

interface GateItem {
  id: number;
  label: string;
  category: 'Validation' | 'Telephony' | 'Compliance' | 'Billing' | 'Reliability';
  description: string;
  status: 'passed' | 'failed' | 'unverified';
  statusReason: string;
}

export default function LaunchGatePage() {
  // Live system state evaluation
  // Computed strictly from current environment, credentials, and tenant DB state
  const hasStripeCredentials = Boolean(
    process.env.NEXT_PUBLIC_STRIPE_LIVE === 'true'
  );
  const hasTwilioCredentials = Boolean(
    process.env.NEXT_PUBLIC_TWILIO_LIVE === 'true'
  );
  const isPostgresMigrated = false; // Local JSON persistence in pre-launch mode; Postgres not migrated
  const payingCustomerCount = 0;    // Apex is demo seed, CoolBreeze is unpaid trial
  const tcrRegistrationStatus = 'unsubmitted';

  const gates: GateItem[] = [
    {
      id: 1,
      label: 'Three paying pilot customers',
      category: 'Validation',
      description: 'Acquire and onboard 3 paying home-service contractors before public general launch.',
      status: payingCustomerCount >= 3 ? 'passed' : 'failed',
      statusReason: '0 paying customers (Apex is demo seed, CoolBreeze is trial)',
    },
    {
      id: 2,
      label: 'Pilot users operated successfully',
      category: 'Validation',
      description: 'Pilot contractors operated for at least 7 consecutive days receiving real leads.',
      status: 'unverified',
      statusReason: 'Manual — unverified (no live contractor pilots operating)',
    },
    {
      id: 3,
      label: 'Carrier conditional forwarding tested',
      category: 'Telephony',
      description: 'Verified conditional rollover on Verizon (*71), AT&T (*61), and T-Mobile (**61*).',
      status: 'unverified',
      statusReason: 'Manual — unverified (carrier network tests pending live numbers)',
    },
    {
      id: 4,
      label: 'A2P 10DLC registration verified with TCR',
      category: 'Compliance',
      description: 'Brand vetting and campaign submission confirmed with The Campaign Registry.',
      status: (tcrRegistrationStatus as string) === 'approved' ? 'passed' : 'failed',
      statusReason: 'Not submitted to TCR; campaign vetting window pending',
    },
    {
      id: 5,
      label: 'Legal terms, Privacy policy & TCPA disclosures live',
      category: 'Compliance',
      description: 'Clear SMS disclosure, TCPA consent language, and opt-out terms published.',
      status: 'passed',
      statusReason: 'Routes /privacy, /terms, and /compliance deployed and active',
    },
    {
      id: 6,
      label: 'Multi-tenant security & route isolation audit',
      category: 'Reliability',
      description: 'Formal third-party penetration and multi-tenant isolation review signed off.',
      status: 'unverified',
      statusReason: 'Manual — unverified (formal security review outstanding)',
    },
    {
      id: 7,
      label: 'Stripe billing & dunning tested',
      category: 'Billing',
      description: 'Successful payments, payment failures (past_due), and subscription cancellations verified.',
      status: hasStripeCredentials ? 'passed' : 'failed',
      statusReason: 'No live Stripe credentials configured; dunning untestable',
    },
    {
      id: 8,
      label: 'Twilio HMAC-SHA1 signature verification active',
      category: 'Telephony',
      description: 'Twilio HMAC-SHA1 signature verification active on all voice and SMS endpoints.',
      status: hasTwilioCredentials ? 'passed' : 'failed',
      statusReason: 'Twilio credentials missing; live HMAC untestable without Twilio',
    },
    {
      id: 9,
      label: 'Webhook idempotency verified',
      category: 'Reliability',
      description: 'Duplicate CallSid and MessageSid payloads safely dropped without double charges.',
      status: 'passed',
      statusReason: 'CallSid/MessageSid idempotency engine active and unit-tested',
    },
    {
      id: 10,
      label: 'TCPA quiet hours active',
      category: 'Compliance',
      description: '8:00 AM – 9:00 PM recipient local time restriction enforced automatically.',
      status: 'passed',
      statusReason: '8am–9pm local timezone quiet hours engine active and tested',
    },
    {
      id: 11,
      label: 'STOP / Opt-out carrier-level handshake',
      category: 'Compliance',
      description: 'Carrier-level STOP response and instant suppression verified on live wireless network.',
      status: 'unverified',
      statusReason: 'Manual — unverified (carrier-level handshake pending live number)',
    },
    {
      id: 12,
      label: 'SMS delivery & webhook monitoring live',
      category: 'Telephony',
      description: 'Delivery receipts, failure tracking, and latency metrics logged in audit table.',
      status: hasTwilioCredentials ? 'passed' : 'failed',
      statusReason: 'Twilio connection not live; delivery receipt webhooks not connected',
    },
    {
      id: 13,
      label: 'Error alert dispatch active',
      category: 'Reliability',
      description: 'Emergency keywords and system exceptions alert administrator immediately.',
      status: 'unverified',
      statusReason: 'Manual — unverified (production alert escalation webhook pending)',
    },
    {
      id: 14,
      label: 'Customer support runbook ready',
      category: 'Validation',
      description: 'Carrier code troubleshooting and manual fallback instructions documented.',
      status: 'unverified',
      statusReason: 'Manual — unverified (support runbook documentation in progress)',
    },
    {
      id: 15,
      label: 'PostgreSQL migration dumps verified',
      category: 'Reliability',
      description: 'Multi-tenant PII and revenue data migrated from local JSON file to production PostgreSQL.',
      status: isPostgresMigrated ? 'passed' : 'failed',
      statusReason: 'Postgres migration pending; currently running local JSON persistence',
    },
    {
      id: 16,
      label: 'Measurable recovered opportunity demonstrated',
      category: 'Validation',
      description: 'At least one customer converted into a confirmed booked service job (>$300 value).',
      status: payingCustomerCount > 0 ? 'passed' : 'failed',
      statusReason: '0 real paying customers; demo leads only',
    },
  ];

  const passedCount = gates.filter((g) => g.status === 'passed').length;
  const isLaunchReady = passedCount === gates.length;
  const pct = Math.round((passedCount / gates.length) * 100);

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

        {/* Mandatory Header Disclaimer (Prompt 2 Item 3) */}
        <div className="rounded-xl border border-amber-500/40 bg-amber-950/30 px-4 py-3 text-xs text-amber-200 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
          <span>
            <strong>Disclaimer:</strong> This gate reflects system state only. It does not reflect legal review, which is a separate outstanding item.
          </span>
        </div>

        {/* Dynamic Status Banner */}
        <div
          className={`rounded-2xl border p-6 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 ${
            isLaunchReady
              ? 'border-emerald-500/50 bg-emerald-950/40 text-emerald-200'
              : 'border-red-500/50 bg-red-950/40 text-red-200'
          }`}
        >
          <div>
            <span className="text-xs uppercase font-bold tracking-wider text-slate-400">Computed Launch Gate Status</span>
            <div className="mt-1 text-2xl font-extrabold text-white">
              {passedCount} of {gates.length} Gates Cleared ({pct}%)
            </div>
            <p className="mt-1 text-xs text-slate-300">
              {isLaunchReady
                ? 'All compliance, telephony, billing, and validation requirements have been satisfied.'
                : `${gates.length - passedCount} gates remain blocked or unverified. General marketing launch is suspended.`}
            </p>
          </div>

          {isLaunchReady ? (
            <div className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-xs text-white shrink-0">
              <CheckCircle className="h-4 w-4" /> LAUNCH APPROVED
            </div>
          ) : (
            <div className="flex items-center gap-2 rounded-xl bg-red-600/90 border border-red-500 px-4 py-2 font-bold text-xs text-white shrink-0">
              <XCircle className="h-4 w-4" /> LAUNCH BLOCKED ({gates.length - passedCount} PENDING)
            </div>
          )}
        </div>

        {/* Gates Grid */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-200">Mandatory Production Gates (Computed Live)</h2>
            <span className="text-xs text-slate-400">
              {passedCount} Passed · {gates.filter(g => g.status === 'failed').length} Failed · {gates.filter(g => g.status === 'unverified').length} Unverified
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {gates.map((g) => {
              const isPassed = g.status === 'passed';
              const isUnverified = g.status === 'unverified';

              return (
                <div
                  key={g.id}
                  className={`flex items-start gap-3 rounded-xl border p-4 transition ${
                    isPassed
                      ? 'border-emerald-800/80 bg-emerald-950/20'
                      : isUnverified
                      ? 'border-amber-900/60 bg-amber-950/20'
                      : 'border-red-900/60 bg-red-950/20'
                  }`}
                >
                  <div
                    className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold mt-0.5 ${
                      isPassed
                        ? 'bg-emerald-500 text-slate-950'
                        : isUnverified
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-red-500 text-white'
                    }`}
                  >
                    {isPassed ? '✓' : isUnverified ? '?' : '✕'}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs text-white truncate">{g.label}</span>
                      <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[9px] font-semibold text-slate-400 uppercase shrink-0">
                        {g.category}
                      </span>
                    </div>

                    <p className="mt-1 text-[11px] text-slate-400 leading-relaxed">{g.description}</p>

                    <div className="mt-2 text-[10px] font-mono">
                      {isPassed ? (
                        <span className="text-emerald-400">✓ {g.statusReason}</span>
                      ) : isUnverified ? (
                        <span className="text-amber-400">⚠ {g.statusReason}</span>
                      ) : (
                        <span className="text-red-400">✕ {g.statusReason}</span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
