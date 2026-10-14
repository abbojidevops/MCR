import './test-env';

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

test('H1a: Readiness Returns 503 for Missing or Weak Auth Configuration Without Leaking Details', async () => {
  const previousNodeEnv = process.env.NODE_ENV;
  const previousSessionSecret = process.env.SESSION_SECRET;
  const previousAdminPassword = process.env.ADMIN_PASSWORD;

  try {
    (process.env as any).NODE_ENV = 'production';
    process.env.ADMIN_PASSWORD = 'SuperSecureTestAdminPassword2026!';

    for (const sessionSecret of [undefined, 'a'.repeat(64)]) {
      if (sessionSecret === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = sessionSecret;

      const response = await healthGet(createMockRequest());
      const body = await response.json();
      assert.equal(response.status, 503);
      assert.equal(body.status, 'unhealthy');
      assert.deepEqual(Object.keys(body).sort(), ['status', 'timestamp', 'version'].sort());
      assert.equal(JSON.stringify(body).includes('SESSION_SECRET'), false);
    }

    process.env.SESSION_SECRET = 'f4c1a9d83b27e65094af1d2c8b7e035af61c2938d405eb7a19c2f8d6470ba3e5';
    for (const adminPassword of [undefined, 'short']) {
      if (adminPassword === undefined) delete process.env.ADMIN_PASSWORD;
      else process.env.ADMIN_PASSWORD = adminPassword;

      const response = await healthGet(createMockRequest());
      const body = await response.json();
      assert.equal(response.status, 503);
      assert.equal(body.status, 'unhealthy');
      assert.deepEqual(Object.keys(body).sort(), ['status', 'timestamp', 'version'].sort());
      assert.equal(JSON.stringify(body).includes('ADMIN_PASSWORD'), false);
    }
  } finally {
    if (previousNodeEnv === undefined) delete (process.env as any).NODE_ENV;
    else (process.env as any).NODE_ENV = previousNodeEnv;
    if (previousSessionSecret === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previousSessionSecret;
    if (previousAdminPassword === undefined) delete process.env.ADMIN_PASSWORD;
    else process.env.ADMIN_PASSWORD = previousAdminPassword;
  }
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
    status: 'signed_up',
    last_updated_by: 'admin',
    carrier_source: 'demo',
    brand_sid: null,
    campaign_sid: null,
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
  // Simulate carrier asserting sms_live via webhook on non-demo tenant with valid 32-hex identifiers
  db.recordComplianceTransition(
    'acc-coolbreeze-hvac',
    'sms_live',
    'carrier_webhook',
    'tcr_carrier_webhook',
    'Carrier vetting approved and 10DLC live',
    {
      carrier_source: 'carrier_webhook',
      brand_sid: 'BN0123456789abcdef0123456789abcdef',
      campaign_sid: 'CM0123456789abcdef0123456789abcdef',
    }
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

  // Reset back to pristine seed state
  db.updateCompliance('acc-coolbreeze-hvac', {
    status: 'signed_up',
    last_updated_by: 'admin',
    carrier_source: 'demo',
    brand_sid: null,
    campaign_sid: null,
  });
});
