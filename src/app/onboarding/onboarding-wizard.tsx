'use client';

import React, { useState, useEffect } from 'react';
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
  RotateCcw,
  Loader2,
} from 'lucide-react';
import { TradeKey } from '@/types';
import { TRADE_TEMPLATES } from '@/lib/trade-templates';
import { CARRIER_GUIDES } from '@/lib/carrier-guides';

/**
 * Single source of truth for the signup flow's step count and labels.
 *
 * The wizard body below branches on `currentStep === n`; keeping the names in
 * one array means the progress rail and the "Step n of 12" label can never
 * drift out of sync with the actual steps.
 */
const ONBOARDING_STEPS = [
  { n: 1, label: 'Business' },
  { n: 2, label: 'Trade' },
  { n: 3, label: 'Hours' },
  { n: 4, label: 'Alerts' },
  { n: 5, label: 'Recovery #' },
  { n: 6, label: 'Carrier' },
  { n: 7, label: 'Forwarding' },
  { n: 8, label: '10DLC' },
  { n: 9, label: 'Preferences' },
  { n: 10, label: 'Test call' },
  { n: 11, label: 'Verify' },
  { n: 12, label: 'Done' },
] as const;

/** Browser-local draft key. Deliberately namespaced so it cannot collide. */
const ONBOARDING_STORAGE_KEY = 'mcr.onboarding.draft.v1';

export default function OnboardingWizard() {
  const router = useRouter();
  const [currentStep, setCurrentStep] = useState<number>(1);
  const totalSteps = ONBOARDING_STEPS.length;
  const [resumed, setResumed] = useState(false);

  // Form State
  const [businessName, setBusinessName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [trade, setTrade] = useState<TradeKey>('plumbing');
  const [ownerName, setOwnerName] = useState('');
  const [ownerPhone, setOwnerPhone] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [selectedCarrier, setSelectedCarrier] = useState('verizon');
  const [copiedCode, setCopiedCode] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [mcrAssignedNumber, setMcrAssignedNumber] = useState<string>('');

  // Restore an unfinished draft. Signup is a long, multi-step flow and a
  // customer who closes the tab mid-way should not have to start over.
  useEffect(() => {
    try {
      const raw = window.localStorage.getItem(ONBOARDING_STORAGE_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      if (typeof draft?.currentStep === 'number' && draft.currentStep >= 1) {
        setCurrentStep(Math.min(draft.currentStep, totalSteps));
      }
      if (draft?.businessName) setBusinessName(draft.businessName);
      if (draft?.legalName) setLegalName(draft.legalName);
      if (draft?.trade) setTrade(draft.trade);
      if (draft?.ownerName) setOwnerName(draft.ownerName);
      if (draft?.ownerPhone) setOwnerPhone(draft.ownerPhone);
      if (draft?.email) setEmail(draft.email);
      if (draft?.selectedCarrier) setSelectedCarrier(draft.selectedCarrier);
      setResumed(Boolean(draft?.businessName || draft?.email || draft?.currentStep > 1));
    } catch {
      /* a corrupt or unavailable draft simply starts fresh */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist the draft on every change so a refresh or an accidental tab close
  // never loses progress. The password is deliberately never stored.
  useEffect(() => {
    try {
      window.localStorage.setItem(
        ONBOARDING_STORAGE_KEY,
        JSON.stringify({
          currentStep,
          businessName,
          legalName,
          trade,
          ownerName,
          ownerPhone,
          email,
          selectedCarrier,
        })
      );
    } catch {
      /* private browsing / quota exhausted: continue without a draft */
    }
  }, [currentStep, businessName, legalName, trade, ownerName, ownerPhone, email, selectedCarrier]);

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

  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleFinishOnboarding = async () => {
    setIsSubmitting(true);
    setSubmitError(null);
    try {
      const res = await fetch('/api/onboarding', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName,
          trade,
          ownerName,
          phone: ownerPhone,
          email,
          password,
          carrierName: carrierGuide.carrier_name,
        }),
      });

      if (!res.ok) {
        // A network failure must never be reported as success: navigating to
        // the dashboard here would leave the customer signed out with no
        // account and no explanation.
        const data = await res.json().catch(() => null);
        setSubmitError(
          data?.error ||
            `We could not create your account (HTTP ${res.status}). Your progress is saved — please try again.`
        );
        setIsSubmitting(false);
        return;
      }

      // Account created and the session cookie is set. Clear the draft and
      // hand the customer straight to their dashboard.
      try {
        window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      } catch {
        /* ignore */
      }
      router.push('/dashboard');
      router.refresh();
    } catch (err) {
      console.error('Failed to complete onboarding:', err);
      setSubmitError(
        'Network error — your account was not created. Your progress is saved in this browser, please try again.'
      );
      setIsSubmitting(false);
    }
  };


  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
        <div className="mx-auto flex max-w-3xl">
          <Link href="/" className="flex items-center gap-2.5">
            <span
              className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white shadow-sm"
              aria-hidden="true"
            >
              <PhoneCall className="h-4 w-4" />
            </span>
            <span className="leading-tight">
              <span className="block text-sm font-extrabold tracking-tight text-slate-900">MCR</span>
              <span className="block text-[10px] font-medium text-slate-400">Revenue Recovery</span>
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-4">
            <span className="text-xs font-semibold text-slate-500">
              Step {currentStep} of {totalSteps}
            </span>
            <Link
              href="/login"
              className="text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              Save &amp; finish later
            </Link>
          </div>
        </div>
      </header>

      {/* Progress bar + named step rail */}
      <div className="border-b border-slate-200 bg-white">
        <div
          className="h-1.5 w-full bg-slate-200"
          role="progressbar"
          aria-valuenow={currentStep}
          aria-valuemin={1}
          aria-valuemax={totalSteps}
          aria-label="Setup progress"
        >
          <div
            className="h-full bg-blue-600 transition-all duration-300 ease-out"
            style={{ width: `${(currentStep / totalSteps) * 100}%` }}
          ></div>
        </div>

        <nav
          aria-label="Setup steps"
          className="mx-auto max-w-3xl overflow-x-auto px-4 py-2.5 sm:px-6"
        >
          <ol className="flex items-center gap-1.5 text-[10px] font-semibold">
            {ONBOARDING_STEPS.map((step) => {
              const state =
                step.n < currentStep ? 'done' : step.n === currentStep ? 'current' : 'todo';
              return (
                <li key={step.n} className="flex shrink-0 items-center gap-1.5">
                  <span
                    aria-current={state === 'current' ? 'step' : undefined}
                    className={`flex h-5 w-5 items-center justify-center rounded-full border text-[9px] font-bold ${
                      state === 'done'
                        ? 'border-emerald-500 bg-emerald-500 text-white'
                        : state === 'current'
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-slate-300 bg-white text-slate-400'
                    }`}
                  >
                    {state === 'done' ? '✓' : step.n}
                  </span>
                  <span
                    className={
                      state === 'current'
                        ? 'font-bold text-slate-900'
                        : state === 'done'
                        ? 'text-emerald-700'
                        : 'text-slate-400'
                    }
                  >
                    {step.label}
                  </span>
                </li>
              );
            })}
          </ol>
        </nav>
      </div>

      {resumed && (
        <div className="mx-auto w-full max-w-2xl px-4 pt-5 sm:px-6">
          <div className="flex items-start gap-2.5 rounded-xl border border-blue-100 bg-blue-50/70 p-3 text-[11px] text-blue-900">
            <RotateCcw className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-600" aria-hidden="true" />
            <span>
              We restored your unfinished setup from this browser. Your password is never saved —
              you will enter it again at the end.
            </span>
          </div>
        </div>
      )}

      {/* Main Form Body */}
      <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-8 sm:px-6">
        {submitError && (
          <div
            role="alert"
            className="mb-5 flex items-start gap-3 rounded-xl border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
          >
            <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-rose-500" aria-hidden="true" />
            <span>{submitError}</span>
          </div>
        )}
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
                    Account Email (Required for login)
                  </label>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="e.g. owner@apexplumbing.com"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700">
                    Password (Min. 12 characters)
                  </label>
                  <input
                    type="password"
                    required
                    minLength={12}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 12 characters"
                    className="mt-1.5 w-full rounded-lg border border-slate-300 px-3.5 py-2.5 text-sm shadow-sm focus:border-blue-500 focus:outline-none"
                  />
                  {password && password.length < 12 && (
                    <p className="mt-1 text-xs text-rose-500">Password must be at least 12 characters long ({password.length}/12)</p>
                  )}
                </div>
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
                className="mt-8 inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-8 py-3.5 text-base font-semibold text-white shadow-md hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" aria-hidden="true" />
                    Creating your account...
                  </>
                ) : (
                  <>
                    Open Owner Dashboard <ArrowRight className="h-5 w-5" aria-hidden="true" />
                  </>
                )}
              </button>
              <p className="mt-4 text-xs text-slate-500">
                Creating your account signs you in and takes you straight to your dashboard. You can
                change any of these details later in Settings.
              </p>
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
                <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
              </button>

              <button
                type="button"
                onClick={() => setCurrentStep((p) => Math.min(totalSteps, p + 1))}
                className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
              >
                Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
