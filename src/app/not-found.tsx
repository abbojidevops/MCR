import Link from 'next/link';
import { PhoneCall, Home, LifeBuoy, ArrowLeft } from 'lucide-react';
import { COMPANY_INFO } from '@/lib/constants';

export const metadata = {
  title: 'Page not found — MCR',
};

export default function NotFound() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex h-16 max-w-5xl items-center px-4 sm:px-6">
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
        </div>
      </header>

      <main className="flex flex-1 items-center justify-center px-4 py-16 sm:px-6">
        <div className="w-full max-w-md text-center">
          <p className="text-6xl font-black tracking-tight text-slate-200">404</p>
          <h1 className="mt-4 text-2xl font-extrabold tracking-tight text-slate-900">
            We couldn&apos;t find that page
          </h1>
          <p className="mt-2 text-sm text-slate-600">
            The link may be out of date, or the page may have moved. Nothing is broken on your
            account — try one of the destinations below.
          </p>

          <div className="mt-8 space-y-2.5">
            <Link
              href="/"
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700"
            >
              <Home className="h-4 w-4" aria-hidden="true" />
              Go to the home page
            </Link>
            <Link
              href="/dashboard"
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
            >
              <ArrowLeft className="h-4 w-4" aria-hidden="true" />
              Go to your dashboard
            </Link>
          </div>

          <p className="mt-8 inline-flex items-center gap-1.5 text-xs text-slate-500">
            <LifeBuoy className="h-3.5 w-3.5" aria-hidden="true" />
            Still stuck? Email{' '}
            <a href={`mailto:${COMPANY_INFO.email}`} className="font-semibold text-blue-600">
              {COMPANY_INFO.email}
            </a>
          </p>
        </div>
      </main>
    </div>
  );
}
