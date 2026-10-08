'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { Radio, ArrowLeft, AlertTriangle, CheckCircle, PhoneForwarded } from 'lucide-react';
import { CARRIER_GUIDES } from '@/lib/carrier-guides';
import { CarrierForwardingGuide } from '@/types';

type GuideEntry = CarrierForwardingGuide & { carrier_id: string };

const GUIDES: GuideEntry[] = Object.values(CARRIER_GUIDES) as GuideEntry[];

export default function CarrierMatrixPage() {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white">
            <Radio className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Carrier Forwarding Reference
            </h1>
            <p className="text-xs text-slate-500">
              Conditional call-forwarding codes MCR gives tenants, by carrier.
            </p>
          </div>
        </div>
        <Link
          href="/admin"
          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
        >
          <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Admin
        </Link>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-xs text-amber-900">
        <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
        <div>
          <div className="font-bold">This is reference material, not test evidence.</div>
          <p className="mt-1 leading-relaxed">
            MCR has not benchmarked these carriers on live handsets. The codes below are the standard
            GSM/USSD conditional-forwarding strings documented for each carrier, and they are the same
            instructions shown to tenants in the Carrier Forwarding wizard. Whether rollover and
            caller-ID pass-through behave as described on a given handset can only be confirmed by
            dialing the code from that handset and calling the number to let it ring out.
          </p>
        </div>
      </div>

      <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <caption className="border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold text-slate-500">
            Documented conditional forwarding codes per carrier. Expand a row for the full tenant-facing
            instructions.
          </caption>
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
            <tr>
              <th scope="col" className="px-4 py-3">
                Carrier
              </th>
              <th scope="col" className="px-4 py-3">
                No-Answer Code
              </th>
              <th scope="col" className="px-4 py-3">
                Busy / Decline Code
              </th>
              <th scope="col" className="px-4 py-3">
                Cancel
              </th>
              <th scope="col" className="px-4 py-3">
                Conditional Forwarding
              </th>
              <th scope="col" className="px-4 py-3">
                Instructions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {GUIDES.map((g) => (
              <React.Fragment key={g.carrier_id}>
                <tr className="hover:bg-slate-50">
                  <td className="px-4 py-3 font-bold text-slate-900">{g.carrier_name}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{g.forward_no_answer_code}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{g.forward_busy_code}</td>
                  <td className="px-4 py-3 font-mono text-slate-700">{g.cancel_forward_code}</td>
                  <td className="px-4 py-3">
                    {g.supports_conditional_forwarding ? (
                      <span className="inline-flex items-center gap-1 font-semibold text-emerald-700">
                        <CheckCircle className="h-3.5 w-3.5" aria-hidden="true" /> Supported
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 font-semibold text-amber-700">
                        <AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Not supported
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      aria-expanded={expandedId === g.carrier_id}
                      onClick={() =>
                        setExpandedId(expandedId === g.carrier_id ? null : g.carrier_id)
                      }
                      className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 font-semibold text-slate-700 hover:bg-slate-100"
                    >
                      <PhoneForwarded className="h-3.5 w-3.5" aria-hidden="true" />
                      {expandedId === g.carrier_id ? 'Hide' : 'Show'}
                    </button>
                  </td>
                </tr>
                {expandedId === g.carrier_id && (
                  <tr className="bg-slate-50">
                    <td colSpan={6} className="px-4 py-4">
                      <div className="space-y-2 text-[11px] leading-relaxed text-slate-700">
                        <ol className="list-decimal space-y-1 pl-5">
                          {g.instructions.map((step, i) => (
                            <li key={i}>{step}</li>
                          ))}
                        </ol>
                        {g.notes && (
                          <p className="rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-amber-900">
                            <strong>Note:</strong> {g.notes}
                          </p>
                        )}
                        <p className="text-slate-500">
                          <code className="rounded bg-slate-100 px-1 py-0.5">
                            {'{{FORWARD_NUMBER}}'}
                          </code>{' '}
                          is replaced with the tenant&apos;s dedicated MCR recovery line.
                        </p>
                      </div>
                    </td>
                  </tr>
                )}
              </React.Fragment>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
