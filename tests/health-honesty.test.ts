(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { GET as healthGet } from '@/app/api/health/route';

function createMockRequest(
  url: string = 'http://localhost:3001/api/health',
  cookie?: string
) {
  const reqHeaders = new Headers();
  if (cookie) {
    reqHeaders.set('cookie', `${SESSION_COOKIE_NAME}=${cookie}`);
  }

  return new NextRequest(new URL(url), {
    method: 'GET',
    headers: reqHeaders,
  });
}

test('H1: Public Health Minimal Payload (Anonymous Visitor)', async () => {
  const req = createMockRequest();
  const res = await healthGet(req);

  assert.equal(res.status, 200, 'Public health must return 200');
  const body = await res.json();

  // Acceptance Criterion 1: returns {status, timestamp, version} and nothing else
  const keys = Object.keys(body).sort();
  assert.deepEqual(
    keys,
    ['status', 'timestamp', 'version'].sort(),
    'Public health endpoint must return only {status, timestamp, version} and nothing else'
  );

  // Leakage checks: no posture details published
  assert.equal(body.checks, undefined, 'Detailed checks must not be leaked');
  assert.equal(body.memory, undefined, 'Memory stats must not be leaked');
  assert.equal(body.activeTenants, undefined, 'Tenant counts must not be leaked');
  assert.equal(body.storageEngine, undefined, 'Storage engine must not be leaked');
  assert.equal(body.mockMode, undefined, 'Mock mode must not be leaked');
  assert.equal(body.uptimeSeconds, undefined, 'Uptime must not be leaked');
});

test('H2: Non-Operator Customer Receives Public Health Only (No Detailed Checks)', async () => {
  const customerToken = createSessionToken({
    accountId: 'acc-apex-plumbing',
    userId: 'usr-customer-owner',
    role: 'owner',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/health', customerToken);
  const res = await healthGet(req);
  const body = await res.json();

  const keys = Object.keys(body).sort();
  assert.deepEqual(
    keys,
    ['status', 'timestamp', 'version'].sort(),
    'Non-operator customer session must only receive the public health payload'
  );
  assert.equal(body.checks, undefined);
});

test('H3: Operator Authentication Detailed Diagnostic Exposure', async () => {
  const adminToken = createSessionToken({
    accountId: 'acc-apex-plumbing',
    userId: 'usr-platform-admin',
    role: 'admin',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/health', adminToken);
  const res = await healthGet(req);
  const body = await res.json();

  assert.ok(body.checks, 'Operator must receive checks');
  assert.ok(body.checks.database, 'Operator must receive database checks');
  assert.ok(body.checks.telecom, 'Operator must receive telecom checks');
  assert.ok(body.checks.compliance, 'Operator must receive compliance checks');
  assert.ok(body.checks.billing, 'Operator must receive billing checks');
  assert.ok(body.memory, 'Operator must receive memory checks');
});

test('H4: Compliance Subsystem Honesty — Not Claimed Healthy on Config Alone', async () => {
  // Ensure non-demo account does not have carrier-asserted live registration
  db.updateCompliance('acc-coolbreeze-hvac', {
    status: 'campaign_approved',
    last_updated_by: 'admin',
  });

  const adminToken = createSessionToken({
    accountId: 'acc-apex-plumbing',
    userId: 'usr-platform-admin',
    role: 'admin',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/health', adminToken);
  const res = await healthGet(req);
  const body = await res.json();

  const compliance = body.checks.compliance;
  assert.equal(
    compliance.status,
    'unhealthy',
    'Compliance must report unhealthy when non-demo tenant lacks carrier-asserted live status'
  );
  assert.equal(
    compliance.reason,
    'no carrier-asserted registration for any non-demo account',
    'Compliance report must explain exact reason for unhealthiness'
  );
});

test('H5: Compliance Subsystem Reports Healthy Once Carrier Asserts sms_live on Non-Demo Tenant', async () => {
  // Simulate carrier asserting sms_live via webhook on non-demo tenant
  db.recordComplianceTransition(
    'acc-coolbreeze-hvac',
    'sms_live',
    'carrier_webhook',
    'tcr_carrier_webhook',
    'Carrier vetting approved and 10DLC live'
  );

  const adminToken = createSessionToken({
    accountId: 'acc-apex-plumbing',
    userId: 'usr-platform-admin',
    role: 'admin',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/health', adminToken);
  const res = await healthGet(req);
  const body = await res.json();

  const compliance = body.checks.compliance;
  assert.equal(compliance.status, 'healthy', 'Compliance must report healthy when carrier has asserted sms_live');

  // Reset back to pre-test state
  db.updateCompliance('acc-coolbreeze-hvac', {
    status: 'campaign_approved',
    last_updated_by: 'admin',
  });
});
