'use client';

import React, { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { ShieldAlert, Lock, ArrowRight, AlertCircle, Loader2, ArrowLeft } from 'lucide-react';
import { safeNextPath } from '@/lib/safe-redirect';
import { COMPANY_INFO } from '@/lib/constants';

export default function OperatorLoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // ?next= comes from the URL and is therefore untrusted: only same-origin
  // paths inside this app are honoured, otherwise we would be running an open
  // redirect out of the operator console.
  const nextPath = safeNextPath(searchParams.get('next'), '/admin');

  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  // If ADMIN_PASSWORD is not configured the middleware answers 503 for every
  // /admin/* path. Detect that up front so the operator sees why.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/admin/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}) })
      .then(async (res) => {
        if (cancelled) return;
        if (res.status === 503) {
          const data = await res.json().catch(() => null);
          setUnavailable(true);
          setError(data?.error || 'ADMIN_PASSWORD is not configured on this deployment.');
        }
      })
      .catch(() => {
        /* network errors surface on submit */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!password) {
      setError('Operator password is required');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json().catch(() => null);

      if (!res.ok) {
        if (res.status === 503) {
          setUnavailable(true);
          setError(data?.error || 'ADMIN_PASSWORD is not configured on this deployment.');
        } else if (res.status === 429) {
          setError('Too many attempts. Please wait before trying again.');
        } else {
          setError(data?.error || 'Invalid operator credentials.');
        }
        setLoading(false);
        return;
      }

      router.push(nextPath);
      router.refresh();
    } catch {
      setError('Network error. Unable to reach the operator authentication service.');
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-center bg-slate-900 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-red-600 text-white shadow-md">
            <ShieldAlert className="h-6 w-6" aria-hidden="true" />
          </div>
        </div>
        <h1 className="mt-4 text-center text-2xl font-extrabold tracking-tight text-white">
          Platform Operator Sign-In
        </h1>
        <p className="mt-2 text-center text-xs text-slate-400">
          MCR Central Admin Control Room · restricted to platform operators
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-2xl border border-slate-800 bg-slate-950 px-6 py-8 shadow-lg sm:px-10">
          {unavailable && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-lg border border-amber-500/40 bg-amber-950/40 p-4 text-xs text-amber-200"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" aria-hidden="true" />
              <span>
                Admin access is disabled on this deployment because{' '}
                <code className="font-mono">ADMIN_PASSWORD</code> is not configured.
              </span>
            </div>
          )}

          {error && !unavailable && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-lg border border-rose-500/40 bg-rose-950/40 p-4 text-xs text-rose-200"
            >
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
            <div>
              <label htmlFor="operator-password" className="block text-xs font-semibold text-slate-300">
                Operator password
              </label>
              <div className="relative mt-1.5">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-500">
                  <Lock className="h-4 w-4" aria-hidden="true" />
                </div>
                <input
                  id="operator-password"
                  name="password"
                  type="password"
                  autoComplete="current-password"
                  required
                  autoFocus
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="block w-full rounded-lg border border-slate-700 bg-slate-900 pl-9 pr-3.5 py-2.5 text-sm text-white placeholder:text-slate-500 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
              </div>
              <p className="mt-2 text-[11px] text-slate-500">
                Set with the <code className="font-mono">ADMIN_PASSWORD</code> environment variable on the server.
              </p>
            </div>

            <button
              type="submit"
              disabled={loading || unavailable}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 focus:ring-offset-slate-950 disabled:opacity-60"
            >
              {loading ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Verifying...
                </>
              ) : (
                <>
                  Enter Control Room
                  <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </>
              )}
            </button>
          </form>

          <div className="mt-6 border-t border-slate-800 pt-4 text-center text-xs">
            <Link
              href="/login"
              className="inline-flex items-center gap-1.5 font-semibold text-slate-400 hover:text-white"
            >
              <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
              Back to tenant sign-in
            </Link>
          </div>
        </div>
      </div>

      <footer className="mt-auto border-t border-slate-800 px-4 py-5 text-center text-[11px] text-slate-500">
        <p>
          Restricted console · {COMPANY_INFO.name}
        </p>
        <p className="mt-1">
          Tenant support {COMPANY_INFO.supportHours} ·{' '}
          <a href={`mailto:${COMPANY_INFO.email}`} className="font-semibold hover:text-slate-300">
            {COMPANY_INFO.email}
          </a>
        </p>
      </footer>
    </div>
  );
}
