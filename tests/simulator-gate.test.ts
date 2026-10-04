(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Domain and Auth modules
import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

// Route handlers
import { GET as simulatorGet, POST as simulatorPost } from '@/app/api/simulator/route';

const DEMO_TENANT = 'acc-apex-plumbing';
const LIVE_TENANT = 'acc-coolbreeze-hvac';

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

test('S1: Anonymous Caller Refusal — POST /api/simulator returns 401 Unauthorized', async () => {
  const req = createMockRequest('http://localhost:3001/api/simulator', {
    method: 'POST',
    body: { action: 'simulate_call' },
  });

  const res = await simulatorPost(req);
  assert.equal(res.status, 401, 'Anonymous caller must receive 401 Unauthorized');
  const data = await res.json();
  assert.match(data.error, /Unauthorized/i);
});

test('S2: Anonymous Caller Refusal — GET /api/simulator returns 401 Unauthorized', async () => {
  const req = createMockRequest('http://localhost:3001/api/simulator', {
    method: 'GET',
  });

  const res = await simulatorGet(req);
  assert.equal(res.status, 401, 'Anonymous caller must receive 401 Unauthorized on GET');
  const data = await res.json();
  assert.match(data.error, /Unauthorized/i);
});

test('S3: Non-Demo Tenant Isolation — POST /api/simulator returns flat 403 Forbidden', async () => {
  const nonDemoToken = createSessionToken({
    accountId: LIVE_TENANT,
    role: 'owner',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/simulator', {
    method: 'POST',
    token: nonDemoToken,
    body: { action: 'simulate_call' },
  });

  const res = await simulatorPost(req);
  assert.equal(res.status, 403, 'Non-demo tenant must be flatly refused with 403 Forbidden');
  const data = await res.json();
  assert.match(data.error, /Forbidden/i);
});

test('S4: Non-Demo Tenant Isolation — GET /api/simulator returns flat 403 Forbidden', async () => {
  const nonDemoToken = createSessionToken({
    accountId: LIVE_TENANT,
    role: 'owner',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/simulator', {
    method: 'GET',
    token: nonDemoToken,
  });

  const res = await simulatorGet(req);
  assert.equal(res.status, 403, 'Non-demo tenant must be flatly refused with 403 Forbidden on GET');
  const data = await res.json();
  assert.match(data.error, /Forbidden/i);
});

test('S5: Demo Tenant Full Walkthrough — End-to-End Simulation Completes without Error', async () => {
  const demoToken = createSessionToken({
    accountId: DEMO_TENANT,
    role: 'owner',
    isDemo: true,
  });

  const testCallerNumber = `+1217555${Math.floor(1000 + Math.random() * 9000)}`;

  // Step 1: Simulate missed call -> produces text-back
  const callReq = createMockRequest('http://localhost:3001/api/simulator', {
    method: 'POST',
    token: demoToken,
    body: {
      action: 'simulate_call',
      callerNumber: testCallerNumber,
      callerName: 'Sarah Jenkins',
    },
  });

  const callRes = await simulatorPost(callReq);
  assert.equal(callRes.status, 200, 'Demo tenant must be permitted to simulate missed calls');
  const callData = await callRes.json();
  assert.equal(callData.success, true);
  assert.ok(callData.callRecordId, 'Must return callRecordId');
  assert.ok(callData.conversationId, 'Must return conversationId');
  assert.ok(callData.textBackBody, 'Must return textBackBody');
  assert.ok(Array.isArray(callData.checklist), 'Must return simulation checklist');

  // Step 2: Customer replies confirming emergency
  const reply1Req = createMockRequest('http://localhost:3001/api/simulator', {
    method: 'POST',
    token: demoToken,
    body: {
      action: 'simulate_reply',
      callerNumber: testCallerNumber,
      replyText: 'Yes, basement pipe burst and water is rising',
    },
  });

  const reply1Res = await simulatorPost(reply1Req);
  assert.equal(reply1Res.status, 200);
  const reply1Data = await reply1Res.json();
  assert.equal(reply1Data.success, true);
  assert.equal(reply1Data.stepUpdated, 'ASK_PROBLEM');

  // Step 3: Customer describes the problem
  const reply2Req = createMockRequest('http://localhost:3001/api/simulator', {
    method: 'POST',
    token: demoToken,
    body: {
      action: 'simulate_reply',
      callerNumber: testCallerNumber,
      replyText: 'Main shutoff valve broke, leaking 5 gallons a minute',
    },
  });

  const reply2Res = await simulatorPost(reply2Req);
  assert.equal(reply2Res.status, 200);
  const reply2Data = await reply2Res.json();
  assert.equal(reply2Data.success, true);
  assert.equal(reply2Data.stepUpdated, 'ASK_ADDRESS');

  // Step 4: Customer provides location
  const reply3Req = createMockRequest('http://localhost:3001/api/simulator', {
    method: 'POST',
    token: demoToken,
    body: {
      action: 'simulate_reply',
      callerNumber: testCallerNumber,
      replyText: '742 Evergreen Terrace, Springfield, IL',
    },
  });

  const reply3Res = await simulatorPost(reply3Req);
  assert.equal(reply3Res.status, 200);
  const reply3Data = await reply3Res.json();
  assert.equal(reply3Data.success, true);
  assert.equal(reply3Data.stepUpdated, 'ASK_PHOTO');

  // Step 5: Customer finishes photo step -> triggers job creation
  const reply4Req = createMockRequest('http://localhost:3001/api/simulator', {
    method: 'POST',
    token: demoToken,
    body: {
      action: 'simulate_reply',
      callerNumber: testCallerNumber,
      replyText: 'none',
    },
  });

  const reply4Res = await simulatorPost(reply4Req);
  assert.equal(reply4Res.status, 200);
  const reply4Data = await reply4Res.json();
  assert.equal(reply4Data.success, true);
  assert.equal(reply4Data.stepUpdated, 'QUALIFIED');
  assert.equal(reply4Data.jobCreated, true, 'Job must be created at end of demo walkthrough');
  assert.ok(reply4Data.jobId, 'jobId must be returned');

  // Step 6: Verify status retrieval on demo tenant
  const statusReq = createMockRequest('http://localhost:3001/api/simulator', {
    method: 'POST',
    token: demoToken,
    body: { action: 'get_status' },
  });

  const statusRes = await simulatorPost(statusReq);
  assert.equal(statusRes.status, 200);
  const statusData = await statusRes.json();
  assert.ok(Array.isArray(statusData.calls));
  assert.ok(Array.isArray(statusData.jobs));

  // Step 7: GET /api/simulator works for demo tenant
  const getReq = createMockRequest('http://localhost:3001/api/simulator', {
    method: 'GET',
    token: demoToken,
  });
  const getRes = await simulatorGet(getReq);
  assert.equal(getRes.status, 200);
});
