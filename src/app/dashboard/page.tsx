'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  PhoneCall,
  MessageSquare,
  ClipboardList,
  CheckCircle,
  TrendingUp,
  AlertTriangle,
  Clock,
  ArrowRight,
  Phone,
  Flame,
  Wrench,
  DollarSign,
} from 'lucide-react';
import { JobCard } from '@/types';

export default function DashboardOverviewPage() {
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [metrics, setMetrics] = useState({
    missedCallsToday: 8,
    textBacksSent: 7,
    qualifiedLeads: 5,
    jobsBooked: 2,
    estimatedRevenue: 2820,
  });

  const fetchDashboardData = async () => {
    try {
      const res = await fetch('/api/jobs?accountId=acc-apex-plumbing');
      const data = await res.json();
      if (data.jobs) {
        setJobs(data.jobs);
        const booked = data.jobs.filter((j: JobCard) => j.status === 'BOOKED').length;
        const totalEst = data.jobs.reduce((sum: number, j: JobCard) => sum + (j.estimated_value || 0), 0);
        setMetrics((prev) => ({
          ...prev,
          qualifiedLeads: data.jobs.length,
          jobsBooked: booked,
          estimatedRevenue: totalEst,
        }));
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const handleUpdateStatus = async (jobId: string, newStatus: string) => {
    try {
      await fetch('/api/jobs', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acc-apex-plumbing',
          jobId,
          status: newStatus,
        }),
      });
      fetchDashboardData();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Welcome & Subtitle */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Apex Plumbing & Rooter</h1>
          <p className="text-xs text-slate-500">
            Missed-Call Recovery Active • Dedicated Line: <strong className="text-slate-700">+1 (217) 555-0190</strong>
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href="/dashboard/jobs"
            className="inline-flex items-center gap-1 rounded-lg bg-blue-600 px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-blue-700"
          >
            View Kanban Board <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>

      {/* Metric Cards Grid */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Missed Calls</span>
            <PhoneCall className="h-4 w-4 text-blue-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">{metrics.missedCallsToday}</div>
          <div className="mt-1 text-[11px] text-slate-400">Past 24 hours</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Text-Backs Sent</span>
            <MessageSquare className="h-4 w-4 text-indigo-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">{metrics.textBacksSent}</div>
          <div className="mt-1 text-[11px] text-emerald-600 font-medium">87.5% sent &lt;60s</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Qualified Leads</span>
            <ClipboardList className="h-4 w-4 text-amber-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-slate-900">{metrics.qualifiedLeads}</div>
          <div className="mt-1 text-[11px] text-slate-400">Address & issue collected</div>
        </div>

        <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-500">
            <span className="text-xs font-medium">Jobs Booked</span>
            <CheckCircle className="h-4 w-4 text-emerald-500" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-600">{metrics.jobsBooked}</div>
          <div className="mt-1 text-[11px] text-slate-400">Converted by team</div>
        </div>

        <div className="col-span-2 sm:col-span-2 lg:col-span-1 rounded-2xl border border-emerald-200 bg-emerald-50/50 p-4 shadow-sm">
          <div className="flex items-center justify-between text-emerald-800">
            <span className="text-xs font-medium">Recovered Value</span>
            <TrendingUp className="h-4 w-4 text-emerald-600" />
          </div>
          <div className="mt-2 text-2xl font-extrabold text-emerald-700">
            ${metrics.estimatedRevenue.toLocaleString()}
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 font-medium">From missed calls</div>
        </div>
      </div>

      {/* Main Content Layout: Jobs Feed + Daily Report */}
      <div className="grid gap-6 lg:grid-cols-12">
        {/* Recent Qualified Job Cards (8 cols) */}
        <div className="lg:col-span-8 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900">Recent Recovered Opportunities</h2>
            <span className="text-xs text-slate-500">Updated in real time</span>
          </div>

          <div className="space-y-3">
            {jobs.map((job) => {
              const isEmergency = job.is_emergency;
              return (
                <div
                  key={job.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm transition-all ${
                    isEmergency ? 'border-red-300 ring-1 ring-red-200' : 'border-slate-200'
                  }`}
                >
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-2">
                      {isEmergency && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-red-100 px-2 py-0.5 text-[10px] font-bold text-red-700">
                          <Flame className="h-3 w-3" /> EMERGENCY
                        </span>
                      )}
                      <h3 className="font-bold text-sm text-slate-900">{job.title}</h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <span className="font-bold text-xs text-slate-700">
                        ${job.actual_value || job.estimated_value}
                      </span>
                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${
                          job.status === 'NEW'
                            ? 'bg-blue-100 text-blue-700'
                            : job.status === 'CONTACTED'
                            ? 'bg-amber-100 text-amber-700'
                            : job.status === 'BOOKED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {job.status}
                      </span>
                    </div>
                  </div>

                  <p className="mt-2 text-xs text-slate-600">
                    <strong>Issue:</strong> {job.problem}
                  </p>

                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span>
                      <strong>Caller:</strong> {job.contact?.full_name || 'Homeowner'} ({job.contact?.phone_number})
                    </span>
                    <span>
                      <strong>Address:</strong> {job.address || 'Address provided via text'}
                    </span>
                  </div>

                  {/* Actions Bar */}
                  <div className="mt-4 flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 text-xs">
                    <div className="flex items-center gap-2">
                      <a
                        href={`tel:${job.contact?.phone_number}`}
                        className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 font-semibold text-white hover:bg-emerald-700"
                      >
                        <Phone className="h-3 w-3" /> 1-Tap Call
                      </a>
                      <Link
                        href={`/dashboard/inbox`}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <MessageSquare className="h-3 w-3" /> View SMS
                      </Link>
                    </div>

                    {/* Quick Status Toggles */}
                    <div className="flex items-center gap-1.5 mt-2 sm:mt-0">
                      <span className="text-[11px] text-slate-400">Status:</span>
                      <button
                        onClick={() => handleUpdateStatus(job.id, 'CONTACTED')}
                        className={`rounded px-2 py-1 text-[10px] font-semibold ${
                          job.status === 'CONTACTED' ? 'bg-amber-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Contacted
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(job.id, 'BOOKED')}
                        className={`rounded px-2 py-1 text-[10px] font-semibold ${
                          job.status === 'BOOKED' ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Booked
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(job.id, 'DEAD')}
                        className={`rounded px-2 py-1 text-[10px] font-semibold ${
                          job.status === 'DEAD' ? 'bg-slate-700 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Dead
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Daily 6:00 PM Summary & Health (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Today&apos;s 6:00 PM Report</h2>
            </div>
            <p className="mt-1 text-xs text-slate-500">
              Automated daily briefing sent to owner cell phone every evening.
            </p>

            <div className="mt-4 rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs space-y-2">
              <div className="flex justify-between">
                <span className="text-slate-600">Missed calls:</span>
                <span className="font-bold text-slate-900">{metrics.missedCallsToday}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Text-backs sent:</span>
                <span className="font-bold text-slate-900">{metrics.textBacksSent}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Customers responded:</span>
                <span className="font-bold text-slate-900">{metrics.qualifiedLeads}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-600">Jobs marked booked:</span>
                <span className="font-bold text-emerald-600">{metrics.jobsBooked}</span>
              </div>
              <div className="flex justify-between border-t border-slate-200 pt-2 font-bold">
                <span className="text-slate-800">Est. Recovered Value:</span>
                <span className="text-emerald-700">${metrics.estimatedRevenue.toLocaleString()}</span>
              </div>
            </div>

            <Link
              href="/dashboard/reports"
              className="mt-4 block w-full rounded-xl border border-slate-200 py-2 text-center text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              View Full Weekly Report
            </Link>
          </div>

          {/* Carrier Forwarding Status */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-900">Forwarding Health</span>
              <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">
                ACTIVE
              </span>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Carrier: <strong>Verizon Wireless</strong>. Unanswered and busy calls forward conditionally to +1 (217) 555-0190.
            </p>
            <Link
              href="/dashboard/forwarding"
              className="mt-3 inline-block text-xs font-semibold text-blue-600 hover:underline"
            >
              Verify Carrier Codes →
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
