/**
 * MCR — Outgoing CRM Webhook Dispatcher
 *
 * Streams recovered leads and booked job cards to contractor CRM platforms
 * (Jobber, Housecall Pro, ServiceTitan, Zapier, Make) in real time.
 * Supports HMAC-SHA256 payload signing for webhook authenticity verification.
 */
import crypto from 'crypto';
import { db } from '@/db/repository';
import { Job } from '@/types';

export type CrmWebhookEvent = 'job.created' | 'job.booked' | 'job.updated';

export interface CrmWebhookPayload {
  event: CrmWebhookEvent;
  timestamp: string;
  account: {
    id: string;
    businessName: string;
    trade: string;
  };
  job: {
    id: string;
    title: string;
    trade: string;
    status: string;
    isEmergency: boolean;
    problem?: string;
    address?: string;
    photoUrls: string[];
    estimatedValue?: number;
    actualValue?: number;
    customerPhone?: string;
    createdAt?: string;
    updatedAt?: string;
  };
}

export interface DispatchedCrmWebhookRecord {
  id: string;
  accountId: string;
  event: CrmWebhookEvent;
  targetUrl: string;
  statusCode: number;
  timestamp: string;
  signature?: string;
  payload: CrmWebhookPayload;
}

// In-memory telemetry buffer for test verification and live inspection
const dispatchedHistory: DispatchedCrmWebhookRecord[] = [];

export function getDispatchedCrmWebhooks(): DispatchedCrmWebhookRecord[] {
  return [...dispatchedHistory];
}

export function clearDispatchedCrmWebhooks(): void {
  dispatchedHistory.length = 0;
}

export function generateWebhookSignature(payload: string, secret: string): string {
  const hmac = crypto.createHmac('sha256', secret);
  hmac.update(payload, 'utf8');
  return `sha256=${hmac.digest('hex')}`;
}

export async function dispatchCrmWebhook(options: {
  accountId: string;
  event: CrmWebhookEvent;
  job: Job;
  customerPhone?: string;
}): Promise<{ ok: boolean; status?: number; error?: string }> {
  const { accountId, event, job, customerPhone } = options;

  await db.hydrateBusinessProfileFromPostgres(accountId);
  const profile = db.getBusinessProfile(accountId);
  if (!profile || !profile.crm_webhook_url) {
    return { ok: false, error: 'No CRM webhook URL configured' };
  }

  const webhookUrl = profile.crm_webhook_url.trim();
  if (!webhookUrl.startsWith('http://') && !webhookUrl.startsWith('https://')) {
    return { ok: false, error: 'Invalid webhook URL protocol (must be http:// or https://)' };
  }

  // Filter events if contractor specified a subset
  const allowedEvents = profile.crm_webhook_events || ['job.created', 'job.booked', 'job.updated'];
  if (!allowedEvents.includes(event)) {
    return { ok: false, error: `Event ${event} is not in configured webhook events list` };
  }

  // Resolve customer phone from contact if not directly provided
  let phone = customerPhone;
  if (!phone && job.contact_id) {
    const contact = db.getContact(job.contact_id);
    if (contact) phone = contact.phone_number;
  }

  const payload: CrmWebhookPayload = {
    event,
    timestamp: new Date().toISOString(),
    account: {
      id: accountId,
      businessName: profile.business_name,
      trade: profile.trade,
    },
    job: {
      id: job.id,
      title: job.title,
      trade: job.trade,
      status: job.status,
      isEmergency: Boolean(job.is_emergency),
      problem: job.problem,
      address: job.address,
      photoUrls: Array.isArray(job.photo_urls) ? job.photo_urls : [],
      estimatedValue: job.estimated_value,
      actualValue: job.actual_value,
      customerPhone: phone,
      createdAt: job.created_at,
      updatedAt: job.updated_at,
    },
  };

  const stringPayload = JSON.stringify(payload);
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-MCR-Event': event,
    'User-Agent': 'MCR-CRM-Webhook-Dispatcher/1.0',
  };

  let signature: string | undefined;
  if (profile.crm_webhook_secret) {
    signature = generateWebhookSignature(stringPayload, profile.crm_webhook_secret);
    headers['X-MCR-Signature'] = signature;
  }

  let statusCode = 200;
  let dispatchError: string | undefined;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3000);

    const res = await fetch(webhookUrl, {
      method: 'POST',
      headers,
      body: stringPayload,
      signal: controller.signal,
    });
    clearTimeout(timeout);
    statusCode = res.status;
  } catch (err: any) {
    statusCode = 502;
    dispatchError = err.message || 'Webhook network dispatch error';
  }

  const record: DispatchedCrmWebhookRecord = {
    id: `crm-hook-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    accountId,
    event,
    targetUrl: webhookUrl,
    statusCode,
    timestamp: payload.timestamp,
    signature,
    payload,
  };

  dispatchedHistory.push(record);
  if (dispatchedHistory.length > 50) {
    dispatchedHistory.shift();
  }

  db.logAudit(accountId, 'CRM_WEBHOOK_DISPATCH', {
    event,
    jobId: job.id,
    targetUrl: webhookUrl,
    statusCode,
    error: dispatchError,
  });

  return {
    ok: statusCode >= 200 && statusCode < 300,
    status: statusCode,
    error: dispatchError,
  };
}
