'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { Users, ArrowLeft, RefreshCw, AlertTriangle, PhoneCall, Loader2 } from 'lucide-react';

interface FleetTenant {
  id: string;
  name: string;
  status: string;
  planTier: string;
  isDemo: boolean;
  businessName: string;
  trade: string;
  notificationPhone: string | null;
  forwardingConfigured: boolean;
  crmWebhookConfigured: boolean;
  complianceStatus: string;
  metrics: {
    totalCalls: number;
    textBacksSent: number;
    totalJobs: number;
    bookedJobs: number;
    recoveredRevenue: number;
  };
}

export default function ConciergePilotPage() {
  const [tenants, setTenants] = useState<FleetTenant[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const fetchPilots = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch('/api/admin/fleet');
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Failed to load pilot data (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (!data.success) throw new Error(data.error || 'Fleet endpoint returned an error.');
      setTenants(data.tenants || []);
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'Unable to load pilot data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPilots();
  }, []);

  const liveTenants = tenants.filter((t) => !t.isDemo);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 border-b border-slate-200 pb-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-purple-600 text-white">
            <Users className="h-5 w-5" aria-hidden="true" />
          </div>
          <div>
            <h1 className="text-xl font-bold tracking-tight text-slate-900">
              Pilot Accounts &amp; Migration Stages
            </h1>
            <p className="text-xs text-slate-500">
              Live tenant telemetry for every account on this deployment.
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchPilots}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            )}
            Refresh
          </button>
          <Link
            href="/admin"
            className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" /> Back to Admin
          </Link>
        </div>
      </div>

      {loadError && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-5 text-rose-800"
        >
          <h2 className="text-sm font-bold">Pilot data could not be loaded.</h2>
          <p className="mt-1 text-xs">{loadError}</p>
          <button
            type="button"
            onClick={fetchPilots}
            className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-500"
          >
            Try Again
          </button>
        </div>
      )}

      {loading && tenants.length === 0 && !loadError && (
        <div className="space-y-3" aria-hidden="true">
          <div className="h-12 animate-pulse rounded-xl bg-slate-200" />
          <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
        </div>
      )}

      {!loading && !loadError && tenants.length === 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-600">
          <Users className="mx-auto mb-2 h-8 w-8 text-slate-400" aria-hidden="true" />
          <h2 className="font-bold text-slate-900">No tenant accounts exist yet.</h2>
          <p className="mt-1 text-xs">
            Accounts appear here as soon as they are created on this deployment.
          </p>
        </div>
      )}

      {tenants.length > 0 && (
        <div className="overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <caption className="border-b border-slate-200 px-4 py-3 text-left text-xs font-semibold text-slate-500">
              Every tenant on this deployment, with live call, text-back, and job telemetry from the
              MCR database.
            </caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">
                  Business
                </th>
                <th scope="col" className="px-4 py-3">
                  Trade / Plan
                </th>
                <th scope="col" className="px-4 py-3">
                  Calls / Text-Backs
                </th>
                <th scope="col" className="px-4 py-3">
                  Jobs (booked)
                </th>
                <th scope="col" className="px-4 py-3">
                  Recovered Revenue
                </th>
                <th scope="col" className="px-4 py-3">
                  Forwarding
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tenants.map((t) => (
                <tr key={t.id} className="hover:bg-slate-50">
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{t.businessName || t.name}</div>
                    <div className="text-[11px] text-slate-500">
                      {t.isDemo ? 'Demo seed' : `Status: ${t.status}`}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {t.trade} · {t.planTier}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {t.metrics.totalCalls} / {t.metrics.textBacksSent}
                  </td>
                  <td className="px-4 py-3 text-slate-700">
                    {t.metrics.totalJobs} ({t.metrics.bookedJobs})
                  </td>
                  <td className="px-4 py-3 font-bold text-emerald-700">
                    ${t.metrics.recoveredRevenue.toLocaleString()}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase ${
                        t.forwardingConfigured
                          ? 'border-emerald-200 bg-emerald-50 text-emerald-700'
                          : 'border-amber-200 bg-amber-50 text-amber-700'
                      }`}
                    >
                      {t.forwardingConfigured ? 'Self-reported' : 'Pending'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {liveTenants.length === 0 && tenants.length > 0 && (
        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 p-5 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div>
            <div className="font-bold">No non-demo tenants on this deployment.</div>
            <p className="mt-1">
              Every account currently in the database is flagged as a demo seed. Nothing here
              represents a paying customer.
            </p>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-900">Operating a pilot in manual concierge mode</h2>
        <p className="mt-2 text-xs leading-relaxed text-slate-600">
          This deployment does not include a manual concierge dispatch queue — every account runs the
          same automated pipeline. To exercise the pipeline for a tenant, use{' '}
          <Link href="/admin" className="font-semibold text-blue-600 underline">
            Simulate Call
          </Link>{' '}
          on the fleet overview, which runs a real missed call through detection, text-back, and
          qualification. Phone-based escalation for a specific tenant uses the notification phone on
          that account&apos;s Business Profile.
        </p>
        <p className="mt-2 flex items-start gap-2 text-xs text-slate-600">
          <PhoneCall className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" aria-hidden="true" />
          <span>
            Emergency escalation contacts live in each tenant&apos;s profile, not in this console.
          </span>
        </p>
      </div>
    </div>
  );
}
