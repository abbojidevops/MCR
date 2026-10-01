'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  Users,
  ArrowLeft,
  CheckCircle,
  PhoneCall,
  MessageSquare,
  Wrench,
  ToggleLeft,
  ToggleRight,
  Send,
  Plus,
} from 'lucide-react';

interface PilotCustomer {
  id: string;
  businessName: string;
  ownerName: string;
  trade: string;
  phone: string;
  payingMonthly: number;
  mode: 'manual_concierge' | 'hybrid' | 'fully_automated';
  missedCallsLogged: number;
  recoveredJobsCount: number;
  totalRecoveredValue: number;
}

export default function ConciergePilotPage() {
  const [pilots, setPilots] = useState<PilotCustomer[]>([
    {
      id: 'pilot-1',
      businessName: 'Apex Plumbing & Rooter [Demo Seed]',
      ownerName: 'Demo Owner',
      trade: 'Plumbing',
      phone: '+1 (217) 555-0144',
      payingMonthly: 0,
      mode: 'fully_automated',
      missedCallsLogged: 0,
      recoveredJobsCount: 0,
      totalRecoveredValue: 0,
    },
    {
      id: 'pilot-2',
      businessName: 'CoolBreeze Heating & Air [Trial Seed]',
      ownerName: 'Trial User',
      trade: 'HVAC',
      phone: '+1 (317) 555-0177',
      payingMonthly: 0,
      mode: 'hybrid',
      missedCallsLogged: 0,
      recoveredJobsCount: 0,
      totalRecoveredValue: 0,
    },
  ]);

  const [manualCallInput, setManualCallInput] = useState({
    pilotId: 'pilot-3',
    callerNumber: '+1 (312) 555-9011',
    callerName: 'Unknown Caller',
    notes: 'Power flickered in kitchen after thunder',
  });

  const [toast, setToast] = useState<string | null>(null);

  const togglePilotMode = (id: string) => {
    setPilots((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        const nextMode: PilotCustomer['mode'] =
          p.mode === 'manual_concierge'
            ? 'hybrid'
            : p.mode === 'hybrid'
            ? 'fully_automated'
            : 'manual_concierge';
        return { ...p, mode: nextMode };
      })
    );
    setToast('Pilot operating mode updated successfully.');
    setTimeout(() => setToast(null), 3000);
  };

  const handleLogManualCall = () => {
    setToast(`Logged manual call for ${manualCallInput.callerNumber}. Concierge SMS dispatched.`);
    setTimeout(() => setToast(null), 3500);
  };

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 sm:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <div className="flex items-center justify-between border-b border-slate-800 pb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white font-bold">
              <Users className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Concierge Validation & Pilot Migration</h1>
              <span className="text-xs text-slate-400">Section 3 Concierge-First Operational Dashboard</span>
            </div>
          </div>

          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back to Admin
          </Link>
        </div>

        {toast && (
          <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/60 p-3 text-xs font-bold text-emerald-300">
            ✓ {toast}
          </div>
        )}

        {/* Validation Gate Criteria */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-200">Validation Gate: 3 Paying Customers</h2>
          <p className="text-xs text-slate-400 leading-relaxed">
            Per the SaaS validation architecture, manual and automated workflows coexist seamlessly. The founder initially
            validates lead recovery for the first three paying trade companies, proving that customers respond to text-backs
            and owners can convert recovered leads into booked jobs.
          </p>
        </div>

        {/* Pilot Accounts Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6">
          <h2 className="text-base font-bold text-slate-200 mb-4">Pilot Customers & Migration Stages</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                <tr>
                  <th className="py-3 px-4">Business & Owner</th>
                  <th className="py-3 px-4">Trade</th>
                  <th className="py-3 px-4">Monthly Fee</th>
                  <th className="py-3 px-4">Recovered Leads</th>
                  <th className="py-3 px-4">Recovered Value</th>
                  <th className="py-3 px-4">Operating Mode</th>
                  <th className="py-3 px-4">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {pilots.map((p) => (
                  <tr key={p.id} className="hover:bg-slate-900/50">
                    <td className="py-3 px-4">
                      <div className="font-bold text-white">{p.businessName}</div>
                      <div className="text-slate-400 text-[11px]">
                        {p.ownerName} • {p.phone}
                      </div>
                    </td>
                    <td className="py-3 px-4 font-semibold text-slate-300">{p.trade}</td>
                    <td className="py-3 px-4 font-bold text-emerald-400">${p.payingMonthly}/mo</td>
                    <td className="py-3 px-4 font-bold text-white">
                      {p.recoveredJobsCount} / {p.missedCallsLogged}
                    </td>
                    <td className="py-3 px-4 font-bold text-emerald-400">${p.totalRecoveredValue.toLocaleString()}</td>
                    <td className="py-3 px-4">
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                          p.mode === 'fully_automated'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : p.mode === 'hybrid'
                            ? 'bg-blue-950 text-blue-400 border border-blue-800'
                            : 'bg-purple-950 text-purple-400 border border-purple-800'
                        }`}
                      >
                        {p.mode.replace('_', ' ')}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <button
                        onClick={() => togglePilotMode(p.id)}
                        className="text-xs text-blue-400 hover:text-blue-300 font-semibold underline"
                      >
                        Advance Mode →
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Concierge Manual Call Logger (For manual pilot workflow) */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4">
          <h2 className="text-base font-bold text-slate-200">Manual Concierge Intercept Tool</h2>
          <p className="text-xs text-slate-400">
            For pilots in manual concierge mode, founder can manually log a contractor&apos;s missed call to trigger automated follow-up.
          </p>

          <div className="grid gap-4 sm:grid-cols-4 text-xs">
            <div>
              <label className="block text-slate-400 font-semibold mb-1">Target Pilot Business</label>
              <select
                value={manualCallInput.pilotId}
                onChange={(e) => setManualCallInput({ ...manualCallInput, pilotId: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none"
              >
                <option value="pilot-3">VoltCraft Master Electricians</option>
                <option value="pilot-2">CoolBreeze Heating & Air</option>
                <option value="pilot-1">Apex Plumbing & Rooter</option>
              </select>
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Customer Phone Number</label>
              <input
                type="text"
                value={manualCallInput.callerNumber}
                onChange={(e) => setManualCallInput({ ...manualCallInput, callerNumber: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-slate-400 font-semibold mb-1">Notes / Reported Issue</label>
              <input
                type="text"
                value={manualCallInput.notes}
                onChange={(e) => setManualCallInput({ ...manualCallInput, notes: e.target.value })}
                className="w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-white focus:outline-none"
              />
            </div>

            <div className="flex items-end">
              <button
                type="button"
                onClick={handleLogManualCall}
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-blue-600 py-2 font-bold text-white hover:bg-blue-700"
              >
                <Send className="h-3.5 w-3.5" /> Dispatch Concierge SMS
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
