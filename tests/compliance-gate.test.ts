(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { GET as complianceGet, POST as compliancePost } from '@/app/api/compliance/route';
import {
  isCarrierControlledStatus,
  canCustomerPerformTransition,
  isValidTransition,
  getNextComplianceStatus,
} from '@/lib/compliance-machine';

function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: any;
    cookie?: string;
    headers?: Record<string, string>;
  } = {}
) {
  const reqHeaders = new Headers(options.headers || {});
  if (options.cookie) {
    reqHeaders.set('cookie', `${SESSION_COOKIE_NAME}=${options.cookie}`);
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

const TEST_ACCOUNT = 'acc-apex-plumbing';

test('C1: Anonymous Caller Refusal — POST & GET /api/compliance returns 401 Unauthorized', async () => {
  // GET without cookie -> 401
  const reqGet = createMockRequest('http://localhost:3001/api/compliance');
  const resGet = await complianceGet(reqGet);
  assert.equal(resGet.status, 401, 'Anonymous GET must return 401');

  // POST without cookie -> 401
  const reqPost = createMockRequest('http://localhost:3001/api/compliance', {
    method: 'POST',
    body: { action: 'advance_status' },
  });
  const resPost = await compliancePost(reqPost);
  assert.equal(resPost.status, 401, 'Anonymous POST must return 401');
});

test('C2: Customer Self-Certification Refusal — Customer session calling advance_status returns 403 Forbidden', async () => {
  // Ensure account starts in signed_up or brand_submitted
  db.updateCompliance(TEST_ACCOUNT, { status: 'signed_up', status_history: [] });

  // Standard customer owner session (role: 'owner')
  const customerToken = createSessionToken({
    accountId: TEST_ACCOUNT,
    userId: 'usr-customer-owner',
    role: 'owner',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/compliance', {
    method: 'POST',
    cookie: customerToken,
    body: { action: 'advance_status' },
  });

  const res = await compliancePost(req);
  assert.equal(res.status, 403, 'Customer session must be refused 403 Forbidden when calling advance_status');

  const data = await res.json();
  assert.match(data.error, /cannot self-certify/i, 'Error message must explain customer cannot self-certify');

  // Assert database status remains unchanged
  const comp = db.getCompliance(TEST_ACCOUNT);
  assert.equal(comp?.status, 'signed_up', 'Compliance status must not advance after rejected customer call');
});

test('C3: Customer Self-Rejection Refusal — Customer session calling simulate_rejection returns 403 Forbidden', async () => {
  const customerToken = createSessionToken({
    accountId: TEST_ACCOUNT,
    userId: 'usr-customer-owner',
    role: 'owner',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/compliance', {
    method: 'POST',
    cookie: customerToken,
    body: { action: 'simulate_rejection', rejectionReason: 'Testing unauthorized rejection' },
  });

  const res = await compliancePost(req);
  assert.equal(res.status, 403, 'Customer session must be refused 403 when trying to simulate/trigger rejection');
});

test('C4: Customer Permitted Action: submit_registration (signed_up -> brand_submitted) succeeds with provenance', async () => {
  db.updateCompliance(TEST_ACCOUNT, {
    status: 'signed_up',
    brand_sid: undefined,
    status_history: [],
  });

  const customerToken = createSessionToken({
    accountId: TEST_ACCOUNT,
    userId: 'usr-customer-owner',
    role: 'owner',
    isDemo: false,
  });

  const registrationData = {
    legal_name: 'Apex Plumbing Services LLC',
    ein: '12-3456789',
    business_type: 'LLC',
    address: '1820 E Adams St, Springfield, IL 62704',
  };

  const req = createMockRequest('http://localhost:3001/api/compliance', {
    method: 'POST',
    cookie: customerToken,
    body: { action: 'submit_registration', registrationData },
  });

  const res = await compliancePost(req);
  assert.equal(res.status, 200, 'Customer submit_registration must succeed with 200');

  const data = await res.json();
  assert.equal(data.success, true);
  assert.equal(data.compliance.status, 'brand_submitted');
  assert.equal(data.compliance.last_updated_by, 'customer');
  assert.equal(data.compliance.brand_sid, null, 'brand_sid must stay null until supplied by carrier/operator');

  // Verify history entry recorded
  assert.ok(data.compliance.status_history.length > 0);
  const latestHistory = data.compliance.status_history[data.compliance.status_history.length - 1];
  assert.equal(latestHistory.from_status, 'signed_up');
  assert.equal(latestHistory.to_status, 'brand_submitted');
  assert.equal(latestHistory.updated_by, 'customer');
  assert.equal(latestHistory.actor_id, 'usr-customer-owner');
});

test('C5: Customer Re-Submission After Rejection succeeds, but fails if not rejected', async () => {
  const customerToken = createSessionToken({
    accountId: TEST_ACCOUNT,
    userId: 'usr-customer-owner',
    role: 'owner',
    isDemo: false,
  });

  // Attempt resubmit when NOT rejected (status: brand_submitted) -> 400
  db.updateCompliance(TEST_ACCOUNT, { status: 'brand_submitted' });
  const reqBad = createMockRequest('http://localhost:3001/api/compliance', {
    method: 'POST',
    cookie: customerToken,
    body: { action: 'resubmit' },
  });
  const resBad = await compliancePost(reqBad);
  assert.equal(resBad.status, 400, 'Resubmit when not rejected must return 400');

  // Transition to rejected with a reason
  db.recordComplianceTransition(
    TEST_ACCOUNT,
    'rejected',
    'carrier_webhook',
    'tcr',
    'Legal business name does not match EIN document'
  );

  // Now customer resubmits -> 200
  const reqGood = createMockRequest('http://localhost:3001/api/compliance', {
    method: 'POST',
    cookie: customerToken,
    body: { action: 'resubmit' },
  });
  const resGood = await compliancePost(reqGood);
  assert.equal(resGood.status, 200, 'Resubmit when rejected must return 200');

  const data = await resGood.json();
  assert.equal(data.compliance.status, 'brand_submitted');
  assert.equal(data.compliance.last_updated_by, 'customer');
  assert.equal(data.compliance.rejection_reason, undefined, 'Rejection reason must be cleared upon resubmission');
});

test('C6: Platform Admin Authorization — Session with role: admin calling advance_status succeeds', async () => {
  // Ensure status is brand_submitted
  db.updateCompliance(TEST_ACCOUNT, { status: 'brand_submitted' });

  const adminToken = createSessionToken({
    accountId: TEST_ACCOUNT,
    userId: 'usr-platform-admin',
    role: 'admin',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/compliance', {
    method: 'POST',
    cookie: adminToken,
    body: { action: 'advance_status' },
  });

  const res = await compliancePost(req);
  assert.equal(res.status, 200, 'Admin session must succeed with 200');

  const data = await res.json();
  assert.equal(data.compliance.status, 'brand_approved');
  assert.equal(data.compliance.last_updated_by, 'admin');

  const latestHistory = data.compliance.status_history[data.compliance.status_history.length - 1];
  assert.equal(latestHistory.from_status, 'brand_submitted');
  assert.equal(latestHistory.to_status, 'brand_approved');
  assert.equal(latestHistory.updated_by, 'admin');
  assert.equal(latestHistory.actor_id, 'usr-platform-admin');
});

import crypto from 'crypto';

const TEST_CARRIER_SECRET = '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function createCarrierHmacHeaders(
  body: any,
  secret: string = TEST_CARRIER_SECRET,
  options: {
    timestamp?: number;
    eventId?: string;
    accountId?: string;
  } = {}
) {
  const timestamp = options.timestamp ?? Date.now();
  const rawBody = JSON.stringify(body);
  const signature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${rawBody}`)
    .digest('hex');

  const headers: Record<string, string> = {
    'x-carrier-signature': `t=${timestamp},v1=${signature}`,
    'x-carrier-timestamp': String(timestamp),
  };

  if (options.eventId) {
    headers['x-carrier-event-id'] = options.eventId;
  }
  if (options.accountId) {
    headers['x-carrier-account-id'] = options.accountId;
  }

  return headers;
}

test('C7: Carrier Webhook Authorization — Request with valid cryptographic HMAC signature succeeds', async () => {
  const originalSecret = process.env.CARRIER_WEBHOOK_SECRET;
  process.env.CARRIER_WEBHOOK_SECRET = TEST_CARRIER_SECRET;

  try {
    // Ensure status is brand_approved
    db.updateCompliance(TEST_ACCOUNT, { status: 'brand_approved' });

    const payload = {
      accountId: TEST_ACCOUNT,
      action: 'advance_status',
    };
    const headers = createCarrierHmacHeaders(payload, TEST_CARRIER_SECRET, {
      eventId: `evt-c7-${Date.now()}`,
      accountId: TEST_ACCOUNT,
    });

    const req = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers,
      body: payload,
    });

    const res = await compliancePost(req);
    assert.equal(res.status, 200, 'Carrier webhook request with valid HMAC must succeed with 200');

    const data = await res.json();
    assert.equal(data.compliance.status, 'campaign_submitted');
    assert.equal(data.compliance.last_updated_by, 'carrier_webhook');

    const latestHistory = data.compliance.status_history[data.compliance.status_history.length - 1];
    assert.equal(latestHistory.from_status, 'brand_approved');
    assert.equal(latestHistory.to_status, 'campaign_submitted');
    assert.equal(latestHistory.updated_by, 'carrier_webhook');
  } finally {
    if (originalSecret !== undefined) process.env.CARRIER_WEBHOOK_SECRET = originalSecret;
    else delete process.env.CARRIER_WEBHOOK_SECRET;
  }
});

test('C8: End-to-End Carrier Pipeline & Provenance Audit Trail (All Transitions Tracked)', async () => {
  const originalSecret = process.env.CARRIER_WEBHOOK_SECRET;
  process.env.CARRIER_WEBHOOK_SECRET = TEST_CARRIER_SECRET;

  try {
    // Reset account compliance state
    db.updateCompliance(TEST_ACCOUNT, {
      status: 'signed_up',
      status_history: [],
      last_updated_by: undefined,
    });

    const customerToken = createSessionToken({
      accountId: TEST_ACCOUNT,
      userId: 'usr-customer-owner',
      role: 'owner',
      isDemo: false,
    });
    const adminToken = createSessionToken({
      accountId: TEST_ACCOUNT,
      userId: 'usr-admin-ops',
      role: 'admin',
      isDemo: false,
    });

    // Step 1: Customer submits registration -> brand_submitted (customer)
    const step1 = await compliancePost(
      createMockRequest('http://localhost:3001/api/compliance', {
        method: 'POST',
        cookie: customerToken,
        body: {
          action: 'submit_registration',
          registrationData: {
            legal_name: 'Apex Plumbing LLC',
            ein: '12-3456789',
            business_type: 'LLC',
          },
        },
      })
    );
    assert.equal((await step1.json()).compliance.status, 'brand_submitted');

    // Step 2: Customer attempt to self-advance -> 403 Forbidden!
    const rogueStep = await compliancePost(
      createMockRequest('http://localhost:3001/api/compliance', {
        method: 'POST',
        cookie: customerToken,
        body: { action: 'advance_status' },
      })
    );
    assert.equal(rogueStep.status, 403, 'Customer self-advancement must be blocked');

    // Step 3: Carrier advances brand_submitted -> brand_approved
    const payload3 = { accountId: TEST_ACCOUNT, action: 'advance_status' };
    const step3 = await compliancePost(
      createMockRequest('http://localhost:3001/api/compliance', {
        method: 'POST',
        headers: createCarrierHmacHeaders(payload3, TEST_CARRIER_SECRET, {
          eventId: `evt-c8-3-${Date.now()}`,
          accountId: TEST_ACCOUNT,
        }),
        body: payload3,
      })
    );
    assert.equal((await step3.json()).compliance.status, 'brand_approved');

    // Step 4: Admin advances brand_approved -> campaign_submitted
    const step4 = await compliancePost(
      createMockRequest('http://localhost:3001/api/compliance', {
        method: 'POST',
        cookie: adminToken,
        body: { action: 'advance_status' },
      })
    );
    assert.equal((await step4.json()).compliance.status, 'campaign_submitted');

    // Step 5: Carrier advances campaign_submitted -> campaign_approved
    const payload5 = { accountId: TEST_ACCOUNT, action: 'advance_status' };
    const step5 = await compliancePost(
      createMockRequest('http://localhost:3001/api/compliance', {
        method: 'POST',
        headers: createCarrierHmacHeaders(payload5, TEST_CARRIER_SECRET, {
          eventId: `evt-c8-5-${Date.now()}`,
          accountId: TEST_ACCOUNT,
        }),
        body: payload5,
      })
    );
    assert.equal((await step5.json()).compliance.status, 'campaign_approved');

    // Step 6: Admin advances campaign_approved -> number_linked
    const step6 = await compliancePost(
      createMockRequest('http://localhost:3001/api/compliance', {
        method: 'POST',
        cookie: adminToken,
        body: { action: 'advance_status' },
      })
    );
    assert.equal((await step6.json()).compliance.status, 'number_linked');

    // Step 7: Carrier activates number_linked -> sms_live
    const payload7 = { accountId: TEST_ACCOUNT, action: 'advance_status' };
    const step7 = await compliancePost(
      createMockRequest('http://localhost:3001/api/compliance', {
        method: 'POST',
        headers: createCarrierHmacHeaders(payload7, TEST_CARRIER_SECRET, {
          eventId: `evt-c8-7-${Date.now()}`,
          accountId: TEST_ACCOUNT,
        }),
        body: payload7,
      })
    );
    const finalData = await step7.json();
    assert.equal(finalData.compliance.status, 'sms_live');

    // Assert full provenance history integrity
    const history = finalData.compliance.status_history;
    assert.equal(history.length, 6, 'Must have recorded exactly 6 valid transitions');
    assert.equal(history[0].to_status, 'brand_submitted');
    assert.equal(history[0].updated_by, 'customer');
    assert.equal(history[1].to_status, 'brand_approved');
    assert.equal(history[1].updated_by, 'carrier_webhook');
    assert.equal(history[2].to_status, 'campaign_submitted');
    assert.equal(history[2].updated_by, 'admin');
    assert.equal(history[3].to_status, 'campaign_approved');
    assert.equal(history[3].updated_by, 'carrier_webhook');
    assert.equal(history[4].to_status, 'number_linked');
    assert.equal(history[4].updated_by, 'admin');
    assert.equal(history[5].to_status, 'sms_live');
    assert.equal(history[5].updated_by, 'carrier_webhook');
  } finally {
    if (originalSecret !== undefined) process.env.CARRIER_WEBHOOK_SECRET = originalSecret;
    else delete process.env.CARRIER_WEBHOOK_SECRET;
  }
});

test('CW-1: Fail-Closed When CARRIER_WEBHOOK_SECRET is Unset (503 Service Unavailable)', async () => {
  const originalSecret = process.env.CARRIER_WEBHOOK_SECRET;
  delete process.env.CARRIER_WEBHOOK_SECRET;

  try {
    const payload = { accountId: TEST_ACCOUNT, action: 'advance_status' };
    const req = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers: {
        'x-carrier-signature': 't=12345,v1=abc123456789',
        'x-carrier-timestamp': '12345',
      },
      body: payload,
    });

    const res = await compliancePost(req);
    assert.equal(res.status, 503, 'Unset CARRIER_WEBHOOK_SECRET must fail-closed with 503');
    const data = await res.json();
    assert.match(data.error, /CARRIER_WEBHOOK_SECRET environment variable is not configured/);
  } finally {
    if (originalSecret !== undefined) process.env.CARRIER_WEBHOOK_SECRET = originalSecret;
    else delete process.env.CARRIER_WEBHOOK_SECRET;
  }
});

test('CW-2: Burned Legacy Secret Permanently Rejected (401 Unauthorized)', async () => {
  const originalSecret = process.env.CARRIER_WEBHOOK_SECRET;
  process.env.CARRIER_WEBHOOK_SECRET = TEST_CARRIER_SECRET;

  try {
    const payload = { accountId: TEST_ACCOUNT, action: 'advance_status' };
    const req = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers: {
        'x-carrier-webhook-secret': 'mcr-carrier-webhook-secret-2026',
      },
      body: payload,
    });

    const res = await compliancePost(req);
    assert.equal(res.status, 401, 'Burned secret must be refused with 401');
    const data = await res.json();
    assert.match(data.error, /burned carrier webhook secret/);
  } finally {
    if (originalSecret !== undefined) process.env.CARRIER_WEBHOOK_SECRET = originalSecret;
    else delete process.env.CARRIER_WEBHOOK_SECRET;
  }
});

test('CW-3: Forged / Tampered Cryptographic Signature Refused (401 Unauthorized)', async () => {
  const originalSecret = process.env.CARRIER_WEBHOOK_SECRET;
  process.env.CARRIER_WEBHOOK_SECRET = TEST_CARRIER_SECRET;

  try {
    const payload = { accountId: TEST_ACCOUNT, action: 'advance_status' };
    const now = Date.now();
    const req = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers: {
        'x-carrier-signature': `t=${now},v1=0000000000000000000000000000000000000000000000000000000000000000`,
        'x-carrier-timestamp': String(now),
      },
      body: payload,
    });

    const res = await compliancePost(req);
    assert.equal(res.status, 401, 'Forged HMAC signature must return 401');
    const data = await res.json();
    assert.match(data.error, /Invalid carrier webhook cryptographic signature/);
  } finally {
    if (originalSecret !== undefined) process.env.CARRIER_WEBHOOK_SECRET = originalSecret;
    else delete process.env.CARRIER_WEBHOOK_SECRET;
  }
});

test('CW-4: Stale Timestamp Outside Tolerance Window Refused (401 Unauthorized)', async () => {
  const originalSecret = process.env.CARRIER_WEBHOOK_SECRET;
  process.env.CARRIER_WEBHOOK_SECRET = TEST_CARRIER_SECRET;

  try {
    const payload = { accountId: TEST_ACCOUNT, action: 'advance_status' };
    const staleTime = Date.now() - 10 * 60 * 1000; // 10 minutes ago (> 5 min tolerance)
    const headers = createCarrierHmacHeaders(payload, TEST_CARRIER_SECRET, {
      timestamp: staleTime,
    });

    const req = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers,
      body: payload,
    });

    const res = await compliancePost(req);
    assert.equal(res.status, 401, 'Stale timestamp must return 401');
    const data = await res.json();
    assert.match(data.error, /outside tolerance window/);
  } finally {
    if (originalSecret !== undefined) process.env.CARRIER_WEBHOOK_SECRET = originalSecret;
    else delete process.env.CARRIER_WEBHOOK_SECRET;
  }
});

test('CW-5: Replay Protection Refuses Duplicate Event ID (409 Conflict)', async () => {
  const originalSecret = process.env.CARRIER_WEBHOOK_SECRET;
  process.env.CARRIER_WEBHOOK_SECRET = TEST_CARRIER_SECRET;

  try {
    db.updateCompliance(TEST_ACCOUNT, { status: 'brand_submitted' });
    const eventId = `replay-test-${Date.now()}`;
    const payload = { accountId: TEST_ACCOUNT, action: 'advance_status' };
    const headers = createCarrierHmacHeaders(payload, TEST_CARRIER_SECRET, {
      eventId,
      accountId: TEST_ACCOUNT,
    });

    // 1st delivery -> succeeds with 200
    const req1 = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers,
      body: payload,
    });
    const res1 = await compliancePost(req1);
    assert.equal(res1.status, 200, 'Initial delivery must succeed');

    // 2nd delivery with identical eventId -> 409 Conflict!
    const req2 = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers,
      body: payload,
    });
    const res2 = await compliancePost(req2);
    assert.equal(res2.status, 409, 'Replay of eventId must return 409 Conflict');
    const data = await res2.json();
    assert.match(data.error, /replay detected/);
    assert.equal(data.eventId, eventId);
  } finally {
    if (originalSecret !== undefined) process.env.CARRIER_WEBHOOK_SECRET = originalSecret;
    else delete process.env.CARRIER_WEBHOOK_SECRET;
  }
});

test('CW-6: Authority Scoping Refuses Administrative set_status (403 Forbidden)', async () => {
  const originalSecret = process.env.CARRIER_WEBHOOK_SECRET;
  process.env.CARRIER_WEBHOOK_SECRET = TEST_CARRIER_SECRET;

  try {
    db.updateCompliance(TEST_ACCOUNT, { status: 'signed_up' });
    const payload = {
      accountId: TEST_ACCOUNT,
      action: 'set_status',
      targetStatus: 'sms_live',
    };
    const headers = createCarrierHmacHeaders(payload, TEST_CARRIER_SECRET, {
      accountId: TEST_ACCOUNT,
    });

    const req = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers,
      body: payload,
    });

    const res = await compliancePost(req);
    assert.equal(res.status, 403, 'Carrier webhook must be forbidden from executing set_status');
    const data = await res.json();
    assert.match(data.error, /Carrier authority is strictly limited/);

    // Verify account status was NOT modified
    const comp = db.getCompliance(TEST_ACCOUNT);
    assert.equal(comp?.status, 'signed_up', 'Account status must not be modified by forbidden action');
  } finally {
    if (originalSecret !== undefined) process.env.CARRIER_WEBHOOK_SECRET = originalSecret;
    else delete process.env.CARRIER_WEBHOOK_SECRET;
  }
});

test('CW-7: Cross-Tenant Isolation — Signed Request for Tenant A Cannot Touch Tenant B', async () => {
  const originalSecret = process.env.CARRIER_WEBHOOK_SECRET;
  process.env.CARRIER_WEBHOOK_SECRET = TEST_CARRIER_SECRET;

  try {
    const TENANT_A = 'acc-apex-plumbing';
    const TENANT_B = 'acc-coolbreeze-hvac';

    const prevCompB = db.getCompliance(TENANT_B)?.status;

    // Signature scoped to Tenant A via x-carrier-account-id
    const payload = {
      accountId: TENANT_B, // Maliciously targeting Tenant B in body!
      action: 'advance_status',
    };
    const headers = createCarrierHmacHeaders(payload, TEST_CARRIER_SECRET, {
      accountId: TENANT_A, // Scoped to Tenant A
    });

    const req = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers,
      body: payload,
    });

    const res = await compliancePost(req);
    assert.equal(res.status, 403, 'Cross-tenant webhook attempt must return 403 Forbidden');
    const data = await res.json();
    assert.match(data.error, /cannot touch tenant/);

    // Ensure Tenant B status was not modified
    assert.equal(db.getCompliance(TENANT_B)?.status, prevCompB, 'Tenant B status must remain unmodified');
  } finally {
    if (originalSecret !== undefined) process.env.CARRIER_WEBHOOK_SECRET = originalSecret;
    else delete process.env.CARRIER_WEBHOOK_SECRET;
  }
});

test('CW-8: Audit Trail Verification — Carrier Webhook Transitions Recorded in Audit Log', async () => {
  const originalSecret = process.env.CARRIER_WEBHOOK_SECRET;
  process.env.CARRIER_WEBHOOK_SECRET = TEST_CARRIER_SECRET;

  try {
    db.updateCompliance(TEST_ACCOUNT, { status: 'brand_submitted' });
    const eventId = `audit-test-${Date.now()}`;
    const payload = { accountId: TEST_ACCOUNT, action: 'advance_status' };
    const headers = createCarrierHmacHeaders(payload, TEST_CARRIER_SECRET, {
      eventId,
      accountId: TEST_ACCOUNT,
    });
    headers['cf-connecting-ip'] = '198.51.100.42';

    const req = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers,
      body: payload,
    });

    const res = await compliancePost(req);
    assert.equal(res.status, 200);

    // Check audit log
    const auditLogs = db.getAuditLogs(TEST_ACCOUNT);
    const carrierLog = auditLogs.find(
      (a: any) => a.action === 'CARRIER_WEBHOOK_STATUS_UPDATE' && a.details?.eventId === eventId
    );
    assert.ok(carrierLog, 'Carrier webhook update must be logged in audit trail');
    assert.equal(carrierLog.details.actor, 'tcr-carrier-webhook');
    assert.equal(carrierLog.details.sourceAddress, '198.51.100.42');
    assert.equal(carrierLog.details.fromStatus, 'brand_submitted');
    assert.equal(carrierLog.details.toStatus, 'brand_approved');
    assert.ok(carrierLog.details.fieldsChanged.includes('status'));

    // Clean up TEST_ACCOUNT compliance back to pristine signed_up
    db.updateCompliance(TEST_ACCOUNT, { status: 'signed_up', status_history: [] });
  } finally {
    if (originalSecret !== undefined) process.env.CARRIER_WEBHOOK_SECRET = originalSecret;
    else delete process.env.CARRIER_WEBHOOK_SECRET;
  }
});

test('C9: State Machine Function Unit Assertions', () => {
  assert.equal(isCarrierControlledStatus('sms_live'), true);
  assert.equal(isCarrierControlledStatus('brand_approved'), true);
  assert.equal(isCarrierControlledStatus('signed_up'), false);
  assert.equal(isCarrierControlledStatus('brand_submitted'), false);

  assert.equal(canCustomerPerformTransition('signed_up', 'brand_submitted', 'submit_registration'), true);
  assert.equal(canCustomerPerformTransition('rejected', 'brand_submitted', 'resubmit'), true);
  assert.equal(canCustomerPerformTransition('brand_submitted', 'brand_approved'), false);
  assert.equal(canCustomerPerformTransition('number_linked', 'sms_live'), false);

  assert.equal(isValidTransition('signed_up', 'brand_submitted'), true);
  assert.equal(isValidTransition('signed_up', 'sms_live'), false);
  assert.equal(isValidTransition('brand_submitted', 'brand_approved'), true);
  assert.equal(isValidTransition('brand_submitted', 'rejected'), true);
});

// ============================================================================
// TASK 15 — Carrier Fact Authority & Whitelist Tests
// ============================================================================

test('T15-1: Injected Fields Refused (400) Naming Each Rejected Field', async () => {
  db.updateCompliance(TEST_ACCOUNT, {
    status: 'signed_up',
    status_history: [],
    last_updated_by: 'admin',
    campaign_sid: null,
    brand_sid: null,
  });

  const customerToken = createSessionToken({
    accountId: TEST_ACCOUNT,
    userId: 'usr-customer-owner',
    role: 'owner',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/compliance', {
    method: 'POST',
    cookie: customerToken,
    body: {
      action: 'submit_registration',
      registrationData: {
        legal_name: 'Alpha Mechanical LLC',
        ein: '88-7654321',
        business_type: 'LLC',
        campaign_sid: 'CM_injected_by_customer',
        status: 'sms_live',
        last_updated_by: 'carrier_webhook',
        carrier_source: 'carrier_api',
      },
    },
  });

  const res = await compliancePost(req);
  assert.equal(res.status, 400, 'Injected fields must be refused with 400 Bad Request');

  const data = await res.json();
  assert.ok(Array.isArray(data.rejected), 'Response must contain rejected array');
  assert.deepEqual(
    data.rejected.sort(),
    ['campaign_sid', 'carrier_source', 'last_updated_by', 'status'].sort(),
    'Response must explicitly name all four rejected fields'
  );
  assert.match(
    data.error,
    /These fields are not yours to set:.*A carrier decides brand and campaign identifiers/
  );

  // Assert database was NOT modified
  const comp = db.getCompliance(TEST_ACCOUNT);
  assert.equal(comp?.status, 'signed_up', 'Database status must remain signed_up');
  assert.notEqual(comp?.campaign_sid, 'CM_injected_by_customer', 'Database must not contain injected campaign_sid');
  assert.notEqual(comp?.last_updated_by, 'carrier_webhook', 'Database must not contain injected last_updated_by');
});

test('T15-2: No Identifier Synthesized — brand_sid and campaign_sid stay null', async () => {
  db.updateCompliance(TEST_ACCOUNT, { status: 'signed_up', status_history: [] });

  const customerToken = createSessionToken({
    accountId: TEST_ACCOUNT,
    userId: 'usr-customer-owner',
    role: 'owner',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/compliance', {
    method: 'POST',
    cookie: customerToken,
    body: {
      action: 'submit_registration',
      registrationData: {
        legal_name: 'Alpha Mechanical LLC',
        ein: '88-7654321',
        business_type: 'LLC',
        address: '100 Main St, Chicago, IL 60601',
      },
    },
  });

  const res = await compliancePost(req);
  assert.equal(res.status, 200, 'Valid submission must succeed with 200');

  const data = await res.json();
  assert.equal(data.compliance.status, 'brand_submitted');
  assert.equal(data.compliance.brand_sid, null, 'brand_sid must stay null (no clock-derived identifier)');
  assert.equal(data.compliance.campaign_sid, null, 'campaign_sid must stay null');
  assert.equal(data.compliance.last_updated_by, 'customer');

  // Verify in database directly
  const comp = db.getCompliance(TEST_ACCOUNT);
  assert.equal(comp?.brand_sid, null, 'Database brand_sid must be null');
  assert.equal(comp?.campaign_sid, null, 'Database campaign_sid must be null');
});

test('T15-3: Provenance and Status are Server-Assigned, Never from Caller', async () => {
  db.updateCompliance(TEST_ACCOUNT, { status: 'signed_up', status_history: [] });

  const customerToken = createSessionToken({
    accountId: TEST_ACCOUNT,
    userId: 'usr-customer-owner',
    role: 'owner',
    isDemo: false,
  });

  // Attempt to supply last_updated_by and status at the request root
  const req = createMockRequest('http://localhost:3001/api/compliance', {
    method: 'POST',
    cookie: customerToken,
    body: {
      action: 'submit_registration',
      status: 'sms_live', // Root-level injection attempt
      last_updated_by: 'carrier_webhook', // Root-level injection attempt
      registrationData: {
        legal_name: 'Alpha Mechanical LLC',
        ein: '88-7654321',
        business_type: 'LLC',
      },
    },
  });

  const res = await compliancePost(req);
  assert.equal(res.status, 200, 'Valid registration payload must succeed');

  const data = await res.json();
  assert.equal(data.compliance.status, 'brand_submitted', 'Status must be server-assigned brand_submitted');
  assert.equal(data.compliance.last_updated_by, 'customer', 'Provenance must be server-assigned customer');

  const comp = db.getCompliance(TEST_ACCOUNT);
  assert.equal(comp?.status, 'brand_submitted');
  assert.equal(comp?.last_updated_by, 'customer');
});

test('T15-4: Missing Required Payload Fields Named with 400', async () => {
  db.updateCompliance(TEST_ACCOUNT, { status: 'signed_up', status_history: [] });

  const customerToken = createSessionToken({
    accountId: TEST_ACCOUNT,
    userId: 'usr-customer-owner',
    role: 'owner',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/compliance', {
    method: 'POST',
    cookie: customerToken,
    body: {
      action: 'submit_registration',
      registrationData: {
        legal_name: 'Alpha Mechanical LLC',
        // ein is missing
        // business_type is missing
      },
    },
  });

  const res = await compliancePost(req);
  assert.equal(res.status, 400, 'Payload with missing required fields must return 400');

  const data = await res.json();
  assert.ok(Array.isArray(data.missing), 'Response must include missing array');
  assert.deepEqual(data.missing.sort(), ['business_type', 'ein'].sort());
  assert.match(data.error, /Missing required registration fields/);

  // Clean up TEST_ACCOUNT compliance back to pristine signed_up
  db.updateCompliance(TEST_ACCOUNT, { status: 'signed_up', status_history: [] });
});

