'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Lock, Mail, ArrowRight, ShieldCheck, AlertCircle, Loader2 } from 'lucide-react';

export interface DemoCredentials {
  email: string;
  password: string;
  label: string;
}

export interface LoginFormProps {
  demoCredentials: DemoCredentials | null;
  demoDisclosureReason: string;
}

export default function LoginForm({ demoCredentials, demoDisclosureReason }: LoginFormProps) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
        } else {
          setError(data?.error || 'Failed to sign in. Please verify your credentials.');
        }
        setLoading(false);
        return;
      }

      // Successful login - redirect to dashboard
      router.push('/dashboard');
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
    <div className="flex min-h-screen flex-col justify-center bg-slate-50 py-12 sm:px-6 lg:px-8">
      <div className="sm:mx-auto sm:w-full sm:max-w-md">
        <div className="flex justify-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-blue-600 text-white font-extrabold text-xl shadow-md">
            MCR
          </div>
        </div>
        <h1 className="mt-4 text-center text-3xl font-extrabold tracking-tight text-slate-900">
          Sign in to your account
        </h1>
        <p className="mt-2 text-center text-sm text-slate-600">
          Missed Call Recovery System &amp; Lead Dispatch
        </p>
      </div>

      <div className="mt-8 sm:mx-auto sm:w-full sm:max-w-md">
        <div className="rounded-2xl border border-slate-200 bg-white px-6 py-8 shadow-sm sm:px-10">
          {error && (
            <div
              role="alert"
              className="mb-6 flex items-start gap-3 rounded-lg border border-rose-200 bg-rose-50 p-4 text-sm text-rose-800"
            >
              <AlertCircle className="h-5 w-5 flex-shrink-0 text-rose-500 mt-0.5" aria-hidden="true" />
              <span>{error}</span>
            </div>
          )}

          <form className="space-y-6" onSubmit={handleSubmit} noValidate>
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

            <div>
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
            </div>
          </form>

          {/* Demo credentials are rendered ONLY when this deployment explicitly
              runs in demo/staging mode. Never in production. */}
          {demoCredentials && (
            <div className="mt-6 border-t border-slate-100 pt-6">
              <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3.5 text-xs text-blue-900">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-semibold flex items-center gap-1.5">
                    <ShieldCheck className="h-4 w-4 text-blue-600" aria-hidden="true" />
                    {demoCredentials.label}
                  </span>
                  <button
                    type="button"
                    onClick={fillDemoCredentials}
                    className="font-semibold text-blue-700 hover:text-blue-800 underline"
                  >
                    Auto-fill
                  </button>
                </div>
                <p className="mt-1 text-slate-600">
                  {demoCredentials.email} / {demoCredentials.password}
                </p>
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Demonstration account only. Records are sample data and are excluded from live metrics.
                </p>
              </div>
            </div>
          )}

          <div className="mt-6 text-center text-xs text-slate-500">
            Don&apos;t have an account yet?{' '}
            <Link href="/onboarding" className="font-semibold text-blue-600 hover:text-blue-700 underline">
              Start Onboarding
            </Link>
          </div>

          <div className="mt-4 border-t border-slate-100 pt-4 text-center text-xs text-slate-500">
            Platform operator?{' '}
            <Link href="/admin/login" className="font-semibold text-slate-700 hover:text-slate-900 underline">
              Admin sign-in
            </Link>
          </div>
        </div>
      </div>

      <p className="mt-6 text-center text-[11px] text-slate-400" data-testid="demo-mode-disclosure">
        {demoDisclosureReason}
      </p>
    </div>
  );
}
