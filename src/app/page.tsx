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
} from 'lucide-react';

export default function LandingPage() {
  // ROI Calculator State
  const [avgJobValue, setAvgJobValue] = useState<number>(450);
  const [missedCallsPerMonth, setMissedCallsPerMonth] = useState<number>(35);
  const [recoveryRate, setRecoveryRate] = useState<number>(25);

  const potentialRecoveredJobs = Math.round((missedCallsPerMonth * recoveryRate) / 100);
  const potentialRecoveredRevenue = potentialRecoveredJobs * avgJobValue;
  const mcrSubscription = 149;
  const roiMultiplier = Math.round(potentialRecoveredRevenue / mcrSubscription);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      {/* ---------------- NAVIGATION ---------------- */}
      <header className="sticky top-0 z-50 border-b border-slate-100 bg-white/95 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-2">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-sm">
              <PhoneCall className="h-5 w-5" />
            </div>
            <div>
              <span className="text-xl font-bold tracking-tight text-slate-900">MCR</span>
              <span className="ml-1.5 hidden text-xs font-semibold uppercase tracking-wider text-blue-600 sm:inline">
                Missed Call Recovery
              </span>
            </div>
          </div>

          <nav className="hidden items-center gap-8 text-sm font-medium text-slate-600 md:flex">
            <a href="#problem" className="hover:text-blue-600">The Problem</a>
            <a href="#how-it-works" className="hover:text-blue-600">How It Works</a>
            <a href="#demo" className="hover:text-blue-600">Live Demo</a>
            <a href="#calculator" className="hover:text-blue-600">ROI Calculator</a>
            <a href="#pricing" className="hover:text-blue-600">Pricing</a>
          </nav>

          <div className="flex items-center gap-3">
            <Link
              href="/dashboard"
              className="rounded-lg border border-slate-200 px-3.5 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Demo Dashboard
            </Link>
            <Link
              href="/onboarding"
              className="inline-flex items-center gap-1.5 rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              Start Free Trial <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </header>

      {/* ---------------- HERO SECTION ---------------- */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/50 via-white to-white py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid items-center gap-12 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700">
                <span className="flex h-2 w-2 rounded-full bg-blue-600"></span>
                Built for Plumbers, HVAC, Electricians & Home Services
              </div>

              <h1 className="mt-5 text-4xl font-extrabold tracking-tight text-slate-900 sm:text-5xl lg:text-6xl">
                Turn Missed Calls Into <span className="text-blue-600">More Jobs.</span>
              </h1>

              <p className="mt-6 text-lg leading-relaxed text-slate-600 sm:text-xl">
                When you can&apos;t answer the phone, automatically follow up with the caller in under 60 seconds, collect
                the job details and photos, and put the qualified opportunity directly into your hands.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <Link
                  href="/onboarding"
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white shadow-md hover:bg-blue-700"
                >
                  Start Recovering Missed Calls <ArrowRight className="h-5 w-5" />
                </Link>
                <a
                  href="#demo"
                  className="inline-flex items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-base font-semibold text-slate-700 hover:bg-slate-50"
                >
                  See How It Works
                </a>
              </div>

              <div className="mt-10 flex flex-wrap items-center gap-6 text-xs text-slate-500">
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span>Works with your existing cell phone</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span>No carrier switch needed</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <CheckCircle className="h-4 w-4 text-emerald-600" />
                  <span>14-day free trial</span>
                </div>
              </div>
            </div>

            {/* Visual Hero Preview Card */}
            <div className="lg:col-span-5">
              <div className="relative mx-auto max-w-sm rounded-3xl border border-slate-800 bg-slate-900 p-4 shadow-2xl">
                <div className="mb-3 flex items-center justify-between border-b border-slate-800 pb-3 text-xs text-slate-400">
                  <div className="flex items-center gap-2">
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse"></span>
                    <span className="font-medium text-slate-200">MCR Live Call Intercept</span>
                  </div>
                  <span>Just now</span>
                </div>

                {/* Simulated SMS Thread */}
                <div className="space-y-3 rounded-2xl bg-slate-950 p-4 text-xs font-sans">
                  <div className="rounded-lg bg-red-950/40 border border-red-800/50 p-2.5 text-red-200">
                    <div className="font-semibold text-red-400 flex items-center gap-1">
                      <PhoneCall className="h-3.5 w-3.5" /> Missed Call Detected (Unanswered)
                    </div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Caller: (217) 555-9821 • Duration: 18s</div>
                  </div>

                  <div className="flex flex-col items-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 p-2.5 text-white">
                      Apex Plumbing — sorry we missed your call! Are you contacting us about a plumbing emergency?
                    </div>
                    <span className="mt-1 text-[10px] text-slate-500">Sent 42s after call</span>
                  </div>

                  <div className="flex flex-col items-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-800 p-2.5 text-slate-200">
                      Yes! My water heater is leaking all over the basement floor.
                    </div>
                    <span className="mt-1 text-[10px] text-slate-500">Customer replied</span>
                  </div>

                  <div className="flex flex-col items-end">
                    <div className="max-w-[85%] rounded-2xl rounded-tr-sm bg-blue-600 p-2.5 text-white">
                      Understood, prioritizing this. What is the service address?
                    </div>
                  </div>

                  <div className="flex flex-col items-start">
                    <div className="max-w-[85%] rounded-2xl rounded-tl-sm bg-slate-800 p-2.5 text-slate-200">
                      123 Main Street, Springfield.
                    </div>
                  </div>

                  <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/40 p-3 text-emerald-200">
                    <div className="flex items-center justify-between font-bold text-emerald-400">
                      <span className="flex items-center gap-1">
                        <CheckCircle className="h-3.5 w-3.5" /> JOB CARD CREATED
                      </span>
                      <span>$1,850 Est.</span>
                    </div>
                    <p className="mt-1 text-[11px] text-slate-300">
                      John Smith • Plumbing Emergency • 123 Main St
                    </p>
                    <div className="mt-2 flex gap-2">
                      <span className="rounded bg-emerald-600/30 px-2 py-0.5 text-[10px] font-semibold text-emerald-300">
                        Lead Notified via Push & SMS
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- THE PROBLEM ---------------- */}
      <section id="problem" className="border-t border-slate-100 bg-slate-50 py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-red-600">The Problem Every Contractor Faces</h2>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              When You Don&apos;t Answer, They Call Your Competitor in 30 Seconds.
            </p>
            <p className="mt-4 text-base text-slate-600">
              You are driving between jobs, up on a roof, under a sink, or after-hours. You can&apos;t pick up every call.
              Voicemail doesn&apos;t work anymore — customers rarely leave messages, they just click the next link on Google.
            </p>
          </div>

          <div className="mt-12 grid gap-6 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-100 text-red-600">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">62% of Contractor Calls Go Unanswered</h3>
              <p className="mt-2 text-sm text-slate-600">
                Solo operators and technicians in the field simply cannot physically answer every incoming call while working.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-amber-100 text-amber-600">
                <Clock className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">80% Hang Up on Voicemail</h3>
              <p className="mt-2 text-sm text-slate-600">
                Homeowners with an urgent heating, plumbing, or garage door issue won&apos;t wait for a callback tomorrow.
              </p>
            </div>

            <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-100 text-blue-600">
                <DollarSign className="h-6 w-6" />
              </div>
              <h3 className="mt-4 text-lg font-bold text-slate-900">$3,000+ Lost Revenue Per Month</h3>
              <p className="mt-2 text-sm text-slate-600">
                Losing just 3 or 4 service calls each month costs an average home-service business over $20,000 to $50,000 annually.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- HOW IT WORKS ---------------- */}
      <section id="how-it-works" className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-xs font-bold uppercase tracking-wider text-blue-600">Simple & Reliable</h2>
            <p className="mt-3 text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">
              How MCR Recovers Your Lost Revenue
            </p>
            <p className="mt-4 text-base text-slate-600">
              No complicated apps for your callers. No changing your existing phone number. Everything runs seamlessly in the background.
            </p>
          </div>

          <div className="mt-16 grid gap-8 md:grid-cols-4">
            <div className="relative rounded-2xl border border-slate-200 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                1
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Phone Rings Normally</h3>
              <p className="mt-2 text-sm text-slate-600">
                A customer calls your current business number. If you&apos;re available, you answer as usual. Nothing changes.
              </p>
            </div>

            <div className="relative rounded-2xl border border-slate-200 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                2
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Conditional Forwarding</h3>
              <p className="mt-2 text-sm text-slate-600">
                If you are busy or don&apos;t answer after 4 rings, your carrier rolls the call over to your dedicated MCR number.
              </p>
            </div>

            <div className="relative rounded-2xl border border-slate-200 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-blue-600 text-sm font-bold text-white">
                3
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Instant Text-Back & Qualification</h3>
              <p className="mt-2 text-sm text-slate-600">
                Within 60 seconds, MCR texts the caller asking if it&apos;s an emergency, gathering address and photo of the problem.
              </p>
            </div>

            <div className="relative rounded-2xl border border-slate-200 p-6">
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-600 text-sm font-bold text-white">
                4
              </div>
              <h3 className="mt-4 text-base font-bold text-slate-900">Job Card & Immediate Alert</h3>
              <p className="mt-2 text-sm text-slate-600">
                A structured job card appears on your phone dashboard with one-tap calling, canned SMS replies, and status tracking.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- INTERACTIVE ROI CALCULATOR ---------------- */}
      <section id="calculator" className="border-t border-slate-100 bg-slate-900 py-16 text-white sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="grid gap-12 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-6">
              <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-400">
                <TrendingUp className="h-3.5 w-3.5" /> ROI Calculator
              </div>
              <h2 className="mt-4 text-3xl font-extrabold tracking-tight sm:text-4xl">
                See How Much Revenue You Could Recover Each Month
              </h2>
              <p className="mt-3 text-slate-400">
                Adjust the sliders based on your business numbers. Recovering even a single job easily pays for your entire year of service.
              </p>

              <div className="mt-8 space-y-6">
                <div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>Average Value Per Job:</span>
                    <span className="font-bold text-blue-400">${avgJobValue}</span>
                  </div>
                  <input
                    type="range"
                    min="100"
                    max="3000"
                    step="50"
                    value={avgJobValue}
                    onChange={(e) => setAvgJobValue(Number(e.target.value))}
                    className="mt-2 w-full accent-blue-500"
                  />
                  <div className="flex justify-between text-[11px] text-slate-500">
                    <span>$100 (Minor repair)</span>
                    <span>$1,500</span>
                    <span>$3,000+ (Replacement/Install)</span>
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
                    <span>5 calls</span>
                    <span>50 calls</span>
                    <span>150 calls</span>
                  </div>
                </div>

                <div>
                  <div className="flex justify-between text-sm font-medium">
                    <span>Estimated Text-Back Recovery Rate:</span>
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
                <div className="text-xs uppercase tracking-wider text-slate-400">Illustrative Estimate</div>
                <div className="mt-4 flex items-baseline gap-2">
                  <span className="text-5xl font-extrabold text-emerald-400">
                    ${potentialRecoveredRevenue.toLocaleString()}
                  </span>
                  <span className="text-slate-400">/ month</span>
                </div>
                <p className="mt-2 text-sm text-slate-300">
                  Potential recovered revenue from ~<strong>{potentialRecoveredJobs} booked jobs</strong> that would have otherwise gone to competitors.
                </p>

                <div className="mt-6 border-t border-slate-800 pt-6">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-slate-400">MCR Pro Subscription:</span>
                    <span className="font-semibold text-slate-200">${mcrSubscription}/mo</span>
                  </div>
                  <div className="mt-2 flex items-center justify-between text-sm">
                    <span className="text-slate-400">Estimated Return on Investment:</span>
                    <span className="font-bold text-emerald-400">{roiMultiplier}x ROI</span>
                  </div>
                </div>

                <div className="mt-8">
                  <Link
                    href="/onboarding"
                    className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-6 py-3.5 text-base font-semibold text-white hover:bg-blue-700"
                  >
                    Claim Your 14-Day Free Trial <ArrowRight className="h-5 w-5" />
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
                  <CheckCircle className="h-4 w-4 text-blue-600" /> Photo & MMS collection
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" /> Emergency keyword alert escalation
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" /> Custom canned SMS replies
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" /> Daily 6 PM & Weekly ROI reports
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-blue-600" /> A2P 10DLC registration included
                </li>
              </ul>
              <Link
                href="/onboarding"
                className="mt-8 block w-full rounded-xl bg-blue-600 py-3 text-center text-sm font-semibold text-white shadow-md hover:bg-blue-700"
              >
                Start 14-Day Free Trial
              </Link>
            </div>

            {/* Business */}
            <div className="rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900">Business</h3>
              <p className="mt-1 text-sm text-slate-500">For multi-truck fleets & busy dispatch.</p>
              <div className="mt-4 flex items-baseline">
                <span className="text-4xl font-extrabold text-slate-900">$299</span>
                <span className="ml-1 text-sm text-slate-500">/ month</span>
              </div>
              <ul className="mt-6 space-y-3 text-sm text-slate-600">
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Up to 600 missed calls / mo
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Multiple phone numbers & rollover
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Up to 15 team dispatch members
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-600" /> Priority telecom delivery routing
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
            <Link href="/dashboard" className="hover:text-slate-900">Dashboard</Link>
            <Link href="/admin" className="hover:text-slate-900">Admin</Link>
            <Link href="/terms" className="hover:text-slate-900">Terms of Service</Link>
            <Link href="/privacy" className="hover:text-slate-900">Privacy Policy</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
