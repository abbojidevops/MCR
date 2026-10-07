(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'http';
import crypto from 'crypto';
import { NextRequest } from 'next/server';

import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import {
  dispatchCrmWebhook,
  generateWebhookSignature,
  getDispatchedCrmWebhooks,
  clearDispatchedCrmWebhooks,
} from '@/lib/crm-webhook';

// Route handlers
import { PATCH as settingsPatch, GET as settingsGet } from '@/app/api/settings/route';
import { PATCH as jobsPatch } from '@/app/api/jobs/route';
import { GET as webhookIntegrationsGet, POST as webhookIntegrationsPost } from '@/app/api/integrations/webhook/route';

const TENANT_A = 'acc-apex-plumbing';

function createMockRequest(
  url: string,
  options: { method?: string; body?: any; token?: string; headers?: Record<string, string> } = {}
) {
  const reqHeaders = new Headers(options.headers || {});
  if (options.token) {
    reqHeaders.set('cookie', `${SESSION_COOKIE_NAME}=${options.token}`);
  }
  if (options.body) {
    reqHeaders.set('content-type', 'application/json');
  }

  return new NextRequest(new URL(url, 'http://localhost:3001'), {
    method: options.method || 'GET',
    headers: reqHeaders,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

test('CRM-1: Cryptographic HMAC-SHA256 Signature Generation & Authenticity', () => {
  const samplePayload = JSON.stringify({
    event: 'job.booked',
    timestamp: '2026-10-07T00:00:00.000Z',
    job: { id: 'job-101', title: 'Water Heater Replacement' },
  });
  const secretKey = 'mcr_sec_super_secret_signing_key_2026';

  const sig = generateWebhookSignature(samplePayload, secretKey);
  assert.ok(sig.startsWith('sha256='), 'Signature must be prefixed with sha256=');

  const expectedHex = crypto.createHmac('sha256', secretKey).update(samplePayload, 'utf8').digest('hex');
  assert.equal(sig, `sha256=${expectedHex}`, 'Signature hex digest must match node crypto HMAC');

  // Verify altering payload produces different signature
  const alteredPayload = JSON.stringify({
    event: 'job.booked',
    timestamp: '2026-10-07T00:00:00.000Z',
    job: { id: 'job-101', title: 'Water Heater Replacement - Altered' },
  });
  const alteredSig = generateWebhookSignature(alteredPayload, secretKey);
  assert.notEqual(sig, alteredSig, 'Altered payload must produce distinct HMAC');

  // Verify altering secret produces different signature
  const otherSecretSig = generateWebhookSignature(samplePayload, 'different_secret_key');
  assert.notEqual(sig, otherSecretSig, 'Different secret key must produce distinct HMAC');
});

test('CRM-2: Contractor Saves CRM Webhook URL, Secret, and Event Filters via PATCH /api/settings', async () => {
  const token = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile, 'Tenant profile must exist');

  const originalUrl = profile.crm_webhook_url;
  const originalSecret = profile.crm_webhook_secret;
  const originalEvents = profile.crm_webhook_events;

  try {
    const targetUrl = 'https://hooks.zapier.com/hooks/catch/sample/mcr-dispatch';
    const targetSecret = 'mcr_sec_89df7a23c0b5';
    const targetEvents = ['job.created', 'job.booked'];

    // 1. PATCH /api/settings
    const patchReq = createMockRequest('http://localhost:3001/api/settings', {
      method: 'PATCH',
      token,
      body: {
        updates: {
          crm_webhook_url: targetUrl,
          crm_webhook_secret: targetSecret,
          crm_webhook_events: targetEvents,
        },
      },
    });
    const patchRes = await settingsPatch(patchReq);
    assert.equal(patchRes.status, 200);
    const patchData = await patchRes.json();
    assert.equal(patchData.success, true);
    assert.equal(patchData.profile.crm_webhook_url, targetUrl);
    assert.equal(patchData.profile.crm_webhook_secret, targetSecret);
    assert.deepEqual(patchData.profile.crm_webhook_events, targetEvents);

    // 2. GET /api/settings
    const getReq = createMockRequest('http://localhost:3001/api/settings', { token });
    const getRes = await settingsGet(getReq);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.profile.crm_webhook_url, targetUrl);
    assert.equal(getData.profile.crm_webhook_secret, targetSecret);
    assert.deepEqual(getData.profile.crm_webhook_events, targetEvents);

    // 3. GET /api/integrations/webhook
    const webhookGetReq = createMockRequest('http://localhost:3001/api/integrations/webhook', { token });
    const webhookGetRes = await webhookIntegrationsGet(webhookGetReq);
    assert.equal(webhookGetRes.status, 200);
    const webhookGetData = await webhookGetRes.json();
    assert.equal(webhookGetData.success, true);
    assert.equal(webhookGetData.crmWebhookUrl, targetUrl);
    assert.equal(webhookGetData.crmWebhookSecret, targetSecret);
    assert.deepEqual(webhookGetData.crmWebhookEvents, targetEvents);
  } finally {
    // Exact restoration
    db.updateBusinessProfile(TENANT_A, {
      crm_webhook_url: originalUrl,
      crm_webhook_secret: originalSecret,
      crm_webhook_events: originalEvents,
    });
  }
});

test('CRM-3: Outgoing Webhook Dispatch on Job Booking (PATCH /api/jobs) with HMAC Signature', async () => {
  const token = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile);

  const originalUrl = profile.crm_webhook_url;
  const originalSecret = profile.crm_webhook_secret;
  const originalEvents = profile.crm_webhook_events;

  const targetJob = db.getJob(TENANT_A, 'job-104');
  assert.ok(targetJob, 'Job-104 must exist');
  const originalJobStatus = targetJob.status;

  // Spin up local mock HTTP receiver
  let receivedPayload: any = null;
  let receivedHeaders: any = null;
  let receivedRawBody = '';

  const server = http.createServer((req, res) => {
    receivedHeaders = req.headers;
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      receivedRawBody = body;
      try {
        receivedPayload = JSON.parse(body);
      } catch {}
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'received' }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const mockWebhookUrl = `http://127.0.0.1:${port}/mcr-receiver`;
  const signingSecret = 'sec_apex_live_hmac_test_2026';

  try {
    // Configure webhook on profile
    db.updateBusinessProfile(TENANT_A, {
      crm_webhook_url: mockWebhookUrl,
      crm_webhook_secret: signingSecret,
      crm_webhook_events: ['job.created', 'job.booked', 'job.updated'],
    });

    clearDispatchedCrmWebhooks();

    // Trigger booking via PATCH /api/jobs
    const patchReq = createMockRequest('http://localhost:3001/api/jobs', {
      method: 'PATCH',
      token,
      body: {
        jobId: 'job-104',
        status: 'BOOKED',
      },
    });

    const res = await jobsPatch(patchReq);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.job.status, 'BOOKED');

    // Assert mock server received payload
    assert.ok(receivedPayload, 'Mock server must receive webhook POST');
    assert.equal(receivedPayload.event, 'job.booked');
    assert.equal(receivedPayload.account.id, TENANT_A);
    assert.equal(receivedPayload.job.id, 'job-104');
    assert.equal(receivedPayload.job.status, 'BOOKED');

    // Assert mock server received headers & HMAC signature
    assert.equal(receivedHeaders['x-mcr-event'], 'job.booked');
    assert.ok(receivedHeaders['x-mcr-signature'], 'X-MCR-Signature header must be present');
    const expectedSig = generateWebhookSignature(receivedRawBody, signingSecret);
    assert.equal(receivedHeaders['x-mcr-signature'], expectedSig);

    // Verify in-memory telemetry buffer
    const dispatched = getDispatchedCrmWebhooks();
    assert.ok(dispatched.length > 0, 'Dispatched history must contain record');
    const lastRecord = dispatched[dispatched.length - 1];
    assert.equal(lastRecord.accountId, TENANT_A);
    assert.equal(lastRecord.event, 'job.booked');
    assert.equal(lastRecord.statusCode, 200);
    assert.equal(lastRecord.signature, expectedSig);
  } finally {
    server.close();
    // Restore job state
    db.updateJob(TENANT_A, 'job-104', {
      status: originalJobStatus,
    });
    // Restore profile
    db.updateBusinessProfile(TENANT_A, {
      crm_webhook_url: originalUrl,
      crm_webhook_secret: originalSecret,
      crm_webhook_events: originalEvents,
    });
    clearDispatchedCrmWebhooks();
  }
});

test('CRM-4: Event Subscription Filter Suppresses Unselected Events', async () => {
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile);

  const originalUrl = profile.crm_webhook_url;
  const originalSecret = profile.crm_webhook_secret;
  const originalEvents = profile.crm_webhook_events;

  const targetJob = db.getJob(TENANT_A, 'job-104');
  assert.ok(targetJob);

  let requestCount = 0;
  const server = http.createServer((_req, res) => {
    requestCount++;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const mockWebhookUrl = `http://127.0.0.1:${port}/filter-test`;

  try {
    // Only subscribe to 'job.booked'
    db.updateBusinessProfile(TENANT_A, {
      crm_webhook_url: mockWebhookUrl,
      crm_webhook_secret: 'sec_filter_test',
      crm_webhook_events: ['job.booked'],
    });

    clearDispatchedCrmWebhooks();

    // 1. Dispatch unselected event 'job.updated' -> should be rejected by filter
    const rejectedResult = await dispatchCrmWebhook({
      accountId: TENANT_A,
      event: 'job.updated',
      job: targetJob,
    });
    assert.equal(rejectedResult.ok, false);
    assert.match(rejectedResult.error || '', /not in configured webhook events list/);
    assert.equal(requestCount, 0, 'No HTTP request must be sent for filtered event');

    // 2. Dispatch subscribed event 'job.booked' -> should succeed
    const allowedResult = await dispatchCrmWebhook({
      accountId: TENANT_A,
      event: 'job.booked',
      job: targetJob,
    });
    assert.equal(allowedResult.ok, true);
    assert.equal(allowedResult.status, 200);
    assert.equal(requestCount, 1, 'HTTP request must be dispatched for allowed event');
  } finally {
    server.close();
    db.updateBusinessProfile(TENANT_A, {
      crm_webhook_url: originalUrl,
      crm_webhook_secret: originalSecret,
      crm_webhook_events: originalEvents,
    });
    clearDispatchedCrmWebhooks();
  }
});

test('CRM-5: Direct Webhook Test Route (POST /api/integrations/webhook) Dispatches with HMAC', async () => {
  const token = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });

  let serverReceived = false;
  let receivedHeaders: any = null;
  const server = http.createServer((req, res) => {
    serverReceived = true;
    receivedHeaders = req.headers;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ received: true }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const testUrl = `http://127.0.0.1:${port}/direct-test`;
  const testSecret = 'sec_direct_webhook_test_key_123';

  try {
    const postReq = createMockRequest('http://localhost:3001/api/integrations/webhook', {
      method: 'POST',
      token,
      body: {
        webhookUrl: testUrl,
        secret: testSecret,
      },
    });

    const res = await webhookIntegrationsPost(postReq);
    assert.equal(res.status, 200);
    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.status, 200);
    assert.ok(data.signature, 'Signature must be returned in response');
    assert.ok(data.signature.startsWith('sha256='));

    assert.equal(serverReceived, true, 'Mock server must receive the test dispatch');
    assert.equal(receivedHeaders['x-mcr-event'], 'job.recovered');
    assert.equal(receivedHeaders['x-mcr-signature'], data.signature);
  } finally {
    server.close();
  }
});

test('CRM-6: Telephony Intake Session Qualified Lead Dispatches job.created Event', async () => {
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile);

  const originalUrl = profile.crm_webhook_url;
  const originalSecret = profile.crm_webhook_secret;
  const originalEvents = profile.crm_webhook_events;

  let intakeEventReceived = false;
  let receivedEventName = '';
  const server = http.createServer((req, res) => {
    intakeEventReceived = true;
    receivedEventName = req.headers['x-mcr-event'] as string;
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const port = (server.address() as any).port;
  const intakeWebhookUrl = `http://127.0.0.1:${port}/intake-lead`;

  try {
    db.updateBusinessProfile(TENANT_A, {
      crm_webhook_url: intakeWebhookUrl,
      crm_webhook_secret: 'sec_intake_dispatch_key',
      crm_webhook_events: ['job.created', 'job.booked', 'job.updated'],
    });

    const testJob = db.getJob(TENANT_A, 'job-106');
    assert.ok(testJob);

    const result = await dispatchCrmWebhook({
      accountId: TENANT_A,
      event: 'job.created',
      job: testJob,
      customerPhone: '+12175550199',
    });

    assert.equal(result.ok, true);
    assert.equal(intakeEventReceived, true);
    assert.equal(receivedEventName, 'job.created');
  } finally {
    server.close();
    db.updateBusinessProfile(TENANT_A, {
      crm_webhook_url: originalUrl,
      crm_webhook_secret: originalSecret,
      crm_webhook_events: originalEvents,
    });
    clearDispatchedCrmWebhooks();
  }
});

test('CRM-7: Database State Hygiene Preservation Across CRM Webhook Operations', () => {
  const counts = db.getTableCounts();
  assert.deepEqual(
    counts,
    {
      accounts: 2,
      credentials: 2,
      compliance: 2,
      jobs: 6,
      conversations: 5,
      calls: 10,
      consentLogs: 0,
    },
    'All 7 tracked tables must maintain exact zero-drift row count invariance'
  );
});
