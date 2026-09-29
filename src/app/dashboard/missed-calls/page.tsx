'use client';

import React, { useState, useEffect } from 'react';
import {
  PhoneCall,
  PhoneIncoming,
  CheckCircle,
  XCircle,
  Clock,
  ShieldAlert,
  ArrowUpRight,
  Filter,
} from 'lucide-react';
import { CallRecord } from '@/types';

export default function MissedCallsPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);

  const fetchCalls = async () => {
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'get_status', accountId: 'acc-apex-plumbing' }),
      });
      const data = await res.json();
      if (data.calls) {
        setCalls(data.calls);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchCalls();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Missed Call Log</h1>
          <p className="text-xs text-slate-500">
            Real-time telemetry of calls conditionally forwarded from your primary business line.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Caller (From)</th>
              <th className="px-4 py-3">Carrier Forwarding</th>
              <th className="px-4 py-3">Reason</th>
              <th className="px-4 py-3">Text-Back Status</th>
              <th className="px-4 py-3">Deduplication</th>
              <th className="px-4 py-3">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {calls.map((call) => (
              <tr key={call.id} className="hover:bg-slate-50">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="flex h-7 w-7 items-center justify-center rounded-full bg-red-100 text-red-600">
                      <PhoneIncoming className="h-3.5 w-3.5" />
                    </div>
                    <div>
                      <div className="font-bold text-slate-900">{call.from_number}</div>
                      <div className="text-[10px] text-slate-400">Duration: {call.duration}s</div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-3">
                  <span className="rounded bg-blue-50 px-2 py-0.5 text-[10px] font-semibold text-blue-700">
                    {call.forwarded_status || 'conditionally-forwarded'}
                  </span>
                </td>
                <td className="px-4 py-3 font-semibold text-slate-700 uppercase text-[11px]">
                  {call.missed_reason || call.call_status}
                </td>
                <td className="px-4 py-3">
                  {call.text_back_status === 'sent' && (
                    <span className="inline-flex items-center gap-1 font-bold text-emerald-600">
                      <CheckCircle className="h-3.5 w-3.5" /> Sent (&lt;60s)
                    </span>
                  )}
                  {call.text_back_status === 'deduplicated' && (
                    <span className="inline-flex items-center gap-1 font-bold text-amber-600">
                      <Clock className="h-3.5 w-3.5" /> 2hr Deduplicated
                    </span>
                  )}
                  {call.text_back_status === 'suppressed' && (
                    <span className="inline-flex items-center gap-1 font-bold text-red-600">
                      <ShieldAlert className="h-3.5 w-3.5" /> STOP Suppressed
                    </span>
                  )}
                  {call.text_back_status === 'pending' && (
                    <span className="text-slate-400">Queued (Quiet Hours)</span>
                  )}
                </td>
                <td className="px-4 py-3 text-[11px] text-slate-500">
                  {call.deduplication_state === 'first_call' ? 'Initial Contact' : 'Repeat Caller (Protected)'}
                </td>
                <td className="px-4 py-3 text-slate-400 text-[11px]">
                  {new Date(call.created_at).toLocaleString([], {
                    month: 'short',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
