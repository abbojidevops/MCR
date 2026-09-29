'use client';

import React, { useState } from 'react';
import {
  PhoneCall,
  Copy,
  Check,
  ShieldCheck,
  Radio,
  AlertTriangle,
  Play,
} from 'lucide-react';
import { CARRIER_GUIDES, getCarrierGuide } from '@/lib/carrier-guides';

export default function ForwardingWizardPage() {
  const [selectedCarrier, setSelectedCarrier] = useState('verizon');
  const [copiedCode, setCopiedCode] = useState(false);
  const [testingCall, setTestingCall] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);

  const mcrAssignedNumber = '+1 (217) 555-0190';
  const guide = getCarrierGuide(selectedCarrier, mcrAssignedNumber);

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleTestCall = async () => {
    setTestingCall(true);
    setTestResult(null);
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_call',
          accountId: 'acc-apex-plumbing',
          callerNumber: '+12175559821',
          callerName: 'Carrier Test Call',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult('✓ Verification Call Succeeded! The conditional routing intercepted cleanly and triggered the text-back.');
      }
    } catch (err) {
      setTestResult('Simulation error. Check connection.');
    } finally {
      setTestingCall(false);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Carrier Call Forwarding Setup</h1>
        <p className="text-xs text-slate-500">
          Configure your existing cell phone or office PBX to conditionally forward only unanswered calls to MCR.
        </p>
      </div>

      {/* Core Principle Notice */}
      <div className="rounded-2xl border border-blue-200 bg-blue-50/70 p-5 text-xs text-blue-900">
        <div className="font-bold flex items-center gap-1.5 text-sm text-blue-950">
          <ShieldCheck className="h-4 w-4 text-blue-600" /> How Conditional Forwarding Protects Your Business
        </div>
        <p className="mt-1 leading-relaxed">
          Your cell phone will <strong>continue to ring normally first</strong>. If you answer, the call takes place normally.
          Only when you are on another job, decline a call, or don&apos;t answer after 4 rings, your carrier automatically
          rolls the call over to your dedicated MCR number.
        </p>
      </div>

      {/* Carrier Selection Grid */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
          Select Your Phone Carrier
        </label>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {Object.keys(CARRIER_GUIDES).map((cKey) => {
            const c = CARRIER_GUIDES[cKey];
            const isSelected = selectedCarrier === cKey;
            return (
              <button
                key={cKey}
                type="button"
                onClick={() => setSelectedCarrier(cKey)}
                className={`rounded-xl border p-3 text-left transition ${
                  isSelected
                    ? 'border-blue-600 bg-blue-50 ring-2 ring-blue-600'
                    : 'border-slate-200 hover:border-slate-300'
                }`}
              >
                <div className="font-bold text-xs text-slate-900">{c.carrier_name}</div>
                <div className="text-[10px] text-slate-500 mt-0.5">Code: {c.forward_no_answer_code.slice(0, 4)}...</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Carrier Instructions Block */}
      {guide && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-4">
            <div>
              <h2 className="text-base font-bold text-slate-900">{guide.carrier_name} Setup Code</h2>
              <p className="text-xs text-slate-500">MCR Destination Number: {mcrAssignedNumber}</p>
            </div>
            <button
              type="button"
              disabled={testingCall}
              onClick={handleTestCall}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-bold text-white shadow hover:bg-slate-800 disabled:opacity-50"
            >
              <Play className="h-3 w-3 text-emerald-400" />
              {testingCall ? 'Testing...' : 'Test Forwarding Route'}
            </button>
          </div>

          {testResult && (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-xs font-semibold text-emerald-800">
              {testResult}
            </div>
          )}

          {/* Dial Code Display */}
          <div className="rounded-2xl border border-slate-800 bg-slate-950 p-6 text-white flex items-center justify-between">
            <div>
              <div className="text-xs uppercase font-semibold text-slate-400">Dial on your phone keypad:</div>
              <div className="mt-1 font-mono text-2xl font-bold text-emerald-400">
                {guide.forward_no_answer_code}
              </div>
            </div>
            <button
              type="button"
              onClick={() => handleCopy(guide.forward_no_answer_code)}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3.5 py-2 text-xs font-bold text-slate-200 hover:bg-slate-700"
            >
              {copiedCode ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
              {copiedCode ? 'Copied' : 'Copy Code'}
            </button>
          </div>

          {/* Step-by-Step Instructions */}
          <div className="space-y-3">
            <h3 className="font-bold text-xs text-slate-900 uppercase tracking-wider">Step-by-Step Instructions:</h3>
            <ol className="list-decimal space-y-2 pl-4 text-xs text-slate-600">
              {guide.instructions.map((inst, idx) => (
                <li key={idx} className="leading-relaxed">
                  {inst}
                </li>
              ))}
            </ol>
          </div>

          {/* Cancellation Code */}
          <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 text-xs text-slate-600 flex items-center justify-between">
            <div>
              <span className="font-bold text-slate-800">To Disable Forwarding at Any Time:</span>
              <p className="text-[11px] text-slate-500 mt-0.5">Simply dial {guide.cancel_forward_code} on your phone.</p>
            </div>
            <button
              onClick={() => handleCopy(guide.cancel_forward_code)}
              className="text-xs font-semibold text-blue-600 hover:underline"
            >
              Copy Code
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
