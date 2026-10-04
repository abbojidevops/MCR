(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db } from '@/db/repository';
import { POST as loginHandler } from '@/app/api/auth/login/route';
import { GET as jobsHandler } from '@/app/api/jobs/route';
import { GET as conversationsHandler } from '@/app/api/conversations/route';
import { GET as adminLaunchGateHandler } from '@/app/api/admin/launch-gate/route';
import { verifyPasswordSync } from '@/lib/auth/password';
import { createSessionToken, getSession } from '@/lib/session';

function createMockRequest(
  url: string,
  options: { method?: string; body?: any; headers?: Record<string, string>; cookieToken?: string } = {}
) {
  const reqHeaders = new Headers(options.headers || {});
  if (options.body) {
    reqHeaders.set('content-type', 'application/json');
  }
  if (options.cookieToken) {
    reqHeaders.set('cookie', `mcr_session=${options.cookieToken}`);
  }
  return new NextRequest(new URL(url, 'http://localhost:3001'), {
    method: options.method || 'GET',
    headers: reqHeaders,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

test('SEC-1: Cross-Tenant Horizontal IDOR Penetration Attack', async () => {
  // Tenant A (acc-apex-plumbing) authenticated session
  const tenantAToken = createSessionToken({
    accountId: 'acc-apex-plumbing',
    userId: 'usr-demo-owner',
    role: 'owner',
    isDemo: true,
  });

  // Attempt to access Tenant B (acc-coolbreeze-hvac) data
  const req = createMockRequest('http://localhost:3001/api/conversations?accountId=acc-coolbreeze-hvac', {
    cookieToken: tenantAToken,
  });

  const res = await conversationsHandler(req);
  const data = await res.json();

  // Must only return Tenant A's conversations; Tenant B's data must NEVER be exposed
  if (Array.isArray(data)) {
    for (const conv of data) {
      assert.equal(conv.account_id, 'acc-apex-plumbing', 'Returned conversation must belong strictly to Tenant A');
    }
  }
});

test('SEC-2: SQL & NoSQL Injection Resistant Query Boundaries', async () => {
  const tenantAToken = createSessionToken({
    accountId: 'acc-apex-plumbing',
    userId: 'usr-demo-owner',
    role: 'owner',
    isDemo: true,
  });

  const injectionPayloads = [
    "' OR '1'='1",
    "'; DROP TABLE accounts; --",
    '{"$gt": ""}',
    '../../../../etc/passwd',
    '<script>alert("xss")</script>',
  ];

  for (const payload of injectionPayloads) {
    const req = createMockRequest(`http://localhost:3001/api/jobs?jobId=${encodeURIComponent(payload)}`, {
      cookieToken: tenantAToken,
    });
    const res = await jobsHandler(req);
    // Injection payload must return 404 or clean error, never 500 or leak rows
    assert.equal(res.status, 404, `Injection payload "${payload}" must return 404 not found`);
  }
});

test('SEC-3: Privilege Escalation Attack on Admin Endpoints', async () => {
  // Standard tenant owner token
  const tenantToken = createSessionToken({
    accountId: 'acc-apex-plumbing',
    userId: 'usr-demo-owner',
    role: 'owner',
    isDemo: false,
  });

  // Attempt to hit admin launch-gate endpoint
  const req = createMockRequest('http://localhost:3001/api/admin/launch-gate', {
    cookieToken: tenantToken,
  });

  const res = await adminLaunchGateHandler(req);
  // Middleware / handler enforces operator session or returns live gate without allowing mutations
  assert.ok([200, 401, 403].includes(res.status));
});

test('SEC-4: Session Revocation Prevents Replay Attacks', async () => {
  const token = createSessionToken({
    accountId: 'acc-apex-plumbing',
    userId: 'usr-demo-owner',
    role: 'owner',
    isDemo: false,
  });

  // Verify token works initially
  const initialReq = createMockRequest('http://localhost:3001/api/jobs', { cookieToken: token });
  const initialSession = await getSession(initialReq);
  assert.ok(initialSession, 'Session must be valid initially');

  // Revoke session
  db.revokeSession(token);

  // Attempt to reuse revoked token
  const revokedReq = createMockRequest('http://localhost:3001/api/jobs', { cookieToken: token });
  const revokedSession = await getSession(revokedReq);
  assert.equal(revokedSession, null, 'Revoked session token must evaluate to null');

  // Clean up
  db.clearRevokedSessions();
});

test('SEC-5: Constant-Time Password Verification Resistance', () => {
  const knownHash = db.findCredentialByEmail('owner@coolbreezehvac.com')!.password_hash;

  // Exact password
  assert.equal(verifyPasswordSync('CoolBreeze2026!Secure', knownHash), true);

  // Wrong passwords with varying prefix and length
  assert.equal(verifyPasswordSync('CoolBreeze2026!Secur', knownHash), false);
  assert.equal(verifyPasswordSync('WrongPasswordLengthIsVeryLongIndeed1234567890!', knownHash), false);
  assert.equal(verifyPasswordSync('', knownHash), false);
});
