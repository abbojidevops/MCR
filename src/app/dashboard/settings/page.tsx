'use client';

import React, { useState, useEffect } from 'react';
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
} from 'lucide-react';
import { BusinessProfile, CannedReply, TradeKey } from '@/types';

export default function SettingsPage() {
  const [profile, setProfile] = useState<BusinessProfile | null>(null);
  const [cannedReplies, setCannedReplies] = useState<CannedReply[]>([]);
  const [newTitle, setNewTitle] = useState('');
  const [newShortcut, setNewShortcut] = useState('');
  const [newBody, setNewBody] = useState('');
  const [toast, setToast] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [webhookUrl, setWebhookUrl] = useState('https://hooks.zapier.com/hooks/catch/sample/mcr');
  const [isTestingWebhook, setIsTestingWebhook] = useState(false);
  const [webhookResult, setWebhookResult] = useState<any>(null);

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
          accountId: 'acc-apex-plumbing'
        })
      });
      const data = await res.json();
      setWebhookResult(data);
    } catch (err: any) {
      setWebhookResult({ success: false, error: err.message });
    } finally {
      setIsTestingWebhook(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch('/api/settings?accountId=acc-apex-plumbing');
      const data = await res.json();
      if (data.profile) setProfile(data.profile);

      const crRes = await fetch('/api/canned-replies?accountId=acc-apex-plumbing');
      const crData = await crRes.json();
      if (crData.cannedReplies) setCannedReplies(crData.cannedReplies);
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
          accountId: 'acc-apex-plumbing',
          updates: {
            business_name: profile.business_name,
            timezone: profile.timezone,
            notification_phone: profile.notification_phone,
            emergency_phone: profile.emergency_phone,
          },
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToast('Business profile settings saved.');
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
          accountId: 'acc-apex-plumbing',
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

  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Settings & Canned Replies</h1>
        <p className="text-xs text-slate-500">
          Configure business details, notification channels, and custom 1-tap SMS response templates.
        </p>
      </div>

      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs font-semibold text-emerald-800 flex items-center gap-1.5">
          <CheckCircle className="h-4 w-4 text-emerald-600" /> {toast}
        </div>
      )}

      {/* Business Details Form */}
      {profile && (
        <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
            <Building className="h-4 w-4 text-blue-600" />
            <h2 className="text-sm font-bold text-slate-900">Business Profile</h2>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Business Name (In SMS Text-Backs)</label>
              <input
                type="text"
                value={profile.business_name}
                onChange={(e) => setProfile({ ...profile, business_name: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Timezone (TCPA Quiet Hours)</label>
              <select
                value={profile.timezone}
                onChange={(e) => setProfile({ ...profile, timezone: e.target.value })}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 focus:outline-none"
              >
                <option value="America/New_York">Eastern Time (ET)</option>
                <option value="America/Chicago">Central Time (CT)</option>
                <option value="America/Denver">Mountain Time (MT)</option>
                <option value="America/Los_Angeles">Pacific Time (PT)</option>
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Owner Alert Cell Phone</label>
              <input
                type="text"
                value={profile.notification_phone || ''}
                onChange={(e) => setProfile({ ...profile, notification_phone: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Emergency Dispatch Line</label>
              <input
                type="text"
                value={profile.emergency_phone || ''}
                onChange={(e) => setProfile({ ...profile, emergency_phone: e.target.value })}
                className="w-full rounded-lg border border-slate-300 px-3 py-2 focus:outline-none"
              />
            </div>
          </div>

          <div className="pt-2">
            <button
              type="button"
              disabled={isSaving}
              onClick={handleSaveProfile}
              className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white shadow hover:bg-blue-700 disabled:opacity-50"
            >
              <Save className="h-3.5 w-3.5" /> {isSaving ? 'Saving...' : 'Save Profile'}
            </button>
          </div>
        </div>
      )}

      {/* Canned Replies Editor */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center gap-2 border-b border-slate-100 pb-3">
          <MessageSquare className="h-4 w-4 text-indigo-600" />
          <h2 className="text-sm font-bold text-slate-900">Custom Canned SMS Replies</h2>
        </div>
        <p className="text-xs text-slate-500">
          These templates appear as 1-tap shortcuts in your Two-Way SMS Inbox for field technicians to answer quickly.
        </p>

        {/* Existing Canned Replies List */}
        <div className="space-y-2">
          {cannedReplies.map((cr) => (
            <div
              key={cr.id}
              className="flex items-start justify-between rounded-xl border border-slate-100 bg-slate-50 p-3 text-xs"
            >
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-bold text-slate-900">{cr.title}</span>
                  <span className="font-mono text-[10px] text-blue-600 bg-blue-50 px-1.5 py-0.5 rounded">
                    {cr.shortcut}
                  </span>
                </div>
                <p className="mt-1 text-slate-600 text-[11px] leading-relaxed">{cr.body}</p>
              </div>
            </div>
          ))}
        </div>

        {/* Add Canned Reply Form */}
        <form onSubmit={handleAddCannedReply} className="border-t border-slate-100 pt-4 space-y-3 text-xs">
          <h3 className="font-bold text-slate-800">Add New Canned Template</h3>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <label className="block text-slate-600 font-medium mb-1">Shortcut Label</label>
              <input
                type="text"
                placeholder="e.g. En route"
                value={newTitle}
                onChange={(e) => setNewTitle(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-slate-600 font-medium mb-1">Shortcut Command</label>
              <input
                type="text"
                placeholder="e.g. /eta"
                value={newShortcut}
                onChange={(e) => setNewShortcut(e.target.value)}
                className="w-full rounded-lg border border-slate-300 px-3 py-1.5 focus:outline-none"
              />
            </div>
          </div>
          <div>
            <label className="block text-slate-600 font-medium mb-1">Message Body</label>
            <textarea
              rows={2}
              placeholder="e.g. Hi! Our technician is on the way and will arrive within 20 minutes."
              value={newBody}
              onChange={(e) => setNewBody(e.target.value)}
              className="w-full rounded-lg border border-slate-300 p-2.5 focus:outline-none"
            ></textarea>
          </div>
          <button
            type="submit"
            className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 font-bold text-white hover:bg-slate-800"
          >
            <Plus className="h-3.5 w-3.5" /> Add Canned Reply
          </button>
        </form>
      </div>

      {/* Webhook & CRM Integrations */}
      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <Webhook className="h-4 w-4 text-emerald-600" />
            <h2 className="text-sm font-bold text-slate-900">CRM &amp; Zapier Webhook Forwarding</h2>
          </div>
          <span className="rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
            Real-Time Push
          </span>
        </div>
        <p className="text-xs text-slate-500">
          Automatically push newly recovered lead details and job cards to your external CRM (ServiceTitan, Housecall Pro, Jobber) or custom Zapier / Make webhook.
        </p>

        <form onSubmit={handleTestWebhook} className="space-y-3 text-xs">
          <div>
            <label className="block text-slate-600 font-medium mb-1">Target Webhook URL (POST)</label>
            <div className="flex gap-2">
              <input
                type="url"
                required
                value={webhookUrl}
                onChange={(e) => setWebhookUrl(e.target.value)}
                placeholder="https://hooks.zapier.com/hooks/catch/..."
                className="flex-1 rounded-lg border border-slate-300 px-3 py-2 font-mono text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
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
            <div className={`mt-3 rounded-xl border p-3 font-mono text-[11px] ${webhookResult.success ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-red-50 border-red-200 text-red-900'}`}>
              <div className="flex items-center justify-between font-bold mb-1">
                <span>Status: {webhookResult.statusCode || (webhookResult.success ? '200 OK' : 'Failed')}</span>
                <span>{webhookResult.success ? 'Payload Dispatched' : 'Error'}</span>
              </div>
              <pre className="overflow-x-auto text-[10px] max-h-32 bg-white/70 p-2 rounded border border-slate-200 mt-1">
                {JSON.stringify(webhookResult.dispatchedPayload || webhookResult, null, 2)}
              </pre>
            </div>
          )}
        </form>
      </div>
    </div>
  );
}
