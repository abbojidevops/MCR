'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  PhoneCall,
  LayoutDashboard,
  ClipboardList,
  MessageSquare,
  History,
  TrendingUp,
  Settings,
  CreditCard,
  FlaskConical,
  Bell,
  Menu,
  X,
  Play,
  CheckCircle,
  HelpCircle,
  Share2,
  ShieldCheck,
  MoreHorizontal,
  Clock,
  ShieldAlert,
} from 'lucide-react';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [selectedAccount, setSelectedAccount] = useState('acc-apex-plumbing');
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [helpModalOpen, setHelpModalOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(2);
  const [simulatingCall, setSimulatingCall] = useState(false);
  const [simulationToast, setSimulationToast] = useState<string | null>(null);
  const [complianceStatus, setComplianceStatus] = useState<string>('signed_up');

  React.useEffect(() => {
    fetch('/api/auth/session')
      .then((r) => r.json())
      .then((d) => {
        if (d.accountId) setSelectedAccount(d.accountId);
      })
      .catch(console.error);

    fetch('/api/compliance')
      .then((r) => r.json())
      .then((d) => {
        if (d.compliance?.status) setComplianceStatus(d.compliance.status);
      })
      .catch(console.error);
  }, []);

  // Primary Navigation
  const primaryNavItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Missed Calls', href: '/dashboard/missed-calls', icon: History },
    { label: 'Conversations', href: '/dashboard/inbox', icon: MessageSquare },
    { label: 'Jobs', href: '/dashboard/jobs', icon: ClipboardList },
    { label: 'Reports', href: '/dashboard/reports', icon: TrendingUp },
    { label: 'Settings', href: '/dashboard/settings', icon: Settings },
    { label: 'Billing', href: '/dashboard/billing', icon: CreditCard },
  ];

  // Secondary Tools
  const secondaryNavItems = [
    { label: 'Carrier Forwarding', href: '/dashboard/forwarding', icon: Share2 },
    { label: '10DLC Compliance', href: '/dashboard/compliance', icon: ShieldCheck },
    { label: 'Test Simulator', href: '/dashboard/test-mode', icon: FlaskConical },
  ];

  // Mobile Bottom Bar Items
  const mobileBottomItems = [
    { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { label: 'Inbox', href: '/dashboard/inbox', icon: MessageSquare },
    { label: 'Jobs', href: '/dashboard/jobs', icon: ClipboardList },
    { label: 'Calls', href: '/dashboard/missed-calls', icon: History },
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
      setSimulationToast('Simulation failed. Check connection.');
    } finally {
      setSimulatingCall(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900 pb-16 md:pb-0">
      {/* ---------------- DESKTOP SIDEBAR ---------------- */}
      <aside className="hidden w-64 flex-col border-r border-slate-200 bg-white md:flex">
        {/* Brand */}
        <div className="flex h-16 items-center gap-2.5 border-b border-slate-200 px-6">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-600 text-white font-bold shadow-sm">
            <PhoneCall className="h-4 w-4" />
          </div>
          <div>
            <span className="font-extrabold text-slate-900 tracking-tight text-sm">MCR</span>
            <span className="block text-[10px] text-slate-400 font-medium">Revenue Recovery</span>
          </div>
        </div>

        {/* Active Authenticated Business Profile */}
        <div className="border-b border-slate-200 p-3">
          <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2 mb-1">
            Active Business
          </label>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-800">
            {selectedAccount === 'acc-coolbreeze-hvac' ? 'CoolBreeze Heating & Air' : 'Apex Plumbing & Rooter'}
          </div>
        </div>

        {/* Primary Navigation */}
        <nav className="flex-1 space-y-1 p-3 overflow-y-auto">
          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">
            Main Menu
          </div>
          {primaryNavItems.map((item) => {
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

          <div className="pt-3 text-[10px] font-bold uppercase tracking-wider text-slate-400 px-3 py-1">
            Tools &amp; Telecom
          </div>
          {secondaryNavItems.map((item) => {
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

          {/* Help Item */}
          <button
            onClick={() => setHelpModalOpen(true)}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <HelpCircle className="h-4 w-4 text-slate-400" />
            Help &amp; Support
          </button>
        </nav>

        {/* Setup Compliance Status Widget (Item 5 Truthfulness) */}
        <div className="p-3">
          {complianceStatus === 'sms_live' ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 p-3 text-xs">
              <div className="flex items-center justify-between font-bold text-emerald-900 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" /> MCR SETUP
                </span>
                <span className="rounded bg-emerald-200/60 px-1.5 py-0.5 text-[9px] font-extrabold text-emerald-800">
                  100% READY
                </span>
              </div>
              <div className="mt-1.5 grid grid-cols-2 gap-x-1 gap-y-0.5 text-[10px] text-emerald-800 font-medium">
                <span>✓ Profile</span>
                <span>✓ Recovery #</span>
                <span>✓ Forwarding</span>
                <span>✓ Test Call</span>
                <span>✓ SMS Auto</span>
                <span>✓ 10DLC Live</span>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50/90 p-3 text-xs">
              <div className="flex items-center justify-between font-bold text-amber-900 text-[11px]">
                <span className="flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-amber-600" /> 10DLC Compliance
                </span>
                <span className="rounded bg-amber-200/80 px-1.5 py-0.5 text-[9px] font-extrabold text-amber-900 uppercase">
                  {complianceStatus.replace('_', ' ')}
                </span>
              </div>
              <div className="mt-2 font-bold text-amber-950 text-[11px] leading-tight">
                Voice alerts active · Text-back not yet live
              </div>
              <p className="mt-1 text-[10px] text-amber-800 leading-snug">
                Carrier vetting in progress (3 days – 4 weeks). Voice forwarding captures missed calls now.
              </p>
              <div className="mt-2.5 flex items-center justify-between border-t border-amber-200/60 pt-2 text-[10px]">
                <span className="text-amber-800">State: <strong className="font-mono">{complianceStatus}</strong></span>
                <Link href="/dashboard/compliance" className="font-bold text-amber-900 underline hover:text-amber-950">
                  View Tracker &rarr;
                </Link>
              </div>
            </div>
          )}
        </div>

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
              <span className="font-extrabold text-slate-900 text-sm">MCR</span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Section 14: Demo Mode Badge */}
            <div className="flex items-center gap-1.5 rounded-full border border-amber-300 bg-amber-50 px-2.5 py-1 text-[11px] font-bold text-amber-900 shadow-xs">
              <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse"></span>
              <span>DEMO ACCOUNT</span>
            </div>

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
                    <span className="text-xs font-bold text-slate-900">Urgent Alerts</span>
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
                      <div className="font-semibold text-red-800">🚨 Water Heater Rupture</div>
                      <div className="text-slate-600 mt-0.5">Emergency customer at 123 Main St. Action required.</div>
                    </div>
                    <div className="rounded-lg bg-blue-50 p-2.5 text-xs border border-blue-100">
                      <div className="font-semibold text-blue-800">📞 Missed Call Recovered</div>
                      <div className="text-slate-600 mt-0.5">Customer responded &amp; qualified via SMS.</div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Mobile Top Menu Drawer (When hamburger toggled) */}
        {mobileMenuOpen && (
          <div className="border-b border-slate-200 bg-white p-4 md:hidden space-y-2">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-2">Navigation</div>
            <nav className="grid grid-cols-2 gap-2">
              {[...primaryNavItems, ...secondaryNavItems].map((item) => {
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
          <div className="fixed bottom-20 md:bottom-6 right-6 z-50 flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-3 text-xs font-semibold text-white shadow-2xl animate-bounce">
            <CheckCircle className="h-4 w-4 text-emerald-400" />
            <span>{simulationToast}</span>
          </div>
        )}

        {/* Page Content */}
        <main className="flex-1 p-4 sm:p-6 lg:p-8 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      {/* ---------------- SECTION 20: MOBILE STICKY BOTTOM NAV BAR ---------------- */}
      <nav className="fixed bottom-0 left-0 right-0 z-40 flex h-16 border-t border-slate-200 bg-white/95 backdrop-blur md:hidden">
        {mobileBottomItems.map((item) => {
          const isActive = pathname === item.href;
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition ${
                isActive ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
              }`}
            >
              <Icon className={`h-5 w-5 ${isActive ? 'text-blue-600' : 'text-slate-400'}`} />
              <span>{item.label}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className={`flex flex-1 flex-col items-center justify-center gap-1 text-[10px] font-semibold transition ${
            mobileMenuOpen ? 'text-blue-600' : 'text-slate-500 hover:text-slate-900'
          }`}
        >
          <MoreHorizontal className="h-5 w-5 text-slate-400" />
          <span>More</span>
        </button>
      </nav>

      {/* Help Modal */}
      {helpModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <HelpCircle className="h-5 w-5 text-blue-600" />
                <h3 className="font-bold text-slate-900">MCR Support &amp; Knowledge Base</h3>
              </div>
              <button onClick={() => setHelpModalOpen(false)} className="rounded-lg p-1 text-slate-400 hover:bg-slate-100">
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="space-y-3 text-xs text-slate-600">
              <p>
                <strong>Need help configuring conditional call forwarding?</strong><br />
                Visit our carrier guide in <Link href="/dashboard/forwarding" onClick={() => setHelpModalOpen(false)} className="text-blue-600 underline">Carrier Forwarding</Link> or dial your carrier activation code.
              </p>
              <p>
                <strong>Emergency Inquiries:</strong><br />
                Call our 24/7 Concierge Hotline: <strong className="text-slate-900">+1 (800) 555-MCR1</strong>
              </p>
              <p>
                <strong>Email Support:</strong><br />
                <span className="font-mono text-slate-800">support@mcr-recovery.com</span>
              </p>
            </div>
            <button
              onClick={() => setHelpModalOpen(false)}
              className="w-full rounded-xl bg-slate-900 py-2.5 text-xs font-bold text-white hover:bg-slate-800"
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
