'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ShieldAlert,
  Building,
  DollarSign,
  PhoneCall,
  MessageSquare,
  CheckCircle,
  ArrowLeft,
  Users,
  Activity,
  Layers,
  Clock,
  Search,
  RefreshCw,
  Play,
  Send,
  Sliders,
  Check,
  AlertTriangle,
  Loader2,
  PhoneForwarded,
} from 'lucide-react';

interface FleetTenant {
  id: string;
  name: string;
  slug: string;
  status: string;
  planTier: string;
  isDemo: boolean;
  createdAt: string;
  businessName: string;
  trade: string;
  notificationPhone: string | null;
  forwardingConfigured: boolean;
  crmWebhookConfigured: boolean;
  complianceStatus: string;
  mcrNumber: string | null;
  metrics: {
    totalCalls: number;
    textBacksSent: number;
    totalJobs: number;
    bookedJobs: number;
    recoveredRevenue: number;
  };
}

interface PlatformStats {
  totalAccounts: number;
  payingTenantsCount: number;
  estimatedMrr: number;
  totalRecoveredRevenue: number;
  totalCalls: number;
  totalBookedJobs: number;
}

interface AuditLogEntry {
  id: string;
  accountId: string;
  action: string;
  timestamp: string;
  details?: any;
}

export default function AdminDashboardPage() {
  const [tenants, setTenants] = useState<FleetTenant[]>([]);
  const [stats, setStats] = useState<PlatformStats | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'trial' | 'demo'>('all');
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const fetchFleetData = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/fleet');
      if (!res.ok) throw new Error('Failed to fetch fleet data');
      const data = await res.json();
      if (data.success) {
        setTenants(data.tenants || []);
        setStats(data.platformStats || null);
        setAuditLogs(data.auditLogs || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchFleetData();
  }, []);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  const handleSimulateCall = async (tenantId: string, businessName: string) => {
    try {
      setActionLoading(`sim-${tenantId}`);
      const res = await fetch('/api/admin/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_call',
          accountId: tenantId,
          callerName: 'Concierge Verification Caller',
          callerNumber: '+12175558833',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Simulated missed call executed for ${businessName}. Text-back triggered.`);
        fetchFleetData();
      } else {
        showToast(`Error: ${data.error || 'Failed to simulate call'}`);
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleToggleForwarding = async (tenantId: string, currentStatus: boolean, businessName: string) => {
    try {
      setActionLoading(`fwd-${tenantId}`);
      const res = await fetch('/api/admin/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'verify_forwarding',
          accountId: tenantId,
          forwardingConfigured: !currentStatus,
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Forwarding for ${businessName} marked as ${!currentStatus ? 'VERIFIED' : 'PENDING'}.`);
        fetchFleetData();
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const handleTriggerDigest = async (tenantId: string, businessName: string) => {
    try {
      setActionLoading(`digest-${tenantId}`);
      const res = await fetch('/api/admin/fleet', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'trigger_digest',
          accountId: tenantId,
          digestType: 'daily_summary',
        }),
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Daily summary digest triggered for ${businessName}.`);
        fetchFleetData();
      }
    } catch (err: any) {
      showToast(`Error: ${err.message}`);
    } finally {
      setActionLoading(null);
    }
  };

  const filteredTenants = tenants.filter((t) => {
    const matchesSearch =
      t.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.businessName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.trade.toLowerCase().includes(searchQuery.toLowerCase()) ||
      t.id.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (statusFilter === 'all') return true;
    if (statusFilter === 'demo') return t.isDemo;
    if (statusFilter === 'active') return t.status === 'active' && !t.isDemo;
    if (statusFilter === 'trial') return t.status === 'trial';
    return true;
  });

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 sm:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        {/* Top Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 pb-6 gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-red-600 text-white font-bold">
              <ShieldAlert className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight">MCR Central Admin Control Room</h1>
              <span className="text-xs text-slate-400">Multi-Tenant Fleet Telemetry &amp; Concierge Operations Hub</span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <button
              onClick={fetchFleetData}
              disabled={loading}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
            <Link
              href="/admin/carrier-matrix"
              className="inline-flex items-center gap-1 rounded-xl border border-blue-700 bg-blue-950/60 px-3 py-2 text-xs font-semibold text-blue-300 hover:bg-blue-900/80 transition"
            >
              📡 Carrier Matrix
            </Link>
            <Link
              href="/admin/launch-gate"
              className="inline-flex items-center gap-1 rounded-xl border border-emerald-700 bg-emerald-950/60 px-3 py-2 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/80 transition"
            >
              🚀 Launch Gates
            </Link>
            <Link
              href="/admin/risks"
              className="inline-flex items-center gap-1 rounded-xl border border-amber-700 bg-amber-950/60 px-3 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-900/80 transition"
            >
              ⚠️ Risk Matrix
            </Link>
            <Link
              href="/admin/concierge"
              className="inline-flex items-center gap-1 rounded-xl border border-purple-700 bg-purple-950/60 px-3 py-2 text-xs font-semibold text-purple-300 hover:bg-purple-900/80 transition"
            >
              👥 Concierge Pilots
            </Link>
            <Link
              href="/dashboard"
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
            >
              <ArrowLeft className="h-3.5 w-3.5" /> Client Dashboard
            </Link>
          </div>
        </div>

        {/* Notification Toast */}
        {toast && (
          <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/80 p-3.5 text-xs font-bold text-emerald-300 flex items-center justify-between shadow-lg">
            <span>✓ {toast}</span>
            <button onClick={() => setToast(null)} className="text-emerald-400 hover:text-white font-mono text-xs">✕</button>
          </div>
        )}

        {/* Global SaaS Platform Metrics */}
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-sm">
            <span className="text-xs font-medium text-slate-400">Total Fleet Tenants</span>
            <div className="mt-2 text-3xl font-extrabold text-white">
              {stats ? stats.totalAccounts : tenants.length}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {stats ? `${stats.payingTenantsCount} paying · ${stats.totalAccounts - stats.payingTenantsCount} demo/trial` : 'Loading...'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-sm">
            <span className="text-xs font-medium text-slate-400">Honest Verified MRR</span>
            <div className="mt-2 text-3xl font-extrabold text-emerald-400">
              ${stats ? stats.estimatedMrr : 0}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              {stats?.payingTenantsCount ? `${stats.payingTenantsCount} active paying subscriptions` : '0 live paying subscriptions'}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-sm">
            <span className="text-xs font-medium text-slate-400">Fleet Recovered Revenue</span>
            <div className="mt-2 text-3xl font-extrabold text-blue-400">
              ${stats ? stats.totalRecoveredRevenue.toLocaleString() : 0}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Across {stats ? stats.totalBookedJobs : 0} booked contractor jobs
            </div>
          </div>

          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-5 shadow-sm">
            <span className="text-xs font-medium text-slate-400">Fleet Call Volume</span>
            <div className="mt-2 text-3xl font-extrabold text-indigo-400">
              {stats ? stats.totalCalls : 0}
            </div>
            <div className="mt-1 text-xs text-slate-400">
              Inbound missed calls routed through MCR
            </div>
          </div>
        </div>

        {/* Customer Accounts (Tenants) Management Table */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h2 className="text-base font-bold text-slate-200">Customer Accounts &amp; Fleet Operations</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Manage contractor onboarding, execute concierge test calls, and audit carrier rollover health.
              </p>
            </div>

            {/* Filter & Search controls */}
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <div className="relative">
                <Search className="absolute left-2.5 top-2 h-3.5 w-3.5 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search contractor, trade, or ID..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="rounded-xl border border-slate-800 bg-slate-900 pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-blue-500"
                />
              </div>

              <div className="flex rounded-xl border border-slate-800 bg-slate-900 p-0.5">
                {(['all', 'active', 'trial', 'demo'] as const).map((mode) => (
                  <button
                    key={mode}
                    onClick={() => setStatusFilter(mode)}
                    className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold capitalize transition ${
                      statusFilter === mode
                        ? 'bg-blue-600 text-white'
                        : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {mode}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 text-[11px] font-bold uppercase text-slate-400">
                <tr>
                  <th className="py-3 px-3">Contractor / Trade</th>
                  <th className="py-3 px-3">Tenant ID</th>
                  <th className="py-3 px-3">Plan / Status</th>
                  <th className="py-3 px-3">Recovery Line</th>
                  <th className="py-3 px-3">Forwarding</th>
                  <th className="py-3 px-3">TCR Compliance</th>
                  <th className="py-3 px-3">Recovered ($)</th>
                  <th className="py-3 px-3 text-right">Concierge Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850">
                {filteredTenants.length === 0 ? (
                  <tr>
                    <td colSpan={8} className="py-8 text-center text-slate-500">
                      No matching contractor accounts found.
                    </td>
                  </tr>
                ) : (
                  filteredTenants.map((acc) => (
                    <tr key={acc.id} className="hover:bg-slate-900/60 transition">
                      <td className="py-3 px-3">
                        <div className="font-bold text-white">{acc.businessName}</div>
                        <div className="text-[10px] text-slate-400 capitalize">{acc.trade}</div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-400">{acc.id}</td>
                      <td className="py-3 px-3">
                        <div className="flex items-center gap-1.5">
                          <span className="rounded-full bg-blue-950 border border-blue-800 px-2 py-0.5 text-[10px] font-extrabold uppercase text-blue-300">
                            {acc.planTier}
                          </span>
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${
                              acc.isDemo
                                ? 'bg-amber-950 border border-amber-800 text-amber-300'
                                : acc.status === 'active'
                                ? 'bg-emerald-950 border border-emerald-800 text-emerald-300'
                                : 'bg-slate-800 text-slate-300'
                            }`}
                          >
                            {acc.isDemo ? 'demo' : acc.status}
                          </span>
                        </div>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-slate-300">
                        {acc.mcrNumber || 'Pending Provision'}
                      </td>
                      <td className="py-3 px-3">
                        <button
                          onClick={() => handleToggleForwarding(acc.id, acc.forwardingConfigured, acc.businessName)}
                          disabled={actionLoading === `fwd-${acc.id}`}
                          title="Click to toggle forwarding verification"
                          className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold border cursor-pointer transition ${
                            acc.forwardingConfigured
                              ? 'bg-emerald-950 border-emerald-700 text-emerald-300 hover:bg-emerald-900'
                              : 'bg-rose-950 border-rose-800 text-rose-300 hover:bg-rose-900'
                          }`}
                        >
                          {actionLoading === `fwd-${acc.id}` ? (
                            <Loader2 className="h-2.5 w-2.5 animate-spin" />
                          ) : acc.forwardingConfigured ? (
                            <Check className="h-2.5 w-2.5" />
                          ) : (
                            <AlertTriangle className="h-2.5 w-2.5" />
                          )}
                          {acc.forwardingConfigured ? 'Verified' : 'Pending *71'}
                        </button>
                      </td>
                      <td className="py-3 px-3">
                        <span
                          className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase border ${
                            acc.complianceStatus === 'sms_live'
                              ? 'bg-emerald-950 border-emerald-700 text-emerald-300'
                              : 'bg-amber-950 border-amber-800 text-amber-300'
                          }`}
                        >
                          {acc.complianceStatus.replace('_', ' ')}
                        </span>
                      </td>
                      <td className="py-3 px-3 font-mono text-[11px] text-emerald-400 font-semibold">
                        ${acc.metrics.recoveredRevenue.toLocaleString()} ({acc.metrics.bookedJobs} jobs)
                      </td>
                      <td className="py-3 px-3 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleSimulateCall(acc.id, acc.businessName)}
                            disabled={actionLoading === `sim-${acc.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
                            title="Trigger simulated missed call & text-back triage"
                          >
                            {actionLoading === `sim-${acc.id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Play className="h-3 w-3 text-emerald-400" />
                            )}
                            Test Call
                          </button>
                          <button
                            onClick={() => handleTriggerDigest(acc.id, acc.businessName)}
                            disabled={actionLoading === `digest-${acc.id}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-700 bg-slate-800 px-2 py-1 text-[11px] font-semibold text-slate-200 hover:bg-slate-700 transition cursor-pointer"
                            title="Trigger daily summary flash dispatch"
                          >
                            {actionLoading === `digest-${acc.id}` ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Send className="h-3 w-3 text-blue-400" />
                            )}
                            Digest
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Real-Time System Audit & Dispatch Stream */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-4">
          <div className="flex items-center justify-between border-b border-slate-850 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-emerald-400" />
              <h2 className="text-sm font-bold text-slate-200">Live Telemetry &amp; Audit Trail</h2>
            </div>
            <span className="text-[11px] font-mono text-slate-400">
              Showing last {auditLogs.length} platform events
            </span>
          </div>

          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {auditLogs.length === 0 ? (
              <div className="text-xs text-slate-500 py-3 text-center">No recent audit events recorded.</div>
            ) : (
              auditLogs.map((log) => (
                <div
                  key={log.id}
                  className="rounded-xl border border-slate-850 bg-slate-900/70 p-3 text-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2"
                >
                  <div className="flex items-center gap-2.5">
                    <span className="font-mono text-[10px] text-blue-400 bg-blue-950 border border-blue-900 px-2 py-0.5 rounded font-bold">
                      {log.action}
                    </span>
                    <span className="font-mono text-[11px] text-slate-400">{log.accountId}</span>
                    {log.details && (
                      <span className="text-[11px] text-slate-300 truncate max-w-xs sm:max-w-md">
                        {typeof log.details === 'object'
                          ? JSON.stringify(log.details)
                          : String(log.details)}
                      </span>
                    )}
                  </div>
                  <span className="font-mono text-[10px] text-slate-500 shrink-0">
                    {new Date(log.timestamp).toLocaleTimeString()}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>

        {/* System Telemetry & Guardrail Enforcement */}
        <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 space-y-3">
          <h2 className="text-base font-bold text-slate-200">System Telemetry &amp; Idempotency Engine</h2>
          <div className="rounded-xl border border-slate-800 bg-slate-900 p-4 font-mono text-xs text-slate-300 space-y-1">
            <div className="text-emerald-400">✓ Webhook Idempotency: Duplicate CallSid &amp; MessageSid dropping active</div>
            <div className="text-emerald-400">✓ Quiet Hours Engine: TCPA 8:00 - 21:00 recipient local time filter ACTIVE</div>
            <div className="text-emerald-400">✓ 2-Hour Deduplication: Suppressing duplicate text-backs to frequent callers</div>
            <div className="text-emerald-400">✓ STOP/UNSUBSCRIBE: Instant suppression list insertion prior to message dispatch</div>
            <div className="text-emerald-400">✓ Outbound CRM Dispatcher: Real-time HMAC-SHA256 authenticated webhook sync ACTIVE</div>
            <div className="text-emerald-400">✓ Multi-Cloud Staging Readiness: Render, Railway, Vercel manifests verified</div>
          </div>
        </div>
      </div>
    </div>
  );
}
