'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import {
  PhoneCall,
  MessageSquare,
  ShieldCheck,
  CheckCircle,
  ArrowRight,
  DollarSign,
  AlertTriangle,
  Zap,
  Wrench,
  Clock,
  ChevronRight,
  TrendingUp,
  Sparkles,
  PhoneMissed,
  MapPin,
  Flame,
  Check,
} from 'lucide-react';

export default function LandingPage() {
  // ROI Calculator State
  const [avgJobValue, setAvgJobValue] = useState<number>(650);
  const [missedCallsPerMonth, setMissedCallsPerMonth] = useState<number>(35);
  const [recoveryRate, setRecoveryRate] = useState<number>(25);

  const potentialRecoveredJobs = Math.round((missedCallsPerMonth * recoveryRate) / 100);
  const potentialRecoveredRevenue = potentialRecoveredJobs * avgJobValue;
  const mcrSubscription = 149;
  const roiMultiplier = Math.round(potentialRecoveredRevenue / mcrSubscription);

  const targetTrades = [
    'Plumbers',
    'HVAC Technicians',
    'Electricians',
    'Roofers',
    'Garage Door Pros',
    'Locksmiths',
    'Appliance Repair',
    'Landscaping',
    'Pest Control',
  ];

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* ---------------- TOP TRUST BANNER ---------------- */}
      <div className="bg-slate-900 px-4 py-2 text-center text-xs font-medium text-slate-300 sm:px-6">
        <span className="inline-flex items-center gap-2">
          <span className="flex h-2 w-2 rounded-full bg-emerald-400"></span>
          <span>Works with your existing carrier (Verizon, AT&amp;T, T-Mobile) • Setup in under 10 minutes</span>
        </span>
      </div>

      {/* ---------------- NAVIGATION ---------------- */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <PhoneCall className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xl font-extrabold tracking-tight text-slate-900">MCR</span>
              <span className="ml-1.5 hidden text-xs font-semibold uppercase tracking-wider text-blue-600 sm:inline">
                Missed Call Recovery
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex">
            <a href="#propositions" className="hover:text-blue-600">Why MCR</a>
            <a href="#how-it-works" className="hover:text-blue-600">How It Works</a>
            <a href="#example-flow" className="hover:text-blue-600">Live Example</a>
            <a href="#calculator" className="hover:text-blue-600">ROI Calculator</a>
            <a href="#pricing" className="hover:text-blue-600">Pricing</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-xl border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
            >
              Demo Dashboard
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-sm font-bold text-white shadow-sm hover:bg-blue-700 transition"
            >
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------- HERO SECTION (SECTION 22 & 23) ---------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/60 via-white to-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              {/* Target Trades Badge */}
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-3.5 py-1 text-xs font-semibold text-blue-700">
                <span className="flex h-2 w-2 rounded-full bg-blue-600"></span>
                Built specifically for Trade &amp; Home Service Businesses
              </div>

              {/* Exact Section 22 Headline */}
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                TURN MISSED CALLS INTO <span className="text-blue-600">MORE JOBS.</span>
              </h1>

              {/* Exact Section 22 Subheadline */}
              <p className="mt-6 text-lg leading-relaxed text-slate-600 sm:text-xl">
                When you can&apos;t answer the phone, MCR automatically follows up with the caller within seconds,
                collects the job details, and puts the qualified opportunity into your hands.
              </p>

              {/* Target Trades Pill List */}
              <div className="mt-6 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                <span className="font-semibold text-slate-900">For:</span>
                {targetTrades.map((trade) => (
                  <span
                    key={trade}
                    className="rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700"
                  >
                    {trade}
                  </span>
                ))}
              </div>

              {/* Section 22 Primary CTA */}
              <div className="mt-8 flex flex-col gap-3.5 sm:flex-row sm:items-center">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-4 text-base font-bold text-white shadow-lg shadow-blue-500/25 hover:bg-blue-700 transition"
                >
                  START RECOVERING MISSED CALLS <ArrowRight className="h-5 w-5" />
                </Link>
                <Link
                  href="/dashboard"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-4 text-base font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  View Live Demo Dashboard
                </Link>
              </div>

              {/* Section 26 Social Proof & Trust Badges */}
              <div className="mt-10 grid grid-cols-2 gap-3 text-xs text-slate-600 sm:grid-cols-4">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Works with existing phone</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>No carrier switch needed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>TCPA &amp; 10DLC compliant</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 shrink-0 text-emerald-600" />
                  <span>Setup in under 10 min</span>
                </div>
              </div>
            </div>

            {/* Visual Phone Mockup / Section 25 Preview */}
            <div className="lg:col-span-5" id="example-flow">
              <div className="relative mx-auto max-w-sm rounded-3xl border-4 border-slate-800 bg-slate-900 p-4 shadow-2xl">
                {/* Phone Header */}
                <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-semibold text-slate-200">MCR Instant Follow-up</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-400">2:14 PM</span>
                </div>

                {/* Section 25 Exact Realistic SMS Thread */}
                <div className="space-y-3 rounded-2xl bg-slate-950 p-4 text-xs font-sans">
                  {/* Missed Call Notice */}
                  <div className="rounded-xl bg-red-950/40 border border-red-800/40 p-2.5 text-red-200">
                    <div className="font-bold text-red-400 flex items-center gap-1.5">
                      <PhoneMissed className="h-4 w-4" /> Missed Call Detected (Unanswered)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">
                      Caller: (217) 555-0143 • Unanswered after 4 rings
                    </div>
                  </div>

                  {/* Auto-SMS 1 */}
                  <div className="flex flex-col items-end">
                    <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-blue-600 p-3 text-white shadow-sm leading-snug">
                      Hi, this is Apex Plumbing. Sorry we missed your call! What can we help you with today?
                    </div>
                    <span className="mt-1 text-[10px] text-slate-400">Auto-sent • 2:14 PM (42s later)</span>
                  </div>

                  {/* Customer Response 1 */}
                  <div className="flex flex-col items-start">
                    <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-slate-800 p-3 text-slate-100 leading-snug">
                      Water heater is leaking in the basement, need someone today if possible
                    </div>
                    <span className="mt-1 text-[10px] text-slate-400">Customer • 2:15 PM</span>
                  </div>

                  {/* Auto-SMS 2 */}
                  <div className="flex flex-col items-end">
                    <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-blue-600 p-3 text-white shadow-sm leading-snug">
                      We can help with that. Is water actively leaking right now? And what&apos;s your address?
                    </div>
                    <span className="mt-1 text-[10px] text-slate-400">Auto-sent • 2:15 PM</span>
                  </div>

                  {/* Customer Response 2 */}
                  <div className="flex flex-col items-start">
                    <div className="max-w-[88%] rounded-2xl rounded-tl-sm bg-slate-800 p-3 text-slate-100 leading-snug">
                      Yes, shut off the valve but there&apos;s standing water. 742 Evergreen Terrace
                    </div>
                    <span className="mt-1 text-[10px] text-slate-400">Customer • 2:16 PM</span>
                  </div>

                  {/* Auto-SMS 3 */}
                  <div className="flex flex-col items-end">
                    <div className="max-w-[88%] rounded-2xl rounded-tr-sm bg-blue-600 p-3 text-white shadow-sm leading-snug">
                      Got it. Our tech Mike will call you in 5 minutes to confirm ETA.
                    </div>
                    <span className="mt-1 text-[10px] text-slate-400">Auto-sent • 2:16 PM</span>
                  </div>

                  {/* Resulting Qualified Job Card */}
                  <div className="rounded-xl border border-emerald-500/50 bg-emerald-950/40 p-3 text-emerald-200 mt-2">
                    <div className="flex items-center justify-between font-bold text-emerald-400 text-xs">
                      <span className="flex items-center gap-1.5 uppercase tracking-wide">
                        <CheckCircle className="h-4 w-4" /> NEW RECOVERED JOB
                      </span>
                      <span className="font-mono text-sm font-extrabold text-emerald-300">$450–$800 Est.</span>
                    </div>
                    <div className="mt-1.5 space-y-0.5 text-[11px] text-slate-200">
                      <div className="font-semibold text-white">Water Heater Leak — Emergency</div>
                      <div className="flex items-center gap-1 text-slate-400">
                        <MapPin className="h-3 w-3 text-slate-400" /> 742 Evergreen Terrace
                      </div>
                    </div>
                    <div className="mt-2.5 flex items-center justify-between border-t border-emerald-800/40 pt-2 text-[10px]">
                      <span className="rounded bg-red-900/60 px-2 py-0.5 font-bold text-red-200 uppercase">
                        Emergency
                      </span>
                      <span className="font-semibold text-emerald-300">
                        Pushed to Tech Mike&apos;s Cell
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- SECTION 24: THREE CORE VALUE PROPOSITIONS ---------------- */}
      <section id="propositions" className="border-t border-slate-100 bg-slate-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Why Home Service Businesses Choose MCR
            </h2>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Built for How Contractors Actually Work
            </p>
            <p className="mt-4 text-base text-slate-600">
              When a customer has a broken furnace, a burst pipe, or a stuck garage door, they don&apos;t wait around.
              MCR keeps them from calling the next company on Google.
            </p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            {/* Value Prop 1 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-bold text-slate-900">
                1. NEVER MISS THE OPPORTUNITY
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Follow up while they&apos;re still looking for a contractor, not hours later when they&apos;ve already hired someone else.
                An automated SMS arrives automatically after a missed call.
              </p>
            </div>

            {/* Value Prop 2 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <Wrench className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-bold text-slate-900">
                2. QUALIFY THE JOB
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Gather emergency status, service address, and issue description before you call back.
                Know whether it&apos;s a \$1,200 replacement or a \$150 repair before picking up the phone.
              </p>
            </div>

            {/* Value Prop 3 */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-bold text-slate-900">
                3. SEE YOUR RECOVERED REVENUE
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Know exactly how many jobs and how many dollars came from recovered calls.
                Separate actual confirmed revenue from pipeline estimates with transparent monthly ROI reports.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- THE PROBLEM IN NUMBERS ---------------- */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-red-600">The Hard Truth</h2>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              When You Don&apos;t Answer, They Call Your Competitor in 30 Seconds.
            </p>
            <p className="mt-4 text-base text-slate-600">
              Solo operators and field technicians simply cannot answer while driving, under a sink, or after-hours.
              Voicemail doesn&apos;t cut it anymore — homeowners rarely leave voicemails.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">62% of Calls Go Unanswered</h3>
              <p className="mt-2 text-sm text-slate-600">
                Trade contractors miss over half of all inbound calls due to being on job sites or driving between appointments.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">80% Hang Up on Voicemail</h3>
              <p className="mt-2 text-sm text-slate-600">
                Homeowners with emergency issues will not wait for a callback tomorrow morning. They dial the next Google listing.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <DollarSign className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">$3,000+ Lost Every Month</h3>
              <p className="mt-2 text-sm text-slate-600">
                Missing just 4 or 5 service calls per month bleeds \$30,000+ to \$50,000 in lost revenue every single year.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- HOW IT WORKS (SECTION 24 WORKFLOW) ---------------- */}
      <section id="how-it-works" className="border-t border-slate-100 bg-slate-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600">Simple &amp; Reliable</h2>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              How MCR Recovers Your Lost Revenue
            </p>
            <p className="mt-4 text-base text-slate-600">
              No complicated apps for your callers. No changing your existing phone number. Everything runs in the background.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-4">
            <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                1
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Phone Rings Normally</h3>
              <p className="mt-2 text-sm text-slate-600">
                A customer calls your current business number. If you are free, answer as normal. Nothing changes.
              </p>
            </div>

            <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                2
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Conditional Forwarding</h3>
              <p className="mt-2 text-sm text-slate-600">
                If you are busy or can&apos;t answer after 4 rings, your carrier rolls the call over to your dedicated MCR number.
              </p>
            </div>

            <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                3
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Instant Text-Back &amp; Intake</h3>
              <p className="mt-2 text-sm text-slate-600">
                Within seconds, MCR automatically texts the caller asking what they need, gathering emergency status and job location.
              </p>
            </div>

            <div className="relative rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
                4
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Job Card &amp; Owner Alert</h3>
              <p className="mt-2 text-sm text-slate-600">
                A qualified job card lands in your dashboard and sends an instant alert to your cell with one-tap calling.
              </p>
            </div>
          </div>

          {/* Section 19: Full 7-Step Recovery Workflow */}
          <div className="mt-14 rounded-2xl border border-slate-200 bg-white p-6 sm:p-8 shadow-sm">
            <h3 className="text-center text-xs font-bold uppercase tracking-wider text-slate-500">
              Complete End-to-End Recovery Sequence
            </h3>
            <div className="mt-6 flex flex-wrap items-center justify-center gap-2 text-xs font-bold text-slate-800">
              <span className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-slate-900 shadow-sm">
                1. MISSED CALL
              </span>
              <span className="text-blue-500 font-extrabold text-sm">→</span>
              <span className="rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-blue-900 shadow-sm">
                2. AUTOMATIC TEXT
              </span>
              <span className="text-blue-500 font-extrabold text-sm">→</span>
              <span className="rounded-xl border border-indigo-200 bg-indigo-50 px-3 py-2 text-indigo-900 shadow-sm">
                3. CUSTOMER RESPONDS
              </span>
              <span className="text-blue-500 font-extrabold text-sm">→</span>
              <span className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-amber-900 shadow-sm">
                4. JOB QUALIFIED
              </span>
              <span className="text-blue-500 font-extrabold text-sm">→</span>
              <span className="rounded-xl border border-purple-200 bg-purple-50 px-3 py-2 text-purple-900 shadow-sm">
                5. OWNER NOTIFIED
              </span>
              <span className="text-blue-500 font-extrabold text-sm">→</span>
              <span className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-emerald-900 shadow-sm">
                6. JOB BOOKED
              </span>
              <span className="text-blue-500 font-extrabold text-sm">→</span>
              <span className="rounded-xl border border-emerald-300 bg-emerald-100 px-3 py-2 text-emerald-950 shadow-sm">
                7. REVENUE TRACKED
              </span>
            </div>

            {/* Section 19: Economic Explanation (WITHOUT MCR vs WITH MCR) */}
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              <div className="rounded-xl border border-red-200 bg-red-50/60 p-5">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wide text-red-700">
                  <span className="flex h-2 w-2 rounded-full bg-red-600"></span>
                  WITHOUT MCR
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">
                  Missed Call → Unanswered Voicemail → Lost to Competitor
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Customer hangs up within 10 seconds and dials the next Google result. You lose $350–$1,200 in gross margin.
                </p>
              </div>

              <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-5">
                <div className="flex items-center gap-2 font-bold text-xs uppercase tracking-wide text-emerald-700">
                  <span className="flex h-2 w-2 rounded-full bg-emerald-600"></span>
                  WITH MCR
                </div>
                <p className="mt-2 text-sm font-semibold text-slate-800">
                  Missed Call → Recovery Conversation → Qualified Lead → Booked Job
                </p>
                <p className="mt-1 text-xs text-slate-600">
                  Instant text engages the customer immediately, gathers emergency details &amp; address, and secures the dispatch.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- INTERACTIVE ROI CALCULATOR (SECTION 33) ---------------- */}
      <section id="calculator" className="border-t border-slate-100 bg-slate-900 py-16 text-white sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
                <TrendingUp className="h-3.5 w-3.5" /> SECTION 33: ROI CALCULATOR
              </div>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
                See How Much Revenue You Could Recover Each Month
              </h2>
              <p className="mt-3 text-slate-400">
                Adjust the sliders based on your business numbers. Recovering even a single job pays for an entire year of MCR.
              </p>

              <div className="mt-8 space-y-6">
                <div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>Average Value Per Job:</span>
                    <span className="font-bold text-blue-400">${avgJobValue}</span>
                  </div>
                  <input
                    type="range"
                    min="150"
                    max="3000"
                    step="50"
                    value={avgJobValue}
                    onChange={(e) => setAvgJobValue(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>$150 (Basic service)</span>
                    <span>$650 (Trade average)</span>
                    <span>$3,000+ (Install/Replacement)</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>Estimated Missed Calls Per Month:</span>
                    <span className="font-bold text-blue-400">{missedCallsPerMonth} calls</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="150"
                    step="5"
                    value={missedCallsPerMonth}
                    onChange={(e) => setMissedCallsPerMonth(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>5 calls/mo</span>
                    <span>35 calls/mo</span>
                    <span>150 calls/mo</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>Estimated Close Rate on Recovered Calls:</span>
                    <span className="font-bold text-blue-400">{recoveryRate}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="60"
                    step="5"
                    value={recoveryRate}
                    onChange={(e) => setRecoveryRate(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>10% (Conservative)</span>
                    <span>25% (Typical)</span>
                    <span>60% (High response)</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="lg:col-span-6">
              <div className="rounded-3xl border border-slate-800 bg-slate-950 p-8 shadow-2xl">
                <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                  Estimated Monthly Recovery
                </div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-5xl font-extrabold text-emerald-400">
                    ${potentialRecoveredRevenue.toLocaleString()}
                  </span>
                  <span className="text-slate-400">/ month</span>
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  Estimated revenue from ~<strong>{potentialRecoveredJobs} booked jobs</strong> that would have otherwise gone to a competitor.
                </p>

                <div className="mt-6 border-t border-slate-800 pt-6 space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">MCR Pro Subscription:</span>
                    <span className="font-semibold text-slate-200">${mcrSubscription}/mo</span>
                  </div>
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">Return on Investment Multiple:</span>
                    <span className="font-bold text-emerald-400">{roiMultiplier}x ROI</span>
                  </div>
                </div>

                {/* Section 33 Exact Disclaimer */}
                <div className="mt-6 rounded-xl bg-slate-900 p-3 text-[11px] text-slate-400 border border-slate-800">
                  <p className="italic">
                    *Illustrative estimate — actual results vary based on response rate and market.
                  </p>
                </div>

                <div className="mt-6">
                  <Link
                    href="/onboarding"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-bold text-white shadow-lg hover:bg-blue-700 transition"
                  >
                    START RECOVERING MISSED CALLS <ArrowRight className="h-5 w-5" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- PRICING ---------------- */}
      <section id="pricing" className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600">Transparent Pricing</h2>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Simple Plans That Pay for Themselves
            </p>
            <p className="mt-4 text-base text-slate-600">
              No long-term contracts. 14-day free trial. Cancel anytime with one click.
            </p>
          </div>

          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {/* Starter */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Starter</h3>
              <p className="mt-1 text-sm text-slate-500">Perfect for solo owner-operators.</p>
              <div className="mt-4 flex items-baseline">
                <span className="text-4xl font-extrabold text-slate-900">$49</span>
                <span className="ml-1 text-sm text-slate-500">/ month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Up to 50 missed calls / mo
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Automated instant text-back
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Basic qualification intake
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> 1 dedicated business number
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Mobile browser dashboard
                </li>
              </ul>
              <Link
                href="/onboarding"
                className="mt-8 block w-full rounded-xl border border-slate-300 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Start Free Trial
              </Link>
            </div>

            {/* Pro (Highlighted) */}
            <div className="relative rounded-2xl border-2 border-blue-600 bg-white p-8 shadow-lg">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-0.5 text-xs font-semibold uppercase tracking-wider text-white">
                Most Popular
              </div>
              <h3 className="text-lg font-bold text-slate-900">Pro</h3>
              <p className="mt-1 text-sm text-slate-500">Ideal for growing trade companies.</p>
              <div className="mt-4 flex items-baseline">
                <span className="text-4xl font-extrabold text-slate-900">$149</span>
                <span className="ml-1 text-sm text-slate-500">/ month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-slate-600">
                <li className="flex items-center gap-2 font-medium text-slate-900">
                  <CheckCircle className="h-4 w-4 text-blue-600" /> Up to 200 missed calls / mo
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" /> Custom trade intake questions
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" /> Emergency keyword alert escalation
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" /> Custom canned SMS replies
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" /> Daily 6 PM &amp; Weekly reports
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" /> A2P 10DLC registration included
                </li>
              </ul>
              <Link
                href="/onboarding"
                className="mt-8 block w-full rounded-xl bg-blue-600 py-3 text-center text-sm font-bold text-white shadow-md hover:bg-blue-700 transition"
              >
                Start 14-Day Free Trial
              </Link>
            </div>

            {/* Business */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Business</h3>
              <p className="mt-1 text-sm text-slate-500">For multi-truck fleets &amp; busy dispatch.</p>
              <div className="mt-4 flex items-baseline">
                <span className="text-4xl font-extrabold text-slate-900">$299</span>
                <span className="ml-1 text-sm text-slate-500">/ month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Up to 600 missed calls / mo
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Multiple phone numbers &amp; rollover
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Up to 15 team dispatch members
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> CRM &amp; Zapier Webhooks
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Dedicated onboarding support
                </li>
              </ul>
              <Link
                href="/onboarding"
                className="mt-8 block w-full rounded-xl border border-slate-300 py-3 text-center text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                Contact Sales
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- FOOTER ---------------- */}
      <footer className="border-t border-slate-200 bg-slate-50 py-12 text-xs text-slate-500">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 sm:flex-row sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">MCR</span>
            <span>© 2026 Missed Call Recovery Inc. All rights reserved.</span>
          </div>
          <div className="flex gap-6">
            <Link href="/dashboard" className="hover:text-slate-900">Demo Dashboard</Link>
            <Link href="/dashboard/settings" className="hover:text-slate-900">Settings</Link>
            <Link href="/terms" className="hover:text-slate-900">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-slate-900">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
