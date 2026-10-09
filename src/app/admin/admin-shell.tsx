'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  ShieldAlert,
  LayoutDashboard,
  Headphones,
  AlertOctagon,
  RadioTower,
  Flag,
  LogOut,
  Loader2,
} from 'lucide-react';

const ADMIN_NAV = [
  { href: '/admin', label: 'Fleet Overview', icon: LayoutDashboard },
  { href: '/admin/concierge', label: 'Concierge', icon: Headphones },
  { href: '/admin/carrier-matrix', label: 'Carrier Matrix', icon: RadioTower },
  { href: '/admin/risks', label: 'Risk Register', icon: AlertOctagon },
  { href: '/admin/launch-gate', label: 'Launch Gate', icon: Flag },
];

export default function AdminShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState<string | null>(null);

  const isActive = (href: string) =>
    pathname === href || (href !== '/admin' && pathname.startsWith(`${href}/`));

  const handleLogout = async () => {
    setLoggingOut(true);
    setLogoutError(null);
    try {
      const res = await fetch('/api/auth/logout', { method: 'POST' });
      if (!res.ok) throw new Error('Logout request failed');
    } catch (err: any) {
      setLogoutError(err?.message || 'Could not reach the server. Clearing local session.');
    } finally {
      setLoggingOut(false);
      router.replace('/operator-login');
      router.refresh();
    }
  };

  return (
    <div className="min-h-screen bg-slate-100">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-rose-600" aria-hidden="true" />
            <span className="text-sm font-extrabold tracking-tight text-slate-900">
              MCR Operator Console
            </span>
          </div>

          <nav aria-label="Operator console sections" className="flex flex-wrap gap-1 text-xs">
            {ADMIN_NAV.map((item) => {
              const Icon = item.icon;
              const active = isActive(item.href);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? 'page' : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 font-semibold transition ${
                    active
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                  {item.label}
                </Link>
              );
            })}
            <button
              type="button"
              onClick={handleLogout}
              disabled={loggingOut}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-2.5 py-1.5 font-semibold text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:opacity-50"
            >
              {loggingOut ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              Sign Out
            </button>
          </nav>
        </div>
        {logoutError && (
          <div
            role="alert"
            className="border-t border-amber-200 bg-amber-50 px-4 py-2 text-center text-[11px] font-semibold text-amber-900"
          >
            {logoutError}
          </div>
        )}
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">{children}</main>
    </div>
  );
}
