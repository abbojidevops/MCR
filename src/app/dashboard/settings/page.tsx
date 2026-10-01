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
} from 'lucide-react';
import { BusinessProfile, CannedReply, TradeKey } from '@/types';

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
  const [isSaving, setIsSaving] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('https://hooks.zapier.com/hooks/catch/sample/mcr');
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<any>(null);

  // Business Hours & After-Hours State
  const [afterHoursEnabled, setAfterHoursEnabled] = useState(true);
  const [afterHoursMessage, setAfterHoursMessage] = useState(
    'Thanks for calling Apex Plumbing! Our office is closed for the evening. If you have an active leak or urgent emergency, reply YES and we will page our on-call technician immediately.'
  );
  const [openTime, setOpenTime] = useState('07:00');
  const [closeTime, setCloseTime] = useState('18:00');

  // Intake Flow Settings
  const [emergencyKeywordAlerts, setEmergencyKeywordAlerts] = useState(true);
  const [collectAddress, setCollectAddress] = useState(true);
  const [collectPhotos, setCollectPhotos] = useState(true);
  const [customTradeQuestion, setCustomTradeQuestion] = useState(
    'What type of plumbing issue are you experiencing today?'
  );

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings');
      const data = await res.json();
      if (data.profile) setProfile(data.profile);
      if (data.phoneNumbers) setPhoneNumbers(data.phoneNumbers);

      const crRes = await fetch('/api/canned-replies');
      const crData = await crRes.json();
      if (crData.cannedReplies) setCannedReplies(crData.cannedReplies);

      const bRes = await fetch('/api/billing');
      const bData = await bRes.json();
      setBillingInfo(bData);
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

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
      const data = await res.json();
      if (data.success) {
        setToast('Business settings successfully saved.');
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err) {
      console.error(err);
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
      const data = await res.json();
      if (data.success) {
        setCannedReplies([...cannedReplies, data.cannedReply]);
        setNewTitle('');
        setNewShortcut('');
        setNewBody('');
        setToast('New canned reply template added.');
        setTimeout(() => setToast(null), 3000);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const handleTestWebhook = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsTestingWebhook(true);
    setWebhookResult(null);
    try {
      const res = await fetch('/api/integrations/webhook', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          webhookUrl,
        }),
      });
      const data = await res.json();
      setWebhookResult(data);
    } catch (err: any) {
      setWebhookResult({ success: false, error: err.message });
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
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-2">
          <CheckCircle className="h-4 w-4 text-emerald-600" /> {toast}
        </div>
      )}

      {/* Settings Navigation Tabs */}
      <div className="flex overflow-x-auto border-b border-slate-200 gap-1 text-xs font-semibold">
        <button
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

      {/* ---------------- TAB 2: BUSINESS HOURS & AFTER-HOURS ---------------- */}
      {activeTab === 'hours' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-5">
            <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
              <Clock className="h-4 w-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">Standard Operating Schedule</h2>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Standard Opening Time</label>
                <input
                  type="time"
                  value={openTime}
                  onChange={(e) => setOpenTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Standard Closing Time</label>
                <input
                  type="time"
                  value={closeTime}
                  onChange={(e) => setCloseTime(e.target.value)}
                  className="w-full rounded-lg border border-slate-300 px-3 py-2 text-xs"
                />
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <div className="font-semibold text-slate-700">Weekly Schedule</div>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'].map((day, idx) => (
                  <div
                    key={day}
                    className={`rounded-xl border p-2.5 text-center ${
                      idx < 5
                        ? 'border-blue-200 bg-blue-50/50 text-blue-900'
                        : idx === 5
                        ? 'border-slate-200 bg-slate-50 text-slate-700'
                        : 'border-slate-100 bg-slate-50 text-slate-400'
                    }`}
                  >
                    <div className="font-bold">{day}</div>
                    <div className="text-[10px] mt-0.5">
                      {idx < 5 ? `${openTime} - ${closeTime}` : idx === 5 ? '8:00 AM - 1:00 PM' : 'Closed (After-Hours)'}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* After-Hours Behavior */}
            <div className="border-t border-slate-100 pt-4 space-y-3 text-xs">
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-900">After-Hours Auto Text-Back</div>
                  <p className="text-slate-500 text-[11px]">
                    Send a modified message when calls are missed outside of normal working hours.
                  </p>
                </div>
                <input
                  type="checkbox"
                  checked={afterHoursEnabled}
                  onChange={(e) => setAfterHoursEnabled(e.target.checked)}
                  className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                />
              </div>

              {afterHoursEnabled && (
                <div className="mt-2 space-y-2">
                  <label className="block font-medium text-slate-700 text-[11px]">
                    After-Hours Response Message
                  </label>
                  <textarea
                    rows={3}
                    value={afterHoursMessage}
                    onChange={(e) => setAfterHoursMessage(e.target.value)}
                    className="w-full rounded-xl border border-slate-300 p-3 text-xs focus:ring-1 focus:ring-blue-500"
                  />
                  <div className="text-[10px] text-slate-400">
                    Complies with TCPA regulations by honoring opt-outs and providing clear emergency escalation instructions.
                  </div>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                setToast('Operating hours and after-hours text-back saved.');
                setTimeout(() => setToast(null), 3000);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <Save className="h-3.5 w-3.5" /> Save Hours Settings
            </button>
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
                  <input
                    type="checkbox"
                    checked={emergencyKeywordAlerts}
                    onChange={(e) => setEmergencyKeywordAlerts(e.target.checked)}
                    className="h-4 w-4 rounded text-blue-600"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Automatically flags messages with &quot;burst&quot;, &quot;flooding&quot;, &quot;urgent&quot;, &quot;no heat&quot;, &quot;smoke&quot;, or &quot;leaking&quot; as emergencies and triggers high-priority alerts.
                </p>
              </div>

              {/* Question 3: Address collection */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>Question 3: Service Address Collection</span>
                  <input
                    type="checkbox"
                    checked={collectAddress}
                    onChange={(e) => setCollectAddress(e.target.checked)}
                    className="h-4 w-4 rounded text-blue-600"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Prompts the customer: &quot;What is the service address or neighborhood so our technician can check availability?&quot;
                </p>
              </div>

              {/* Question 4: Photo / MMS collection */}
              <div className="rounded-xl border border-slate-200 p-3.5 space-y-2">
                <div className="flex items-center justify-between font-bold text-slate-800">
                  <span>Question 4: Photo Upload Request (MMS)</span>
                  <input
                    type="checkbox"
                    checked={collectPhotos}
                    onChange={(e) => setCollectPhotos(e.target.checked)}
                    className="h-4 w-4 rounded text-blue-600"
                  />
                </div>
                <p className="text-[11px] text-slate-500">
                  Allows homeowners to text back photos of damaged equipment, model tags, or leaks directly into the conversation.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                setToast('Intake qualification sequence saved.');
                setTimeout(() => setToast(null), 3000);
              }}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-blue-700"
            >
              <Save className="h-3.5 w-3.5" /> Save Intake Questions
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
          <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <Webhook className="h-4 w-4 text-emerald-600" />
                <h2 className="text-sm font-bold text-slate-900">CRM &amp; Zapier Webhook Forwarding</h2>
              </div>
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                Live Outbound Push
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Automatically stream recovered leads, addresses, issue descriptions, and estimated job values to ServiceTitan, Housecall Pro, Jobber, or your custom Zapier / Make webhook.
            </p>

            <form onSubmit={handleTestWebhook} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-700 font-semibold mb-1">Target Webhook URL (POST)</label>
                <div className="flex gap-2">
                  <input
                    type="url"
                    required
                    value={webhookUrl}
                    onChange={(e) => setWebhookUrl(e.target.value)}
                    placeholder="https://hooks.zapier.com/hooks/catch/..."
                    className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs"
                  />
                  <button
                    type="submit"
                    disabled={isTestingWebhook}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 font-bold text-white hover:bg-emerald-700 disabled:opacity-50"
                  >
                    <Send className="h-3.5 w-3.5" />
                    {isTestingWebhook ? 'Sending...' : 'Test Webhook'}
                  </button>
                </div>
              </div>

              {webhookResult && (
                <div
                  className={`mt-3 rounded-xl border p-3.5 font-mono text-[11px] ${
                    webhookResult.success
                      ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                      : 'bg-red-50 border-red-200 text-red-900'
                  }`}
                >
                  <div className="flex items-center justify-between font-bold mb-1">
                    <span>Status: {webhookResult.statusCode || (webhookResult.success ? '200 OK' : 'Failed')}</span>
                    <span>{webhookResult.success ? '✓ Payload Dispatched' : 'Error'}</span>
                  </div>
                  <pre className="overflow-x-auto text-[10px] max-h-36 bg-white/80 p-2.5 rounded border border-slate-200 mt-1">
                    {JSON.stringify(webhookResult.dispatchedPayload || webhookResult, null, 2)}
                  </pre>
                </div>
              )}
            </form>
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
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                100% Protected
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

              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 flex items-start gap-3">
                <Clock className="h-4 w-4 text-amber-600 mt-0.5 shrink-0" />
                <div>
                  <div className="font-bold text-amber-950">A2P 10DLC Registration In Progress</div>
                  <p className="text-[11px] text-amber-900 mt-0.5">
                    Brand &amp; campaign registration awaiting carrier approval (3 days to 4 weeks). Voice alerts active · Outbound text-back live upon carrier approval.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-2">
              <Link
                href="/dashboard/compliance"
                className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-4 py-2 font-bold text-slate-700 hover:bg-slate-50"
              >
                Open Full TCPA Compliance Audit Log <ExternalLink className="h-3.5 w-3.5" />
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
              <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                Active Subscription
              </span>
            </div>

            {/* 80% Usage Warning Notice if applicable */}
            {billingInfo?.usageWarning && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-amber-950">Approaching Monthly Call Cap (80%+)</div>
                  <p className="mt-0.5 text-amber-800">
                    {billingInfo.overageNotice || `You've used ${billingInfo?.usage?.calls_processed || 32} of ${billingInfo?.currentPlan?.call_cap || 40} calls this month. Additional calls are $0.35 each, or upgrade to Pro for $149/mo (200 calls).`}
                  </p>
                </div>
              </div>
            )}

            {/* Usage Progress Card */}
            <div className="rounded-xl border border-slate-100 bg-slate-50 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-slate-700">Monthly Call Volume Usage</span>
                <span className="font-mono text-slate-500">
                  <strong>{billingInfo?.usage?.calls_processed || 68}</strong> of {billingInfo?.currentPlan?.call_cap || 600} included calls
                </span>
              </div>
              <div className="h-2 w-full rounded-full bg-slate-200 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    (billingInfo?.usagePercent || 11.3) >= 80 ? 'bg-amber-500' : 'bg-blue-600'
                  }`}
                  style={{ width: `${Math.min(100, billingInfo?.usagePercent || 11.3)}%` }}
                ></div>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500">
                <span>Soft Cap Protection: Automated text-backs never halt mid-emergency</span>
                <span className="font-semibold text-slate-700">
                  Overage Rate: ${billingInfo?.currentPlan?.id === 'starter' ? '0.35' : billingInfo?.currentPlan?.id === 'pro' ? '0.25' : '0.15'}/call
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
                  <span className="rounded bg-emerald-100 text-emerald-800 px-1.5 py-0.5 text-[9px] font-bold">CURRENT</span>
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
                    href="mailto:support@mcr-recovery.com?subject=Business%20Rollout%20Consultation"
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
