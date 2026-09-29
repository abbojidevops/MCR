'use client';

import React, { useState, useEffect } from 'react';
import {
  MessageSquare,
  Send,
  Phone,
  User,
  Zap,
  CheckCircle,
  Paperclip,
  Image as ImageIcon,
} from 'lucide-react';
import { Conversation, Message, CannedReply } from '@/types';

export default function InboxPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConvId, setSelectedConvId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [cannedReplies, setCannedReplies] = useState<CannedReply[]>([]);
  const [newMessageText, setNewMessageText] = useState('');
  const [isSending, setIsSending] = useState(false);

  const fetchConversations = async () => {
    try {
      const res = await fetch('/api/conversations?accountId=acc-apex-plumbing');
      const data = await res.json();
      if (data.conversations) {
        setConversations(data.conversations);
        if (!selectedConvId && data.conversations.length > 0) {
          setSelectedConvId(data.conversations[0].id);
        }
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchMessages = async (convId: string) => {
    try {
      const res = await fetch(`/api/conversations?accountId=acc-apex-plumbing&conversationId=${convId}`);
      const data = await res.json();
      if (data.messages) {
        setMessages(data.messages);
      }
    } catch (err) {
      console.error(err);
    }
  };

  const fetchCannedReplies = async () => {
    try {
      const res = await fetch('/api/canned-replies?accountId=acc-apex-plumbing');
      const data = await res.json();
      if (data.cannedReplies) {
        setCannedReplies(data.cannedReplies);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchConversations();
    fetchCannedReplies();
  }, []);

  useEffect(() => {
    if (selectedConvId) {
      fetchMessages(selectedConvId);
    }
  }, [selectedConvId]);

  const handleSendMessage = async (textToSend?: string) => {
    const text = textToSend || newMessageText;
    if (!text.trim() || !selectedConvId) return;

    setIsSending(true);
    try {
      const res = await fetch('/api/conversations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId: 'acc-apex-plumbing',
          conversationId: selectedConvId,
          bodyText: text,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setNewMessageText('');
        fetchMessages(selectedConvId);
        fetchConversations();
      }
    } catch (err) {
      console.error(err);
    } finally {
      setIsSending(false);
    }
  };

  const activeConv = conversations.find((c) => c.id === selectedConvId);

  return (
    <div className="flex h-[calc(100vh-8rem)] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      {/* Left Pane: Conversations List */}
      <div className="w-full border-r border-slate-200 sm:w-80 flex flex-col">
        <div className="border-b border-slate-100 p-4">
          <h2 className="text-sm font-bold text-slate-900">Conversations</h2>
          <p className="text-[11px] text-slate-500">Inbound caller text threads</p>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100">
          {conversations.map((conv) => {
            const isSelected = conv.id === selectedConvId;
            return (
              <div
                key={conv.id}
                onClick={() => setSelectedConvId(conv.id)}
                className={`cursor-pointer p-4 transition-colors ${
                  isSelected ? 'bg-blue-50/70 border-l-4 border-blue-600' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs text-slate-900">
                    {conv.contact?.full_name || 'Caller'}
                  </span>
                  <span className="text-[10px] text-slate-400">
                    {new Date(conv.last_message_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">{conv.contact?.phone_number}</div>
                <p className="mt-1 text-xs text-slate-600 line-clamp-1">
                  {conv.latest_message?.body || 'No messages yet'}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {/* Right Pane: Message Thread & Sender */}
      <div className="hidden flex-1 flex-col sm:flex">
        {activeConv ? (
          <>
            {/* Thread Header */}
            <div className="flex items-center justify-between border-b border-slate-200 p-4">
              <div>
                <h3 className="font-bold text-sm text-slate-900">
                  {activeConv.contact?.full_name || 'Caller'}
                </h3>
                <span className="text-xs text-slate-500">
                  Phone: {activeConv.contact?.phone_number} • Direct 2-Way SMS
                </span>
              </div>
              <div className="flex items-center gap-2">
                <a
                  href={`tel:${activeConv.contact?.phone_number}`}
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Phone className="h-3.5 w-3.5 text-emerald-600" /> Call
                </a>
              </div>
            </div>

            {/* Messages Scroll View */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-slate-50/50">
              {messages.map((msg) => {
                const isOutbound = msg.direction === 'outbound';
                return (
                  <div
                    key={msg.id}
                    className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}
                  >
                    <div
                      className={`max-w-[75%] rounded-2xl p-3 text-xs shadow-sm ${
                        isOutbound
                          ? 'rounded-tr-sm bg-blue-600 text-white'
                          : 'rounded-tl-sm bg-white text-slate-800 border border-slate-200'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.body}</p>

                      {/* Photo attachments */}
                      {msg.media_urls && msg.media_urls.length > 0 && (
                        <div className="mt-2 space-y-1">
                          {msg.media_urls.map((mUrl, i) => (
                            <div key={i} className="rounded-lg overflow-hidden border border-white/20">
                              <img src={mUrl} alt="Customer upload" className="max-h-48 rounded object-cover" />
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <span className="mt-1 text-[10px] text-slate-400">
                      {isOutbound ? 'MCR / Technician' : activeConv.contact?.full_name || 'Caller'} •{' '}
                      {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </span>
                  </div>
                );
              })}
            </div>

            {/* Canned Replies Bar */}
            <div className="border-t border-slate-200 bg-white px-4 py-2">
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
                <span className="text-[11px] font-bold text-slate-400 flex items-center gap-1 whitespace-nowrap">
                  <Zap className="h-3 w-3 text-amber-500" /> Canned:
                </span>
                {cannedReplies.map((cr) => (
                  <button
                    key={cr.id}
                    type="button"
                    onClick={() => handleSendMessage(cr.body)}
                    className="whitespace-nowrap rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-[11px] font-medium text-slate-700 hover:bg-blue-50 hover:border-blue-300"
                  >
                    {cr.title}
                  </button>
                ))}
              </div>
            </div>

            {/* Input Bar */}
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
                  value={newMessageText}
                  onChange={(e) => setNewMessageText(e.target.value)}
                  placeholder="Type an SMS reply or select a canned template above..."
                  className="flex-1 rounded-xl border border-slate-300 px-3.5 py-2.5 text-xs focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
                />
                <button
                  type="submit"
                  disabled={isSending || !newMessageText.trim()}
                  className="inline-flex items-center gap-1 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white shadow hover:bg-blue-700 disabled:opacity-40"
                >
                  <Send className="h-3.5 w-3.5" /> Send SMS
                </button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex flex-1 items-center justify-center p-8 text-center text-xs text-slate-400">
            Select a conversation on the left to start messaging.
          </div>
        )}
      </div>
    </div>
  );
}
