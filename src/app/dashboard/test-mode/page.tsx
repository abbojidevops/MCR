'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  FlaskConical,
  PhoneCall,
  Send,
  CheckCircle,
  Clock,
  Sparkles,
  ArrowRight,
  Flame,
  Check,
} from 'lucide-react';
import { JobCard } from '@/types';

interface SimulatedMessage {
  sender: 'customer' | 'mcr';
  text: string;
  time: string;
}

export default function TestModePage() {
  const [callerPhone, setCallerPhone] = useState('+1 (217) 555-8833');
  const [callerName, setCallerName] = useState('Sarah Connor');
  const [callSimulated, setCallSimulated] = useState(false);
  const [simulating, setSimulating] = useState(false);
  const [messages, setMessages] = useState<SimulatedMessage[]>([]);
  const [customerInput, setCustomerInput] = useState('');
  const [currentStep, setCurrentStep] = useState<string>('INIT');
  const [createdJob, setCreatedJob] = useState<JobCard | null>(null);

  // Success Checklist state
  const [checklist, setChecklist] = useState({
    callReceived: false,
    missedDetected: false,
    textSent: false,
    customerReplied: false,
    jobCreated: false,
    ownerNotified: false,
  });

  const handleTriggerMissedCall = async () => {
    setSimulating(true);
    setCallSimulated(false);
    setMessages([]);
    setCreatedJob(null);
    setChecklist({
      callReceived: false,
      missedDetected: false,
      textSent: false,
      customerReplied: false,
      jobCreated: false,
      ownerNotified: false,
    });

    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_call',
          callerNumber: callerPhone.replace(/\D/g, ''),
          callerName,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setCallSimulated(true);
        setCurrentStep('ASK_EMERGENCY');
        setMessages([
          {
            sender: 'mcr',
            text: data.textBackBody || 'Apex Plumbing — sorry we missed your call! Are you contacting us about a plumbing emergency?',
            time: 'Just now',
          },
        ]);
        setChecklist({
          callReceived: true,
          missedDetected: true,
          textSent: true,
          customerReplied: false,
          jobCreated: false,
          ownerNotified: true,
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSimulating(false);
    }
  };

  const handleSendCustomerReply = async (presetText?: string) => {
    const text = presetText || customerInput;
    if (!text.trim()) return;

    const newMsgs = [...messages, { sender: 'customer' as const, text, time: 'Just now' }];
    setMessages(newMsgs);
    setCustomerInput('');
    setChecklist((prev) => ({ ...prev, customerReplied: true }));

    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_reply',
          callerNumber: callerPhone.replace(/\D/g, ''),
          replyText: text,
        }),
      });
      const data = await res.json();
      if (data.success) {
        if (data.replyMessage) {
          setMessages((prev) => [
            ...prev,
            { sender: 'mcr' as const, text: data.replyMessage, time: 'Just now' },
          ]);
        }
        setCurrentStep(data.stepUpdated);

        if (data.jobCreated) {
          setChecklist((prev) => ({ ...prev, jobCreated: true, ownerNotified: true }));
          // Fetch latest job
          const jobsRes = await fetch('/api/jobs');
          const jobsData = await jobsRes.json();
          if (jobsData.jobs && jobsData.jobs.length > 0) {
            setCreatedJob(jobsData.jobs[0]);
          }
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Interactive Test Environment</h1>
        <p className="text-xs text-slate-500">
          Simulate an end-to-end missed call flow from the customer&apos;s phone perspective without burning carrier credits.
        </p>
      </div>

      <div className="grid gap-8 lg:grid-cols-12 items-start">
        {/* Virtual Customer Phone Screen (6 cols) */}
        <div className="lg:col-span-6 flex flex-col items-center">
          <div className="w-full max-w-sm rounded-[2.5rem] border-8 border-slate-900 bg-slate-900 p-3 shadow-2xl">
            {/* Phone Speaker Notch */}
            <div className="mx-auto h-4 w-28 rounded-full bg-slate-800 mb-2"></div>

            {/* Inner Phone Screen */}
            <div className="flex h-[560px] flex-col rounded-[2rem] bg-white overflow-hidden text-slate-900">
              {/* Phone Status Bar */}
              <div className="flex items-center justify-between bg-slate-100 px-5 py-2 text-[10px] font-semibold text-slate-600">
                <span>9:41 AM</span>
                <span className="flex items-center gap-1">5G 📶 100%</span>
              </div>

              {/* Messages Header */}
              <div className="border-b border-slate-100 bg-slate-50 px-4 py-3 text-center">
                <div className="font-bold text-xs text-slate-900">Apex Plumbing (MCR Recovery)</div>
                <div className="text-[10px] text-slate-400">+1 (217) 555-0190</div>
              </div>

              {/* Chat Thread */}
              <div className="flex-1 overflow-y-auto p-3 space-y-3 bg-slate-50/30">
                {!callSimulated ? (
                  <div className="flex h-full flex-col items-center justify-center p-6 text-center text-xs text-slate-400">
                    <PhoneCall className="h-8 w-8 text-slate-300 mb-2 animate-pulse" />
                    <p className="font-medium text-slate-600">No active test call yet.</p>
                    <p className="text-[11px] mt-1">Click &quot;Simulate Missed Call&quot; below to trigger the inbound flow.</p>
                  </div>
                ) : (
                  messages.map((m, idx) => (
                    <div
                      key={idx}
                      className={`flex flex-col ${m.sender === 'customer' ? 'items-end' : 'items-start'}`}
                    >
                      <div
                        className={`max-w-[85%] rounded-2xl p-2.5 text-xs ${
                          m.sender === 'customer'
                            ? 'rounded-tr-sm bg-blue-600 text-white'
                            : 'rounded-tl-sm bg-slate-200 text-slate-800'
                        }`}
                      >
                        {m.text}
                      </div>
                      <span className="mt-0.5 text-[9px] text-slate-400">{m.time}</span>
                    </div>
                  ))
                )}
              </div>

              {/* Customer Quick Suggestion Chips */}
              {callSimulated && currentStep !== 'QUALIFIED' && (
                <div className="border-t border-slate-100 bg-white px-3 py-1.5 flex gap-1.5 overflow-x-auto text-[10px]">
                  {currentStep === 'ASK_EMERGENCY' && (
                    <>
                      <button
                        onClick={() => handleSendCustomerReply('Yes, water heater leaking everywhere!')}
                        className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-blue-700 font-semibold whitespace-nowrap"
                      >
                        Yes, leaking badly!
                      </button>
                      <button
                        onClick={() => handleSendCustomerReply('No emergency, just need a toilet installed')}
                        className="rounded-full bg-slate-100 px-2 py-0.5 text-slate-700 whitespace-nowrap"
                      >
                        No emergency
                      </button>
                    </>
                  )}
                  {currentStep === 'ASK_PROBLEM' && (
                    <button
                      onClick={() => handleSendCustomerReply('Tank broke, water all over basement')}
                      className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-blue-700 font-semibold whitespace-nowrap"
                    >
                      Water heater ruptured
                    </button>
                  )}
                  {currentStep === 'ASK_ADDRESS' && (
                    <button
                      onClick={() => handleSendCustomerReply('123 Main Street, Springfield')}
                      className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-blue-700 font-semibold whitespace-nowrap"
                    >
                      123 Main Street
                    </button>
                  )}
                  {currentStep === 'ASK_PHOTO' && (
                    <button
                      onClick={() => handleSendCustomerReply('Photo sent, please hurry')}
                      className="rounded-full bg-blue-50 border border-blue-200 px-2 py-0.5 text-blue-700 font-semibold whitespace-nowrap"
                    >
                      Attached photo of leak
                    </button>
                  )}
                </div>
              )}

              {/* Customer Input Box */}
              <div className="border-t border-slate-200 bg-white p-2">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    handleSendCustomerReply();
                  }}
                  className="flex items-center gap-1.5"
                >
                  <input
                    type="text"
                    disabled={!callSimulated || currentStep === 'QUALIFIED'}
                    value={customerInput}
                    onChange={(e) => setCustomerInput(e.target.value)}
                    placeholder={
                      !callSimulated
                        ? 'Trigger call first...'
                        : currentStep === 'QUALIFIED'
                        ? 'Intake completed!'
                        : 'Reply as customer...'
                    }
                    className="flex-1 rounded-full border border-slate-300 px-3 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100"
                  />
                  <button
                    type="submit"
                    disabled={!callSimulated || !customerInput.trim() || currentStep === 'QUALIFIED'}
                    className="flex h-7 w-7 items-center justify-center rounded-full bg-blue-600 text-white disabled:opacity-40"
                  >
                    <Send className="h-3 w-3" />
                  </button>
                </form>
              </div>
            </div>
          </div>

          {/* Trigger Button Under Phone */}
          <button
            type="button"
            disabled={simulating}
            onClick={handleTriggerMissedCall}
            className="mt-6 inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50 text-xs"
          >
            <PhoneCall className="h-4 w-4" />
            {simulating ? 'Simulating Carrier Rollover...' : '1. Simulate Missed Call from Customer'}
          </button>
        </div>

        {/* Right Pane: Success Checklist & Resulting Job Card (6 cols) */}
        <div className="lg:col-span-6 space-y-6">
          {/* Section 49 Success Checklist */}
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="text-sm font-bold text-slate-900 mb-1">V1 Success Checklist (Section 49)</h2>
            <p className="text-xs text-slate-500 mb-4">
              Real-time verification of all 6 steps required for automated revenue recovery.
            </p>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                <span className="font-medium text-slate-700">1. Inbound carrier call received</span>
                <span className={checklist.callReceived ? 'font-bold text-emerald-600' : 'text-slate-400'}>
                  {checklist.callReceived ? '✓ Call Received' : 'Waiting'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                <span className="font-medium text-slate-700">2. Missed call detected (&lt;60s)</span>
                <span className={checklist.missedDetected ? 'font-bold text-emerald-600' : 'text-slate-400'}>
                  {checklist.missedDetected ? '✓ Detected' : 'Waiting'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                <span className="font-medium text-slate-700">3. Trade text-back sent</span>
                <span className={checklist.textSent ? 'font-bold text-emerald-600' : 'text-slate-400'}>
                  {checklist.textSent ? '✓ Text Sent' : 'Waiting'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                <span className="font-medium text-slate-700">4. Customer response received</span>
                <span className={checklist.customerReplied ? 'font-bold text-emerald-600' : 'text-slate-400'}>
                  {checklist.customerReplied ? '✓ Customer Replied' : 'Waiting'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                <span className="font-medium text-slate-700">5. Structured Job Card generated</span>
                <span className={checklist.jobCreated ? 'font-bold text-emerald-600' : 'text-slate-400'}>
                  {checklist.jobCreated ? '✓ Job Created' : 'Waiting'}
                </span>
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50">
                <span className="font-medium text-slate-700">6. Business owner notified</span>
                <span className={checklist.ownerNotified ? 'font-bold text-emerald-600' : 'text-slate-400'}>
                  {checklist.ownerNotified ? '✓ Owner Notified' : 'Waiting'}
                </span>
              </div>
            </div>
          </div>

          {/* Generated Job Card Visualizer */}
          {createdJob ? (
            <div className="rounded-2xl border-2 border-emerald-500 bg-emerald-50/30 p-6 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <span className="rounded-full bg-emerald-100 px-3 py-1 text-xs font-bold text-emerald-800">
                  🎉 JOB CARD RECOVERED
                </span>
                <span className="font-extrabold text-base text-slate-900">${createdJob.estimated_value} Est.</span>
              </div>

              <h3 className="font-extrabold text-base text-slate-900">{createdJob.title}</h3>

              <div className="rounded-xl bg-white p-4 border border-emerald-200 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-slate-500">Customer:</span>
                  <span className="font-bold text-slate-800">{callerName} ({callerPhone})</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Emergency:</span>
                  <span className="font-bold text-red-600">{createdJob.is_emergency ? 'YES' : 'NO'}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Service Address:</span>
                  <span className="font-bold text-slate-800">{createdJob.address}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Problem Description:</span>
                  <span className="font-bold text-slate-800">{createdJob.problem}</span>
                </div>
              </div>

              <Link
                href="/dashboard/jobs"
                className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl bg-emerald-700 py-2.5 text-xs font-bold text-white shadow hover:bg-emerald-800"
              >
                View in Kanban Pipeline <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          ) : (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-8 text-center text-xs text-slate-500">
              Complete the qualification questions on the phone screen to watch your job ticket materialize here!
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
