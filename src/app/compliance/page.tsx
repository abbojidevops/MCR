import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, CheckCircle2, Clock, AlertTriangle, PhoneCall, Lock, FileText } from 'lucide-react';

export const metadata = {
  title: 'Compliance & Telecom Standards — MCR',
  description: 'TCPA quiet hours, CTIA guidelines, A2P 10DLC registration timelines, and carrier compliance guardrails.',
};

export default function CompliancePage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back to MCR Home
          </Link>
          <span className="text-xs font-mono text-slate-400">TCPA &amp; 10DLC Guardrails</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6 space-y-8">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 shadow-sm space-y-8">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-800 mb-3 border border-emerald-200">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> Carrier Verified Telecom Architecture
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">
              Telecommunications &amp; TCPA Compliance
            </h1>
            <p className="mt-2 text-sm text-slate-500">
              How MCR guarantees full regulatory compliance under FCC TCPA rules, CTIA messaging principles, and carrier A2P 10DLC regulations.
            </p>
          </div>

          {/* 10-Minute Setup vs 10DLC Registration Timeline */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-6 space-y-4">
            <div className="flex items-center gap-2 text-sm font-bold text-blue-950">
              <Clock className="h-5 w-5 text-blue-700" />
              <span>10-Minute Onboarding vs. A2P 10DLC Campaign Approval Timeline</span>
            </div>
            <p className="text-xs text-blue-900 leading-relaxed">
              MCR separates instant forwarding configuration from carrier campaign approval to ensure you never lose a missed call:
            </p>
            <div className="grid gap-3 sm:grid-cols-2 text-xs">
              <div className="rounded-lg bg-white p-3.5 border border-blue-200">
                <span className="font-bold text-blue-900 block mb-1">⚡ 10-Minute Setup (Immediate)</span>
                <p className="text-slate-600">
                  Refers strictly to creating your account, dialing your carrier conditional forwarding code (*71 / *67 / *61) on your mobile phone, and verifying your first test call.
                </p>
              </div>
              <div className="rounded-lg bg-white p-3.5 border border-blue-200">
                <span className="font-bold text-blue-900 block mb-1">📋 A2P 10DLC Approval (1–5 Days)</span>
                <p className="text-slate-600">
                  Dedicated brand &amp; campaign registration across Verizon, AT&amp;T, and T-Mobile takes 1 to 5 business days for carrier vetting. During this window, text-backs send from our shared pre-registered high-trust fallback number so zero calls are lost.
                </p>
              </div>
            </div>
          </div>

          <div className="space-y-6 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-6">
            {/* 1. TCPA Quiet Hours */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 1. TCPA Quiet Hours Enforcement
              </h2>
              <p>
                Under the Telephone Consumer Protection Act (TCPA) and state telecom rules, automated non-emergency marketing text messages are prohibited before 8:00 AM and after 9:00 PM in the recipient&apos;s local timezone.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                <li>Calls received during quiet hours (9:00 PM – 8:00 AM) automatically queue qualification texts for dispatch at 8:00 AM.</li>
                <li>Emergency leads with active hazards (e.g. water heater bursts, sewage backups) provide immediate emergency confirmation only.</li>
                <li>Timezones are determined using the caller&apos;s area code and validated against geographic registry tables.</li>
              </ul>
            </section>

            {/* 2. TCPA STOP Opt-Out */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 2. Automatic STOP / Opt-Out Suppression
              </h2>
              <p>
                In strict accordance with CTIA guidelines, callers retain total control over messaging consent:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                <li>If a caller replies with <strong>STOP, UNSUBSCRIBE, CANCEL, QUIT</strong>, or <strong>END</strong>, their number is instantly added to our permanent suppression table.</li>
                <li>The system dispatches one single mandatory opt-out confirmation message, then permanently blocks all automated text-backs to that number.</li>
                <li>Opt-out events are recorded in the account audit log with cryptographic timestamps.</li>
              </ul>
            </section>

            {/* 3. Deduplication */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 3. 4-Hour Call Deduplication Window
              </h2>
              <p>
                To avoid spamming customers who call multiple times in succession, MCR enforces a 4-hour deduplication window:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-xs text-slate-600">
                <li>If a customer misses a call and receives a text-back, subsequent missed calls from the same number within 4 hours are suppressed.</li>
                <li>The suppression reason &ldquo;Deduplicated (Called within last 4 hours)&rdquo; is clearly documented in your dashboard.</li>
              </ul>
            </section>

            {/* 4. Infrastructure & Security */}
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="h-4 w-4 text-emerald-600" /> 4. Carrier-Grade Telephony Infrastructure
              </h2>
              <p>
                MCR operates on carrier-grade Twilio telecom infrastructure. All customer communication data is encrypted in transit via TLS 1.3 and at rest with AES-256. MCR never resells customer phone numbers or communications data to third parties under any circumstances.
              </p>
            </section>
          </div>

          <div className="border-t border-slate-100 pt-6 flex flex-wrap items-center justify-between gap-4 text-xs text-slate-500">
            <div>
              Registered TCR Campaign: <code className="font-mono font-bold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded">MCR-TRADE-REC-8841</code>
            </div>
            <div className="flex gap-4">
              <Link href="/privacy" className="text-blue-600 hover:underline">Privacy Policy</Link>
              <Link href="/terms" className="text-blue-600 hover:underline">Terms of Service</Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
