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
  Building,
  Phone,
  HelpCircle,
  Sliders,
  Award,
} from 'lucide-react';
import { COMPANY_INFO, PLAN_CONFIG, DEFAULT_GROSS_MARGIN } from '@/lib/constants';
import { getDerivedComplianceClaim } from '@/lib/marketing-claims';

export default function LandingPage() {
  const claim = getDerivedComplianceClaim(false);
  // Tier-Aware Conservative ROI Calculator State (Part 1.5)
  // Conservative defaults: 20 missed calls/month, $450 average ticket, 15% close rate
  const [avgJobValue, setAvgJobValue] = useState<number>(450);
  const [missedCallsPerMonth, setMissedCallsPerMonth] = useState<number>(20);
  const [recoveryRate, setRecoveryRate] = useState<number>(15);
  const [selectedPlan, setSelectedPlan] = useState<'starter' | 'pro' | 'business'>('starter');
  const [grossMarginPercent, setGrossMarginPercent] = useState<number>(40);

  const potentialRecoveredJobs = Math.max(1, Math.round((missedCallsPerMonth * recoveryRate) / 100));
  const potentialRecoveredRevenue = potentialRecoveredJobs * avgJobValue;
  const potentialGrossProfit = Math.round(potentialRecoveredRevenue * (grossMarginPercent / 100));

  const planCost =
    selectedPlan === 'starter'
      ? PLAN_CONFIG.starter.monthlyPrice
      : selectedPlan === 'pro'
      ? PLAN_CONFIG.pro.monthlyPrice
      : PLAN_CONFIG.business.monthlyPrice;

  const planName =
    selectedPlan === 'starter'
      ? 'Starter ($79/mo)'
      : selectedPlan === 'pro'
      ? 'Pro ($149/mo)'
      : 'Business ($299/mo)';

  // Break-even metrics: how many months of software does one recovered job cover?
  const singleJobRevenue = avgJobValue;
  const singleJobProfit = avgJobValue * (grossMarginPercent / 100);
  const monthsCoveredRevenueStarter = (singleJobRevenue / 79).toFixed(1);
  const monthsCoveredRevenuePro = (singleJobRevenue / 149).toFixed(1);
  const monthsCoveredProfitStarter = (singleJobProfit / 79).toFixed(1);

  // Multiple on software cost (never call it ROI or Profit)
  const softwareCostMultiple = (potentialRecoveredRevenue / planCost).toFixed(1);
  const marginMultiple = (potentialGrossProfit / planCost).toFixed(1);

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
    <div className="flex min-h-screen flex-col bg-white text-slate-800">
      {/* ---------------- TOP TRUST BANNER ---------------- */}
      <div className="bg-slate-900 px-4 py-2.5 text-center text-xs font-medium text-slate-300 sm:px-6">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-center gap-x-4 gap-y-1">
          <span className="inline-flex items-center gap-1.5 text-emerald-400 font-bold">
            <span className="flex h-2 w-2 rounded-full bg-emerald-400 animate-pulse"></span>
            Live Carrier Forwarding
          </span>
          <span>Works with Verizon, AT&amp;T, T-Mobile • 10-minute carrier forwarding setup</span>
          <span className="text-slate-500 hidden md:inline">|</span>
          <span className="text-slate-400 hidden md:inline">
            {claim.topBannerText}
          </span>
        </div>
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
                Missed Call Revenue Recovery
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-semibold text-slate-600 md:flex">
            <a href="#propositions" className="hover:text-blue-600 transition">Why MCR</a>
            <a href="#how-it-works" className="hover:text-blue-600 transition">How It Works</a>
            <a href="#case-study" className="hover:text-blue-600 transition">Pilot Case Study</a>
            <a href="#calculator" className="hover:text-blue-600 transition">Economics Calculator</a>
            <a href="#pricing" className="hover:text-blue-600 transition">Pricing</a>
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
              Start 14-Day Test <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------- HERO SECTION ---------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/60 via-white to-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              {/* Target Trades & Compliance Badge */}
              <Link
                href="/compliance"
                className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50/80 px-3.5 py-1 text-xs font-semibold text-blue-700 hover:bg-blue-100 hover:border-blue-300 transition group"
              >
                <span className="flex h-2 w-2 rounded-full bg-blue-600"></span>
                <span>{claim.heroBadgeTitle}</span>
                <span className="text-blue-300">•</span>
                <span>Built for Trade &amp; Home Service Businesses</span>
                <ArrowRight className="h-3 w-3 text-blue-500 group-hover:translate-x-0.5 transition" />
              </Link>

              {/* Headline */}
              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                TURN MISSED CALLS INTO <span className="text-blue-600">CONFIRMED JOBS.</span>
              </h1>

              {/* Subheadline */}
              <p className="mt-6 text-lg leading-relaxed text-slate-600 sm:text-xl">
                When you can&apos;t answer the phone, MCR automatically follows up with the caller within seconds,
                collects emergency status and job location via SMS, and pushes qualified job cards directly to your dashboard.
              </p>

              {/* Target Trades Pill List */}
              <div className="mt-6 flex flex-wrap gap-2">
                {targetTrades.map((trade) => (
                  <span
                    key={trade}
                    className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-700"
                  >
                    {trade}
                  </span>
                ))}
              </div>

              {/* Hero CTAs + Interactive Phone Test (Part 2.4) */}
              <div className="mt-8 flex flex-col gap-4 sm:flex-row sm:items-center">
                <Link
                  href="/onboarding"
                  className="flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-bold text-white shadow-md hover:bg-blue-700 transition"
                >
                  Start 14-Day Free Tracking Test <ArrowRight className="h-5 w-5" />
                </Link>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-2 text-xs text-slate-500">
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Keep your existing cell phone &amp; number
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Carrier-grade Twilio infrastructure
                </span>
                <span className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> TCPA quiet hours built-in
                </span>
              </div>
            </div>

            {/* Live SMS Interaction Visual */}
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-sm rounded-[2.5rem] border-8 border-slate-900 bg-slate-900 p-4 shadow-2xl">
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-4 w-32 rounded-b-xl bg-slate-900 z-20"></div>

                <div className="rounded-[1.75rem] bg-slate-950 p-4 pt-6 text-white space-y-3 font-sans">
                  {/* SMS Header */}
                  <div className="border-b border-slate-800 pb-3 text-center">
                    <div className="text-[10px] text-slate-400 uppercase tracking-wider">SMS Conversation</div>
                    <div className="font-bold text-sm text-slate-200">Apex Plumbing &amp; Rooter</div>
                    <div className="text-[10px] text-emerald-400 font-mono">Auto Text-Back: Dispatched in 8s</div>
                  </div>

                  {/* Messages Flow */}
                  <div className="space-y-2.5 text-xs pt-1">
                    <div className="rounded-2xl rounded-tl-sm bg-slate-800 p-3 text-slate-200 max-w-[88%] border border-slate-700">
                      Apex Plumbing &amp; Rooter — sorry we missed your call! Are you contacting us about a plumbing emergency?
                    </div>

                    <div className="ml-auto rounded-2xl rounded-tr-sm bg-blue-600 p-3 text-white max-w-[88%] font-medium">
                      YES EMERGENCY! Sump pump died and rain water is rising in the basement!
                    </div>

                    <div className="rounded-2xl rounded-tl-sm bg-slate-800 p-3 text-slate-200 max-w-[88%] border border-slate-700">
                      Understood, prioritizing this right now. What is your service address?
                    </div>

                    <div className="ml-auto rounded-2xl rounded-tr-sm bg-blue-600 p-3 text-white max-w-[88%] font-medium">
                      910 Maple Ave here in Springfield. Please hurry!
                    </div>

                    <div className="rounded-2xl rounded-tl-sm bg-emerald-900/60 p-3 text-emerald-200 max-w-[88%] border border-emerald-700/60">
                      ✓ Qualified Lead Generated ($850 est.) • On-call technician Mike alerted
                    </div>
                  </div>

                  {/* Push Notification Card */}
                  <div className="rounded-xl bg-slate-800/90 p-3 border border-slate-700 text-xs mt-3">
                    <div className="flex items-center justify-between text-[10px] text-slate-400">
                      <span className="font-bold text-blue-400">MCR ALERT • NOW</span>
                      <Flame className="h-3.5 w-3.5 text-red-500" />
                    </div>
                    <div className="font-bold text-white mt-1">🚨 Marcus Vance — Sump Pump Failure</div>
                    <div className="text-slate-300 text-[11px] mt-0.5">910 Maple Ave • One-Tap Call Customer</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- THREE CORE VALUE PROPOSITIONS ---------------- */}
      <section id="propositions" className="border-t border-slate-100 bg-slate-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600">
              Why Home Service Contractors Choose MCR
            </h2>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Built for How Field Trades Actually Operate
            </p>
            <p className="mt-4 text-base text-slate-600">
              When a homeowner has a burst pipe, a broken furnace, or a stuck garage door, they don&apos;t wait for voicemail.
              MCR engages them instantly before they dial the next contractor on Google.
            </p>
          </div>

          <div className="mt-12 grid gap-8 md:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <Zap className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-bold text-slate-900">
                1. NEVER MISS THE OPPORTUNITY
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Follow up while they&apos;re still looking for a contractor, not hours later when they&apos;ve already hired someone else.
                An automated SMS arrives within 8 to 30 seconds of any missed call.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-100 text-indigo-600">
                <Wrench className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-bold text-slate-900">
                2. QUALIFY THE JOB BEFORE YOU CALL
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Gather emergency status, service address, and issue description before you pick up the phone.
                Know whether it&apos;s a $1,200 replacement or a $150 minor fix before returning the call.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm hover:shadow-md transition">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-100 text-emerald-600">
                <TrendingUp className="h-6 w-6" />
              </div>
              <h3 className="mt-5 text-lg font-bold text-slate-900">
                3. TRANSPARENT REVENUE ACCOUNTING
              </h3>
              <p className="mt-3 text-sm leading-relaxed text-slate-600">
                Strictly separates confirmed completed revenue from active in-pipeline estimates.
                Every recovered job links directly back to the original missed call record.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- MEASURE YOUR OWN MISS RATE (PART 2.3) ---------------- */}
      <section className="py-16 sm:py-20 border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="rounded-3xl border border-blue-200 bg-gradient-to-br from-blue-50/70 via-white to-slate-50 p-8 sm:p-12 shadow-sm">
            <div className="max-w-3xl">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-100 px-3 py-1 text-xs font-bold text-blue-800 mb-3">
                <PhoneMissed className="h-3.5 w-3.5" /> Honest Call Tracking Offer
              </div>
              <h2 className="text-2xl sm:text-3xl font-extrabold text-slate-900">
                Don&apos;t Guess Your Missed-Call Count. Measure It for Free.
              </h2>
              <p className="mt-4 text-base text-slate-700 leading-relaxed">
                Most trade businesses miss <strong>15% to 30% of incoming calls</strong> during peak job hours, noisy installs, or driving between sites.
                We don&apos;t make up inflated industry statistics. Run our <strong>14-day tracking test</strong> with zero obligation: forward your unanswered calls to MCR, see your exact missed-call volume, and decide with real data in your hands.
              </p>

              <div className="mt-6 flex flex-wrap gap-4 pt-2">
                <Link
                  href="/onboarding"
                  className="rounded-xl bg-blue-600 px-5 py-3 text-sm font-bold text-white hover:bg-blue-700 shadow-sm transition"
                >
                  Start 14-Day Free Tracking Test
                </Link>
                <Link
                  href="/dashboard"
                  className="rounded-xl border border-slate-300 bg-white px-5 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition"
                >
                  Explore Demo Records First
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- PILOT CASE STUDY & TRUST (PART 2.4 / ROUND 2) ---------------- */}
      <section id="case-study" className="py-16 sm:py-24 border-t border-slate-100 bg-slate-50">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">Pilot Results</span>
            <h2 className="mt-2 text-3xl font-extrabold text-slate-900 sm:text-4xl">
              Pilot results — coming soon
            </h2>
            <p className="mt-4 text-base text-slate-600 leading-relaxed">
              We&apos;re running our first pilots now. When a real contractor has a real month of numbers, we&apos;ll publish them here, including the ones that look bad.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section id="how-it-works" className="py-16 sm:py-24 border-t border-slate-200/80 bg-white">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600">Seamless Integration</h2>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              How MCR Recovers Your Lost Revenue
            </p>
            <p className="mt-4 text-base text-slate-600">
              No complicated apps for your callers. No replacing your existing business phone number. Everything runs automatically in the background.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-4">
            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                1
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Phone Rings Normally</h3>
              <p className="mt-2 text-sm text-slate-600">
                A customer calls your current business number. If you are free, answer as normal. Nothing changes.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                2
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Carrier Conditional Roll</h3>
              <p className="mt-2 text-sm text-slate-600">
                If you are busy or can&apos;t answer after 4 rings, your carrier rolls the call over to your dedicated MCR line.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                3
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Instant Text-Back &amp; Intake</h3>
              <p className="mt-2 text-sm text-slate-600">
                Within 8–30 seconds, MCR texts the caller asking what they need, collecting emergency status and job location.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-slate-50 p-6 shadow-sm">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
                4
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Job Card &amp; Owner Alert</h3>
              <p className="mt-2 text-sm text-slate-600">
                A qualified job card lands in your dashboard and sends an instant SMS alert to your cell with one-tap calling.
              </p>
            </div>
          </div>

          {/* Onboarding vs 10DLC Timeline Clarification (Part 2.1) */}
          <div className="mt-12 rounded-2xl border border-slate-200 bg-slate-50 p-6 text-xs text-slate-600 space-y-2">
            <div className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Clock className="h-4 w-4 text-blue-600" />
              <span>10-Minute Setup vs. A2P 10DLC Carrier Approval:</span>
            </div>
            <p className="leading-relaxed">
              &ldquo;10-minute setup&rdquo; refers strictly to creating your account, dialing your carrier forwarding code (*71 on Verizon, *004* on AT&amp;T, **61* on T-Mobile) on your cell phone, and verifying your first test call. Brand registration takes minutes to 3 days. Campaign approval, which is what actually gates your texting, runs 3 days to 4 weeks and includes a $15 non-refundable vetting fee. Sole proprietors without an EIN move fastest. If you need calls covered before carrier approval clears, voice alerts remain fully active while text-back registration finishes vetting.
            </p>
          </div>
        </div>
      </section>

      {/* ---------------- TIER-AWARE CONSERVATIVE ECONOMICS CALCULATOR (PART 1.5) ---------------- */}
      <section id="calculator" className="border-t border-slate-100 bg-slate-900 py-16 text-white sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6 space-y-6">
              <div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/20 px-3 py-1 text-xs font-semibold text-blue-400">
                  <TrendingUp className="h-3.5 w-3.5" /> Conservative Economics Calculator
                </div>
                <h2 className="mt-3 text-3xl font-extrabold tracking-tight sm:text-4xl">
                  Measure Your Software Break-Even Point
                </h2>
                <p className="mt-3 text-slate-400 text-sm leading-relaxed">
                  We use conservative estimates: <strong>20 missed calls</strong>, <strong>$450 average ticket</strong>, and a realistic <strong>15% recovery rate</strong>. Notice how quickly even one recovered job pays for months of software.
                </p>
              </div>

              {/* Sliders */}
              <div className="space-y-5 bg-slate-950/60 p-6 rounded-2xl border border-slate-800">
                {/* Average Ticket */}
                <div>
                  <div className="flex justify-between text-xs font-medium">
                    <span>Average Value Per Job:</span>
                    <span className="font-bold text-blue-400 font-mono text-sm">${avgJobValue}</span>
                  </div>
                  <input
                    type="range"
                    min="150"
                    max="2500"
                    step="50"
                    value={avgJobValue}
                    onChange={(e) => setAvgJobValue(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>$150 (Basic service)</span>
                    <span>$450 (Conservative trade avg)</span>
                    <span>$2,500+ (Installation)</span>
                  </div>
                </div>

                {/* Missed Calls */}
                <div>
                  <div className="flex justify-between text-xs font-medium">
                    <span>Estimated Missed Calls Per Month:</span>
                    <span className="font-bold text-blue-400 font-mono text-sm">{missedCallsPerMonth} calls/mo</span>
                  </div>
                  <input
                    type="range"
                    min="5"
                    max="100"
                    step="5"
                    value={missedCallsPerMonth}
                    onChange={(e) => setMissedCallsPerMonth(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>5 calls/mo</span>
                    <span>20 calls/mo (Default)</span>
                    <span>100 calls/mo</span>
                  </div>
                </div>

                {/* Close Rate */}
                <div>
                  <div className="flex justify-between text-xs font-medium">
                    <span>Estimated Close Rate on Recovered Calls:</span>
                    <span className="font-bold text-blue-400 font-mono text-sm">{recoveryRate}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="40"
                    step="5"
                    value={recoveryRate}
                    onChange={(e) => setRecoveryRate(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>10% (Low)</span>
                    <span>15% (Conservative default)</span>
                    <span>40% (High response)</span>
                  </div>
                </div>

                {/* Gross Margin Toggle (Part 1.5) */}
                <div className="border-t border-slate-800 pt-4">
                  <div className="flex justify-between text-xs font-medium">
                    <span>Your Estimated Gross Margin:</span>
                    <span className="font-bold text-emerald-400 font-mono text-sm">{grossMarginPercent}%</span>
                  </div>
                  <input
                    type="range"
                    min="20"
                    max="70"
                    step="5"
                    value={grossMarginPercent}
                    onChange={(e) => setGrossMarginPercent(Number(e.target.value))}
                    className="mt-2 w-full accent-emerald-500"
                  />
                  <div className="flex justify-between text-[10px] text-slate-500">
                    <span>20% (High materials)</span>
                    <span>40% (Standard trade default)</span>
                    <span>70% (Service / Labor heavy)</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Results Card */}
            <div className="lg:col-span-6">
              <div className="rounded-3xl border border-slate-800 bg-slate-950 p-8 shadow-2xl space-y-6">
                <div>
                  <div className="text-xs uppercase tracking-wider text-slate-400 font-semibold">
                    Conservative Monthly Revenue Recovery
                  </div>
                  <div className="mt-3 flex items-baseline gap-2">
                    <span className="text-5xl font-extrabold text-emerald-400">
                      ${potentialRecoveredRevenue.toLocaleString()}
                    </span>
                    <span className="text-slate-400 text-sm">/ month</span>
                  </div>
                  <p className="mt-2 text-xs text-slate-300">
                    Estimated gross revenue from ~<strong>{potentialRecoveredJobs} recovered jobs</strong> ({missedCallsPerMonth} calls × {recoveryRate}% close).
                  </p>
                </div>

                {/* Plan Selection Buttons */}
                <div className="border-t border-slate-800 pt-4">
                  <label className="block text-xs text-slate-400 font-medium mb-2">Compare Against MCR Tier:</label>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    <button
                      type="button"
                      onClick={() => setSelectedPlan('starter')}
                      className={`rounded-xl p-2.5 font-bold transition text-center ${
                        selectedPlan === 'starter' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      Starter ($79)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPlan('pro')}
                      className={`rounded-xl p-2.5 font-bold transition text-center ${
                        selectedPlan === 'pro' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      Pro ($149)
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedPlan('business')}
                      className={`rounded-xl p-2.5 font-bold transition text-center ${
                        selectedPlan === 'business' ? 'bg-blue-600 text-white' : 'bg-slate-900 text-slate-400 hover:text-white'
                      }`}
                    >
                      Business ($299)
                    </button>
                  </div>
                </div>

                {/* Break-Even Math Breakdown (Part 1.5) */}
                <div className="rounded-2xl bg-slate-900 p-4 border border-slate-800 space-y-2.5 text-xs">
                  <div className="font-bold text-slate-200">Break-Even Analysis:</div>
                  <div className="text-slate-300 leading-relaxed">
                    👉 <strong>One recovered job at ${avgJobValue}</strong> covers{' '}
                    <span className="text-emerald-400 font-bold">{monthsCoveredRevenueStarter} months</span> of Starter ($79/mo) or{' '}
                    <span className="text-emerald-400 font-bold">{monthsCoveredRevenuePro} months</span> of Pro ($149/mo).
                  </div>
                  <div className="text-slate-400 border-t border-slate-800 pt-2 text-[11px] leading-relaxed">
                    👉 At an estimated <strong>{grossMarginPercent}% gross margin</strong>, one job recovers <strong>${singleJobProfit.toFixed(0)} gross profit</strong> — covering{' '}
                    <span className="text-white font-semibold">{monthsCoveredProfitStarter} months</span> of Starter.
                  </div>
                </div>

                {/* Multiple on Software Cost (Relabeled, Never ROI or Profit) */}
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="rounded-xl bg-slate-900 p-3 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">Gross Revenue Multiple:</span>
                    <strong className="text-lg font-black text-emerald-400">{softwareCostMultiple}×</strong>
                    <span className="text-[10px] text-slate-500 block mt-0.5">on {planName}</span>
                  </div>
                  <div className="rounded-xl bg-slate-900 p-3 border border-slate-800">
                    <span className="text-slate-400 block text-[10px]">At {grossMarginPercent}% Margin:</span>
                    <strong className="text-lg font-black text-emerald-400">{marginMultiple}×</strong>
                    <span className="text-[10px] text-slate-500 block mt-0.5">software cost multiple</span>
                  </div>
                </div>

                <div>
                  <Link
                    href="/onboarding"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-sm font-bold text-white shadow-lg hover:bg-blue-700 transition"
                  >
                    START 14-DAY RECOVERY TEST <ArrowRight className="h-4 w-4" />
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- PRICING (PARTS 3.5, 3.6, 3.7) ---------------- */}
      <section id="pricing" className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600">Transparent Pricing</h2>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              Simple Plans With Soft Cap Protection
            </p>
            <p className="mt-4 text-base text-slate-600">
              No long-term contracts. 14-day tracking test. Text-backs never halt mid-emergency when you hit your cap.
            </p>
          </div>

          <div className="mt-16 grid gap-8 lg:grid-cols-3">
            {/* Starter (Repriced to $79/40 calls - Part 3.7) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Starter</h3>
                <p className="mt-1 text-xs text-slate-500">Perfect for solo owner-operators.</p>
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold text-slate-900">$79</span>
                  <span className="ml-1 text-xs text-slate-500">/ month</span>
                </div>
                <div className="mt-2 text-xs font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-md inline-block">
                  One $450 job covers 5.7 months
                </div>

                <ul className="mt-6 space-y-3 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> Up to 40 missed calls / mo
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> Soft cap: $0.35/overage call (never drops leads)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> Automated instant text-back (&lt;60s)
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> Basic qualification intake
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> 1 business forwarding number
                  </li>
                </ul>
              </div>

              <Link
                href="/onboarding"
                className="mt-8 block w-full rounded-xl border border-slate-300 py-3 text-center text-xs font-bold text-slate-700 hover:bg-slate-50 transition"
              >
                Start 14-Day Free Test
              </Link>
            </div>

            {/* Pro (Highlighted) */}
            <div className="relative rounded-2xl border-2 border-blue-600 bg-white p-8 shadow-lg flex flex-col justify-between">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-blue-600 px-3 py-0.5 text-[10px] font-bold uppercase tracking-wider text-white">
                Most Popular
              </div>
              <div>
                <h3 className="text-lg font-bold text-slate-900">Pro</h3>
                <p className="mt-1 text-xs text-slate-500">Ideal for growing trade companies.</p>
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold text-slate-900">$149</span>
                  <span className="ml-1 text-xs text-slate-500">/ month</span>
                </div>
                <div className="mt-2 text-xs font-semibold text-blue-700 bg-blue-50 px-2.5 py-1 rounded-md inline-block">
                  One $450 job covers 3.0 months
                </div>

                <ul className="mt-6 space-y-3 text-xs text-slate-600">
                  <li className="flex items-center gap-2 font-semibold text-slate-900">
                    <CheckCircle className="h-4 w-4 text-blue-600 shrink-0" /> Up to 200 missed calls / mo
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600 shrink-0" /> Soft cap: $0.25/overage call
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600 shrink-0" /> Custom trade intake questions
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600 shrink-0" /> Emergency keyword alert escalation
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600 shrink-0" /> Photo &amp; media intake collection
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-blue-600 shrink-0" /> A2P 10DLC registration support
                  </li>
                </ul>
              </div>

              <Link
                href="/onboarding"
                className="mt-8 block w-full rounded-xl bg-blue-600 py-3 text-center text-xs font-bold text-white shadow-md hover:bg-blue-700 transition"
              >
                Start 14-Day Free Test
              </Link>
            </div>

            {/* Business (Talk to Us / Schedule Rollout CTA - Part 3.6) */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm flex flex-col justify-between">
              <div>
                <h3 className="text-lg font-bold text-slate-900">Business</h3>
                <p className="mt-1 text-xs text-slate-500">For multi-truck fleets &amp; franchise operations.</p>
                <div className="mt-4 flex items-baseline">
                  <span className="text-4xl font-extrabold text-slate-900">$299</span>
                  <span className="ml-1 text-xs text-slate-500">/ month</span>
                </div>
                <div className="mt-2 text-xs font-semibold text-slate-700 bg-slate-100 px-2.5 py-1 rounded-md inline-block">
                  Multi-line &amp; Rollover Routing
                </div>

                <ul className="mt-6 space-y-3 text-xs text-slate-600">
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> Up to 600 missed calls / mo
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> Soft cap: $0.15/overage call
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> Multi-line rollover routing
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> Up to 15 dispatch team members
                  </li>
                  <li className="flex items-center gap-2">
                    <CheckCircle className="h-4 w-4 text-emerald-600 shrink-0" /> Dedicated compliance manager
                  </li>
                </ul>
              </div>

              {/* Part 3.6: Business tier CTA changed from Start trial to Schedule Rollout */}
              <a
                href={`mailto:${COMPANY_INFO.email}?subject=Business%20Rollout%20Consultation`}
                className="mt-8 block w-full rounded-xl bg-slate-900 py-3 text-center text-xs font-bold text-white hover:bg-slate-800 transition"
              >
                Schedule Rollout (Talk to Us)
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- FOOTER (PART 2.4 & PART 2.2) ---------------- */}
      <footer className="border-t border-slate-200 bg-slate-50 py-12 text-xs text-slate-500">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-slate-200 pb-6">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-sm text-slate-900">MCR</span>
                <span className="text-[11px] text-slate-500">— Missed Call Revenue Recovery</span>
              </div>
              <p className="text-[11px] text-slate-500">
                Direct Contact: {COMPANY_INFO.email}
              </p>
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-medium">
              <Link href="/compliance" className="text-slate-600 hover:text-blue-600">TCPA &amp; 10DLC Compliance</Link>
              <Link href="/privacy" className="text-slate-600 hover:text-blue-600">Privacy Policy</Link>
              <Link href="/terms" className="text-slate-600 hover:text-blue-600">Terms of Service</Link>
              <Link href="/dashboard" className="text-slate-600 hover:text-blue-600">Demo Dashboard</Link>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-[11px] text-slate-400">
            <span>© 2026 Missed Call Recovery Inc. All rights reserved. Automated missed-call text-back &amp; qualification platform for trade contractors.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
