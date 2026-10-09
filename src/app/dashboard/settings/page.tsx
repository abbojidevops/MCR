'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
import {
  Settings,
  Building,
  Clock,
  MessageSquare,
  Bell,
  Save,
  Plus,
  Trash2,
  CheckCircle,
  Webhook,
  Send,
  ExternalLink,
  ShieldCheck,
  PhoneCall,
  Sliders,
  HelpCircle,
  AlertTriangle,
  ArrowRight,
  CreditCard,
  Zap,
  Loader2,
  Key,
  Lock,
  RefreshCw,
  X,
} from 'lucide-react';
import { BusinessProfile, CannedReply, TradeKey } from '@/types';
import { COMPANY_INFO } from '@/lib/constants';
import { TRADE_TEMPLATES } from '@/lib/trade-templates';

export default function SettingsPage() {
  const [activeTab, setActiveTab] = useState<'profile' | 'hours' | 'intake' | 'canned' | 'integrations' | 'compliance' | 'billing'>('profile');
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [phoneNumbers, setPhoneNumbers] = useState<any[]>([]);
  const [cannedReplies, setCannedReplies] = useState<CannedReply[]>([]);
  const [billingInfo, setBillingInfo] = useState<any>(null);
  const [newTitle, setNewTitle] = useState('');
  const [newShortcut, setNewShortcut] = useState('');
  const [newBody, setNewBody] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [toastError, setToastError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('https://hooks.zapier.com/hooks/catch/sample/mcr');
  const [crmWebhookUrl, setCrmWebhookUrl] = useState('');
  const [crmWebhookSecret, setCrmWebhookSecret] = useState('');
  const [crmWebhookEvents, setCrmWebhookEvents] = useState<string[]>(['job.created', 'job.booked', 'job.updated']);
  const [isSavingWebhook, setIsSavingWebhook] = useState(false);
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<any>(null);

  // Intake Flow Settings
  const [customTradeQuestion, setCustomTradeQuestion] = useState(
    'What type of plumbing issue are you experiencing today?'
  );
  const [customEmergencyKeywords, setCustomEmergencyKeywords] = useState<string[]>([]);
  const [newCustomKeyword, setNewCustomKeyword] = useState('');
  const [isSavingIntake, setIsSavingIntake] = useState(false);

  const showToast = (message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  };

  const showToastError = (message: string) => {
    setToastError(message);
  };

  const fetchSettings = async () => {
    try {
      setLoading(true);
      setLoadError(null);
      const res = await fetch('/api/settings');
      if (!res.ok) {
        const errData = await res.json().catch(() => null);
        throw new Error(errData?.error || `Failed to load settings (HTTP ${res.status})`);
      }
      const data = await res.json();
      if (data.profile) {
        setProfile(data.profile);
        if (data.profile.custom_emergency_keywords) {
          setCustomEmergencyKeywords(data.profile.custom_emergency_keywords);
        }
        if (data.profile.custom_intake_question) {
          setCustomTradeQuestion(data.profile.custom_intake_question);
        }
        if (data.profile.crm_webhook_url) {
          setCrmWebhookUrl(data.profile.crm_webhook_url);
          setWebhookUrl(data.profile.crm_webhook_url);
        }
        if (data.profile.crm_webhook_secret) {
          setCrmWebhookSecret(data.profile.crm_webhook_secret);
        }
        if (data.profile.crm_webhook_events && Array.isArray(data.profile.crm_webhook_events)) {
          setCrmWebhookEvents(data.profile.crm_webhook_events);
        }
      }
      if (data.phoneNumbers) setPhoneNumbers(data.phoneNumbers);

      const crRes = await fetch('/api/canned-replies');
      if (!crRes.ok) throw new Error('Failed to load canned replies.');
      const crData = await crRes.json();
      if (crData.cannedReplies) setCannedReplies(crData.cannedReplies);

      const bRes = await fetch('/api/billing');
      if (!bRes.ok) throw new Error('Failed to load billing status.');
      const bData = await bRes.json();
      setBillingInfo(bData);
    } catch (err: any) {
      console.error(err);
      setLoadError(err?.message || 'Unable to load settings.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const handleSaveIntake = async () => {
    setIsSavingIntake(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: {
            custom_intake_question: customTradeQuestion,
            custom_emergency_keywords: customEmergencyKeywords,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setToastError(
          data?.error ||
            `Could not save the intake settings (HTTP ${res.status}). Your changes were not saved.`
        );
        return;
      }
      showToast('Intake qualification sequence and custom keywords saved.');
    } catch (err: any) {
      console.error(err);
      setToastError(err?.message || 'Network error — your changes were not saved.');
    } finally {
      setIsSavingIntake(false);
    }
  };

  const handleAddKeyword = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = newCustomKeyword.trim().toLowerCase();
    if (!trimmed) return;
    if (!customEmergencyKeywords.includes(trimmed)) {
      setCustomEmergencyKeywords([...customEmergencyKeywords, trimmed]);
    }
    setNewCustomKeyword('');
  };

  const handleRemoveKeyword = (keywordToRemove: string) => {
    setCustomEmergencyKeywords(customEmergencyKeywords.filter((k) => k !== keywordToRemove));
  };

  const handleSaveProfile = async () => {
    if (!profile) return;
    setIsSaving(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: {
            business_name: profile.business_name,
            trade: profile.trade,
            timezone: profile.timezone,
            notification_phone: profile.notification_phone,
            emergency_phone: profile.emergency_phone,
            carrier_name: profile.carrier_name,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setToastError(
          data?.error ||
            `Could not save the business profile (HTTP ${res.status}). Your changes were not saved.`
        );
        return;
      }
      showToast('Business settings successfully saved.');
    } catch (err: any) {
      console.error(err);
      setToastError(err?.message || 'Network error — your changes were not saved.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddCannedReply = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim() || !newBody.trim()) return;

    try {
      const res = await fetch('/api/canned-replies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: newTitle,
          shortcut: newShortcut.startsWith('/') ? newShortcut : `/${newShortcut}`,
          bodyText: newBody,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setToastError(
          data?.error || `Could not add the canned reply (HTTP ${res.status}). Please try again.`
        );
        return;
      }
      setCannedReplies([...cannedReplies, data.cannedReply]);
      setNewTitle('');
      setNewShortcut('');
      setNewBody('');
      showToast('New canned reply template added.');
    } catch (err: any) {
      console.error(err);
      setToastError(err?.message || 'Network error — the canned reply was not saved.');
    }
  };

  const handleSaveWebhookSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setIsSavingWebhook(true);
    try {
      const res = await fetch('/api/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          updates: {
            crm_webhook_url: crmWebhookUrl,
            crm_webhook_secret: crmWebhookSecret,
            crm_webhook_events: crmWebhookEvents,
          },
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setToastError(
          data?.error ||
            `Could not save the webhook settings (HTTP ${res.status}). Your changes were not saved.`
        );
        return;
      }
      showToast('CRM Webhook settings and HMAC security configuration saved.');
    } catch (err: any) {
      console.error(err);
      setToastError(err?.message || 'Network error — your changes were not saved.');
    } finally {
      setIsSavingWebhook(false);
    }
  };

  const handleGenerateSecret = () => {
    const chars = '0123456789abcdef';
    let rand = '';
    for (let i = 0; i < 32; i++) {
      rand += chars[Math.floor(Math.random() * chars.length)];
    }
    setCrmWebhookSecret(`mcr_sec_${rand}`);
  };

  const toggleWebhookEvent = (ev: string) => {
    if (crmWebhookEvents.includes(ev)) {
      setCrmWebhookEvents(crmWebhookEvents.filter((e) => e !== ev));
    } else {
      setCrmWebhookEvents([...crmWebhookEvents, ev]);
    }
  };

  const handleTestWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTestingWebhook(true);
    setWebhookResult(null);
    try {
      const targetUrl = crmWebhookUrl.trim() || webhookUrl.trim();
      const res = await fetch('/api/integrations/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl: targetUrl,
          secret: crmWebhookSecret.trim() || undefined,
        }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        setWebhookResult({
          success: false,
          error: data?.error || `Test webhook failed (HTTP ${res.status}).`,
        });
        return;
      }
      setWebhookResult(data);
    } catch (err: any) {
      setWebhookResult({ success: false, error: err?.message || 'Network error sending test webhook.' });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const mcrNumber = phoneNumbers[0]?.formatted_number || '+1 (217) 555-0190';

  return (
    <div className="space-y-6 max-w-4xl pb-16">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Settings &amp; Configuration</h1>
        <p className="text-xs text-slate-500">
          Manage your trade profile, carrier forwarding, intake questions, canned SMS shortcuts, and compliance.
        </p>
      </div>

      {toast && (
        <div
          role="status"
          className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2"
        >
          <CheckCircle className="h-4 w-4 text-emerald-600" aria-hidden="true" />{' '}
          <span className="flex-1">{toast}</span>
          <button
            type="button"
            onClick={() => setToast(null)}
            aria-label="Dismiss notification"
            className="rounded p-0.5 text-emerald-700 hover:bg-emerald-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {toastError && (
        <div
          role="alert"
          className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs font-semibold text-rose-800 flex items-center gap-2"
        >
          <AlertTriangle className="h-4 w-4 text-rose-600" aria-hidden="true" />{' '}
          <span className="flex-1">{toastError}</span>
          <button
            type="button"
            onClick={() => setToastError(null)}
            aria-label="Dismiss error"
            className="rounded p-0.5 text-rose-700 hover:bg-rose-100"
          >
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      )}

      {loadError && (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50 p-6 text-center text-rose-800"
        >
          <AlertTriangle className="h-8 w-8 mx-auto mb-2 text-rose-600" aria-hidden="true" />
          <h2 className="font-bold text-base">Settings could not be loaded.</h2>
          <p className="mt-1 text-xs text-rose-700">{loadError}</p>
          <button
            type="button"
            onClick={fetchSettings}
            className="mt-4 rounded-xl bg-rose-600 px-4 py-2 text-xs font-semibold text-white hover:bg-rose-700"
          >
            Try Again
          </button>
        </div>
      )}

      {loading && !profile && !loadError && (
        <div className="space-y-4" aria-hidden="true">
          <div className="h-10 w-full animate-pulse rounded-xl bg-slate-200" />
          <div className="h-64 animate-pulse rounded-2xl bg-slate-200" />
          <div className="h-40 animate-pulse rounded-2xl bg-slate-200" />
        </div>
      )}

      {/* Settings Navigation Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-200 gap-1 text-xs font-semibold">
        <button
          type="button"
          aria-current={activeTab === 'profile' ? 'page' : undefined}
          onClick={() => setActiveTab('profile')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 whitespace-nowrap transition ${
            activeTab === 'profile'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Building className="h-3.5 w-3.5" /> Business Profile
        </button>

        <button
          type="button"
          aria-current={activeTab === 'hours' ? 'page' : undefined}
          onClick={() => setActiveTab('hours')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 whitespace-nowrap transition ${
            activeTab === 'hours'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Clock className="h-3.5 w-3.5" /> Hours &amp; After-Hours
        </button>

        <button
          type="button"
          aria-current={activeTab === 'intake' ? 'page' : undefined}
          onClick={() => setActiveTab('intake')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 whitespace-nowrap transition ${
            activeTab === 'intake'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" /> Intake Questions
        </button>

        <button
          type="button"
          aria-current={activeTab === 'canned' ? 'page' : undefined}
          onClick={() => setActiveTab('canned')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 whitespace-nowrap transition ${
            activeTab === 'canned'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <MessageSquare className="h-3.5 w-3.5" /> Canned Replies
        </button>

        <button
          type="button"
          aria-current={activeTab === 'integrations' ? 'page' : undefined}
          onClick={() => setActiveTab('integrations')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 whitespace-nowrap transition ${
            activeTab === 'integrations'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <Webhook className="h-3.5 w-3.5" /> Webhooks &amp; CRM
        </button>

        <button
          type="button"
          aria-current={activeTab === 'compliance' ? 'page' : undefined}
          onClick={() => setActiveTab('compliance')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 whitespace-nowrap transition ${
            activeTab === 'compliance'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShieldCheck className="h-3.5 w-3.5" /> TCPA &amp; Telecom
        </button>

        <button
          type="button"
          aria-current={activeTab === 'billing' ? 'page' : undefined}
          onClick={() => setActiveTab('billing')}
          className={`flex items-center gap-1.5 border-b-2 px-3 py-2.5 whitespace-nowrap transition ${
            activeTab === 'billing'
              ? 'border-blue-600 text-blue-600 font-bold'
              : 'border-transparent text-slate-600 hover:text-slate-900'
          }`}
        >
          <CreditCard className="h-3.5 w-3.5" /> Billing &amp; Usage
        </button>
      </div>

      {/* ---------------- TAB 1: BUSINESS PROFILE ---------------- */}
      {activeTab === 'profile' && profile && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Trade Business Information</h2>
              </div>
              <span className="text-[10px] font-semibold text-slate-500 uppercase tracking-wider">
                Account ID: {profile.account_id}
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Company Name</label>
                <input
                  type="text"
                  value={profile.business_name}
                  onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-400">Included in the automated text-back greeting.</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Primary Trade</label>
                <select
                  value={profile.trade}
                  onChange={(e) => setProfile({ ...profile, trade: e.target.value as TradeKey })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="plumbing">Plumbing</option>
                  <option value="hvac">HVAC / Heating &amp; Cooling</option>
                  <option value="electrical">Electrical</option>
                  <option value="roofing">Roofing</option>
                  <option value="garage_door">Garage Door Services</option>
                  <option value="locksmith">Locksmith</option>
                  <option value="appliance_repair">Appliance Repair</option>
                  <option value="landscaping">Landscaping &amp; Tree Service</option>
                  <option value="pest_control">Pest Control</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Owner Alert Cell Phone</label>
                <input
                  type="text"
                  value={profile.notification_phone || ''}
                  onChange={(e) => setProfile({ ...profile, notification_phone: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  placeholder="+1 (217) 555-0100"
                />
                <span className="text-[10px] text-slate-400">Receives SMS alerts when calls are missed or jobs qualify.</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Emergency Dispatch Line</label>
                <input
                  type="text"
                  value={profile.emergency_phone || ''}
                  onChange={(e) => setProfile({ ...profile, emergency_phone: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  placeholder="+1 (217) 555-0199"
                />
                <span className="text-[10px] text-slate-400">Target for high-priority emergency escalation alerts.</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Operating Timezone</label>
                <select
                  value={profile.timezone}
                  onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="America/New_York">Eastern Time (US &amp; Canada)</option>
                  <option value="America/Chicago">Central Time (US &amp; Canada)</option>
                  <option value="America/Denver">Mountain Time (US &amp; Canada)</option>
                  <option value="America/Los_Angeles">Pacific Time (US &amp; Canada)</option>
                </select>
                <span className="text-[10px] text-slate-400">Enforces TCPA quiet hours and scheduled reports.</span>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Primary Wireless Carrier</label>
                <select
                  value={profile.carrier_name || 'Verizon'}
                  onChange={(e) => setProfile({ ...profile, carrier_name: e.target.value })}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs"
                >
                  <option value="Verizon">Verizon Wireless (*71)</option>
                  <option value="AT&T">AT&amp;T Wireless (*004*)</option>
                  <option value="T-Mobile">T-Mobile (*61* / **61*)</option>
                  <option value="Other">Other Carrier / VoIP PBX</option>
                </select>
              </div>
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
              <button
                type="button"
                disabled={isSaving}
                onClick={handleSaveProfile}
                className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition"
              >
                <Save className="h-3.5 w-3.5" /> {isSaving ? 'Saving Changes...' : 'Save Profile Changes'}
              </button>
              <Link
                href="/dashboard/forwarding"
                className="inline-flex items-center gap-1 text-xs font-semibold text-blue-600 hover:text-blue-700"
              >
                Open Carrier Setup Wizard <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>

          {/* Assigned MCR Line Info */}
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-5 text-xs flex items-center justify-between">
            <div>
              <div className="font-bold text-slate-900 flex items-center gap-2">
                <PhoneCall className="h-4 w-4 text-emerald-600" />
                <span>Dedicated MCR Recovery Line:</span>
                <span className="font-mono text-blue-600 font-extrabold text-sm">{mcrNumber}</span>
              </div>
              <p className="mt-1 text-slate-500 text-[11px]">
                Forward unanswered calls from your main line to this number using conditional call forwarding.
              </p>
            </div>
            <Link
              href="/dashboard/forwarding"
              className="rounded-lg bg-white border border-slate-300 px-3 py-1.5 font-bold text-slate-700 hover:bg-slate-100"
            >
              Verify Routing
            </Link>
          </div>
        </div>
      )}

      {/* ---------------- TAB 2: BUSINESS HOURS ---------------- */}
      {activeTab === 'hours' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Clock className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Business Hours &amp; Routing</h2>
            </div>

            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900" role="status">
              <div className="font-bold text-amber-950">Weekly business-hour scheduling is not available</div>
              <p className="mt-1 leading-relaxed">
                MCR does not store your weekly opening hours or use them to change call routing or text-back messages.
                There is no separate after-hours message setting today, so this page has no schedule to save.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700">
              <h3 className="font-bold text-slate-900">What MCR does today</h3>
              <ul className="mt-2 list-disc space-y-1 pl-5 leading-relaxed">
                <li>Missed-call text-backs are sent as soon as possible, subject to the caller&apos;s local TCPA quiet-hours window (8:00 AM–9:00 PM).</li>
                <li>Messages outside that window are held until the next permitted time.</li>
                <li>Emergency keywords can still trigger owner alerts at any hour.</li>
              </ul>
              <p className="mt-3 leading-relaxed">
                Your operating timezone is used for platform quiet-hour calculations and scheduled reports. It does not create a weekly business-hours schedule.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 3: INTAKE QUESTIONS ---------------- */}
      {activeTab === 'intake' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Sliders className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Qualification &amp; Intake Flow</h2>
            </div>
            <p className="text-xs text-slate-500">
              Customize the automated questions sent to missed callers to qualify the lead before you call back.
            </p>

            <div className="space-y-4 text-xs">
              {/* Question 1: Trade description */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>Question 1: Initial Problem Description</span>
                  <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold">
                    Always Enabled
                  </span>
                </div>
                <input
                  type="text"
                  value={customTradeQuestion}
                  onChange={(e) => setCustomTradeQuestion(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2 text-xs"
                />
                <span className="text-[10px] text-slate-400">
                  Example: &quot;What can we help you with today?&quot; or &quot;What type of plumbing problem do you have?&quot;
                </span>
              </div>

              {/* Question 2: Emergency detection */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>Question 2: Emergency Status Keyword Detection</span>
                  <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold">
                    Always Enabled
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  Every reply is scanned against the emergency keywords for your trade, plus any custom
                  keywords you add below. A match flags the lead as an emergency and escalates an alert to
                  your owner cell phone immediately.
                </p>

                {/* Custom Emergency Keywords Editor */}
                <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                  <label className="block font-semibold text-slate-700 text-[11px]">
                    Custom Business Emergency Keywords
                  </label>
                  <p className="text-[10px] text-slate-400">
                    Add specific words or phrases unique to your business (e.g. &quot;sump pump&quot;, &quot;slab leak&quot;, &quot;sewer backup&quot;, &quot;main line&quot;).
                  </p>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={newCustomKeyword}
                      onChange={(e) => setNewCustomKeyword(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleAddKeyword();
                        }
                      }}
                      placeholder="e.g. sump pump"
                      className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs focus:ring-1 focus:ring-blue-500"
                    />
                    <button
                      type="button"
                      onClick={() => handleAddKeyword()}
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-800 px-3 py-1.5 text-xs font-bold text-white hover:bg-slate-900 transition cursor-pointer"
                    >
                      <Plus className="h-3.5 w-3.5" /> Add Keyword
                    </button>
                  </div>

                  {customEmergencyKeywords.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mt-2 pt-1">
                      {customEmergencyKeywords.map((kw) => (
                        <span
                          key={kw}
                          className="inline-flex items-center gap-1 rounded-full bg-rose-50 border border-rose-200 px-2.5 py-0.5 text-[11px] font-semibold text-rose-700"
                        >
                          {kw}
                          <button
                            type="button"
                            onClick={() => handleRemoveKeyword(kw)}
                            className="hover:text-rose-900 ml-0.5 text-xs font-bold cursor-pointer"
                          >
                            ×
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* Questions 3 & 4: fixed by trade template */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-3">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>Questions 3 &amp; 4: Service Address &amp; Photo Request</span>
                  <span className="text-[10px] bg-blue-50 text-blue-700 px-2 py-0.5 rounded font-semibold">
                    Set By Trade
                  </span>
                </div>
                <p className="text-[11px] text-slate-500">
                  These two steps are part of the fixed sequence for your selected trade and cannot be
                  toggled off. Here is the exact sequence MCR sends today:
                </p>
                <ol className="space-y-2">
                  {(TRADE_TEMPLATES[profile?.trade || 'plumbing']?.questions || []).map((q, i) => (
                    <li
                      key={q.key}
                      className="rounded-lg border border-slate-100 bg-slate-50 p-2.5 text-[11px] text-slate-700"
                    >
                      <span className="font-bold text-slate-900">Step {i + 1}:</span> {q.text}
                    </li>
                  ))}
                </ol>
                <p className="text-[10px] text-slate-400">
                  Photo steps are sent as an MMS-capable prompt; the customer may skip any step by
                  replying freely, and MCR continues the conversation either way.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={handleSaveIntake}
              disabled={isSavingIntake}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
            >
              {isSavingIntake ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Save className="h-3.5 w-3.5" />
              )}
              {isSavingIntake ? 'Saving...' : 'Save Intake Questions'}
            </button>
          </div>
        </div>
      )}

      {/* ---------------- TAB 4: CANNED REPLIES ---------------- */}
      {activeTab === 'canned' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <MessageSquare className="h-4 w-4 text-indigo-600" />
              <h2 className="text-sm font-bold text-slate-900">Custom Canned SMS Templates</h2>
            </div>
            <p className="text-xs text-slate-500">
              These 1-tap shortcuts appear in your Two-Way SMS Inbox so field technicians can reply instantly from a truck.
            </p>

            <div className="space-y-2.5">
              {cannedReplies.map((cr) => (
                <div
                  key={cr.id}
                  className="flex items-start justify-between rounded-xl border border-slate-100 bg-slate-50 p-3.5 text-xs"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-slate-900">{cr.title}</span>
                      <span className="font-mono text-[10px] text-blue-700 bg-blue-100/70 px-2 py-0.5 rounded font-bold">
                        {cr.shortcut}
                      </span>
                    </div>
                    <p className="text-slate-600 text-[11px] leading-relaxed">{cr.body}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Canned Reply Form */}
            <form onSubmit={handleAddCannedReply} className="border-t border-slate-100 pt-4 space-y-3 text-xs">
              <h3 className="font-bold text-slate-900">Add New Quick-Reply Template</h3>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Shortcut Title</label>
                  <input
                    type="text"
                    placeholder="e.g. Technician En Route"
                    value={newTitle}
                    onChange={(e) => setNewTitle(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
                <div>
                  <label className="block text-slate-700 font-semibold mb-1">Command Shortcut</label>
                  <input
                    type="text"
                    placeholder="e.g. /eta"
                    value={newShortcut}
                    onChange={(e) => setNewShortcut(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                  />
                </div>
              </div>
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Message Body</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Hi! Our technician Mike is en route and will arrive in approximately 15 minutes."
                  value={newBody}
                  onChange={(e) => setNewBody(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 p-2.5 text-xs"
                ></textarea>
              </div>
              <button
                type="submit"
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800"
              >
                <Plus className="h-3.5 w-3.5" /> Add Canned Template
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ---------------- TAB 5: INTEGRATIONS & WEBHOOKS ---------------- */}
      {activeTab === 'integrations' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-6">
            <div className="flex items-center justify-between border-b border-slate-100 pb-4">
              <div className="flex items-center gap-2">
                <Webhook className="h-5 w-5 text-emerald-600" />
                <div>
                  <h2 className="text-sm font-bold text-slate-900">Third-Party CRM &amp; Webhook Dispatch</h2>
                  <p className="text-[11px] text-slate-500">
                    Forward recovered missed-call leads and booked job cards to Jobber, Housecall Pro, ServiceTitan, Zapier, or Make.
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-bold text-emerald-700 border border-emerald-200 flex items-center gap-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                HMAC Signed
              </span>
            </div>

            {/* Webhook Configuration Form */}
            <form onSubmit={handleSaveWebhookSettings} className="space-y-4 text-xs">
              {/* Endpoint URL */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  Target Webhook URL (POST)
                </label>
                <input
                  type="url"
                  value={crmWebhookUrl}
                  onChange={(e) => {
                    setCrmWebhookUrl(e.target.value);
                    setWebhookUrl(e.target.value);
                  }}
                  placeholder="https://hooks.zapier.com/hooks/catch/... or https://api.getjobber.com/..."
                  className="w-full rounded-xl border border-slate-300 p-2.5 font-mono text-xs focus:ring-1 focus:ring-blue-500"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Must begin with https:// or http://. Dispatched asynchronously with automated retries.
                </span>
              </div>

              {/* Signing Secret */}
              <div>
                <label className="block text-slate-700 font-semibold mb-1">
                  HMAC-SHA256 Signing Secret (Optional)
                </label>
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Key className="absolute left-3 top-2.5 h-3.5 w-3.5 text-slate-400" />
                    <input
                      type="text"
                      value={crmWebhookSecret}
                      onChange={(e) => setCrmWebhookSecret(e.target.value)}
                      placeholder="e.g. mcr_sec_9f82a17b8c..."
                      className="w-full rounded-xl border border-slate-300 pl-8 pr-3 py-2 font-mono text-xs focus:ring-1 focus:ring-blue-500"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleGenerateSecret}
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-semibold text-slate-700 hover:bg-slate-100 transition cursor-pointer"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-slate-500" /> Generate Secret
                  </button>
                </div>
                <span className="text-[10px] text-slate-400 mt-1 block">
                  When specified, each outbound POST includes a computed cryptographic signature in the <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-700">X-MCR-Signature: sha256=...</code> header.
                </span>
              </div>

              {/* Event Subscriptions */}
              <div>
                <label className="block text-slate-700 font-semibold mb-2">
                  Subscribed Trigger Events
                </label>
                <div className="grid gap-2 sm:grid-cols-3">
                  <div
                    onClick={() => toggleWebhookEvent('job.created')}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      crmWebhookEvents.includes('job.created')
                        ? 'bg-blue-50/60 border-blue-200 text-blue-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={crmWebhookEvents.includes('job.created')}
                      onChange={() => {}}
                      className="mt-0.5 h-3.5 w-3.5 rounded text-blue-600 pointer-events-none"
                    />
                    <div>
                      <div className="font-bold text-[11px]">job.created</div>
                      <div className="text-[10px] text-slate-500">Intake session qualified lead</div>
                    </div>
                  </div>

                  <div
                    onClick={() => toggleWebhookEvent('job.booked')}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      crmWebhookEvents.includes('job.booked')
                        ? 'bg-blue-50/60 border-blue-200 text-blue-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={crmWebhookEvents.includes('job.booked')}
                      onChange={() => {}}
                      className="mt-0.5 h-3.5 w-3.5 rounded text-blue-600 pointer-events-none"
                    />
                    <div>
                      <div className="font-bold text-[11px]">job.booked</div>
                      <div className="text-[10px] text-slate-500">Contractor books service call</div>
                    </div>
                  </div>

                  <div
                    onClick={() => toggleWebhookEvent('job.updated')}
                    className={`flex items-start gap-2.5 p-3 rounded-xl border cursor-pointer transition ${
                      crmWebhookEvents.includes('job.updated')
                        ? 'bg-blue-50/60 border-blue-200 text-blue-900'
                        : 'bg-slate-50 border-slate-200 text-slate-600'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={crmWebhookEvents.includes('job.updated')}
                      onChange={() => {}}
                      className="mt-0.5 h-3.5 w-3.5 rounded text-blue-600 pointer-events-none"
                    />
                    <div>
                      <div className="font-bold text-[11px]">job.updated</div>
                      <div className="text-[10px] text-slate-500">Ticket notes or price modified</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Action Buttons */}
              <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-slate-100">
                <button
                  type="submit"
                  disabled={isSavingWebhook}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 font-bold text-white hover:bg-blue-700 disabled:opacity-50 transition cursor-pointer"
                >
                  {isSavingWebhook ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Save className="h-3.5 w-3.5" />
                  )}
                  {isSavingWebhook ? 'Saving...' : 'Save Webhook Settings'}
                </button>

                <button
                  type="button"
                  onClick={handleTestWebhook}
                  disabled={isTestingWebhook || (!crmWebhookUrl && !webhookUrl)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition cursor-pointer"
                >
                  <Send className="h-3.5 w-3.5" />
                  {isTestingWebhook ? 'Sending Test...' : 'Send Test Webhook'}
                </button>
              </div>

              {/* Test Result Pane */}
              {webhookResult && (
                <div
                  className={`mt-4 rounded-xl border p-4 font-mono text-[11px] ${
                    webhookResult.success
                      ? 'bg-emerald-50/80 border-emerald-200 text-emerald-900'
                      : 'bg-red-50/80 border-red-200 text-red-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold mb-1.5">
                    <span className="flex items-center gap-1.5">
                      <span className={`h-2 w-2 rounded-full ${webhookResult.success ? 'bg-emerald-500' : 'bg-red-500'}`} />
                      Status: {webhookResult.statusCode || webhookResult.status || (webhookResult.success ? '200 OK' : 'Failed')}
                    </span>
                    <span>{webhookResult.success ? '✓ Payload Successfully Dispatched' : 'Dispatch Failed'}</span>
                  </div>
                  {webhookResult.signature && (
                    <div className="text-[10px] text-slate-600 mb-1">
                      Header: <code className="bg-white/80 px-1 py-0.5 rounded border border-slate-200">X-MCR-Signature: {webhookResult.signature}</code>
                    </div>
                  )}
                  <pre className="overflow-x-auto text-[10px] max-h-40 bg-white/90 p-3 rounded-lg border border-slate-200 mt-2">
                    {JSON.stringify(webhookResult.sentPayload || webhookResult.dispatchedPayload || webhookResult, null, 2)}
                  </pre>
                </div>
              )}
            </form>

            {/* CRM Field Mapping & Compatibility Guide */}
            <div className="border-t border-slate-100 pt-5">
              <h3 className="text-xs font-bold text-slate-800 mb-2">Supported Field Service &amp; CRM Integrations</h3>
              <div className="grid gap-3 sm:grid-cols-3 text-[11px]">
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="font-bold text-slate-800">Jobber</div>
                  <p className="text-slate-500 text-[10px] mt-0.5">
                    Paste your Zapier / Make Webhook catcher URL to automatically generate client requests and scheduled jobs in Jobber.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="font-bold text-slate-800">Housecall Pro</div>
                  <p className="text-slate-500 text-[10px] mt-0.5">
                    Stream new leads, service addresses, and customer contact info directly into Housecall Pro customer records.
                  </p>
                </div>
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                  <div className="font-bold text-slate-800">ServiceTitan / Zapier</div>
                  <p className="text-slate-500 text-[10px] mt-0.5">
                    Verify payload integrity using HMAC-SHA256 headers before creating booking requests in ServiceTitan.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 6: TCPA & TELECOM COMPLIANCE ---------------- */}
      {activeTab === 'compliance' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">TCPA &amp; A2P 10DLC Compliance Guardrails</h2>
              </div>
              <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200">
                Guardrails Active
              </span>
            </div>

            <div className="space-y-3 text-xs">
              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 flex items-start gap-3">
                <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">TCPA Quiet Hours Enforcement</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    No marketing text-backs are dispatched before 8:00 AM or after 9:00 PM in the caller&apos;s local timezone. Messages during quiet hours queue or provide emergency escalation options only.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 flex items-start gap-3">
                <CheckCircle className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-slate-900">Automatic STOP / UNSUBSCRIBE Suppression</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    If any caller replies with STOP, UNSUBSCRIBE, CANCEL, or END, the number is instantly added to the suppression list and all future automated text-backs are permanently blocked.
                  </p>
                </div>
              </div>

              <div className="rounded-xl border border-slate-100 bg-slate-50 p-3.5 flex items-start gap-3">
                <Clock className="h-4 w-4 text-slate-500 mt-0.5 shrink-0" aria-hidden="true" />
                <div>
                  <div className="font-bold text-slate-900">Quiet Hours</div>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    Text-backs are held outside 8:00 AM – 9:00 PM in the caller&apos;s local timezone and
                    released at the next permitted time.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/dashboard/compliance"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-50"
              >
                View A2P 10DLC Registration Status <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ---------------- TAB 7: BILLING & USAGE ---------------- */}
      {activeTab === 'billing' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4 w-4 text-blue-600" />
                <h2 className="text-sm font-bold text-slate-900">Subscription Plan &amp; Monthly Usage</h2>
              </div>
              {billingInfo?.currentPlan?.id ? (
                <span className="rounded-full bg-blue-50 px-2.5 py-0.5 text-[10px] font-bold text-blue-700 border border-blue-200">
                  Current Plan: {billingInfo.currentPlan.name}
                </span>
              ) : (
                <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-[10px] font-bold text-slate-600 border border-slate-200">
                  Plan status unavailable
                </span>
              )}
            </div>

            {/* 80% Usage Warning Notice if applicable */}
            {billingInfo?.usageWarning && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-950">Approaching Monthly Call Cap (80%+)</div>
                  <p className="mt-0.5 text-amber-800">
                    {billingInfo.overageNotice ||
                      `You've used ${billingInfo?.usage?.calls_count ?? 0} of ${
                        billingInfo?.currentPlan?.included_calls ?? 0
                      } calls this month.`}
                  </p>
                </div>
              </div>
            )}

            {/* Usage Progress Card */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">Monthly Call Volume Usage</span>
                <span className="font-mono text-slate-500">
                  <strong>{billingInfo?.usage?.calls_count ?? '—'}</strong> of{' '}
                  {billingInfo?.currentPlan?.included_calls ?? '—'} included calls
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    (billingInfo?.usagePercent ?? 0) >= 80 ? 'bg-amber-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${Math.min(100, billingInfo?.usagePercent ?? 0)}%` }}
                ></div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Soft Cap Protection: Automated text-backs never halt mid-emergency</span>
                <span className="font-semibold text-slate-700">
                  Overage Rate: $
                  {billingInfo?.currentPlan?.id && billingInfo?.planConfig?.[billingInfo.currentPlan.id]
                    ? billingInfo.planConfig[billingInfo.currentPlan.id].overageRate.toFixed(2)
                    : '—'}
                  /call
                </span>
              </div>
            </div>

            {/* Plan Tiers Overview */}
            <div className="grid gap-4 sm:grid-cols-3 pt-2">
              {/* Starter */}
              <div className={`rounded-xl border p-4 text-xs space-y-3 ${
                billingInfo?.currentPlan?.id === 'starter' ? 'border-blue-600 ring-1 ring-blue-600 bg-blue-50/20' : 'border-slate-200'
              }`}>
                <div>
                  <h3 className="font-bold text-slate-900">Starter</h3>
                  <div className="text-xl font-black text-slate-900 mt-1">$79<span className="text-xs font-normal text-slate-500">/mo</span></div>
                  <p className="text-[11px] text-slate-500 mt-1">40 missed calls included · $0.35/overage</p>
                </div>
                <ul className="space-y-1.5 text-[11px] text-slate-600">
                  <li>✓ Missed-call detection (&lt;60s)</li>
                  <li>✓ Automated SMS text-back</li>
                  <li>✓ Basic qualification intake</li>
                  <li>✓ Soft cap overage billing</li>
                </ul>
              </div>

              {/* Pro */}
              <div className={`rounded-xl border p-4 text-xs space-y-3 ${
                billingInfo?.currentPlan?.id === 'pro' ? 'border-blue-600 ring-1 ring-blue-600 bg-blue-50/20' : 'border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">Pro</h3>
                  <span className="rounded bg-blue-100 text-blue-800 px-1.5 py-0.5 text-[9px] font-bold">POPULAR</span>
                </div>
                <div>
                  <div className="text-xl font-black text-slate-900 mt-1">$149<span className="text-xs font-normal text-slate-500">/mo</span></div>
                  <p className="text-[11px] text-slate-500 mt-1">200 missed calls included · $0.25/overage</p>
                </div>
                <ul className="space-y-1.5 text-[11px] text-slate-600">
                  <li>✓ Everything in Starter</li>
                  <li>✓ Photo &amp; media intake</li>
                  <li>✓ Emergency escalation alerts</li>
                  <li>✓ Daily 6 PM &amp; weekly reports</li>
                </ul>
              </div>

              {/* Business */}
              <div className={`rounded-xl border p-4 text-xs space-y-3 ${
                billingInfo?.currentPlan?.id === 'business' ? 'border-blue-600 ring-1 ring-blue-600 bg-blue-50/20' : 'border-slate-200'
              }`}>
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-slate-900">Business</h3>
                  {billingInfo?.currentPlan?.id === 'business' && (
                    <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[9px] font-bold">
                      CURRENT
                    </span>
                  )}
                </div>
                <div>
                  <div className="text-xl font-black text-slate-900 mt-1">$299<span className="text-xs font-normal text-slate-500">/mo</span></div>
                  <p className="text-[11px] text-slate-500 mt-1">600 missed calls included · $0.15/overage</p>
                </div>
                <ul className="space-y-1.5 text-[11px] text-slate-600">
                  <li>✓ Everything in Pro</li>
                  <li>✓ Multi-line rollover routing</li>
                  <li>✓ Priority telecom routing</li>
                  <li>✓ Dedicated compliance manager</li>
                </ul>
                <div className="pt-2">
                  <a
                    href={`mailto:${COMPANY_INFO.email}?subject=Business%20Rollout%20Consultation`}
                    className="block text-center rounded-lg bg-slate-900 text-white font-bold py-2 text-xs hover:bg-slate-800"
                  >
                    Schedule Rollout
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
