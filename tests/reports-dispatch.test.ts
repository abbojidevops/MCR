(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Domain and Auth modules
import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

// Route handler
import { POST as dispatchPost } from '@/app/api/reports/dispatch/route';

const TENANT_A = 'acc-apex-plumbing';
const TENANT_B = 'acc-coolbreeze-hvac';

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
    method: options.method || 'POST',
    headers: reqHeaders,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

test('REPORT-1: Dispatching Daily SMS Summary Delivers Formatted Metrics Text to Contractor', async () => {
  const token = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const req = createMockRequest('http://localhost:3001/api/reports/dispatch', {
    token,
    body: { type: 'daily_sms' },
  });

  const res = await dispatchPost(req);
  assert.equal(res.status, 200, 'Daily SMS dispatch must return 200 OK');

  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.accountId, TENANT_A);
  assert.ok(data.dispatchedAt);
  assert.ok(data.results.sms, 'Must contain SMS dispatch results');
  assert.ok(data.results.sms.sid, 'Must generate valid SMS SID');
  assert.ok(data.results.sms.to, 'Must designate contractor recipient phone');
  assert.match(
    data.results.sms.body,
    /TODAY'S MISSED-CALL REPORT for Apex Plumbing/i,
    'SMS body must include daily missed-call report text and business name'
  );
  assert.match(data.results.sms.body, /Missed calls:/);
  assert.match(data.results.sms.body, /Text-backs sent:/);
});

test('REPORT-2: Dispatching Weekly Email Digest Renders & Sends HTML Report to Contractor', async () => {
  const token = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const req = createMockRequest('http://localhost:3001/api/reports/dispatch', {
    token,
    body: { type: 'weekly_email' },
  });

  const res = await dispatchPost(req);
  assert.equal(res.status, 200, 'Weekly email dispatch must return 200 OK');

  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.results.email, 'Must contain email dispatch results');
  assert.ok(data.results.email.messageId, 'Must generate message ID');
  assert.ok(data.results.email.to, 'Must designate contractor recipient email');
  assert.match(
    data.results.email.subject,
    /Weekly Report: Apex Plumbing/i,
    'Email subject must interpolate business name'
  );
});

test('REPORT-3: Combined Digest Dispatch ("type: all") Dispatches Both SMS & Email', async () => {
  const token = createSessionToken({ accountId: TENANT_B, role: 'owner', isDemo: false });
  const req = createMockRequest('http://localhost:3001/api/reports/dispatch', {
    token,
    body: { type: 'all' },
  });

  const res = await dispatchPost(req);
  assert.equal(res.status, 200);

  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.results.sms, 'Must dispatch SMS');
  assert.ok(data.results.email, 'Must dispatch email');
  assert.match(data.results.sms.body, /TODAY'S MISSED-CALL REPORT for CoolBreeze/i);
  assert.match(data.results.email.subject, /Weekly Report: CoolBreeze/i);
});

test('REPORT-4: Unauthenticated Request Returns 401 Unauthorized', async () => {
  const req = createMockRequest('http://localhost:3001/api/reports/dispatch', {
    body: { type: 'daily_sms' },
  });

  const res = await dispatchPost(req);
  assert.equal(res.status, 401, 'Unauthenticated request must be rejected');
});

test('REPORT-5: Missing Notification Phone Triggers 400 Bad Request', async () => {
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile);

  // Temporarily clear notification & emergency phone
  const origNotification = profile.notification_phone;
  const origEmergency = profile.emergency_phone;

  db.updateBusinessProfile(TENANT_A, {
    notification_phone: '',
    emergency_phone: '',
  });

  try {
    const token = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
    const req = createMockRequest('http://localhost:3001/api/reports/dispatch', {
      token,
      body: { type: 'daily_sms' },
    });

    const res = await dispatchPost(req);
    assert.equal(res.status, 400, 'Must return 400 when contractor phone is missing');
    const data = await res.json();
    assert.match(data.error, /No notification phone configured/i);
  } finally {
    // Restore profile to maintain strict 0-delta hygiene
    db.updateBusinessProfile(TENANT_A, {
      notification_phone: origNotification,
      emergency_phone: origEmergency,
    });
  }
});
