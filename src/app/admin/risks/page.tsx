'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  ArrowLeft,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  TrendingUp,
  Users,
  Wrench,
} from 'lucide-react';

interface RiskItem {
  id: number;
  risk: string;
  likelihood: 'Low' | 'Medium' | 'High';
  impact: 'Low' | 'Medium' | 'High' | 'Critical';
  mitigation: string;
  owner: string;
  status: 'Mitigated' | 'Monitoring' | 'Active';
}

export default function RiskRegisterPage() {
  const [risks] = useState<RiskItem[]>([
    {
      id: 1,
      risk: 'Conditional forwarding unsupported on regional/prepaid MVNO',
      likelihood: 'Low',
      impact: 'High',
      mitigation: 'Pre-flight carrier detection in onboarding; fallback to office VoIP rollover or dedicated direct line.',
      owner: 'Telecom Architect',
      status: 'Mitigated',
    },
    {
      id: 2,
      risk: 'Caller ID not preserved during forwarding',
      likelihood: 'Medium',
      impact: 'Critical',
      mitigation: 'Conditional forwarding preserves original caller ID natively. Explicit carrier testing guide prevents blind forward-all.',
      owner: 'Telecom Engineer',
      status: 'Mitigated',
    },
    {
      id: 3,
      risk: 'A2P 10DLC registration delays (TCR)',
      likelihood: 'High',
      impact: 'High',
      mitigation: 'Pre-registered standard campaign templates. During review window, missed-call detection & owner alerts still function.',
      owner: 'Compliance Officer',
      status: 'Monitoring',
    },
    {
      id: 4,
      risk: 'SMS carrier spam filtering',
      likelihood: 'Medium',
      impact: 'High',
      mitigation: 'Clear business branding in first 10 words, no link shorteners, transactional intent only, STOP/HELP compliance built-in.',
      owner: 'Product Growth',
      status: 'Mitigated',
    },
    {
      id: 5,
      risk: 'Carrier forwarding minute costs',
      likelihood: 'Low',
      impact: 'Low',
      mitigation: 'TwiML immediately hangs up after 1s once missed-call is recorded, consuming under 5 seconds of carrier talk time.',
      owner: 'DevOps',
      status: 'Mitigated',
    },
    {
      id: 6,
      risk: 'TCPA / Quiet hours compliance complaints',
      likelihood: 'Low',
      impact: 'Critical',
      mitigation: 'Strict 8 AM – 9 PM recipient local time enforcement with area-code timezone fallback. Instant STOP suppression.',
      owner: 'Security Engineer',
      status: 'Mitigated',
    },
    {
      id: 7,
      risk: 'Customer churn after free trial',
      likelihood: 'Medium',
      impact: 'High',
      mitigation: 'Automated Daily 6 PM & Weekly Recovered-Jobs Report proving tangible dollar ROI ($1,000+ recovered vs $149/mo fee).',
      owner: 'Product Manager',
      status: 'Active',
    },
    {
      id: 8,
      risk: 'Provider pricing or fee changes',
      likelihood: 'Low',
      impact: 'Medium',
      mitigation: 'High gross margin (~79.4%) provides healthy buffer against marginal SMS rate adjustments.',
      owner: 'Finance / SaaS Architect',
      status: 'Monitoring',
    },
    {
      id: 9,
      risk: 'General CRM competitors adding text-back',
      likelihood: 'High',
      impact: 'Medium',
      mitigation: 'Narrow trade focus, zero-software-replacement positioning, superior trade qualification questions and emergency detection.',
      owner: 'Product Growth',
      status: 'Monitoring',
    },
    {
      id: 10,
      risk: 'Founder trapped in manual concierge support',
      likelihood: 'Medium',
      impact: 'High',
      mitigation: '12-step self-service onboarding wizard, automated carrier code generator, built-in test simulator.',
      owner: 'Founder',
      status: 'Mitigated',
    },
  ]);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 sm:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-amber-600 text-white font-bold">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">SaaS Risk Register & Mitigation Matrix</h1>
              <span className="text-xs text-slate-400">Section 62 Formal Risk Governance Tracker</span>
            </div>
          </div>

          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
          </Link>
        </div>

        {/* Risk Summary Badges */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <span className="text-xs font-medium text-slate-400">Total Tracked Risks</span>
            <div className="mt-2 text-3xl font-extrabold text-white">{risks.length}</div>
            <div className="mt-1 text-xs text-emerald-400">100% Mitigations Architected</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <span className="text-xs font-medium text-slate-400">High / Critical Impact Risks</span>
            <div className="mt-2 text-3xl font-extrabold text-amber-400">6</div>
            <div className="mt-1 text-xs text-slate-400">Safeguards actively implemented</div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5">
            <span className="text-xs font-medium text-slate-400">Concierge Validation Gate</span>
            <div className="mt-2 text-3xl font-extrabold text-amber-400">Pending (0/3)</div>
            <div className="mt-1 text-xs text-slate-400">0 paying pilots (pre-launch phase)</div>
          </div>
        </div>

        {/* Risk Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
          <h2 className="text-base font-bold text-slate-200 mb-4">Risk Matrix & Active Controls</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                <tr>
                  <th className="py-3 px-4">#</th>
                  <th className="py-3 px-4">Risk Description</th>
                  <th className="py-3 px-4">Likelihood</th>
                  <th className="py-3 px-4">Impact</th>
                  <th className="py-3 px-4">Mitigation Strategy</th>
                  <th className="py-3 px-4">Owner</th>
                  <th className="py-3 px-4">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {risks.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-900/50">
                    <td className="py-3 px-4 text-slate-500 font-mono">{r.id}</td>
                    <td className="py-3 px-4 font-bold text-white max-w-xs">{r.risk}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          r.likelihood === 'High'
                            ? 'bg-red-950 text-red-400'
                            : r.likelihood === 'Medium'
                            ? 'bg-amber-950 text-amber-400'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {r.likelihood}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          r.impact === 'Critical'
                            ? 'bg-red-950 text-red-400'
                            : r.impact === 'High'
                            ? 'bg-amber-950 text-amber-400'
                            : 'bg-slate-800 text-slate-300'
                        }`}
                      >
                        {r.impact}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-300 max-w-sm leading-relaxed">{r.mitigation}</td>
                    <td className="py-3 px-4 text-slate-400 font-semibold">{r.owner}</td>
                    <td className="py-3 px-4">
                      <span className="rounded-full bg-emerald-950 text-emerald-400 border border-emerald-800 px-2 py-0.5 text-[10px] font-bold">
                        {r.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* ---------------- OPEN QUESTION: AFTER-HOURS SMS POLICY (ITEM 6) ---------------- */}
        <div className="rounded-2xl border border-amber-600/50 bg-amber-950/20 p-6 space-y-4">
          <div className="flex items-center gap-2 text-amber-400 font-bold text-sm">
            <AlertTriangle className="h-4 w-4" />
            <span>Open Legal Question: After-Hours SMS Policy &amp; TCPA Attorney Sign-Off</span>
          </div>

          <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
            <p>
              <strong>The Problem:</strong> When a homeowner calls a contractor at 10:00 PM with an emergency (e.g. burst pipe), the consumer-facing automated text-back is currently queued until 8:05 AM to avoid TCPA quiet hours violations. However, waiting 10 hours means the homeowner calls a competitor, defeating the primary emergency value proposition.
            </p>
            <p>
              <strong>Current Code Implementation:</strong>
            </p>
            <ul className="list-disc pl-5 space-y-1 text-slate-400">
              <li>
                <strong className="text-white">Business Owner Alert:</strong> Fires <em>immediately at any hour</em> via push notification, email, and one-tap callback URL (<code className="font-mono text-emerald-400">tel:caller</code>). Business-to-business lead alerts on the contractor&apos;s own phone are NOT consumer telemarketing and are exempt from TCPA quiet hours.
              </li>
              <li>
                <strong className="text-white">Consumer Outbound SMS:</strong> Queued until 8:05 AM in the caller&apos;s local timezone unless legal confirms an exception.
              </li>
            </ul>
            <p>
              <strong>The Open Legal Argument:</strong> A direct, automated reply to an inbound consumer phone call is arguably <em>responsive transaction fulfillment</em> rather than unprompted telemarketing solicitation. Under FCC precedent, responding to consumer-initiated contact within minutes has strong legal defense, but courts and carrier rules differ on late-night automated SMS.
            </p>
            <p className="rounded-lg bg-amber-950/60 border border-amber-800/80 p-3 text-amber-200">
              ⚖️ <strong>Legal Action Required:</strong> This policy must be formally evaluated and signed off by qualified TCPA legal counsel before enabling after-hours text-back dispatch in production. Code cannot make this determination unilaterally. Until formal legal sign-off, all consumer marketing of 24/7 or late-night automated text-back is suspended.
            </p>
          </div>
        </div>

        {/* ---------------- ARCHITECTURE DECISION: SHARED FALLBACK & SUPPRESSION (ITEM 8) ---------------- */}
        <div className="rounded-2xl border border-blue-600/50 bg-blue-950/20 p-6 space-y-4">
          <div className="flex items-center gap-2 text-blue-400 font-bold text-sm">
            <ShieldAlert className="h-4 w-4" />
            <span>Architecture Decision Record: Shared Pre-Registered Fallback Number</span>
          </div>

          <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
            <p>
              During the 3-day to 4-week TCR campaign approval window, tenants cannot send SMS from their dedicated numbers without carrier blocking. Evaluating the use of a shared pre-registered high-trust fallback number:
            </p>

            <div className="grid gap-3 sm:grid-cols-3 pt-2">
              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
                <span className="font-bold text-amber-400 block text-xs">1. Shared Fate Risk</span>
                <p className="text-[11px] text-slate-400 leading-normal">
                  All tenants route through a single carrier campaign. A single spam complaint or illegal message from one rogue contractor risks having the entire campaign suspended by carriers, instantly shutting down texting for all tenants across the fleet.
                </p>
                <div className="text-[10px] text-slate-500 border-t border-slate-800 pt-1.5">
                  <strong>Mitigation:</strong> Strict pre-approved templates only. No freeform promotional messages permitted during fallback.
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
                <span className="font-bold text-amber-400 block text-xs">2. Throughput Ceiling</span>
                <p className="text-[11px] text-slate-400 leading-normal">
                  Sole-proprietor campaigns cap near 3,000 segments/day, with T-Mobile capping at 1,000 segments/day total. At an average of 4 messages per lead and 10 missed calls/tenant/day, the shared pool saturates at just <strong>25 active tenants</strong>.
                </p>
                <div className="text-[10px] text-slate-500 border-t border-slate-800 pt-1.5">
                  <strong>Mitigation:</strong> Hard throttle per tenant; queuing threshold alerts founder at 60% capacity.
                </div>
              </div>

              <div className="rounded-xl border border-slate-800 bg-slate-900/80 p-4 space-y-2">
                <span className="font-bold text-emerald-400 block text-xs">3. Suppression Migration</span>
                <p className="text-[11px] text-slate-400 leading-normal">
                  When a consumer replies STOP to the shared fallback number, the suppression must persist when the tenant&apos;s dedicated number clears vetting.
                </p>
                <div className="text-[10px] text-slate-500 border-t border-slate-800 pt-1.5">
                  <strong>Implementation:</strong> Suppressions are stored by <code className="text-emerald-300 font-mono">(tenant_id, phone_number)</code> tuple, independent of originating sender number. Cutover migrates all historical opt-outs automatically.
                </div>
              </div>
            </div>

            <p className="pt-2 text-slate-400">
              <strong>Recommendation:</strong> Do not market automated fallback texting as an immediate guarantee. Instead, rely on the honest waiting-period message (&ldquo;Voice alerts live today · Text-back activates upon carrier approval&rdquo;) with optional manual concierge assistance during vetting.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
