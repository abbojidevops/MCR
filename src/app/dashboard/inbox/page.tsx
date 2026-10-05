'use client';

import React, { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import {
  MessageSquare,
  Send,
  Phone,
  User,
  Zap,
  CheckCircle,
  Paperclip,
  Image as ImageIcon,
  Flame,
  ArrowLeft,
  Clock,
  ClipboardList,
  AlertTriangle,
  MapPin,
  DollarSign,
  Tag,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import { Conversation, Message, CannedReply, JobCard } from '@/types';

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [jobs, setJobs] = useState<JobCard[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [cannedReplies, setCannedReplies] = useState<CannedReply[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [mobileDetailView, setMobileDetailView] = useState(false);
  const [isSuppressed, setIsSuppressed] = useState(false);
  const [quietHours, setQuietHours] = useState<{
    isWithinHours: boolean;
    recipientLocalHour: number;
    recipientTimezone: string;
    nextAllowedSendTime?: string;
    reason?: string;
  } | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);
  const [emergencyOverride, setEmergencyOverride] = useState(false);

  // Section 12: Standard Trade Quick Replies
  const standardQuickReplies = [
    "Thanks for reaching out. I'll call you shortly.",
    "Please send a photo of the equipment/issue.",
    "What time works best for us to come take a look?",
    "I've received your request and dispatched our tech.",
  ];

  const fetchData = async () => {
    try {
      const [convRes, jobsRes, crRes] = await Promise.all([
        fetch('/api/conversations'),
        fetch('/api/jobs'),
        fetch('/api/canned-replies'),
      ]);

      const convData = await convRes.json();
      const jobsData = await jobsRes.json();
      const crData = await crRes.json();

      if (convData.conversations) {
        setConversations(convData.conversations);
        if (!selectedConvId && convData.conversations.length > 0) {
          setSelectedConvId(convData.conversations[0].id);
          setIsSuppressed(Boolean(convData.conversations[0].isSuppressed));
        }
      }
      if (jobsData.jobs) setJobs(jobsData.jobs);
      if (crData.cannedReplies) setCannedReplies(crData.cannedReplies);
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMessages = async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations?conversationId=${convId}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
      if (data.isSuppressed !== undefined) {
        setIsSuppressed(Boolean(data.isSuppressed));
      }
      if (data.quietHours !== undefined) {
        setQuietHours(data.quietHours);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (selectedConvId) {
      fetchMessages(selectedConvId);
    }
  }, [selectedConvId]);

  const handleSelectConv = (convId: string) => {
    setSelectedConvId(convId);
    setMobileDetailView(true);
    setSendError(null);
    setEmergencyOverride(false);
    const target = conversations.find((c) => c.id === convId);
    if (target) {
      setIsSuppressed(Boolean((target as any).isSuppressed));
    }
  };

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || newMessageText;
    if (!text.trim() || !selectedConvId || isSending) return;

    if (isSuppressed) {
      setSendError('Cannot send SMS: Customer has opted out (STOP suppression active).');
      return;
    }

    setIsSending(true);
    setSendError(null);
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversationId: selectedConvId,
          bodyText: text,
          emergencyOverride,
        }),
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        setSendError(data.error || 'Failed to dispatch SMS message');
        if (data.isSuppressed) {
          setIsSuppressed(true);
        }
        return;
      }

      setNewMessageText('');
      setEmergencyOverride(false);
      fetchMessages(selectedConvId);
      fetchData();
    } catch (err: any) {
      console.error(err);
      setSendError(err.message || 'Network exception while dispatching message');
    } finally {
      setIsSending(false);
    }
  };

  // Enrich conversations with matching Job info and Customer Identity
  const enrichedConversations = useMemo(() => {
    return conversations.map((conv) => {
      const cleanPhone = (conv.contact?.phone_number || '').replace(/\D/g, '').slice(-10);
      const matchedJob = jobs.find((j) => {
        const jPhone = (j.contact?.phone_number || '').replace(/\D/g, '').slice(-10);
        return jPhone === cleanPhone || j.conversation_id === conv.id;
      });

      const customerName = conv.contact?.full_name?.trim() ? conv.contact.full_name : 'Unknown Caller';
      const convIsSuppressed = Boolean((conv as any).isSuppressed);

      return {
        ...conv,
        customerName,
        job: matchedJob,
        isEmergency: matchedJob?.is_emergency ?? false,
        isSuppressed: convIsSuppressed,
      };
    });
  }, [conversations, jobs]);

  const activeConv = enrichedConversations.find((c) => c.id === selectedConvId);
  const currentSuppressed = Boolean(activeConv?.isSuppressed || isSuppressed);

  return (
    <div className="flex h-[calc(100vh-8.5rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* ---------------- LEFT PANE: CONVERSATION LIST ---------------- */}
      <div
        className={`${
          mobileDetailView ? 'hidden' : 'flex'
        } w-full sm:flex sm:w-80 md:w-96 flex-col border-r border-slate-200 bg-white`}
      >
        <div className="border-b border-slate-100 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-black text-slate-900">Conversations</h2>
            <span className="text-[10px] font-bold text-blue-600 bg-blue-50 px-2 py-0.5 rounded-full border border-blue-200">
              {conversations.length} Active
            </span>
          </div>
          <p className="text-[11px] text-slate-500 mt-0.5">Two-way SMS with missed callers</p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {enrichedConversations.map((conv) => {
            const isSelected = conv.id === selectedConvId;
            return (
              <div
                key={conv.id}
                onClick={() => handleSelectConv(conv.id)}
                className={`cursor-pointer p-4 transition-colors ${
                  isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start justify-between gap-1">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-xs text-slate-900">
                        {conv.customerName}
                      </span>
                      {conv.isEmergency && (
                        <span className="flex items-center gap-0.5 rounded bg-red-100 px-1.5 py-0.5 text-[9px] font-extrabold text-red-700">
                          <Flame className="h-2.5 w-2.5" /> URGENT
                        </span>
                      )}
                      {conv.isSuppressed && (
                        <span className="flex items-center gap-0.5 rounded bg-rose-100 px-1.5 py-0.5 text-[9px] font-extrabold text-rose-800 border border-rose-200">
                          OPTED OUT
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                      {conv.contact?.phone_number}
                    </div>
                  </div>

                  <div className="flex flex-col items-end gap-1 shrink-0">
                    <span className="text-[10px] text-slate-400">
                      {conv.last_message_at
                        ? new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                        : ''}
                    </span>
                    {((conv as any).message_count || (conv as any).messageCount || 0) > 0 && (
                      <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[9px] font-bold text-slate-600">
                        {((conv as any).message_count || (conv as any).messageCount)} msgs
                      </span>
                    )}
                  </div>
                </div>

                <p className="mt-2 text-xs text-slate-600 line-clamp-1">
                  {(conv.latest_message || (conv as any).latestMessage)?.body || 'No messages yet'}
                </p>

                {/* Badges (Intake progress & Job Status) */}
                <div className="mt-2 flex items-center justify-between text-[10px]">
                  <span className="text-slate-400 truncate max-w-[140px]">
                    {conv.job?.address ? `📍 ${conv.job.address}` : 'Intake Active'}
                  </span>
                  {conv.job && (
                    <span
                      className={`rounded px-1.5 py-0.5 font-bold uppercase ${
                        conv.job.status === 'COMPLETED'
                          ? 'bg-emerald-100 text-emerald-800'
                          : conv.job.status === 'BOOKED'
                          ? 'bg-blue-100 text-blue-800'
                          : conv.job.status === 'CONTACTED'
                          ? 'bg-amber-100 text-amber-800'
                          : conv.job.status === 'DEAD'
                          ? 'bg-slate-100 text-slate-500'
                          : 'bg-indigo-100 text-indigo-800'
                      }`}
                    >
                      {conv.job.status}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ---------------- RIGHT PANE: CONVERSATION DETAIL ---------------- */}
      <div
        className={`${
          mobileDetailView ? 'flex' : 'hidden'
        } sm:flex flex-1 flex-col bg-white overflow-hidden`}
      >
        {activeConv ? (
          <>
            {/* Thread Header with Customer, Phone, Time */}
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3 bg-white">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setMobileDetailView(false)}
                  className="sm:hidden rounded-lg p-1.5 text-slate-500 hover:bg-slate-100"
                >
                  <ArrowLeft className="h-4 w-4" />
                </button>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-extrabold text-sm text-slate-900">
                      {activeConv.customerName}
                    </h3>
                    {activeConv.isEmergency && (
                      <span className="flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[9px] font-extrabold text-white uppercase">
                        <Flame className="h-3 w-3" /> Emergency
                      </span>
                    )}
                    {currentSuppressed && (
                      <span className="flex items-center gap-1 rounded-full bg-rose-600 px-2 py-0.5 text-[9px] font-extrabold text-white uppercase">
                        <ShieldAlert className="h-3 w-3" /> Opted Out (STOP)
                      </span>
                    )}
                    {activeConv.job && (
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-700">
                        {activeConv.job.status}
                      </span>
                    )}
                  </div>
                  <div className="text-xs text-slate-500 mt-0.5 font-mono">
                    {activeConv.contact?.phone_number}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2">
                {activeConv.contact?.phone_number && (
                  <a
                    href={`tel:${activeConv.contact.phone_number}`}
                    className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 shadow-sm"
                  >
                    <Phone className="h-3.5 w-3.5" /> Call Customer
                  </a>
                )}
                {activeConv.job && (
                  <Link
                    href={`/dashboard/jobs`}
                    className="hidden sm:inline-flex items-center gap-1 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-bold text-slate-700 hover:bg-slate-50"
                  >
                    <ClipboardList className="h-3.5 w-3.5 text-amber-600" /> View Job
                  </Link>
                )}
              </div>
            </div>

            {/* ---------------- SECTION 5: INBOX LEAD SUMMARY ---------------- */}
            <div className="border-b border-slate-200 bg-slate-50/80 p-3 sm:px-4 text-xs">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-2">
                Lead Summary &amp; Job Details
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Issue</span>
                  <span className="font-semibold text-slate-900 truncate block">
                    {activeConv.job?.problem || activeConv.job?.title || 'General Inbound Inquiry'}
                  </span>
                </div>

                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Priority</span>
                  <span className="font-bold flex items-center gap-1">
                    {activeConv.isEmergency ? (
                      <span className="text-red-600 flex items-center gap-1 font-bold">
                        <Flame className="h-3 w-3" /> Emergency
                      </span>
                    ) : (
                      <span className="text-slate-700 font-semibold">Standard Service</span>
                    )}
                  </span>
                </div>

                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Address</span>
                  <span className="font-medium text-slate-800 truncate block">
                    {activeConv.job?.address || activeConv.contact?.address || 'Address pending'}
                  </span>
                </div>

                <div>
                  <span className="block text-[10px] font-bold uppercase text-slate-500">Status</span>
                  <span className="font-bold uppercase text-blue-700">
                    {activeConv.job?.status || 'New Lead'}
                  </span>
                </div>
              </div>

              <div className="mt-2.5 pt-2 border-t border-slate-200/60 flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-4">
                  <div>
                    <span className="text-[10px] text-slate-500 font-medium">Estimated Value: </span>
                    <span className="font-bold text-slate-900">
                      {activeConv.job?.estimated_value !== undefined ? `$${activeConv.job.estimated_value}` : '—'}
                    </span>
                  </div>
                  {activeConv.job?.actual_value !== undefined && (
                    <div>
                      <span className="text-[10px] text-slate-500 font-medium">Actual Revenue: </span>
                      <span className="font-bold text-emerald-600">
                        ${activeConv.job.actual_value}
                      </span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  {activeConv.contact?.phone_number && (
                    <a
                      href={`tel:${activeConv.contact.phone_number}`}
                      className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-emerald-700"
                    >
                      <Phone className="h-3 w-3" /> Call Customer
                    </a>
                  )}
                  {activeConv.job && (
                    <Link
                      href="/dashboard/jobs"
                      className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-2.5 py-1 text-[11px] font-bold text-white hover:bg-slate-800"
                    >
                      <ClipboardList className="h-3 w-3 text-amber-400" /> View Job
                    </Link>
                  )}
                </div>
              </div>
            </div>

            {/* ---------------- TCPA SUPPRESSION & QUIET HOURS BANNERS ---------------- */}
            {currentSuppressed && (
              <div className="bg-rose-50 border-b border-rose-200 px-4 py-2.5 flex items-center gap-2.5 text-xs text-rose-900">
                <ShieldAlert className="h-4 w-4 text-rose-600 shrink-0" />
                <div>
                  <span className="font-bold">TCPA Opt-Out Active:</span> Customer texted STOP and revoked SMS consent. Outbound replies to this number are blocked to ensure federal compliance.
                </div>
              </div>
            )}

            {quietHours && !quietHours.isWithinHours && !currentSuppressed && (
              <div className="bg-amber-50 border-b border-amber-200 px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-900">
                <div className="flex items-center gap-2">
                  <Clock className="h-4 w-4 text-amber-600 shrink-0" />
                  <span>
                    <span className="font-bold">Quiet Hours Active:</span> Local time is {quietHours.recipientLocalHour}:00 in {quietHours.recipientTimezone} (TCPA window: 8 AM - 9 PM).
                  </span>
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer font-bold text-[11px] text-amber-900 bg-amber-100/90 hover:bg-amber-200 px-2.5 py-1 rounded-md border border-amber-300 transition">
                  <input
                    type="checkbox"
                    checked={emergencyOverride}
                    onChange={(e) => setEmergencyOverride(e.target.checked)}
                    className="rounded text-amber-600 h-3.5 w-3.5"
                  />
                  Emergency Override
                </label>
              </div>
            )}

            {sendError && (
              <div className="bg-red-50 border-b border-red-200 px-4 py-2 flex items-center justify-between text-xs text-red-800 animate-in fade-in">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-red-600 shrink-0" />
                  <span className="font-semibold">{sendError}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setSendError(null)}
                  className="text-red-500 hover:text-red-700 font-bold px-2 py-0.5 rounded text-xs"
                >
                  ✕
                </button>
              </div>
            )}

            {/* Messages Scroll Area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/40">
              {messages.map((msg) => {
                const isOutbound = msg.direction === 'outbound';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[85%] sm:max-w-[70%] rounded-2xl p-3 text-xs shadow-sm ${
                        isOutbound
                          ? 'rounded-tr-sm bg-blue-600 text-white'
                          : 'rounded-tl-sm bg-white text-slate-800 border border-slate-200'
                      }`}
                    >
                      <p className="whitespace-pre-wrap leading-relaxed">{msg.body}</p>

                      {/* Photo attachments */}
                      {msg.media_urls && msg.media_urls.length > 0 && (
                        <div className="mt-2 space-y-1.5">
                          {msg.media_urls.map((mUrl, i) => (
                            <div key={i} className="rounded-xl overflow-hidden border border-slate-200 shadow-sm">
                              <img src={mUrl} alt="Customer upload" className="max-h-60 rounded object-cover" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="mt-1 text-[10px] text-slate-400">
                      {isOutbound ? 'MCR System / You' : activeConv.customerName} •{' '}
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Section 12: Quick Replies Bar */}
            <div className="border-t border-slate-200 bg-white px-4 py-2 space-y-1.5">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-[10px] font-bold uppercase text-slate-400 whitespace-nowrap">
                  Quick Replies:
                </span>
                {standardQuickReplies.map((qr, idx) => (
                  <button
                    key={idx}
                    type="button"
                    disabled={currentSuppressed || isSending}
                    onClick={() => handleSendMessage(qr)}
                    className="whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-blue-50 hover:border-blue-300 disabled:opacity-40 disabled:cursor-not-allowed transition"
                  >
                    {qr}
                  </button>
                ))}
              </div>

              {cannedReplies.length > 0 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                  <span className="text-[10px] font-bold uppercase text-indigo-500 whitespace-nowrap flex items-center gap-1">
                    <Zap className="h-3 w-3" /> Shortcuts:
                  </span>
                  {cannedReplies.map((cr) => (
                    <button
                      key={cr.id}
                      type="button"
                      disabled={currentSuppressed || isSending}
                      onClick={() => handleSendMessage(cr.body)}
                      className="whitespace-nowrap rounded-lg border border-indigo-100 bg-indigo-50/50 px-2 py-0.5 text-[11px] font-medium text-indigo-800 hover:bg-indigo-100 disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {cr.title} ({cr.shortcut})
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Input Composer */}
            <div className="border-t border-slate-200 p-3 bg-white">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSendMessage();
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  disabled={currentSuppressed || isSending}
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder={
                    currentSuppressed
                      ? 'Messaging disabled: Customer sent STOP (TCPA suppressed)'
                      : 'Type an SMS reply to customer...'
                  }
                  className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:bg-slate-100 disabled:text-slate-400 disabled:cursor-not-allowed"
                />
                <button
                  type="submit"
                  disabled={isSending || !newMessageText.trim() || currentSuppressed}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition shrink-0"
                >
                  {isSending ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin" /> Sending...
                    </>
                  ) : (
                    <>
                      <Send className="h-3.5 w-3.5" /> Send SMS
                    </>
                  )}
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-xs text-slate-400">
            Select a conversation on the left to review customer messages.
          </div>
        )}
      </div>
    </div>
  );
}
