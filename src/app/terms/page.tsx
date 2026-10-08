import React from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText, PhoneCall, CheckCircle } from 'lucide-react';
import { COMPANY_INFO } from '@/lib/constants';

export const metadata = {
  title: 'Terms of Service — MCR (Missed Call Recovery)',
  description: 'Terms of Service and SMS Messaging Terms under CTIA and 10DLC regulations.'
};

export default function TermsPage() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      {/* Header */}
      <header className="border-b border-slate-200 bg-white sticky top-0 z-10">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="inline-flex items-center gap-2 text-sm font-semibold text-slate-600 hover:text-slate-900">
            <ArrowLeft className="h-4 w-4" /> Back to MCR Home
          </Link>
          <span className="text-xs font-mono text-slate-400">Effective: January 1, 2026</span>
        </div>
      </header>

      {/* Main Content */}
      <main className="mx-auto max-w-4xl px-4 py-12 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-8 sm:p-12 shadow-sm space-y-8">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-indigo-50 px-3 py-1 text-xs font-semibold text-indigo-700 mb-3 border border-indigo-200">
              <FileText className="h-3.5 w-3.5" /> CTIA &amp; 10DLC Messaging Terms
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Terms of Service</h1>
            <p className="mt-2 text-sm text-slate-500">
              Please read these terms carefully before utilizing the MCR software platform or engaging in our transactional SMS messaging services.
            </p>
          </div>

          {/* SMS Program Terms Box */}
          <div className="rounded-xl border border-indigo-200 bg-indigo-50/70 p-5 text-xs text-indigo-950 space-y-3">
            <div className="flex items-center gap-2 font-bold text-sm text-indigo-950">
              <PhoneCall className="h-4 w-4 text-indigo-700" />
              <span>MCR Transactional SMS Program Terms</span>
            </div>
            <p className="leading-relaxed">
              <strong>Program Name:</strong> MCR Missed Call Recovery Transactional Alerts<br />
              <strong>Program Description:</strong> When you place a phone call to a participating local home-service business and the business is unable to answer, MCR delivers an automated transactional text message to provide immediate customer service and capture details regarding your inquiry.
            </p>
            <ul className="list-disc pl-5 space-y-1 text-indigo-900">
              <li><strong>Cost:</strong> Message and data rates may apply depending on your cellular provider plan.</li>
              <li><strong>Frequency:</strong> Message frequency varies depending on your missed calls and conversation responses.</li>
              <li><strong>Opt-Out:</strong> Text <span className="font-bold">STOP</span>, <span className="font-bold">CANCEL</span>, or <span className="font-bold">UNSUBSCRIBE</span> at any time to permanently opt out. You will receive one final confirmation message.</li>
              <li><strong>Help:</strong> Text <span className="font-bold">HELP</span> or contact our support team at <span className="font-bold">{COMPANY_INFO.email}</span>.</li>
              <li><strong>Supported Carriers:</strong> AT&amp;T, Verizon Wireless, T-Mobile, Sprint, Boost Mobile, Cricket, MetroPCS, Virgin Mobile, and other major US carriers. Carriers are not liable for delayed or undelivered messages.</li>
            </ul>
          </div>

          <div className="space-y-6 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-6">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">1. Acceptance of Terms</h2>
              <p>
                By accessing our website, subscribing to our SaaS plans, or using our carrier conditional call forwarding integrations, you agree to be bound by these Terms of Service. If you do not agree, do not use the MCR platform.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">2. Customer Consent &amp; Calling Parties</h2>
              <p>
                When a consumer places an inbound phone call to a business subscriber of MCR, the caller demonstrates an existing business inquiry. The resulting transactional SMS text-back is sent solely in response to that caller's inbound action. MCR strictly prohibits the use of its platform for unsolicited cold outbound marketing or bulk blast campaigns.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">3. TCPA Quiet Hours Compliance</h2>
              <p>
                In strict adherence to the Telephone Consumer Protection Act (TCPA) and state telemarketing regulations, MCR automatically suppresses automated text-backs outside the hours of 8:00 AM to 9:00 PM local recipient time. Missed calls received overnight are queued or flagged for daytime follow-up.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">4. Subscription Billing &amp; Cancellations</h2>
              <p>
                MCR subscriptions are billed monthly or annually in advance via Stripe. Subscriptions renew automatically unless canceled via the Billing Dashboard prior to the end of the current billing cycle. You may cancel at any time with zero long-term cancellation penalties.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">5. Limitation of Liability</h2>
              <p>
                MCR provides automated communications infrastructure on an "as-is" and "as-available" basis. MCR is not responsible for cellular carrier network outages, third-party carrier forwarding errors, or undelivered messages caused by recipient device configuration or carrier spam filtering.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">6. Governing Law</h2>
              <p>
                These Terms shall be governed and construed in accordance with the laws of the State of Texas, without regard to its conflict of law provisions.
              </p>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
