(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Domain and Auth modules
import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { createFixtureTracker, TestFixtureTracker } from '@/lib/test-hygiene';
import { evaluateLaunchGates } from '@/lib/launch-gate';

// Route handlers
import { GET as fleetGet, POST as fleetPost } from '@/app/api/admin/fleet/route';

const tracker = createFixtureTracker();

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

test('ADMIN-1: Operator RBAC Enforcement — GET & POST /api/admin/fleet reject anonymous and non-admin callers with 403', async () => {
  // 1. Anonymous GET
  const anonGetReq = createMockRequest('http://localhost:3001/api/admin/fleet', {
    method: 'GET',
  });
  const anonGetRes = await fleetGet(anonGetReq);
  assert.equal(anonGetRes.status, 403, 'Anonymous GET must be rejected with 403 Forbidden');
  const anonGetData = await anonGetRes.json();
  assert.match(anonGetData.error, /Forbidden/i);

  // 2. Tenant Owner GET
  const ownerToken = createSessionToken({
    accountId: 'acc-apex-plumbing',
    role: 'owner',
    isDemo: true,
  });
  const ownerGetReq = createMockRequest('http://localhost:3001/api/admin/fleet', {
    method: 'GET',
    token: ownerToken,
  });
  const ownerGetRes = await fleetGet(ownerGetReq);
  assert.equal(ownerGetRes.status, 403, 'Tenant owner GET must be rejected with 403 Forbidden');

  // 3. Tenant Member GET
  const memberToken = createSessionToken({
    accountId: 'acc-apex-plumbing',
    role: 'member',
    isDemo: true,
  });
  const memberGetReq = createMockRequest('http://localhost:3001/api/admin/fleet', {
    method: 'GET',
    token: memberToken,
  });
  const memberGetRes = await fleetGet(memberGetReq);
  assert.equal(memberGetRes.status, 403, 'Tenant member GET must be rejected with 403 Forbidden');

  // 4. Anonymous POST
  const anonPostReq = createMockRequest('http://localhost:3001/api/admin/fleet', {
    method: 'POST',
    body: { action: 'simulate_call', accountId: 'acc-apex-plumbing' },
  });
  const anonPostRes = await fleetPost(anonPostReq);
  assert.equal(anonPostRes.status, 403, 'Anonymous POST must be rejected with 403 Forbidden');

  // 5. Tenant Owner POST
  const ownerPostReq = createMockRequest('http://localhost:3001/api/admin/fleet', {
    method: 'POST',
    token: ownerToken,
    body: { action: 'simulate_call', accountId: 'acc-apex-plumbing' },
  });
  const ownerPostRes = await fleetPost(ownerPostReq);
  assert.equal(ownerPostRes.status, 403, 'Tenant owner POST must be rejected with 403 Forbidden');
});

test('ADMIN-2: Fleet Discovery & Honest SaaS Economics — GET /api/admin/fleet returns dynamic tenant fleet & honest MRR', async () => {
  const adminToken = createSessionToken({
    accountId: 'acc-admin',
    userId: 'usr-platform-admin',
    role: 'admin',
    isDemo: false,
  });

  const req = createMockRequest('http://localhost:3001/api/admin/fleet', {
    method: 'GET',
    token: adminToken,
  });

  const res = await fleetGet(req);
  assert.equal(res.status, 200, 'Admin session must return 200 OK');
  const data = await res.json();

  assert.equal(data.success, true);
  assert.ok(data.platformStats, 'Must return platformStats');
  assert.ok(Array.isArray(data.tenants), 'Must return tenants array');
  assert.ok(Array.isArray(data.auditLogs), 'Must return auditLogs array');

  // Verify honest SaaS metrics
  const accounts = db.getAllAccounts();
  const payingCount = accounts.filter((a) => !a.is_demo && a.status === 'active').length;
  assert.equal(data.platformStats.totalAccounts, accounts.length);
  assert.equal(data.platformStats.payingTenantsCount, payingCount);
  assert.equal(data.platformStats.estimatedMrr, payingCount * 149, 'MRR must be exactly $149 * active paying tenants');

  // Verify tenant fleet items
  for (const tenant of data.tenants) {
    assert.ok(tenant.id);
    assert.ok(tenant.name);
    assert.ok(tenant.status);
    assert.ok(tenant.planTier);
    assert.equal(typeof tenant.isDemo, 'boolean');
    assert.ok(tenant.businessName);
    assert.equal(typeof tenant.forwardingConfigured, 'boolean');
    assert.equal(typeof tenant.crmWebhookConfigured, 'boolean');
    assert.ok(tenant.metrics);
    assert.equal(typeof tenant.metrics.totalCalls, 'number');
    assert.equal(typeof tenant.metrics.textBacksSent, 'number');
    assert.equal(typeof tenant.metrics.bookedJobs, 'number');
    assert.equal(typeof tenant.metrics.recoveredRevenue, 'number');
  }
});

test('ADMIN-3: Admin Concierge Simulated Call Execution — POST /api/admin/fleet action simulate_call', async () => {
  const localTracker = new TestFixtureTracker();
  const adminToken = createSessionToken({
    accountId: 'acc-admin',
    userId: 'usr-platform-admin',
    role: 'admin',
    isDemo: false,
  });

  const created = localTracker.createAccount('Concierge Sim Plumbing', 'plumbing', '+12175559812');
  const testAccId = created.account.id;

  try {
    const req = createMockRequest('http://localhost:3001/api/admin/fleet', {
      method: 'POST',
      token: adminToken,
      body: {
        action: 'simulate_call',
        accountId: testAccId,
        callerNumber: '+12175558833',
        callerName: 'Jane Concierge Caller',
      },
    });

    const res = await fleetPost(req);
    assert.equal(res.status, 200, 'Admin concierge simulation must return 200 OK');
    const data = await res.json();

    assert.equal(data.success, true);
    assert.ok(data.simResult);
    assert.ok(data.simResult.callRecordId);
    assert.ok(data.simResult.conversationId);
    assert.ok(Array.isArray(data.simResult.checklist));
    assert.ok(data.simResult.checklist.length > 0);

    // Verify audit log entry
    const auditLogs = db.getAuditLogs();
    const simLog = auditLogs.find(
      (l) => l.accountId === testAccId && l.action === 'ADMIN_CONCIERGE_SIMULATE_CALL'
    );
    assert.ok(simLog, 'Audit log must record ADMIN_CONCIERGE_SIMULATE_CALL');
    assert.equal(simLog.details.callerNumber, '+12175558833');
  } finally {
    localTracker.cleanup();
  }
});

test('ADMIN-4: Admin Concierge Digest Report Trigger — POST /api/admin/fleet action trigger_digest', async () => {
  const localTracker = new TestFixtureTracker();
  const adminToken = createSessionToken({
    accountId: 'acc-admin',
    userId: 'usr-platform-admin',
    role: 'admin',
    isDemo: false,
  });

  const created = localTracker.createAccount('Concierge Digest Rooter', 'drain_cleaning', '+12175559813');
  const testAccId = created.account.id;

  try {
    const req = createMockRequest('http://localhost:3001/api/admin/fleet', {
      method: 'POST',
      token: adminToken,
      body: {
        action: 'trigger_digest',
        accountId: testAccId,
        digestType: 'weekly_report',
      },
    });

    const res = await fleetPost(req);
    assert.equal(res.status, 200, 'Admin digest trigger must return 200 OK');
    const data = await res.json();

    assert.equal(data.success, true);
    assert.match(data.message, /weekly_report/i);

    // Verify audit log entry
    const auditLogs = db.getAuditLogs();
    const digestLog = auditLogs.find(
      (l) => l.accountId === testAccId && l.action === 'ADMIN_CONCIERGE_TRIGGER_DIGEST'
    );
    assert.ok(digestLog, 'Audit log must record ADMIN_CONCIERGE_TRIGGER_DIGEST');
    assert.equal(digestLog.details.digestType, 'weekly_report');
  } finally {
    localTracker.cleanup();
  }
});

test('ADMIN-5: Admin Concierge Telemetry Updates — Forwarding Verification, Status Updates & Validation', async () => {
  const localTracker = new TestFixtureTracker();
  const adminToken = createSessionToken({
    accountId: 'acc-admin',
    userId: 'usr-platform-admin',
    role: 'admin',
    isDemo: false,
  });

  const created = localTracker.createAccount('Concierge Toggle HVAC', 'hvac', '+12175559814');
  const testAccId = created.account.id;

  try {
    // 1. Verify forwarding toggle
    const forwardReq = createMockRequest('http://localhost:3001/api/admin/fleet', {
      method: 'POST',
      token: adminToken,
      body: {
        action: 'verify_forwarding',
        accountId: testAccId,
        forwardingConfigured: true,
      },
    });
    const forwardRes = await fleetPost(forwardReq);
    assert.equal(forwardRes.status, 200);
    const forwardData = await forwardRes.json();
    assert.equal(forwardData.success, true);
    assert.equal(forwardData.profile.forwarding_configured, true);

    // 2. Update status
    const statusReq = createMockRequest('http://localhost:3001/api/admin/fleet', {
      method: 'POST',
      token: adminToken,
      body: {
        action: 'update_status',
        accountId: testAccId,
        status: 'suspended',
      },
    });
    const statusRes = await fleetPost(statusReq);
    assert.equal(statusRes.status, 200);
    const statusData = await statusRes.json();
    assert.equal(statusData.success, true);
    assert.equal(statusData.account.status, 'suspended');

    // 3. Validation: Missing accountId returns 400
    const missingAccReq = createMockRequest('http://localhost:3001/api/admin/fleet', {
      method: 'POST',
      token: adminToken,
      body: { action: 'update_status' },
    });
    const missingAccRes = await fleetPost(missingAccReq);
    assert.equal(missingAccRes.status, 400);

    // 4. Validation: Non-existent accountId returns 404
    const notFoundReq = createMockRequest('http://localhost:3001/api/admin/fleet', {
      method: 'POST',
      token: adminToken,
      body: { action: 'update_status', accountId: 'acc-does-not-exist', status: 'active' },
    });
    const notFoundRes = await fleetPost(notFoundReq);
    assert.equal(notFoundRes.status, 404);

    // 5. Validation: Unknown action returns 400
    const unknownReq = createMockRequest('http://localhost:3001/api/admin/fleet', {
      method: 'POST',
      token: adminToken,
      body: { action: 'unknown_magic_action', accountId: testAccId },
    });
    const unknownRes = await fleetPost(unknownReq);
    assert.equal(unknownRes.status, 400);
  } finally {
    localTracker.cleanup();
  }
});

test('ADMIN-6: Multi-Table Database Hygiene Invariance & Gate Stability', () => {
  const countsBefore = db.getTableCounts();
  const gatesBefore = evaluateLaunchGates().gates.map((g) => ({ id: g.id, status: g.status }));

  // Run isolated test fixture cycle
  const localTracker = new TestFixtureTracker();
  const created = localTracker.createAccount('Hygiene Guard Plumbing', 'plumbing', '+12175559815');
  assert.equal(db.getTableCounts().accounts, countsBefore.accounts + 1);

  localTracker.cleanup();

  const countsAfter = db.getTableCounts();
  const gatesAfter = evaluateLaunchGates().gates.map((g) => ({ id: g.id, status: g.status }));

  assert.deepEqual(countsAfter, countsBefore, 'All seven table counts must return to exact baseline counts');
  assert.deepEqual(gatesAfter, gatesBefore, 'All 15 launch gates must maintain identical statuses');
});

test.after(() => {
  tracker.cleanup();
});
