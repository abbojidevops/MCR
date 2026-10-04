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
  assert.ok(data.compliance.brand_sid.startsWith('BN_'));

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

test('C7: Carrier Webhook Authorization — Request with valid x-carrier-webhook-secret succeeds', async () => {
  // Ensure status is brand_approved
  db.updateCompliance(TEST_ACCOUNT, { status: 'brand_approved' });

  const req = createMockRequest('http://localhost:3001/api/compliance', {
    method: 'POST',
    headers: {
      'x-carrier-webhook-secret': 'mcr-carrier-webhook-secret-2026',
    },
    body: {
      accountId: TEST_ACCOUNT,
      action: 'advance_status',
    },
  });

  const res = await compliancePost(req);
  assert.equal(res.status, 200, 'Carrier webhook request must succeed with 200');

  const data = await res.json();
  assert.equal(data.compliance.status, 'campaign_submitted');
  assert.equal(data.compliance.last_updated_by, 'carrier_webhook');

  const latestHistory = data.compliance.status_history[data.compliance.status_history.length - 1];
  assert.equal(latestHistory.from_status, 'brand_approved');
  assert.equal(latestHistory.to_status, 'campaign_submitted');
  assert.equal(latestHistory.updated_by, 'carrier_webhook');
});

test('C8: End-to-End Carrier Pipeline & Provenance Audit Trail (All Transitions Tracked)', async () => {
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
        registrationData: { legal_name: 'Apex Plumbing LLC' },
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
  const step3 = await compliancePost(
    createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers: { 'x-carrier-webhook-secret': 'mcr-carrier-webhook-secret-2026' },
      body: { accountId: TEST_ACCOUNT, action: 'advance_status' },
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
  const step5 = await compliancePost(
    createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers: { 'x-carrier-webhook-secret': 'mcr-carrier-webhook-secret-2026' },
      body: { accountId: TEST_ACCOUNT, action: 'advance_status' },
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
  const step7 = await compliancePost(
    createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers: { 'x-carrier-webhook-secret': 'mcr-carrier-webhook-secret-2026' },
      body: { accountId: TEST_ACCOUNT, action: 'advance_status' },
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
