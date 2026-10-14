'use client';

import React, { useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Loader2, LifeBuoy } from 'lucide-react';
import AuthShell from '@/components/auth/auth-shell';
import { safeNextPath } from '@/lib/safe-redirect';
import { COMPANY_INFO } from '@/lib/constants';

export interface DemoCredentials {
  email: string;
  password: string;
  label: string;
}

export interface LoginFormProps {
  demoCredentials: DemoCredentials | null;
  demoDisclosureReason: string;
}

function LoginFormInner({ demoCredentials, demoDisclosureReason }: LoginFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Honour ?next= so a visitor who was bounced here by the middleware lands
  // where they were originally headed. Validated against an allow-list of
  // same-origin paths to prevent open-redirect abuse.
  const nextTarget = safeNextPath(searchParams.get('next'), '/dashboard');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!email.trim()) {
      setError('Email is required');
      return;
    }

    if (!password) {
      setError('Password is required');
      return;
    }

    setLoading(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      let data: any = null;
      try {
        data = await res.json();
      } catch {
        data = null;
      }

      if (!res.ok) {
        if (res.status === 429) {
          setError(
            data?.error ||
              'Too many failed sign-in attempts. Please wait a moment before trying again.'
          );
        } else if (res.status === 401) {
          setError('That email and password combination does not match an account.');
        } else {
          setError(data?.error || 'Failed to sign in. Please verify your credentials.');
        }
        setLoading(false);
        return;
      }

      // Admins belong in the operator console, everyone else in the tenant app.
      const destination =
        data?.role === 'admin' ? safeNextPath(nextTarget, '/admin') : nextTarget;
      router.push(destination);
      router.refresh();
    } catch {
      setError('Network error. Unable to reach authentication service.');
      setLoading(false);
    }
  };

  const fillDemoCredentials = () => {
    if (!demoCredentials) return;
    setEmail(demoCredentials.email);
    setPassword(demoCredentials.password);
    setError(null);
  };

  return (
    <AuthShell
      eyebrow="Tenant sign-in"
      title="Sign in to your account"
      subtitle="Missed Call Recovery for local service businesses."
      backLink={{ href: '/', label: 'Back to home' }}
      disclosure={demoDisclosureReason}
      belowCard={
        <>
          {/* Demo credentials are rendered ONLY when this deployment explicitly
              runs in demo/staging mode. Never in production. */}
          {demoCredentials && (
            <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-900">
              <div className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 font-semibold">
                  <ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
                  {demoCredentials.label}
                </span>
                <button
                  type="button"
                  onClick={fillDemoCredentials}
                  className="font-semibold text-blue-700 underline hover:text-blue-800"
                >
                  Auto-fill
                </button>
              </div>
              <p className="mt-1 font-mono text-slate-600">
                {demoCredentials.email} / {demoCredentials.password}
              </p>
              <p className="mt-1.5 text-[11px] text-slate-500">
                Demonstration account only. Records are sample data and are excluded from live
                metrics.
              </p>
            </div>
          )}

          <div className="mt-5 space-y-3 text-center text-xs text-slate-500">
            <p>
              Don&apos;t have an account yet?{' '}
              <Link href="/onboarding" className="font-semibold text-blue-600 hover:text-blue-700">
                Create your account
              </Link>
            </p>
            <p className="border-t border-slate-100 pt-3">
              Platform operator?{' '}
              <Link
                href="/admin/login"
                className="font-semibold text-slate-700 hover:text-slate-900"
              >
                Operator sign-in
              </Link>
            </p>
            <p className="border-t border-slate-100 pt-3 text-[11px] text-slate-400">
              <LifeBuoy className="mr-1 inline h-3 w-3" aria-hidden="true" />
              Forgotten your password? Email{' '}
              <a href={`mailto:${COMPANY_INFO.email}`} className="font-semibold hover:text-slate-600">
                {COMPANY_INFO.email}
              </a>{' '}
              and we will reset it. Self-service reset is not available yet.
            </p>
          </div>
        </>
      }
    >
      {error && (
        <div
          role="alert"
          className="mb-5 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-3.5 text-sm text-rose-800"
        >
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-rose-500" aria-hidden="true" />
          <span>{error}</span>
        </div>
      )}

      <form className="space-y-5" onSubmit={handleSubmit} noValidate>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-slate-700">
            Email address
          </label>
          <div className="relative mt-1.5">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Mail className="h-5 w-5" aria-hidden="true" />
            </div>
            <input
              id="email"
              name="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="owner@servicecompany.com"
              className="block w-full rounded-lg border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-slate-700">
            Password
          </label>
          <div className="relative mt-1.5">
            <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-slate-400">
              <Lock className="h-5 w-5" aria-hidden="true" />
            </div>
            <input
              id="password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="block w-full rounded-lg border border-slate-300 pl-10 pr-3.5 py-2.5 text-sm text-slate-900 shadow-sm placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            />
          </div>
        </div>

        <button
          type="submit"
          disabled={loading}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-60"
        >
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              Verifying credentials...
            </>
          ) : (
            <>
              Sign In
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </>
          )}
        </button>
      </form>
    </AuthShell>
  );
}

export default function LoginForm(props: LoginFormProps) {
  return (
    <Suspense fallback={null}>
      <LoginFormInner {...props} />
    </Suspense>
  );
}
