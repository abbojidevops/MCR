'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  PhoneCall,
  LayoutDashboard,
  ClipboardList,
  MessageSquare,
  History,
  TrendingUp,
  Share2,
  ShieldCheck,
  CreditCard,
  FlaskConical,
  Bell,
  Menu,
  X,
  Play,
  CheckCircle,
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('acc-apex-plumbing');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(2);
  const [simulatingCall, setSimulatingCall] = useState(false);
  const [simulationToast, setSimulationToast] = useState<string | null>(null);

  const navItems = [
    { label: 'Overview', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Job Cards', href: '/dashboard/jobs', icon: ClipboardList },
    { label: 'Inbox & SMS', href: '/dashboard/inbox', icon: MessageSquare },
    { label: 'Missed Calls', href: '/dashboard/missed-calls', icon: History },
    { label: 'Weekly Reports', href: '/dashboard/reports', icon: TrendingUp },
    { label: 'Carrier Forwarding', href: '/dashboard/forwarding', icon: Share2 },
    { label: '10DLC Compliance', href: '/dashboard/compliance', icon: ShieldCheck },
    { label: 'Billing & Usage', href: '/dashboard/billing', icon: CreditCard },
    { label: 'Test Simulator', href: '/dashboard/test-mode', icon: FlaskConical },
  ];

  const handleQuickSimulation = async () => {
    setSimulatingCall(true);
    setSimulationToast('Simulating inbound missed call from (217) 555-8833...');
    try {
      const res = await fetch('/api/simulator', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'simulate_call',
          accountId: selectedAccount,
          callerNumber: '+12175558833',
          callerName: 'Sarah Connor',
        }),
      });
      const data = await res.json();
      if (data.success) {
        setSimulationToast('✓ Missed call recorded & automated text-back sent!');
        setUnreadCount((prev) => prev + 1);
        setTimeout(() => setSimulationToast(null), 4000);
      }
    } catch (err) {
      console.error(err);
      setSimulationToast('Simulation failed. Check console.');
    } finally {
      setSimulatingCall(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      {/* ---------------- DESKTOP SIDEBAR ---------------- */}
      <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white md:flex">
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold">
            <PhoneCall className="h-4 w-4" />
          </div>
          <span className="font-bold text-slate-900 tracking-tight">MCR Recovery</span>
        </div>

        {/* Tenant Switcher */}
        <div className="border-b border-slate-200 p-3">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 mb-1">
            Active Business
          </label>
          <select
            value={selectedAccount}
            onChange={(e) => setSelectedAccount(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800 focus:outline-none focus:ring-1 focus:ring-blue-500"
          >
            <option value="acc-apex-plumbing">Apex Plumbing & Rooter</option>
            <option value="acc-coolbreeze-hvac">CoolBreeze Heating & Air</option>
          </select>
        </div>

        {/* Navigation Items */}
        <nav className="flex-1 space-y-1 p-3">
          {navItems.map((item) => {
            const isActive = pathname === item.href;
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${
                  isActive
                    ? 'bg-blue-50 text-blue-600'
                    : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                <Icon className={`h-4 w-4 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* Quick Simulator CTA */}
        <div className="border-t border-slate-200 p-4">
          <button
            type="button"
            disabled={simulatingCall}
            onClick={handleQuickSimulation}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-3 py-2.5 text-xs font-semibold text-white shadow hover:bg-slate-800 disabled:opacity-50"
          >
            <Play className="h-3.5 w-3.5 text-emerald-400" />
            {simulatingCall ? 'Simulating...' : 'Test Missed Call'}
          </button>
        </div>
      </aside>

      {/* ---------------- MAIN CONTENT AREA ---------------- */}
      <div className="flex flex-1 flex-col">
        {/* Top Header */}
        <header className="sticky top-0 z-30 flex h-16 items-center justify-between border-b border-slate-200 bg-white/95 px-4 backdrop-blur sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 md:hidden"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div className="md:hidden flex items-center gap-2">
              <div className="flex h-7 w-7 items-center justify-center rounded bg-blue-600 text-white font-bold">
                <PhoneCall className="h-3.5 w-3.5" />
              </div>
              <span className="font-bold text-slate-900 text-sm">MCR</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Quick action button */}
            <button
              type="button"
              disabled={simulatingCall}
              onClick={handleQuickSimulation}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-sm"
            >
              <Play className="h-3 w-3 text-emerald-500" /> Test Call
            </button>

            {/* Notifications Bell */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute right-1.5 top-1.5 flex h-4 w-4 items-center justify-center rounded-full bg-red-600 text-[10px] font-bold text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {notificationsOpen && (
                <div className="absolute right-0 mt-2 w-80 rounded-2xl border border-slate-200 bg-white p-3 shadow-xl z-50">
                  <div className="flex items-center justify-between border-b border-slate-100 pb-2 px-2">
                    <span className="text-xs font-bold text-slate-900">Notifications</span>
                    <button
                      type="button"
                      onClick={() => setUnreadCount(0)}
                      className="text-[11px] font-medium text-blue-600 hover:underline"
                    >
                      Mark all read
                    </button>
                  </div>
                  <div className="mt-2 space-y-2 max-h-64 overflow-y-auto">
                    <div className="rounded-lg bg-red-50 p-2.5 text-xs border border-red-100">
                      <div className="font-semibold text-red-800">🚨 Water Heater Leaking</div>
                      <div className="text-slate-600 mt-0.5">John Smith at 123 Main St. Action required.</div>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-2.5 text-xs border border-blue-100">
                      <div className="font-semibold text-blue-800">📞 Missed Call Recovered</div>
                      <div className="text-slate-600 mt-0.5">Lisa Ray qualified via SMS. Sewer backup.</div>
                    </div>
                  </div>
                </div>
              )}
            </div>

            <Link
              href="/admin"
              className="rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-200"
            >
              Admin
            </Link>
          </div>
        </header>

        {/* Mobile Navigation Drawer */}
        {mobileMenuOpen && (
          <div className="border-b border-slate-200 bg-white p-4 md:hidden">
            <nav className="grid grid-cols-2 gap-2">
              {navItems.map((item) => {
                const isActive = pathname === item.href;
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-2 rounded-lg p-2.5 text-xs font-semibold ${
                      isActive ? 'bg-blue-50 text-blue-600' : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}

        {/* Simulation Feedback Toast */}
        {simulationToast && (
          <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-2xl animate-bounce">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span>{simulationToast}</span>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8">{children}</main>
      </div>
    </div>
  );
}
