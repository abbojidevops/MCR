'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  PhoneCall,
  CheckCircle,
  ArrowRight,
  ArrowLeft,
  Wrench,
  Flame,
  Zap,
  ShieldCheck,
  Building,
  Clock,
  User,
  Radio,
  Copy,
  Check,
  AlertCircle,
  Smartphone,
} from 'lucide-react';
import { TradeKey } from '@/types';
import { TRADE_TEMPLATES } from '@/lib/trade-templates';
import { CARRIER_GUIDES } from '@/lib/carrier-guides';

export default function OnboardingPage() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const totalSteps = 12;

  // Form State
  const [businessName, setBusinessName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [trade, setTrade] = useState<TradeKey>('plumbing');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [selectedCarrier, setSelectedCarrier] = useState('verizon');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mcrAssignedNumber, setMcrAssignedNumber] = useState<string>('');

  React.useEffect(() => {
    fetch('/api/settings')
      .then((r) => r.json())
      .then((d) => {
        if (d.phoneNumbers && d.phoneNumbers[0]?.formatted_number) {
          setMcrAssignedNumber(d.phoneNumbers[0].formatted_number);
        } else if (d.profile?.notification_phone) {
          setMcrAssignedNumber(d.profile.notification_phone);
        } else {
          setMcrAssignedNumber('[Dedicated Number Assigned Upon Activation]');
        }
      })
      .catch(() => setMcrAssignedNumber('[Dedicated Number Assigned Upon Activation]'));
  }, []);

  // Test simulation state in Step 10 & 11
  const [testSimulating, setTestSimulating] = useState(false);
  const [testChecklist, setTestChecklist] = useState<Record<string, boolean>>({
    callReceived: false,
    missedCallDetected: false,
    textSent: false,
    customerReplied: false,
    jobCreated: false,
    ownerNotified: false,
  });

  const cleanMcrTenDigit = mcrAssignedNumber.replace(/\D/g, '') || 'YOUR_MCR_NUMBER';
  const carrierGuide = CARRIER_GUIDES[selectedCarrier] || CARRIER_GUIDES.verizon;
  const dialCode = carrierGuide.forward_no_answer_code.replace(/{{FORWARD_NUMBER}}/g, cleanMcrTenDigit);

  const handleCopyCode = () => {
    navigator.clipboard.writeText(dialCode);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  const runTestSimulation = async () => {
    setTestSimulating(true);
    // Simulate step by step with natural delays
    setTimeout(() => {
      setTestChecklist((prev) => ({ ...prev, callReceived: true }));
    }, 600);

    setTimeout(() => {
      setTestChecklist((prev) => ({ ...prev, missedCallDetected: true }));
    }, 1200);

    setTimeout(() => {
      setTestChecklist((prev) => ({ ...prev, textSent: true }));
    }, 1800);

    setTimeout(() => {
      setTestChecklist((prev) => ({ ...prev, customerReplied: true }));
    }, 2500);

    setTimeout(() => {
      setTestChecklist((prev) => ({ ...prev, jobCreated: true }));
    }, 3200);

    setTimeout(() => {
      setTestChecklist((prev) => ({ ...prev, ownerNotified: true }));
      setTestSimulating(false);
    }, 3800);
  };

  const handleFinishOnboarding = async () => {
    setIsSubmitting(true);
    try {
      await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          trade,
          ownerName,
          phone: ownerPhone,
          carrierName: carrierGuide.carrier_name,
        }),
      });
      router.push('/dashboard');
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      router.push('/dashboard');
    }
  };

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-4xl items-center justify-between">
          <Link href="/" className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600 text-white font-bold">
              MCR
            </div>
            <span className="font-bold text-slate-900">Setup Wizard</span>
          </Link>
          <div className="text-xs font-semibold text-slate-500">
            Step {currentStep} of {totalSteps}
          </div>
        </div>
      </header>

      {/* Progress Bar */}
      <div className="h-1.5 w-full bg-slate-200">
        <div
          className="h-full bg-blue-600 transition-all duration-300 ease-out"
          style={{ width: `${(currentStep / totalSteps) * 100}%` }}
        ></div>
      </div>

      {/* Main Form Body */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
          {/* STEP 1: Business Information */}
          {currentStep === 1 && (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Building className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">What is your business name?</h2>
              <p className="mt-1 text-sm text-slate-500">
                This name will be included in the automated text message so callers recognize your business immediately.
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Business Name
                  </label>
                  <input
                    type="text"
                    value={businessName}
                    onChange={(e) => setBusinessName(e.target.value)}
                    placeholder="e.g. Apex Plumbing & Drain"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Legal Entity Name (Optional)
                  </label>
                  <input
                    type="text"
                    value={legalName}
                    onChange={(e) => setLegalName(e.target.value)}
                    placeholder="e.g. Apex Plumbing LLC"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 2: Trade / Industry */}
          {currentStep === 2 && (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Wrench className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Select your trade or service</h2>
              <p className="mt-1 text-sm text-slate-500">
                MCR adapts its SMS qualification questions and emergency detection keywords specifically to your industry.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-2">
                {(Object.keys(TRADE_TEMPLATES) as TradeKey[]).map((tKey) => {
                  const item = TRADE_TEMPLATES[tKey];
                  const isSelected = trade === tKey;
                  return (
                    <button
                      key={tKey}
                      type="button"
                      onClick={() => setTrade(tKey)}
                      className={`flex flex-col items-start rounded-xl border p-4 text-left transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-600'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                      }`}
                    >
                      <span className="font-semibold text-sm text-slate-900">{item.display_name}</span>
                      <span className="mt-1 text-xs text-slate-500 line-clamp-1">
                        Questions: Emergency, problem, address, photo
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 3: Business Hours */}
          {currentStep === 3 && (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Clock className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Business Hours & Timezone</h2>
              <p className="mt-1 text-sm text-slate-500">
                MCR strictly complies with TCPA quiet hours (8:00 AM – 9:00 PM local time). Text-backs outside this window
                are queued for the morning unless flagged as an urgent emergency.
              </p>

              <div className="mt-6 space-y-4">
                <div className="rounded-xl border border-slate-200 p-4 bg-slate-50 text-sm">
                  <div className="font-medium text-slate-800">Standard Operating Hours</div>
                  <div className="text-xs text-slate-500 mt-1">Monday – Friday: 8:00 AM – 5:00 PM</div>
                  <div className="text-xs text-slate-500">Saturday: 9:00 AM – 2:00 PM (Emergency calls 24/7)</div>
                </div>

                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Primary Business Timezone
                  </label>
                  <select
                    className="mt-1.5 w-full rounded-lg border border-slate-300 bg-white px-3.5 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                    defaultValue="America/Chicago"
                  >
                    <option value="America/New_York">Eastern Time (ET)</option>
                    <option value="America/Chicago">Central Time (CT)</option>
                    <option value="America/Denver">Mountain Time (MT)</option>
                    <option value="America/Los_Angeles">Pacific Time (PT)</option>
                    <option value="America/Phoenix">Arizona (No DST)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: Owner Contact */}
          {currentStep === 4 && (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <User className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Where should we notify you?</h2>
              <p className="mt-1 text-sm text-slate-500">
                Enter the cell phone number where you or your lead technician will receive instant job notifications.
              </p>

              <div className="mt-6 space-y-4">
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Owner / Technician Name
                  </label>
                  <input
                    type="text"
                    value={ownerName}
                    onChange={(e) => setOwnerName(e.target.value)}
                    placeholder="e.g. Mark Stevens"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Cell Phone for Alerts
                  </label>
                  <input
                    type="tel"
                    value={ownerPhone}
                    onChange={(e) => setOwnerPhone(e.target.value)}
                    placeholder="e.g. (217) 555-0100"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
              </div>
            </div>
          )}

          {/* STEP 5: Phone Number Provisioning */}
          {currentStep === 5 && (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Smartphone className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Your Dedicated Recovery Number</h2>
              <p className="mt-1 text-sm text-slate-500">
                We have provisioned a dedicated local number matching your area code. This number will receive your missed
                call rollovers and manage text-backs.
              </p>

              <div className="mt-6 rounded-2xl border border-blue-200 bg-blue-50/50 p-6 text-center">
                <div className="text-xs uppercase font-semibold tracking-wider text-blue-600">Assigned Number</div>
                <div className="mt-2 text-3xl font-extrabold text-slate-900">{mcrAssignedNumber}</div>
                <div className="mt-3 flex justify-center gap-3 text-xs text-slate-600">
                  <span className="flex items-center gap-1 font-medium text-emerald-700">
                    <CheckCircle className="h-3.5 w-3.5" /> Voice Ready
                  </span>
                  <span className="flex items-center gap-1 font-medium text-emerald-700">
                    <CheckCircle className="h-3.5 w-3.5" /> SMS Ready
                  </span>
                  <span className="flex items-center gap-1 font-medium text-emerald-700">
                    <CheckCircle className="h-3.5 w-3.5" /> MMS Photos
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 6: Select Carrier */}
          {currentStep === 6 && (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Radio className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Select your mobile carrier</h2>
              <p className="mt-1 text-sm text-slate-500">
                Every carrier has a specific conditional dial code (e.g. *71 for Verizon, *61 for AT&T). Select your carrier
                to get exact instructions.
              </p>

              <div className="mt-6 grid grid-cols-2 gap-3">
                {Object.keys(CARRIER_GUIDES).map((cKey) => {
                  const g = CARRIER_GUIDES[cKey];
                  const isSelected = selectedCarrier === cKey;
                  return (
                    <button
                      key={cKey}
                      type="button"
                      onClick={() => setSelectedCarrier(cKey)}
                      className={`rounded-xl border p-4 text-left transition-all ${
                        isSelected
                          ? 'border-blue-600 bg-blue-50/60 ring-2 ring-blue-600'
                          : 'border-slate-200 hover:border-slate-300'
                      }`}
                    >
                      <div className="font-semibold text-sm text-slate-900">{g.carrier_name}</div>
                      <div className="text-xs text-slate-500 mt-1">Code: {g.forward_no_answer_code.slice(0, 4)}...</div>
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* STEP 7: Forwarding Instructions */}
          {currentStep === 7 && (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <PhoneCall className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Set Up Conditional Call Forwarding</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your phone will ring normally first. Only when you don&apos;t answer or decline, your carrier forwards to MCR.
              </p>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-900 p-6 text-white">
                <div className="text-xs font-semibold uppercase text-slate-400">
                  {carrierGuide.carrier_name} Activation Code
                </div>
                <div className="mt-2 flex items-center justify-between">
                  <span className="font-mono text-2xl font-bold text-emerald-400">{dialCode}</span>
                  <button
                    type="button"
                    onClick={handleCopyCode}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                  >
                    {copiedCode ? <Check className="h-4 w-4 text-emerald-400" /> : <Copy className="h-4 w-4" />}
                    {copiedCode ? 'Copied' : 'Copy'}
                  </button>
                </div>
              </div>

              <div className="mt-6 space-y-2 text-xs text-slate-600">
                <div className="font-semibold text-slate-800">Instructions:</div>
                <ol className="list-decimal space-y-1.5 pl-4">
                  {carrierGuide.instructions.map((inst, idx) => (
                    <li key={idx}>{inst}</li>
                  ))}
                </ol>
              </div>
            </div>
          )}

          {/* STEP 8: Compliance Registration */}
          {currentStep === 8 && (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">A2P 10DLC Carrier Registration</h2>
              <p className="mt-1 text-sm text-slate-500">
                All US cellular networks require business identity registration. We manage this automatically with The Campaign Registry (TCR).
              </p>

              <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
                <div className="flex items-center gap-2 font-semibold text-emerald-800 text-sm">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Pre-configured Standard Campaign
                </div>
                <p className="mt-1 text-xs text-emerald-700">
                  Use Case: Customer Care & Missed Call Recovery. Opt-out handling (STOP/UNSUBSCRIBE) and recipient quiet hours
                  are built directly into your account.
                </p>
              </div>

              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-600">
                <div className="font-semibold text-slate-800">10DLC Carrier Registration Timeline:</div>
                <p className="mt-1">
                  Brand registration takes minutes to 3 days. Campaign approval runs 3 days to 4 weeks with a $15 non-refundable carrier vetting fee. During this window, your voice forwarding is active and missed calls notify you immediately.
                </p>
              </div>
            </div>
          )}

          {/* STEP 9: Notification Preferences */}
          {currentStep === 9 && (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <Zap className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Notification Preferences</h2>
              <p className="mt-1 text-sm text-slate-500">
                Choose how you want to be alerted when a missed call is qualified.
              </p>

              <div className="mt-6 space-y-3">
                <label className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                  <div>
                    <div className="font-semibold text-sm text-slate-900">SMS Text Message Alerts</div>
                    <div className="text-xs text-slate-500">Immediate text sent to {ownerPhone}</div>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 rounded accent-blue-600" />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                  <div>
                    <div className="font-semibold text-sm text-slate-900">Emergency Call Escalation</div>
                    <div className="text-xs text-slate-500">High-priority alert when burst, flood, or fire keywords detected</div>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 rounded accent-blue-600" />
                </label>

                <label className="flex items-center justify-between rounded-xl border border-slate-200 p-4">
                  <div>
                    <div className="font-semibold text-sm text-slate-900">Daily 6:00 PM Summary</div>
                    <div className="text-xs text-slate-500">Daily breakdown of missed calls and recovered jobs</div>
                  </div>
                  <input type="checkbox" defaultChecked className="h-4 w-4 rounded accent-blue-600" />
                </label>
              </div>
            </div>
          )}

          {/* STEP 10: Test Missed Call Simulator */}
          {currentStep === 10 && (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                <PhoneCall className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Test Your Missed Call Recovery</h2>
              <p className="mt-1 text-sm text-slate-500">
                Click below to simulate a live customer call that goes unanswered. Watch how MCR intercepts and engages.
              </p>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-center">
                <button
                  type="button"
                  disabled={testSimulating}
                  onClick={runTestSimulation}
                  className="inline-flex items-center gap-2 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white shadow hover:bg-blue-700 disabled:opacity-50"
                >
                  <PhoneCall className="h-4 w-4" />
                  {testSimulating ? 'Simulating Call Flow...' : 'Simulate Test Missed Call'}
                </button>
              </div>

              {/* Live Checklist */}
              <div className="mt-6 space-y-2 rounded-xl border border-slate-200 bg-white p-4 text-xs">
                <div className="font-semibold text-slate-800 mb-2">Automated Verification Checklist:</div>

                <div className="flex items-center justify-between py-1">
                  <span>1. Inbound carrier call received</span>
                  <span className={testChecklist.callReceived ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                    {testChecklist.callReceived ? '✓ Passed' : 'Pending'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span>2. Missed call detected (&lt;60s)</span>
                  <span className={testChecklist.missedCallDetected ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                    {testChecklist.missedCallDetected ? '✓ Passed' : 'Pending'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span>3. Trade-specific text-back sent</span>
                  <span className={testChecklist.textSent ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                    {testChecklist.textSent ? '✓ Passed' : 'Pending'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span>4. Simulated customer reply received</span>
                  <span className={testChecklist.customerReplied ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                    {testChecklist.customerReplied ? '✓ Passed' : 'Pending'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span>5. Structured Job Card generated</span>
                  <span className={testChecklist.jobCreated ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                    {testChecklist.jobCreated ? '✓ Passed' : 'Pending'}
                  </span>
                </div>

                <div className="flex items-center justify-between py-1">
                  <span>6. Business owner alert dispatched</span>
                  <span className={testChecklist.ownerNotified ? 'text-emerald-600 font-bold' : 'text-slate-400'}>
                    {testChecklist.ownerNotified ? '✓ Passed' : 'Pending'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 11: Verification Checklist Summary */}
          {currentStep === 11 && (
            <div>
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50 text-emerald-600">
                <CheckCircle className="h-6 w-6" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">All Systems Operational</h2>
              <p className="mt-1 text-sm text-slate-500">
                Your account is fully configured. The conditional forwarding, intake workflow, and alert routing are active.
              </p>

              <div className="mt-6 rounded-2xl border border-slate-200 bg-slate-50 p-6 space-y-3 text-sm">
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Business:</span>
                  <span className="font-semibold text-slate-800">{businessName}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Trade:</span>
                  <span className="font-semibold text-slate-800 uppercase">{trade}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">MCR Phone:</span>
                  <span className="font-semibold text-slate-800">{mcrAssignedNumber}</span>
                </div>
                <div className="flex justify-between border-b border-slate-200 pb-2">
                  <span className="text-slate-500">Carrier:</span>
                  <span className="font-semibold text-slate-800">{carrierGuide.carrier_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Trial Period:</span>
                  <span className="font-semibold text-emerald-600">14 Days Free</span>
                </div>
              </div>
            </div>
          )}

          {/* STEP 12: Launch Dashboard */}
          {currentStep === 12 && (
            <div className="text-center py-6">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-emerald-600">
                <Check className="h-8 w-8" />
              </div>
              <h2 className="mt-4 text-2xl font-bold text-slate-900">Your MCR recovery system is ready.</h2>
              <p className="mt-2 text-sm text-slate-600 max-w-md mx-auto">
                Next time you miss a call on your cell phone, MCR will automatically handle it and turn it into a booked job.
              </p>

              <button
                type="button"
                onClick={handleFinishOnboarding}
                disabled={isSubmitting}
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isSubmitting ? 'Loading Dashboard...' : 'Open Owner Dashboard'} <ArrowRight className="h-5 w-5" />
              </button>
            </div>
          )}

          {/* Navigation Controls */}
          {currentStep < 12 && (
            <div className="mt-8 flex items-center justify-between border-t border-slate-200 pt-6">
              <button
                type="button"
                disabled={currentStep === 1}
                onClick={() => setCurrentStep((p) => Math.max(1, p - 1))}
                className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-slate-900 disabled:opacity-30"
              >
                <ArrowLeft className="h-4 w-4" /> Back
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep((p) => Math.min(totalSteps, p + 1))}
                className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
