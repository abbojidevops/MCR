(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Domain and Auth modules
import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { TwilioClient } from '@/lib/telecom/twilio-client';
import { clearDispatchedAlerts, getDispatchedAlerts } from '@/lib/alert-dispatcher';

// Route handler
import { POST as bridgeCallPost } from '@/app/api/telecom/bridge-call/route';

const TENANT_A = 'acc-apex-plumbing';
const TENANT_B = 'acc-coolbreeze-hvac';
const CUSTOMER_PHONE = '+12175557788';

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

test('BRIDGE-1: Successful Click-to-Call Voice Bridging via Twilio REST API', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const initialCalls = db.getCallRecords(TENANT_A).length;

  const req = createMockRequest('http://localhost:3001/api/telecom/bridge-call', {
    token: tokenA,
    body: {
      customerPhone: CUSTOMER_PHONE,
      contractorPhone: '+12175550199',
    },
  });

  let createdCallId: string | undefined;
  try {
    const res = await bridgeCallPost(req);
    assert.equal(res.status, 200, 'Bridge call endpoint must return 200 on success');

    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.callSid, 'Must return Twilio call SID');
    assert.equal(data.customerPhone, CUSTOMER_PHONE);
    assert.equal(data.contractorPhone, '+12175550199');
    assert.ok(data.mcrNumber, 'Must return MCR caller ID number');
    assert.ok(data.callRecordId, 'Must return created call record ID');

    createdCallId = data.callRecordId;

    // Verify call record in database
    const callRecord = db.getCallBySid(data.callSid);
    assert.ok(callRecord, 'Call record must be saved in database');
    assert.equal(callRecord.account_id, TENANT_A);
    assert.equal(callRecord.direction, 'outbound');
    assert.equal(callRecord.to_number, CUSTOMER_PHONE);
    assert.equal(callRecord.from_number, data.mcrNumber);
  } finally {
    if (createdCallId) {
      db.deleteCallRecord(createdCallId);
    }
  }
});

test('BRIDGE-2: Bridge Call Auto-Transitions NEW Job Card to CONTACTED', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const jobsA = db.getJobs(TENANT_A);
  const targetJob = jobsA.find((j) => j.status === 'NEW');
  assert.ok(targetJob, 'Tenant A must have a NEW job for testing');

  const initialJobStatus = targetJob.status;
  const initialContactedTime = targetJob.contacted_time;

  const req = createMockRequest('http://localhost:3001/api/telecom/bridge-call', {
    token: tokenA,
    body: {
      customerPhone: targetJob.contact?.phone_number || CUSTOMER_PHONE,
      jobId: targetJob.id,
    },
  });

  let createdCallId: string | undefined;
  try {
    const res = await bridgeCallPost(req);
    assert.equal(res.status, 200);

    const data = await res.json();
    assert.equal(data.success, true);
    assert.equal(data.jobUpdated, true, 'Job must be marked as updated');
    createdCallId = data.callRecordId;

    // Verify job in database is now CONTACTED
    const updatedJob = db.getJob(TENANT_A, targetJob.id);
    assert.equal(updatedJob?.status, 'CONTACTED');
    assert.ok(updatedJob?.contacted_time, 'Must record contacted_time timestamp');
  } finally {
    if (createdCallId) {
      db.deleteCallRecord(createdCallId);
    }
    // Restore initial job status
    db.updateJob(TENANT_A, targetJob.id, {
      status: initialJobStatus,
      contacted_time: initialContactedTime,
    });
  }
});

test('BRIDGE-3: TCPA Opt-Out Suppression Blocks Outbound Call Bridge with 403', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const suppressedPhone = '+12175559900';

  db.addSuppression(TENANT_A, suppressedPhone, 'Test STOP opt-out suppression');
  const consentLogs = (db as any).state.consentLogs;
  const createdConsentId = consentLogs[consentLogs.length - 1]?.id;

  try {
    const req = createMockRequest('http://localhost:3001/api/telecom/bridge-call', {
      token: tokenA,
      body: {
        customerPhone: suppressedPhone,
      },
    });

    const res = await bridgeCallPost(req);
    assert.equal(res.status, 403, 'Must return 403 Forbidden for suppressed recipient');

    const data = await res.json();
    assert.equal(data.code, 'TCPA_SUPPRESSED');
    assert.equal(data.isSuppressed, true);
    assert.match(data.error, /opted out/i);
  } finally {
    db.deleteSuppression(TENANT_A, suppressedPhone);
    if (createdConsentId) {
      db.deleteConsentLog(createdConsentId);
    }
  }
});

test('BRIDGE-4: Carrier Failure Dispatches Critical Alert & Returns 502', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });

  // Mock TwilioClient.createBridgeCall to simulate carrier outage
  const originalCreateBridgeCall = TwilioClient.createBridgeCall;
  TwilioClient.createBridgeCall = async () => ({
    sid: '',
    status: 'failed',
    error: 'Twilio Error 21211: Invalid or unallocated phone number',
  });

  try {
    const req = createMockRequest('http://localhost:3001/api/telecom/bridge-call', {
      token: tokenA,
      body: {
        customerPhone: CUSTOMER_PHONE,
      },
    });

    const res = await bridgeCallPost(req);
    assert.equal(res.status, 502, 'Must return 502 Bad Gateway on carrier failure');

    const data = await res.json();
    assert.equal(data.status, 'failed');
    assert.equal(data.code, 'CARRIER_CALL_FAILED');

    // Verify alert dispatched
    const alerts = getDispatchedAlerts(TENANT_A);
    const failureAlert = alerts.find((a) => a.title === 'Click-to-Call Voice Bridge Failed');
    assert.ok(failureAlert, 'Critical alert must be dispatched');
    assert.equal(failureAlert.level, 'critical');
  } finally {
    TwilioClient.createBridgeCall = originalCreateBridgeCall;
    clearDispatchedAlerts();
  }
});

test('BRIDGE-5: Route Authentication & Isolation for Bridge Call Endpoint', async () => {
  // 1. Anonymous request must return 401
  const anonReq = createMockRequest('http://localhost:3001/api/telecom/bridge-call', {
    body: { customerPhone: CUSTOMER_PHONE },
  });
  const anonRes = await bridgeCallPost(anonReq);
  assert.equal(anonRes.status, 401, 'Anonymous request must be rejected with 401');

  // 2. Missing customerPhone must return 400
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const missingReq = createMockRequest('http://localhost:3001/api/telecom/bridge-call', {
    token: tokenA,
    body: {},
  });
  const missingRes = await bridgeCallPost(missingReq);
  assert.equal(missingRes.status, 400, 'Missing customerPhone must return 400');
});
