import React from 'react';
import Link from 'next/link';
import { ArrowLeft, ShieldCheck, Lock, EyeOff } from 'lucide-react';

export const metadata = {
  title: 'Privacy Policy — MCR (Missed Call Recovery)',
  description: 'MCR Privacy Policy and SMS data protection standards under CTIA and 10DLC TCR regulations.'
};

export default function PrivacyPage() {
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
            <div className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-3 py-1 text-xs font-semibold text-blue-700 mb-3 border border-blue-200">
              <ShieldCheck className="h-3.5 w-3.5" /> CTIA &amp; 10DLC TCR Compliant
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-slate-900">Privacy Policy</h1>
            <p className="mt-2 text-sm text-slate-500">
              How MCR ("Missed Call Recovery Inc.", "we", "our") handles customer information, mobile numbers, and transactional SMS data.
            </p>
          </div>

          {/* Mandatory TCR Clause Alert */}
          <div className="rounded-xl border border-blue-200 bg-blue-50/70 p-5 text-xs text-blue-900 space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-blue-950">
              <Lock className="h-4 w-4 text-blue-700" />
              <span>Mandatory Mobile Information Privacy Disclosure</span>
            </div>
            <p className="leading-relaxed font-semibold">
              No mobile information will be shared with third parties or affiliates for marketing or promotional purposes. All the above categories exclude text messaging originator opt-in data and consent; this information will not be shared with any third parties under any circumstances.
            </p>
          </div>

          <div className="space-y-6 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-6">
            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">1. Information We Collect</h2>
              <p>
                When a customer calls a contractor business utilizing MCR and the call is missed, our telephony infrastructure processes the incoming caller ID (phone number) and call timestamp in order to dispatch an immediate transactional SMS recovery message. During the SMS conversation, we may process:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Customer phone number and caller name (if provided)</li>
                <li>Problem descriptions, trade requirements, and service addresses</li>
                <li>Customer-submitted photos of equipment, leaks, or service locations</li>
                <li>Message timestamps, delivery receipts, and communication logs</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">2. How We Use Collected Data</h2>
              <p>
                Information collected via phone calls and text messages is used strictly for:
              </p>
              <ul className="list-disc pl-5 space-y-1">
                <li>Delivering transactional missed-call SMS notifications on behalf of the contracted service professional</li>
                <li>Qualifying customer service requests and creating dispatch job cards</li>
                <li>Alerting the business owner or technician to urgent service calls</li>
                <li>Enforcing TCPA quiet hours and instant opt-out suppression</li>
              </ul>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">3. Absolute Prohibition on Sale or Sharing of Mobile Data</h2>
              <p>
                We value customer privacy above all else. We do not sell, rent, lease, trade, or share phone numbers, text opt-in data, or customer messages with any third-party marketing companies, lead brokers, or advertising networks. Mobile data is never aggregated for external commercial exploitation.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">4. Opt-Out and Data Retention</h2>
              <p>
                Recipients may revoke SMS consent at any time by replying <strong className="text-slate-900">STOP</strong>, <strong className="text-slate-900">CANCEL</strong>, or <strong className="text-slate-900">UNSUBSCRIBE</strong> to any message received from MCR. Upon receipt of an opt-out keyword, our system immediately adds the number to an irreversible suppression table and halts all further text communications.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">5. Security &amp; Tenant Isolation</h2>
              <p>
                All account records and customer communications are isolated at the database level with strict tenant validation (<code className="text-xs bg-slate-100 px-1 py-0.5 rounded">account_id</code>). All API and webhook communication with telecom carriers uses TLS 1.3 encryption and HMAC-SHA1 signature verification.
              </p>
            </section>

            <section className="space-y-2">
              <h2 className="text-base font-bold text-slate-900">6. Contact Information</h2>
              <p>
                If you have questions regarding this Privacy Policy or wish to request data deletion, contact our Privacy Compliance Officer at:
              </p>
              <div className="rounded-lg bg-slate-50 p-3 font-mono text-xs text-slate-700">
                Email: privacy@mcr-recovery.com<br />
                Address: Missed Call Recovery Inc., Austin, TX 78701
              </div>
            </section>
          </div>
        </div>
      </main>
    </div>
  );
}
