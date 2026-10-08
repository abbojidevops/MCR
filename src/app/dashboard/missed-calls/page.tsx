'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  PhoneCall,
  PhoneIncoming,
  CheckCircle,
  XCircle,
  Clock,
  ShieldAlert,
  ArrowUpRight,
  Filter,
  Phone,
  MessageSquare,
  ClipboardList,
  Flame,
  Search,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { CallRecord, JobCard, Conversation } from '@/types';

type TimeFilter = 'all' | 'today' | 'yesterday' | 'week' | 'month';
type StatusFilter = 'all' | 'no_response' | 'responded' | 'qualified' | 'booked' | 'emergency';

export default function MissedCallsPage() {
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters from Section 11
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const fetchCallsData = async () => {
    try {
      setLoading(true);
      setError(null);
      const [callsRes, jobsRes, convsRes] = await Promise.all([
        fetch('/api/calls'),
        fetch('/api/jobs'),
        fetch('/api/conversations'),
      ]);

      if (!callsRes.ok || !jobsRes.ok || !convsRes.ok) {
        throw new Error('Unable to load call, job, or conversation data.');
      }

      const callsData = await callsRes.json();
      const jobsData = await jobsRes.json();
      const convsData = await convsRes.json();

      if (callsData.calls) setCalls(callsData.calls);
      if (jobsData.jobs) setJobs(jobsData.jobs);
      if (convsData.conversations) setConversations(convsData.conversations);
    } catch (err: any) {
      console.error(err);
      setError(err?.message || 'Unable to load the missed call log.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCallsData();
  }, []);

  // Enrich each call with associated conversation and job card
  const enrichedCalls = useMemo(() => {
    return calls.map((call) => {
      const cleanPhone = call.from_number.replace(/\D/g, '').slice(-10);
      const matchedJob = jobs.find((j) => {
        const jPhone = (j.contact?.phone_number || '').replace(/\D/g, '').slice(-10);
        return jPhone === cleanPhone;
      });
      const matchedConv = conversations.find((c) => {
        const cPhone = (c.contact?.phone_number || '').replace(/\D/g, '').slice(-10);
        return cPhone === cleanPhone;
      });

      return {
        ...call,
        job: matchedJob,
        conversation: matchedConv,
        hasResponded: Boolean(matchedConv || matchedJob),
      };
    });
  }, [calls, jobs, conversations]);

  // Apply Section 11 filters
  const filteredCalls = useMemo(() => {
    const now = new Date();
    const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const startOfYesterday = startOfToday - 86400000;
    const startOfWeek = now.getTime() - 7 * 86400000;
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).getTime();

    return enrichedCalls.filter((c) => {
      const callTime = new Date(c.created_at).getTime();

      // Time Filter
      if (timeFilter === 'today' && callTime < startOfToday) return false;
      if (timeFilter === 'yesterday' && (callTime < startOfYesterday || callTime >= startOfToday)) return false;
      if (timeFilter === 'week' && callTime < startOfWeek) return false;
      if (timeFilter === 'month' && callTime < startOfMonth) return false;

      // Status Filter
      if (statusFilter === 'no_response' && c.hasResponded) return false;
      if (statusFilter === 'responded' && !c.hasResponded) return false;
      if (statusFilter === 'qualified' && !c.job) return false;
      if (statusFilter === 'booked' && c.job?.status !== 'BOOKED') return false;
      if (statusFilter === 'emergency' && !c.job?.is_emergency) return false;

      // Search Filter
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        const phone = c.from_number.toLowerCase();
        const prob = (c.job?.problem || '').toLowerCase();
        const name = (c.job?.contact?.full_name || c.conversation?.contact?.full_name || '').toLowerCase();
        if (!phone.includes(q) && !prob.includes(q) && !name.includes(q)) return false;
      }

      return true;
    });
  }, [enrichedCalls, timeFilter, statusFilter, searchQuery]);

  if (error) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Missed Calls Log</h1>
        </div>
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800"
        >
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-rose-600" aria-hidden="true" />
          <h2 className="font-bold text-base">Missed call data could not be loaded.</h2>
          <p className="mt-1 text-xs text-rose-700">{error}</p>
          <button
            type="button"
            onClick={fetchCallsData}
            className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Missed Calls Log</h1>
          <p className="text-xs text-slate-500">
            Real-time telemetry and customer response attribution for every missed phone call.
          </p>
        </div>
        <button
          type="button"
          onClick={fetchCallsData}
          disabled={loading}
          className="inline-flex items-center gap-1.5 self-start rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
        >
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
          Refresh
        </button>
      </div>

      {loading && calls.length === 0 && (
        <div className="space-y-4" aria-hidden="true">
          <div className="h-24 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
        </div>
      )}

      {/* Section 11: Filters & Search Bar */}
      <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          {/* Time Filters */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold">
            <span className="text-slate-400 text-[11px] uppercase tracking-wider mr-1">Time:</span>
            {[
              { id: 'all', label: 'All Time' },
              { id: 'today', label: 'Today' },
              { id: 'yesterday', label: 'Yesterday' },
              { id: 'week', label: 'This Week' },
              { id: 'month', label: 'This Month' },
            ].map((t) => (
              <button
                key={t.id}
                type="button"
                aria-pressed={timeFilter === t.id}
                onClick={() => setTimeFilter(t.id as TimeFilter)}
                className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                  timeFilter === t.id
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {/* Search Box */}
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-slate-400" />
            <input
              type="search"
              id="missed-calls-search"
              aria-label="Search missed calls by phone number, issue, or customer name"
              placeholder="Search phone or issue..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full sm:w-60 rounded-xl border border-slate-200 bg-slate-50 pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Status Filters */}
        <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold pt-2 border-t border-slate-100">
          <span className="text-slate-400 text-[11px] uppercase tracking-wider mr-1">Status:</span>
          {[
            { id: 'all', label: 'All Statuses' },
            { id: 'no_response', label: 'No Response' },
            { id: 'responded', label: 'Responded' },
            { id: 'qualified', label: 'Qualified Leads' },
            { id: 'booked', label: 'Booked' },
            { id: 'emergency', label: 'Emergency' },
          ].map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={statusFilter === s.id}
              onClick={() => setStatusFilter(s.id as StatusFilter)}
              className={`rounded-lg px-2.5 py-1 text-xs font-semibold transition ${
                statusFilter === s.id
                  ? 'bg-slate-900 text-white'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>
      </div>

      {/* Section 11: Call Cards / Table */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">
              Missed calls with text-back delivery, customer response, lead status and recovered revenue
            </caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] font-bold uppercase text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Caller</th>
                <th scope="col" className="px-4 py-3">Time</th>
                <th scope="col" className="px-4 py-3">Text-Back</th>
                <th scope="col" className="px-4 py-3">Response</th>
                <th scope="col" className="px-4 py-3">Lead Status</th>
                <th scope="col" className="px-4 py-3">Revenue</th>
                <th scope="col" className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCalls.length === 0 ? (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                    {loading
                      ? 'Loading missed calls...'
                      : calls.length === 0
                        ? 'No missed calls have been received yet. Once your carrier forwarding is live, every unanswered call appears here.'
                        : 'No missed calls found matching your filter criteria.'}
                  </td>
                </tr>
              ) : (
                filteredCalls.map((call) => (
                  <tr key={call.id} className="hover:bg-slate-50/80 transition">
                    {/* Caller */}
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <div
                          className={`flex h-7 w-7 items-center justify-center rounded-full ${
                            call.job?.is_emergency
                              ? 'bg-red-100 text-red-600'
                              : 'bg-blue-100 text-blue-600'
                          }`}
                        >
                          {call.job?.is_emergency ? (
                            <Flame className="h-3.5 w-3.5" />
                          ) : (
                            <PhoneIncoming className="h-3.5 w-3.5" />
                          )}
                        </div>
                        <div>
                          <div className="font-bold text-slate-900">
                            {call.job?.contact?.full_name || call.conversation?.contact?.full_name || 'Unknown Caller'}
                          </div>
                          <div className="font-mono text-[10px] text-slate-400">{call.from_number}</div>
                        </div>
                      </div>
                    </td>

                    {/* Time */}
                    <td className="px-4 py-3 text-slate-500">
                      <div>{new Date(call.created_at).toLocaleDateString()}</div>
                      <div className="text-[10px] text-slate-400">
                        {new Date(call.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    {/* Text-Back Status & Suppression Reasons */}
                    <td className="px-4 py-3">
                      {call.text_back_status === 'sent' && (
                        <span className="inline-flex items-center gap-1 font-semibold text-emerald-600">
                          <CheckCircle className="h-3 w-3" /> Sent (&lt;60s)
                        </span>
                      )}
                      {call.text_back_status === 'deduplicated' && (
                        <div>
                          <span className="inline-flex items-center gap-1 font-semibold text-amber-600">
                            <Clock className="h-3 w-3" /> Deduplicated
                          </span>
                          <div className="text-[10px] text-slate-400">Called within last 2 hrs</div>
                        </div>
                      )}
                      {call.text_back_status === 'suppressed' && (
                        <div>
                          <span className="inline-flex items-center gap-1 font-semibold text-red-600">
                            <ShieldAlert className="h-3 w-3" /> Suppressed
                          </span>
                          <div className="text-[10px] text-slate-400">TCPA STOP on file</div>
                        </div>
                      )}
                      {call.text_back_status === 'pending' && (
                        <div>
                          <span className="inline-flex items-center gap-1 font-medium text-slate-500">
                            <Clock className="h-3 w-3" /> Queued
                          </span>
                          <div className="text-[10px] text-slate-400">Quiet hours (Sends at 8:00 AM)</div>
                        </div>
                      )}
                      {call.text_back_status === 'failed' && (
                        <div>
                          <span className="inline-flex items-center gap-1 font-medium text-red-500">
                            <XCircle className="h-3 w-3" /> Failed
                          </span>
                          <div className="text-[10px] text-slate-400">Landline or invalid number</div>
                        </div>
                      )}
                    </td>

                    {/* Response Status */}
                    <td className="px-4 py-3">
                      {call.hasResponded ? (
                        <span className="rounded-full bg-indigo-50 px-2.5 py-0.5 text-[10px] font-bold text-indigo-700 border border-indigo-200">
                          Responded
                        </span>
                      ) : (
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-600">
                          No Response
                        </span>
                      )}
                    </td>

                    {/* Lead Status */}
                    <td className="px-4 py-3">
                      {call.job ? (
                        <div className="flex items-center gap-1.5">
                          {call.job.is_emergency && (
                            <span className="rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-bold text-red-700">
                              EMERGENCY
                            </span>
                          )}
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                              call.job.status === 'COMPLETED'
                                ? 'bg-emerald-100 text-emerald-800'
                                : call.job.status === 'BOOKED'
                                ? 'bg-indigo-100 text-indigo-800'
                                : call.job.status === 'CONTACTED'
                                ? 'bg-amber-100 text-amber-800'
                                : call.job.status === 'NEW'
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-slate-100 text-slate-700'
                            }`}
                          >
                            {call.job.status}
                          </span>
                        </div>
                      ) : (
                        <span className="text-slate-400 text-[11px]">—</span>
                      )}
                    </td>

                    {/* Revenue */}
                    <td className="px-4 py-3 font-bold text-slate-900">
                      {call.job ? (
                        call.job.actual_value ? (
                          <span className="text-emerald-700">${call.job.actual_value}</span>
                        ) : (
                          <span className="text-slate-600">${call.job.estimated_value} (est)</span>
                        )
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`tel:${call.from_number}`}
                          className="inline-flex items-center gap-1 rounded-lg bg-emerald-700 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-800 shadow-sm"
                          aria-label={`Call ${call.from_number}`}
                          title="Call Customer"
                        >
                          <Phone className="h-3 w-3" /> Call
                        </a>
                        <Link
                          href="/dashboard/inbox"
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                          aria-label={`Open SMS thread for ${call.from_number}`}
                          title="Open SMS Thread"
                        >
                          <MessageSquare className="h-3 w-3 text-blue-600" />
                        </Link>
                        {call.job && (
                          <Link
                            href="/dashboard/jobs"
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-semibold text-slate-700 hover:bg-slate-50"
                            aria-label={`View job card for ${call.job?.contact?.full_name || call.from_number}`}
                            title="View Job Card"
                          >
                            <ClipboardList className="h-3 w-3 text-amber-600" />
                          </Link>
                        )}
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
