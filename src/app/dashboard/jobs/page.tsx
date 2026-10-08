'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  ClipboardList,
  Phone,
  MessageSquare,
  Flame,
  CheckCircle,
  XCircle,
  Clock,
  MapPin,
  Camera,
  DollarSign,
  AlertCircle,
  ArrowRight,
  Eye,
  Download,
  Loader2,
  RefreshCw,
} from 'lucide-react';
import { JobCard, JobStatus } from '@/types';

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobCard | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [actualValueInput, setActualValueInput] = useState<string>('');
  const [isBridgingCall, setIsBridgingCall] = useState(false);
  const [bridgeCallStatus, setBridgeCallStatus] = useState<string | null>(null);
  const [bridgeCallError, setBridgeCallError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);

  /**
   * Download the tenant-scoped CSV export. Uses fetch so an expired session or a
   * server error surfaces as a readable message instead of navigating the whole
   * tab to a JSON error page.
   */
  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const res = await fetch('/api/jobs/export');
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Export failed (HTTP ${res.status})`);
      }
      const blob = await res.blob();
      const disposition = res.headers.get('content-disposition') || '';
      const match = disposition.match(/filename="?([^"]+)"?/);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = match ? match[1] : 'mcr-jobs.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setActionError(null);
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || 'CSV export failed.');
    } finally {
      setExporting(false);
    }
  };

  const fetchJobs = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch('/api/jobs');
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Failed to load jobs (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (data.jobs) {
        setJobs(data.jobs);
      }
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'Unable to load job cards.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  // Every timeline entry below is derived from a timestamp that actually exists
  // on the job record. Steps that never happened are omitted rather than asserted.
  const timelineSteps = selectedJob
    ? [
        selectedJob.first_call_time,
        selectedJob.text_back_time,
        selectedJob.qualified_time,
        selectedJob.contacted_time,
        selectedJob.booked_time,
        selectedJob.completed_time,
        selectedJob.dead_time,
      ].filter(Boolean).length
    : 0;

  // Close the job detail dialog on Escape for keyboard users.
  useEffect(() => {
    if (!selectedJob) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setSelectedJob(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [selectedJob]);

  const handleStatusChange = async (jobId: string, newStatus: JobStatus, actualValue?: number) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId,
          status: newStatus,
          actualValue,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setActionError(data?.error || 'Could not update the job. Please try again.');
        return;
      }
      setActionError(null);
      fetchJobs();
      if (selectedJob && selectedJob.id === jobId) {
        setSelectedJob(data.job);
      }
    } catch (err: any) {
      console.error(err);
      setActionError(err?.message || 'Network error while updating the job.');
    }
  };

  const handleBridgeCall = async (customerPhone: string, jobId: string) => {
    setIsBridgingCall(true);
    setBridgeCallStatus('Initiating call bridge...');
    setBridgeCallError(null);
    try {
      const res = await fetch('/api/telecom/bridge-call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ customerPhone, jobId }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setBridgeCallError(data.error || 'Failed to initiate bridge call');
        setBridgeCallStatus(null);
        return;
      }

      setBridgeCallStatus(
        `Calling your phone (${data.contractorPhone})! Answer to be connected to ${data.customerPhone} with business caller ID ${data.mcrNumber}.`
      );
      fetchJobs();
      if (selectedJob && data.jobUpdated) {
        setSelectedJob({ ...selectedJob, status: 'CONTACTED' });
      }
    } catch (err: any) {
      setBridgeCallError(err.message || 'Network exception while bridging call');
      setBridgeCallStatus(null);
    } finally {
      setIsBridgingCall(false);
    }
  };

  const columns: { status: JobStatus; title: string; color: string; badgeBg: string }[] = [
    { status: 'NEW', title: 'New Opportunities', color: 'border-blue-500', badgeBg: 'bg-blue-100 text-blue-800' },
    { status: 'CONTACTED', title: 'Contacted', color: 'border-amber-500', badgeBg: 'bg-amber-100 text-amber-800' },
    { status: 'BOOKED', title: 'Booked Jobs', color: 'border-indigo-500', badgeBg: 'bg-indigo-100 text-indigo-800' },
    { status: 'COMPLETED', title: 'Completed (Paid)', color: 'border-emerald-500', badgeBg: 'bg-emerald-100 text-emerald-800' },
    { status: 'DEAD', title: 'Dead / Lost', color: 'border-slate-400', badgeBg: 'bg-slate-100 text-slate-700' },
  ];

  if (loadError) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Job Cards</h1>
        </div>
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800"
        >
          <AlertCircle className="h-8 w-8 mx-auto mb-2 text-rose-600" aria-hidden="true" />
          <h2 className="font-bold text-base">Job cards could not be loaded.</h2>
          <p className="mt-1 text-xs text-rose-700">{loadError}</p>
          <button
            type="button"
            onClick={fetchJobs}
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
      {actionError && (
        <div
          role="alert"
          className="flex items-center justify-between gap-3 rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800"
        >
          <span className="flex items-center gap-2">
            <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
            {actionError}
          </span>
          <button
            type="button"
            onClick={() => setActionError(null)}
            aria-label="Dismiss error"
            className="rounded px-2 py-0.5 font-bold text-rose-500 hover:text-rose-700"
          >
            ✕
          </button>
        </div>
      )}

      {/* Top Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Job Cards</h1>
          <p className="text-xs text-slate-500">
            Recovered leads generated automatically from missed phone calls.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={fetchJobs}
            disabled={loading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 disabled:opacity-50"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            Refresh
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleExportCsv}
            disabled={exporting}
            className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 transition disabled:opacity-50"
          >
            <Download className="h-3.5 w-3.5 text-slate-500" aria-hidden="true" />
            <span>{exporting ? 'Preparing...' : 'Export CSV'}</span>
          </button>

          <div
            role="group"
            aria-label="Job board view mode"
            className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs"
          >
            <button
              type="button"
              aria-pressed={viewMode === 'kanban'}
              onClick={() => setViewMode('kanban')}
              className={`rounded-md px-3 py-1 font-semibold ${
                viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kanban
            </button>
            <button
              type="button"
              aria-pressed={viewMode === 'list'}
              onClick={() => setViewMode('list')}
              className={`rounded-md px-3 py-1 font-semibold ${
                viewMode === 'list' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              List View
            </button>
          </div>
        </div>
      </div>

      {/* Kanban Board View */}
      {viewMode === 'kanban' && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {columns.map((col) => {
            const colJobs = jobs.filter((j) => (j.status || '').toUpperCase() === col.status.toUpperCase());
            const totalColValue = colJobs.reduce((sum, j) => sum + (j.actual_value || j.estimated_value || 0), 0);

            return (
              <div key={col.status} className="flex flex-col rounded-2xl border border-slate-200 bg-slate-100/60 p-3">
                {/* Column Header */}
                <div className="flex items-center justify-between px-2 py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="font-bold text-xs text-slate-800">{col.title}</span>
                    <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-bold text-slate-700">
                      {colJobs.length}
                    </span>
                  </div>
                  <span className="text-[11px] font-bold text-slate-500">
                    ${totalColValue.toLocaleString()}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="mt-2 space-y-3 flex-1 overflow-y-auto max-h-[75vh]">
                  {colJobs.map((job) => (
                    <button
                      key={job.id}
                      type="button"
                      aria-label={`Open job card: ${job.title}`}
                      onClick={() => {
                        setSelectedJob(job);
                        setActualValueInput(job.actual_value?.toString() || job.estimated_value?.toString() || '');
                      }}
                      className={`cursor-pointer rounded-xl border bg-white p-3.5 text-left shadow-sm transition hover:shadow-md ${
                        job.is_emergency ? 'border-red-400 ring-1 ring-red-200' : 'border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-xs text-slate-900 line-clamp-1">{job.title}</span>
                        <span className="font-bold text-xs text-emerald-600">
                          ${job.actual_value || job.estimated_value}
                        </span>
                      </div>

                      {job.is_emergency && (
                        <div className="mt-1.5 inline-flex items-center gap-1 rounded bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
                          <Flame className="h-3 w-3" /> EMERGENCY
                        </div>
                      )}

                      <p className="mt-2 text-xs text-slate-600 line-clamp-2">{job.problem}</p>

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500 gap-2">
                        <span className="flex items-center gap-1 min-w-0">
                          <MapPin className="h-3 w-3 text-slate-400 shrink-0" />
                          <span className="truncate">{job.address || 'Address on file'}</span>
                        </span>
                        {job.photo_urls && job.photo_urls.length > 0 && (
                          <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] text-blue-700 font-semibold shrink-0" title={`${job.photo_urls.length} photo attached`}>
                            <Camera className="h-3 w-3" /> {job.photo_urls.length} {job.photo_urls.length === 1 ? 'photo' : 'photos'}
                          </span>
                        )}
                      </div>
                    </button>
                  ))}

                  {colJobs.length === 0 && (
                    <div className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-xs text-slate-400">
                      No jobs in this stage
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* List View */}
      {viewMode === 'list' && (
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
          <table className="w-full text-left text-xs">
            <caption className="sr-only">Recovered job cards with trade, status, value and emergency flag</caption>
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase font-bold text-slate-500">
              <tr>
                <th scope="col" className="px-4 py-3">Customer / Job</th>
                <th scope="col" className="px-4 py-3">Trade</th>
                <th scope="col" className="px-4 py-3">Status</th>
                <th scope="col" className="px-4 py-3">Value</th>
                <th scope="col" className="px-4 py-3">Emergency</th>
                <th scope="col" className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {loading && jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-400">
                    Loading job cards...
                  </td>
                </tr>
              )}
              {!loading && jobs.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-10 text-center text-xs text-slate-400">
                    No recovered jobs yet. Missed calls that complete qualification appear here automatically.
                  </td>
                </tr>
              )}
              {jobs.map((job) => (
                <tr
                  key={job.id}
                  onClick={() => {
                    setSelectedJob(job);
                    setActualValueInput(job.actual_value?.toString() || job.estimated_value?.toString() || '');
                  }}
                  className="cursor-pointer hover:bg-slate-50"
                >
                  <td className="px-4 py-3">
                    <div className="font-bold text-slate-900">{job.title}</div>
                    <div className="text-slate-500">
                      {job.contact?.full_name || 'Unknown Caller'} • {job.contact?.phone_number}
                    </div>
                  </td>
                  <td className="px-4 py-3 uppercase font-semibold text-slate-600">{job.trade}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase ${
                      job.status === 'COMPLETED' ? 'bg-emerald-100 text-emerald-800' :
                      job.status === 'BOOKED' ? 'bg-indigo-100 text-indigo-800' :
                      job.status === 'CONTACTED' ? 'bg-amber-100 text-amber-800' :
                      job.status === 'NEW' ? 'bg-blue-100 text-blue-800' :
                      'bg-slate-100 text-slate-700'
                    }`}>
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    {job.actual_value !== undefined ? (
                      <span className="text-emerald-600">${job.actual_value}</span>
                    ) : (
                      <span>${job.estimated_value} (est)</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    {job.is_emergency ? (
                      <span className="font-bold text-red-600 flex items-center gap-1">
                        <Flame className="h-3 w-3" /> YES
                      </span>
                    ) : (
                      <span className="text-slate-400">No</span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <button
                      type="button"
                      aria-label={`View job card for ${job.contact?.full_name || job.title}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedJob(job);
                        setActualValueInput(
                          job.actual_value?.toString() || job.estimated_value?.toString() || ''
                        );
                      }}
                      className="rounded px-1 text-blue-600 font-semibold hover:underline"
                    >
                      View Card
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* JOB CARD DETAIL MODAL */}
      {selectedJob && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm"
          onClick={(e) => {
            if (e.target === e.currentTarget) setSelectedJob(null);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="job-detail-title"
            className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl overflow-y-auto max-h-[90vh]"
          >
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {selectedJob.is_emergency && (
                  <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    <Flame className="h-3.5 w-3.5" aria-hidden="true" /> EMERGENCY LEAD
                  </span>
                )}
                <span className="text-xs font-semibold text-slate-500 uppercase">{selectedJob.trade}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                aria-label="Close job card"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <h2 id="job-detail-title" className="mt-3 text-lg font-bold text-slate-900">
              {selectedJob.title}
            </h2>

            {/* Customer Details */}
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer Name:</span>
                <span className="font-bold text-slate-800">{selectedJob.contact?.full_name || 'Unknown Caller'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phone Number:</span>
                <span className="font-bold text-slate-800">{selectedJob.contact?.phone_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Service Address:</span>
                <span className="font-bold text-slate-800">{selectedJob.address || 'Address provided via text'}</span>
              </div>
              {selectedJob.recovery_source && (
                <div className="flex justify-between border-t border-slate-200/60 pt-2">
                  <span className="text-slate-500">Recovery Source:</span>
                  <span className="font-semibold text-emerald-700">{selectedJob.recovery_source}</span>
                </div>
              )}
            </div>

            {/* Problem Description */}
            <div className="mt-4 text-xs">
              <span className="font-bold text-slate-700">Problem Description (from customer SMS):</span>
              <p className="mt-1 rounded-lg border border-slate-200 bg-white p-3 text-slate-700">
                {selectedJob.problem || 'No description provided.'}
              </p>
            </div>

            {/* Photos if attached */}
            {selectedJob.photo_urls && selectedJob.photo_urls.length > 0 && (
              <div className="mt-4 text-xs">
                <span className="font-bold text-slate-700">Customer Photos (MMS):</span>
                <div className="mt-2 flex gap-3">
                  {selectedJob.photo_urls.map((url, idx) => (
                    <div key={idx} className="h-24 w-24 rounded-lg border border-slate-200 bg-slate-100 overflow-hidden flex items-center justify-center">
                      <img src={url} alt="Problem Photo" className="h-full w-full object-cover" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Revenue Tracking & Distinction */}
            <div className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/50 p-4 space-y-3">
              <span className="font-bold text-xs text-emerald-950 uppercase tracking-wider">Revenue Attribution</span>
              <div className="grid grid-cols-2 gap-3 text-xs">
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                  <span className="text-slate-500 block text-[10px]">Estimated Job Value:</span>
                  <span className="text-base font-bold text-slate-800">${selectedJob.estimated_value || 0}</span>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-200">
                  <span className="text-emerald-700 block text-[10px] font-bold">Confirmed Actual Revenue:</span>
                  <span className="text-base font-black text-emerald-600">
                    ${selectedJob.actual_value !== undefined ? selectedJob.actual_value : '—'}
                  </span>
                </div>
              </div>

              {/* Value Input */}
              <div className="flex items-center gap-2 pt-1">
                <div className="flex-1">
                  <label htmlFor="job-actual-value" className="sr-only">
                    Confirmed invoice value
                  </label>
                  <input
                    id="job-actual-value"
                    type="number"
                    value={actualValueInput}
                    onChange={(e) => setActualValueInput(e.target.value)}
                    placeholder={selectedJob.estimated_value ? `Enter actual invoice value (est. $${selectedJob.estimated_value})` : 'Enter actual invoice value'}
                    className="w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => {
                    const val = parseFloat(actualValueInput);
                    if (!isNaN(val)) {
                      handleStatusChange(selectedJob.id, selectedJob.status, val);
                    }
                  }}
                  className="rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold px-3 py-1.5 text-xs shadow-sm transition"
                >
                  Save Revenue
                </button>
              </div>
            </div>

            {/* Activity Timeline — every entry is derived from persisted records.
                Nothing here is asserted unless the corresponding data exists. */}
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs space-y-2.5">
              <span className="font-bold text-slate-800 uppercase tracking-wider text-[11px]">
                Recovery Activity Timeline
              </span>
              <div className="space-y-2 text-[11px] text-slate-600">
                <div className="flex items-center gap-2">
                  <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                  <span>
                    <strong>Lead created:</strong>{' '}
                    {new Date(selectedJob.created_at).toLocaleString()}
                  </span>
                </div>
                {selectedJob.first_call_time && (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-slate-400"></span>
                    <span>
                      <strong>Missed call received:</strong>{' '}
                      {new Date(selectedJob.first_call_time).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedJob.text_back_time && (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-500"></span>
                    <span>
                      <strong>Automated text-back sent:</strong>{' '}
                      {new Date(selectedJob.text_back_time).toLocaleString()}
                    </span>
                  </div>
                )}
                {selectedJob.qualified_time && (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                    <span>
                      <strong>Lead qualified:</strong> Problem and service address captured (
                      {new Date(selectedJob.qualified_time).toLocaleString()})
                    </span>
                  </div>
                )}
                {selectedJob.contacted_time && (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-purple-500"></span>
                    <span>
                      <strong>Contacted:</strong> Technician contacted customer (
                      {new Date(selectedJob.contacted_time).toLocaleString()})
                    </span>
                  </div>
                )}
                {selectedJob.booked_time && (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-indigo-600"></span>
                    <span>
                      <strong>Job booked:</strong> Confirmed on schedule (
                      {new Date(selectedJob.booked_time).toLocaleString()})
                    </span>
                  </div>
                )}
                {selectedJob.completed_time && (
                  <div className="flex items-center gap-2">
                    <span className="h-2 w-2 rounded-full bg-emerald-600"></span>
                    <span>
                      <strong>Completed &amp; paid:</strong> Invoice of $
                      {selectedJob.actual_value || selectedJob.estimated_value} settled on{' '}
                      {new Date(selectedJob.completed_time).toLocaleDateString()}
                    </span>
                  </div>
                )}
                {timelineSteps === 0 && (
                  <div className="text-[11px] text-slate-400">
                    No further activity recorded for this lead yet.
                  </div>
                )}
              </div>
            </div>

            {/* Bridge Call Status Banners */}
            {bridgeCallStatus && (
              <div className="mt-4 rounded-xl bg-emerald-50 border border-emerald-200 p-3 text-xs text-emerald-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Phone className="h-4 w-4 text-emerald-600 animate-pulse shrink-0" />
                  <span>{bridgeCallStatus}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBridgeCallStatus(null)}
                  aria-label="Dismiss bridge call status"
                  className="text-emerald-700 font-bold hover:underline shrink-0 ml-2"
                >
                  ✕
                </button>
              </div>
            )}
            {bridgeCallError && (
              <div className="mt-4 rounded-xl bg-red-50 border border-red-200 p-3 text-xs text-red-900 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <AlertCircle className="h-4 w-4 text-red-600 shrink-0" />
                  <span>{bridgeCallError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setBridgeCallError(null)}
                  aria-label="Dismiss bridge call error"
                  className="text-red-700 font-bold hover:underline shrink-0 ml-2"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Quick Actions */}
            <div className="mt-6 flex flex-wrap items-center justify-between border-t border-slate-100 pt-4 gap-3">
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={isBridgingCall || !selectedJob.contact?.phone_number}
                  onClick={() => handleBridgeCall(selectedJob.contact!.phone_number, selectedJob.id)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50 transition"
                  title="Dials your phone first, then connects to customer using your MCR business caller ID"
                >
                  {isBridgingCall ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Calling...
                    </>
                  ) : (
                    <>
                      <Phone className="h-3.5 w-3.5" /> Bridge Call (Private)
                    </>
                  )}
                </button>
                <a
                  href={`tel:${selectedJob.contact?.phone_number}`}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  aria-label={`Direct dial ${selectedJob.contact?.phone_number}`}
                  title="Direct cellular call from this device"
                >
                  Direct Dial
                </a>
                <Link
                  href="/dashboard/inbox"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> SMS Thread
                </Link>
              </div>

              {/* Status Switcher Buttons */}
              <div className="flex flex-wrap gap-1.5 mt-3 sm:mt-0">
                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedJob.id, 'CONTACTED')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    selectedJob.status === 'CONTACTED' ? 'bg-amber-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Contacted
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedJob.id, 'BOOKED', parseFloat(actualValueInput) || selectedJob.actual_value || selectedJob.estimated_value || 0)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    selectedJob.status === 'BOOKED' ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Booked
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const finalVal = parseFloat(actualValueInput) || selectedJob.actual_value || selectedJob.estimated_value || 0;
                    handleStatusChange(selectedJob.id, 'COMPLETED', finalVal);
                  }}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    selectedJob.status === 'COMPLETED' ? 'bg-emerald-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Completed (Paid)
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedJob.id, 'DEAD')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition ${
                    selectedJob.status === 'DEAD' ? 'bg-slate-800 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Dead
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
