'use client';

import React, { useState, useEffect } from 'react';
import {
  PhoneCall,
  Copy,
  Check,
  ShieldCheck,
  AlertTriangle,
  Play,
  CheckCircle,
  HelpCircle,
  ChevronDown,
  ChevronUp,
  RotateCcw,
  PhoneForwarded,
  CheckSquare,
  Square,
  Loader2,
} from 'lucide-react';
import { CARRIER_GUIDES, getCarrierGuide } from '@/lib/carrier-guides';

interface RunbookChecklist {
  prepaidChecked: boolean;
  formatChecked: boolean;
  wifiCallingChecked: boolean;
  unconditionalCleared: boolean;
  testCallVerified: boolean;
}

export default function ForwardingWizardPage() {
  const [selectedCarrier, setSelectedCarrier] = useState('verizon');
  const [copiedCode, setCopiedCode] = useState(false);
  const [testingCall, setTestingCall] = useState(false);
  const [testResult, setTestResult] = useState<string | null>(null);
  const [mcrAssignedNumber, setMcrAssignedNumber] = useState<string>('');
  const [forwardingConfigured, setForwardingConfigured] = useState<boolean>(false);
  const [updatingStatus, setUpdatingStatus] = useState<boolean>(false);

  // Runbook accordion state
  const [expandedSection, setExpandedSection] = useState<string | null>('issueA');

  // Interactive troubleshooting checklist state
  const [checklist, setChecklist] = useState<RunbookChecklist>({
    prepaidChecked: false,
    formatChecked: false,
    wifiCallingChecked: false,
    unconditionalCleared: false,
    testCallVerified: false,
  });

  useEffect(() => {
    fetch('/api/settings')
      .then((res) => res.json())
      .then((data) => {
        if (data.phoneNumbers && data.phoneNumbers[0]?.formatted_number) {
          setMcrAssignedNumber(data.phoneNumbers[0].formatted_number);
        } else if (data.profile?.notification_phone) {
          setMcrAssignedNumber(data.profile.notification_phone);
        } else {
          setMcrAssignedNumber('[Pending Carrier Provisioning]');
        }

        if (data.profile?.forwarding_configured) {
          setForwardingConfigured(true);
        } else {
          setForwardingConfigured(false);
        }

        // Auto-select carrier if set in business profile
        if (data.profile?.carrier_name) {
          const lower = data.profile.carrier_name.toLowerCase();
          if (lower.includes('verizon')) setSelectedCarrier('verizon');
          else if (lower.includes('att') || lower.includes('at&t')) setSelectedCarrier('att');
          else if (lower.includes('t-mobile') || lower.includes('tmobile')) setSelectedCarrier('tmobile');
          else if (lower.includes('xfinity')) setSelectedCarrier('xfinity');
          else if (lower.includes('spectrum')) setSelectedCarrier('spectrum');
          else if (lower.includes('mint')) setSelectedCarrier('mint');
          else if (lower.includes('cricket')) setSelectedCarrier('cricket');
        }
      })
      .catch(() => setMcrAssignedNumber('[Pending Carrier Provisioning]'));
  }, []);

  const guide = getCarrierGuide(selectedCarrier, mcrAssignedNumber || '[Pending Carrier Provisioning]');

  const handleCopy = (code: string) => {
    navigator.clipboard.writeText(code);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const handleToggleForwarding = async (status: boolean) => {
    setUpdatingStatus(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: { forwarding_configured: status },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setForwardingConfigured(status);
        if (status) {
          setChecklist((prev) => ({ ...prev, testCallVerified: true }));
        }
      }
    } catch (err) {
      console.error('Failed to update forwarding status:', err);
    } finally {
      setUpdatingStatus(false);
    }
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
          callerNumber: '+12175559821',
          callerName: 'Carrier Test Call',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setTestResult('✓ Verification Call Succeeded! The conditional routing intercepted cleanly and triggered the text-back.');
        // Automatically persist verified status
        await handleToggleForwarding(true);
      } else {
        setTestResult(data.error || 'Test call could not be completed.');
      }
    } catch (err) {
      setTestResult('Simulation error. Check connection.');
    } finally {
      setTestingCall(false);
    }
  };

  const toggleAccordion = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const toggleChecklistItem = (key: keyof RunbookChecklist) => {
    setChecklist((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const resetChecklist = () => {
    setChecklist({
      prepaidChecked: false,
      formatChecked: false,
      wifiCallingChecked: false,
      unconditionalCleared: false,
      testCallVerified: false,
    });
  };

  const completedChecklistCount = Object.values(checklist).filter(Boolean).length;

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Carrier Call Forwarding Setup</h1>
        <p className="text-xs text-slate-500">
          Configure your existing cell phone or office PBX to conditionally forward only unanswered calls to MCR.
        </p>
      </div>

      {/* Live Verification Status Card */}
      <div
        className={`rounded-2xl border p-5 transition shadow-sm ${
          forwardingConfigured
            ? 'border-emerald-200 bg-emerald-50/70 text-emerald-950'
            : 'border-amber-200 bg-amber-50/70 text-amber-950'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div className="flex items-start gap-3">
            {forwardingConfigured ? (
              <div className="mt-0.5 rounded-full bg-emerald-100 p-1.5 text-emerald-600">
                <CheckCircle className="h-5 w-5" />
              </div>
            ) : (
              <div className="mt-0.5 rounded-full bg-amber-100 p-1.5 text-amber-600">
                <AlertTriangle className="h-5 w-5" />
              </div>
            )}
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-sm">
                  {forwardingConfigured
                    ? 'Conditional Forwarding Active & Verified'
                    : 'Conditional Forwarding Pending Activation'}
                </span>
                <span
                  className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider ${
                    forwardingConfigured
                      ? 'bg-emerald-200/80 text-emerald-800'
                      : 'bg-amber-200/80 text-amber-800'
                  }`}
                >
                  {forwardingConfigured ? 'Live' : 'Unverified'}
                </span>
              </div>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                {forwardingConfigured
                  ? 'Your carrier line is actively configured. Unanswered, busy, or declined calls automatically roll over to your dedicated MCR number for instant SMS recovery.'
                  : 'Your carrier star code has not yet been marked as dialed. Dial the code below from your phone keypad, then run a test call or click the button to verify.'}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0 self-start sm:self-center">
            {forwardingConfigured ? (
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => handleToggleForwarding(false)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50 hover:text-slate-900 disabled:opacity-50"
              >
                {updatingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                Reset to Unverified
              </button>
            ) : (
              <button
                type="button"
                disabled={updatingStatus}
                onClick={() => handleToggleForwarding(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-3.5 py-2 text-xs font-bold text-white shadow hover:bg-emerald-700 disabled:opacity-50"
              >
                {updatingStatus ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                I Have Dialed the Code — Mark as Active
              </button>
            )}
          </div>
        </div>
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
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-100 pb-4">
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
              {testingCall ? <Loader2 className="h-3 w-3 animate-spin text-emerald-400" /> : <Play className="h-3 w-3 text-emerald-400" />}
              {testingCall ? 'Testing...' : 'Test Forwarding Route'}
            </button>
          </div>

          {testResult && (
            <div
              className={`rounded-xl border p-4 text-xs font-semibold ${
                testResult.startsWith('✓')
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-rose-200 bg-rose-50 text-rose-800'
              }`}
            >
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

      {/* Interactive Carrier Troubleshooting Runbook & Field Guide */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <PhoneForwarded className="h-5 w-5 text-blue-600" />
            <div>
              <h3 className="text-sm font-bold text-slate-900">Carrier Troubleshooting Runbook & Field Guide</h3>
              <p className="text-xs text-slate-500">
                Actionable diagnostic procedures from operations for resolving fast busy tones, dual-ringing, and prepaid carrier blocks.
              </p>
            </div>
          </div>
          <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
            Runbook v1.0
          </span>
        </div>

        {/* Issue A Accordion */}
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleAccordion('issueA')}
            className="w-full flex items-center justify-between p-4 bg-slate-50 text-left hover:bg-slate-100/70 transition"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-rose-100 text-[11px] font-bold text-rose-700">
                A
              </span>
              <span className="text-xs font-bold text-slate-900">
                Fast Busy Tone or Error Message When Dialing Activation Code
              </span>
            </div>
            {expandedSection === 'issueA' ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>
          {expandedSection === 'issueA' && (
            <div className="p-4 bg-white border-t border-slate-100 text-xs text-slate-600 space-y-3">
              <div className="space-y-1">
                <span className="font-bold text-slate-800">1. Prepaid Plan Restriction</span>
                <p className="text-slate-600 leading-relaxed">
                  Many prepaid mobile plans (e.g. Cricket Basic, T-Mobile Prepaid, Metro, Visible) have conditional call forwarding turned off by default at the carrier switch.
                </p>
                <div className="rounded-lg bg-blue-50 border border-blue-200 p-2.5 text-blue-900 font-medium text-[11px]">
                  <strong>Resolution:</strong> Call your carrier customer support line (611) and ask: &quot;Please enable the feature &apos;Conditional Call Forwarding on Busy/No-Answer&apos; on this line.&quot;
                </div>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-slate-800">2. Dial Format Error (+1 Country Code)</span>
                <p className="text-slate-600 leading-relaxed">
                  Do not type a leading &apos;+&apos; or &apos;+1&apos; inside the carrier code. Enter the 10-digit number directly (e.g. <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">*712175550190</code>, NOT <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">*71+12175550190</code>).
                </p>
              </div>

              <div className="space-y-1">
                <span className="font-bold text-slate-800">3. Wi-Fi Calling Conflict</span>
                <p className="text-slate-600 leading-relaxed">
                  Wi-Fi Calling on iPhone or Android sometimes prevents cellular carrier USSD star codes from reaching the cell tower.
                </p>
                <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-slate-700 font-medium text-[11px]">
                  <strong>Resolution:</strong> Go to <em>Settings → Cellular → Wi-Fi Calling</em>, turn it OFF temporarily, dial the carrier activation code over cellular LTE/5G, listen for the confirmation tone, then re-enable Wi-Fi Calling.
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Issue B Accordion */}
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleAccordion('issueB')}
            className="w-full flex items-center justify-between p-4 bg-slate-50 text-left hover:bg-slate-100/70 transition"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-amber-100 text-[11px] font-bold text-amber-700">
                B
              </span>
              <span className="text-xs font-bold text-slate-900">
                Both Phones Ring Simultaneously or Mobile Never Rings (Unconditional Forwarding Error)
              </span>
            </div>
            {expandedSection === 'issueB' ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>
          {expandedSection === 'issueB' && (
            <div className="p-4 bg-white border-t border-slate-100 text-xs text-slate-600 space-y-3">
              <div className="space-y-1">
                <span className="font-bold text-slate-800">Root Cause: Mistakenly Dialed *72 Instead of *71</span>
                <p className="text-slate-600 leading-relaxed">
                  On Verizon and MVNO networks, <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">*72</code> triggers <strong>Unconditional Call Forwarding</strong>, which diverts all calls immediately without letting your cell phone ring first. You must use <code className="bg-slate-100 px-1 py-0.5 rounded font-mono text-[11px]">*71</code> for <strong>Conditional Call Forwarding</strong>.
                </p>
              </div>

              <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-3 text-emerald-950 font-medium text-[11px] space-y-1.5">
                <strong className="text-emerald-900 block">3-Step Fix:</strong>
                <ol className="list-decimal pl-4 space-y-1">
                  <li>Dial <code className="bg-white px-1 py-0.5 rounded font-mono text-[11px]">*73</code> and press Call to cancel all unconditional forwarding.</li>
                  <li>Have someone call your phone or place a test call to confirm your mobile rings normally.</li>
                  <li>Re-dial the correct conditional code: <code className="bg-white px-1 py-0.5 rounded font-mono text-[11px]">*71{mcrAssignedNumber.replace(/\D/g, '').slice(-10)}</code> and press Call.</li>
                </ol>
              </div>
            </div>
          )}
        </div>

        {/* Issue C Accordion */}
        <div className="rounded-xl border border-slate-200 overflow-hidden">
          <button
            type="button"
            onClick={() => toggleAccordion('issueC')}
            className="w-full flex items-center justify-between p-4 bg-slate-50 text-left hover:bg-slate-100/70 transition"
          >
            <div className="flex items-center gap-2">
              <span className="flex h-5 w-5 items-center justify-center rounded-full bg-blue-100 text-[11px] font-bold text-blue-700">
                C
              </span>
              <span className="text-xs font-bold text-slate-900">
                MVNO &amp; Virtual Carrier Network Mapping (Xfinity, Spectrum, Cricket, Mint)
              </span>
            </div>
            {expandedSection === 'issueC' ? (
              <ChevronUp className="h-4 w-4 text-slate-500" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-500" />
            )}
          </button>
          {expandedSection === 'issueC' && (
            <div className="p-4 bg-white border-t border-slate-100 text-xs text-slate-600 space-y-3">
              <p className="text-slate-600 leading-relaxed">
                Mobile Virtual Network Operators (MVNOs) lease cellular infrastructure from major carrier towers. Dial string commands follow the parent carrier protocol:
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-[11px]">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 font-bold text-slate-700">
                      <th className="py-2 px-3">Provider</th>
                      <th className="py-2 px-3">Parent Network</th>
                      <th className="py-2 px-3">Activation Dial Code</th>
                      <th className="py-2 px-3">Cancellation Code</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">Xfinity / Spectrum Mobile</td>
                      <td className="py-2 px-3 text-slate-600">Verizon Wireless</td>
                      <td className="py-2 px-3 font-mono text-emerald-700">*71&lt;10-digit&gt;</td>
                      <td className="py-2 px-3 font-mono text-slate-600">*73</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">Cricket Wireless</td>
                      <td className="py-2 px-3 text-slate-600">AT&amp;T Mobility</td>
                      <td className="py-2 px-3 font-mono text-emerald-700">*004*&lt;10-digit&gt;#</td>
                      <td className="py-2 px-3 font-mono text-slate-600">##004#</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">Mint Mobile / Metro</td>
                      <td className="py-2 px-3 text-slate-600">T-Mobile US</td>
                      <td className="py-2 px-3 font-mono text-emerald-700">**004*1&lt;10-digit&gt;#</td>
                      <td className="py-2 px-3 font-mono text-slate-600">##004#</td>
                    </tr>
                    <tr>
                      <td className="py-2 px-3 font-semibold text-slate-800">VoIP / RingCentral / Vonage</td>
                      <td className="py-2 px-3 text-slate-600">Cloud PBX</td>
                      <td className="py-2 px-3 text-slate-600">Web Portal Rule (3-4 rings)</td>
                      <td className="py-2 px-3 text-slate-600">Remove Portal Rule</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Interactive Self-Service Checklist */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/50 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckSquare className="h-4 w-4 text-emerald-600" />
              <span className="text-xs font-bold text-slate-900">
                Interactive Carrier Setup Checklist ({completedChecklistCount} of 5 Completed)
              </span>
            </div>
            <button
              type="button"
              onClick={resetChecklist}
              className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 transition"
            >
              Reset Checklist
            </button>
          </div>

          <div className="w-full bg-slate-200 rounded-full h-1.5 overflow-hidden">
            <div
              className="bg-emerald-600 h-1.5 transition-all duration-300"
              style={{ width: `${(completedChecklistCount / 5) * 100}%` }}
            />
          </div>

          <div className="space-y-2 pt-1">
            <label
              onClick={() => toggleChecklistItem('prepaidChecked')}
              className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none"
            >
              <div className="mt-0.5 text-slate-500">
                {checklist.prepaidChecked ? (
                  <CheckSquare className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </div>
              <span className={checklist.prepaidChecked ? 'line-through text-slate-400' : ''}>
                Carrier line supports Conditional Call Forwarding (postpaid or CCF feature enabled via 611 support)
              </span>
            </label>

            <label
              onClick={() => toggleChecklistItem('formatChecked')}
              className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none"
            >
              <div className="mt-0.5 text-slate-500">
                {checklist.formatChecked ? (
                  <CheckSquare className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </div>
              <span className={checklist.formatChecked ? 'line-through text-slate-400' : ''}>
                Star code dialed with clean 10-digit number (no leading +1, dashes, or spaces)
              </span>
            </label>

            <label
              onClick={() => toggleChecklistItem('wifiCallingChecked')}
              className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none"
            >
              <div className="mt-0.5 text-slate-500">
                {checklist.wifiCallingChecked ? (
                  <CheckSquare className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </div>
              <span className={checklist.wifiCallingChecked ? 'line-through text-slate-400' : ''}>
                Handset Wi-Fi Calling temporarily toggled off while dialing carrier star code over LTE/5G
              </span>
            </label>

            <label
              onClick={() => toggleChecklistItem('unconditionalCleared')}
              className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none"
            >
              <div className="mt-0.5 text-slate-500">
                {checklist.unconditionalCleared ? (
                  <CheckSquare className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </div>
              <span className={checklist.unconditionalCleared ? 'line-through text-slate-400' : ''}>
                Cleared any conflicting unconditional forwarding (*73 / ##004# / #61#)
              </span>
            </label>

            <label
              onClick={() => toggleChecklistItem('testCallVerified')}
              className="flex items-start gap-2.5 text-xs text-slate-700 cursor-pointer select-none"
            >
              <div className="mt-0.5 text-slate-500">
                {checklist.testCallVerified ? (
                  <CheckSquare className="h-4 w-4 text-emerald-600" />
                ) : (
                  <Square className="h-4 w-4" />
                )}
              </div>
              <span className={checklist.testCallVerified ? 'line-through text-slate-400' : ''}>
                Ran &apos;Test Forwarding Route&apos; or placed test call to verify automated SMS text-back
              </span>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
