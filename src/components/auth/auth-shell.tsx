'use client';

import React from 'react';
import Link from 'next/link';
import { PhoneCall, ArrowLeft, ShieldCheck } from 'lucide-react';
import { COMPANY_INFO } from '@/lib/constants';

export interface AuthShellProps {
  /** Small label above the card title, e.g. "Tenant sign-in". */
  eyebrow?: string;
  title: string;
  subtitle?: string;
  /** Rendered inside the white card, below any error/success banners. */
  children: React.ReactNode;
  /** Optional link back to the other sign-in surface. */
  backLink?: { href: string; label: string };
  /** Optional content rendered under the card, e.g. the demo-credentials panel. */
  belowCard?: React.ReactNode;
  /** Honest disclosure line rendered at the very bottom of the page. */
  disclosure?: string;
}

/**
 * Shared chrome for every unauthenticated surface: tenant sign-in, operator
 * sign-in, and the onboarding wizard.
 *
 * One layout, one brand mark, one footer, one set of legal links — so the
 * customer never has to work out whether they are "still in the same product"
 * as they move between screens.
 */
export default function AuthShell({
  eyebrow,
  title,
  subtitle,
  children,
  backLink,
  belowCard,
  disclosure,
}: AuthShellProps) {
  const year = new Date().getFullYear();

  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      {/* Top bar */}
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-4 sm:px-6">
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

          <nav aria-label="Legal" className="flex items-center gap-4 text-xs font-semibold text-slate-500">
            <Link href="/terms" className="hover:text-slate-900">
              Terms
            </Link>
            <Link href="/privacy" className="hover:text-slate-900">
              Privacy
            </Link>
            <Link href="/compliance" className="hover:text-slate-900">
              Compliance
            </Link>
          </nav>
        </div>
      </header>

      {/* Body */}
      <main className="flex flex-1 items-start justify-center px-4 py-10 sm:px-6 sm:py-14">
        <div className="w-full max-w-md">
          {backLink && (
            <Link
              href={backLink.href}
              className="mb-5 inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:text-slate-900"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              {backLink.label}
            </Link>
          )}

          <div className="text-center">
            {eyebrow && (
              <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-500">
                <ShieldCheck className="h-3 w-3 text-blue-600" aria-hidden="true" />
                {eyebrow}
              </span>
            )}
            <h1 className="mt-3 text-2xl font-extrabold tracking-tight text-slate-900 sm:text-3xl">
              {title}
            </h1>
            {subtitle && <p className="mt-2 text-sm text-slate-600">{subtitle}</p>}
          </div>

          <div className="mt-7 rounded-2xl border border-slate-200 bg-white px-5 py-7 shadow-sm sm:px-8">
            {children}
          </div>

          {belowCard && <div className="mt-5">{belowCard}</div>}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl flex-col items-center justify-between gap-2 px-4 py-5 text-[11px] text-slate-400 sm:flex-row sm:px-6">
          <p>
            © {year} {COMPANY_INFO.name}
          </p>
          <p>
            Support {COMPANY_INFO.supportHours} ·{' '}
            <a href={`mailto:${COMPANY_INFO.email}`} className="font-semibold hover:text-slate-700">
              {COMPANY_INFO.email}
            </a>
          </p>
        </div>
        {disclosure && (
          <p
            data-testid="demo-mode-disclosure"
            className="border-t border-slate-100 px-4 py-3 text-center text-[10px] text-slate-400"
          >
            {disclosure}
          </p>
        )}
      </footer>
    </div>
  );
}
