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
} from 'lucide-react';
import { JobCard, JobStatus } from '@/types';

export default function JobsPage() {
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [selectedJob, setSelectedJob] = useState<JobCard | null>(null);
  const [viewMode, setViewMode] = useState<'kanban' | 'list'>('kanban');
  const [actualValueInput, setActualValueInput] = useState<string>('');

  const fetchJobs = async () => {
    try {
      const res = await fetch('/api/jobs?accountId=acc-apex-plumbing');
      const data = await res.json();
      if (data.jobs) {
        setJobs(data.jobs);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchJobs();
  }, []);

  const handleStatusChange = async (jobId: string, newStatus: JobStatus, actualValue?: number) => {
    try {
      const res = await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acc-apex-plumbing',
          jobId,
          status: newStatus,
          actualValue,
        }),
      });
      const data = await res.json();
      if (data.success) {
        fetchJobs();
        if (selectedJob && selectedJob.id === jobId) {
          setSelectedJob(data.job);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const columns: { status: JobStatus; title: string; color: string; badgeBg: string }[] = [
    { status: 'NEW', title: 'New Opportunities', color: 'border-blue-500', badgeBg: 'bg-blue-100 text-blue-800' },
    { status: 'CONTACTED', title: 'Contacted', color: 'border-amber-500', badgeBg: 'bg-amber-100 text-amber-800' },
    { status: 'BOOKED', title: 'Booked Jobs', color: 'border-emerald-500', badgeBg: 'bg-emerald-100 text-emerald-800' },
    { status: 'DEAD', title: 'Dead / Lost', color: 'border-slate-400', badgeBg: 'bg-slate-100 text-slate-700' },
  ];

  return (
    <div className="space-y-6">
      {/* Top Header */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Job Cards</h1>
          <p className="text-xs text-slate-500">
            Recovered leads generated automatically from missed phone calls.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border border-slate-200 bg-white p-1 text-xs">
            <button
              onClick={() => setViewMode('kanban')}
              className={`rounded-md px-3 py-1 font-semibold ${
                viewMode === 'kanban' ? 'bg-blue-600 text-white' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Kanban
            </button>
            <button
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
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {columns.map((col) => {
            const colJobs = jobs.filter((j) => j.status === col.status);
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
                    <div
                      key={job.id}
                      onClick={() => {
                        setSelectedJob(job);
                        setActualValueInput(job.actual_value?.toString() || job.estimated_value?.toString() || '');
                      }}
                      className={`cursor-pointer rounded-xl border bg-white p-3.5 shadow-sm transition hover:shadow-md ${
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

                      <div className="mt-3 flex items-center justify-between border-t border-slate-100 pt-2 text-[11px] text-slate-500">
                        <span className="flex items-center gap-1">
                          <MapPin className="h-3 w-3 text-slate-400" />
                          <span className="line-clamp-1 max-w-[130px]">{job.address || 'Address on file'}</span>
                        </span>
                        {job.photo_urls && job.photo_urls.length > 0 && (
                          <span className="flex items-center gap-0.5 text-blue-600 font-semibold">
                            <Camera className="h-3 w-3" /> {job.photo_urls.length}
                          </span>
                        )}
                      </div>
                    </div>
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
            <thead className="border-b border-slate-200 bg-slate-50 text-[11px] uppercase font-bold text-slate-500">
              <tr>
                <th className="px-4 py-3">Customer / Job</th>
                <th className="px-4 py-3">Trade</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Value</th>
                <th className="px-4 py-3">Emergency</th>
                <th className="px-4 py-3">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
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
                      {job.contact?.full_name} • {job.contact?.phone_number}
                    </div>
                  </td>
                  <td className="px-4 py-3 uppercase font-semibold text-slate-600">{job.trade}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-blue-100 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 uppercase">
                      {job.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-bold text-slate-900">
                    ${job.actual_value || job.estimated_value}
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
                    <button className="text-blue-600 font-semibold hover:underline">View Card</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* JOB CARD DETAIL MODAL */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl rounded-2xl bg-white p-6 shadow-2xl overflow-y-auto max-h-[90vh]">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                {selectedJob.is_emergency && (
                  <span className="inline-flex items-center gap-1 rounded bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                    <Flame className="h-3.5 w-3.5" /> EMERGENCY LEAD
                  </span>
                )}
                <span className="text-xs font-semibold text-slate-500 uppercase">{selectedJob.trade}</span>
              </div>
              <button
                type="button"
                onClick={() => setSelectedJob(null)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
              >
                ✕
              </button>
            </div>

            <h2 className="mt-3 text-lg font-bold text-slate-900">{selectedJob.title}</h2>

            {/* Customer Details */}
            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-500">Customer Name:</span>
                <span className="font-bold text-slate-800">{selectedJob.contact?.full_name || 'Homeowner'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Phone Number:</span>
                <span className="font-bold text-slate-800">{selectedJob.contact?.phone_number}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Service Address:</span>
                <span className="font-bold text-slate-800">{selectedJob.address || 'Address provided via text'}</span>
              </div>
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

            {/* Revenue / Actual Value input */}
            <div className="mt-4 flex items-center gap-3">
              <div className="flex-1 text-xs">
                <label className="block font-semibold text-slate-700">Actual Revenue Booked ($):</label>
                <input
                  type="number"
                  value={actualValueInput}
                  onChange={(e) => setActualValueInput(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-1.5 text-xs shadow-sm focus:border-blue-500 focus:outline-none"
                  placeholder="e.g. 450"
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
                className="mt-5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
              >
                Save Value
              </button>
            </div>

            {/* Quick Actions */}
            <div className="mt-6 flex flex-wrap items-center justify-between border-t border-slate-100 pt-4">
              <div className="flex gap-2">
                <a
                  href={`tel:${selectedJob.contact?.phone_number}`}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700"
                >
                  <Phone className="h-3.5 w-3.5" /> Call Customer
                </a>
                <Link
                  href="/dashboard/inbox"
                  className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50"
                >
                  <MessageSquare className="h-3.5 w-3.5" /> Open SMS Thread
                </Link>
              </div>

              {/* Status Switcher Buttons */}
              <div className="flex gap-1.5 mt-3 sm:mt-0">
                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedJob.id, 'CONTACTED')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                    selectedJob.status === 'CONTACTED' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Contacted
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedJob.id, 'BOOKED', parseFloat(actualValueInput) || 350)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                    selectedJob.status === 'BOOKED' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-700'
                  }`}
                >
                  Booked
                </button>
                <button
                  type="button"
                  onClick={() => handleStatusChange(selectedJob.id, 'DEAD')}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold ${
                    selectedJob.status === 'DEAD' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-700'
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
