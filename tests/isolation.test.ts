(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Domain and Auth modules
import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

// Route handlers
import { GET as complianceGet } from '@/app/api/compliance/route';
import { GET as jobsGet, PATCH as jobsPatch } from '@/app/api/jobs/route';
import { GET as conversationsGet, POST as conversationsPost } from '@/app/api/conversations/route';
import { GET as settingsGet } from '@/app/api/settings/route';
import { GET as reportsGet } from '@/app/api/reports/route';
import { GET as dashboardStatsGet } from '@/app/api/dashboard/stats/route';

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
    method: options.method || 'GET',
    headers: reqHeaders,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

test('I1: Strict Session Identity — Client-Supplied Query/Body account_id is Completely Ignored', async () => {
  const tokenB = createSessionToken({ accountId: TENANT_B, role: 'owner', isDemo: false });

  // 1. Tenant B asks for Tenant A's compliance record via query parameter
  const compReq = createMockRequest(`http://localhost:3001/api/compliance?account_id=${TENANT_A}`, {
    token: tokenB,
  });
  const compRes = await complianceGet(compReq);
  assert.equal(compRes.status, 200);
  const compData = await compRes.json();

  // MUST return Tenant B's data, NEVER Tenant A's EIN or business name
  assert.equal(compData.compliance.account_id, TENANT_B, 'Must return Tenant B record');
  assert.notEqual(compData.compliance.account_id, TENANT_A, 'Must NEVER return Tenant A data to Tenant B');
  assert.notEqual(compData.compliance.ein, '12-3456789', 'Tenant A EIN must never leak to Tenant B');

  // 2. Tenant B asks for Tenant A's jobs via query parameter
  const jobsReq = createMockRequest(`http://localhost:3001/api/jobs?account_id=${TENANT_A}`, {
    token: tokenB,
  });
  const jobsRes = await jobsGet(jobsReq);
  assert.equal(jobsRes.status, 200);
  const jobsData = await jobsRes.json();

  for (const job of jobsData.jobs) {
    assert.equal(job.account_id, TENANT_B, 'All returned jobs must belong strictly to Tenant B');
    assert.notEqual(job.account_id, TENANT_A, 'Tenant A job must never appear in Tenant B response');
  }
});

test('I2: Reverse Isolation Probe — Tenant A Cannot Read Tenant B Data', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: true });

  const compReq = createMockRequest(`http://localhost:3001/api/compliance?account_id=${TENANT_B}`, {
    token: tokenA,
  });
  const compRes = await complianceGet(compReq);
  assert.equal(compRes.status, 200);
  const compData = await compRes.json();

  assert.equal(compData.compliance.account_id, TENANT_A, 'Must return Tenant A record');
  assert.notEqual(compData.compliance.account_id, TENANT_B, 'Must NEVER return Tenant B data to Tenant A');
  assert.notEqual(compData.compliance.ein, '98-7654321', 'Tenant B EIN must never leak to Tenant A');

  const jobsReq = createMockRequest(`http://localhost:3001/api/jobs?account_id=${TENANT_B}`, {
    token: tokenA,
  });
  const jobsRes = await jobsGet(jobsReq);
  assert.equal(jobsRes.status, 200);
  const jobsData = await jobsRes.json();

  for (const job of jobsData.jobs) {
    assert.equal(job.account_id, TENANT_A, 'All returned jobs must belong strictly to Tenant A');
  }
});

test('I3: Nested Resource Read — Foreign Conversation ID Returns Byte-Identical 404 (No Oracle)', async () => {
  const tokenB = createSessionToken({ accountId: TENANT_B, role: 'owner', isDemo: false });

  // Find a conversation belonging to Tenant A
  const convsA = db.getConversations(TENANT_A);
  assert.ok(convsA.length > 0, 'Tenant A must have conversations');
  const foreignConvId = convsA[0].id;
  const unknownConvId = 'conv-nonexistent-random-99999';

  // Request foreign conversation
  const foreignReq = createMockRequest(
    `http://localhost:3001/api/conversations?conversationId=${foreignConvId}`,
    { token: tokenB }
  );
  const foreignRes = await conversationsGet(foreignReq);
  const foreignStatus = foreignRes.status;
  const foreignText = await foreignRes.text();

  // Request unknown conversation
  const unknownReq = createMockRequest(
    `http://localhost:3001/api/conversations?conversationId=${unknownConvId}`,
    { token: tokenB }
  );
  const unknownRes = await conversationsGet(unknownReq);
  const unknownStatus = unknownRes.status;
  const unknownText = await unknownRes.text();

  assert.equal(foreignStatus, 404, 'Foreign conversation read must return 404');
  assert.equal(unknownStatus, 404, 'Unknown conversation read must return 404');

  // Assert byte-identical response to eliminate existence oracle
  assert.equal(
    foreignText,
    unknownText,
    'Foreign ID response must be byte-identical to unknown ID response'
  );
  assert.equal(foreignText, JSON.stringify({ error: 'Not found' }));
});

test('I4: Nested Resource Write — Foreign Job PATCH Returns Byte-Identical 404 & Leaves Row Unmodified', async () => {
  const tokenB = createSessionToken({ accountId: TENANT_B, role: 'owner', isDemo: false });

  // Find a job belonging to Tenant A
  const jobsA = db.getJobs(TENANT_A);
  assert.ok(jobsA.length > 0, 'Tenant A must have jobs');
  const foreignJob = jobsA[0];
  const initialValue = foreignJob.actual_value;

  const unknownJobId = 'job-nonexistent-random-88888';

  // Attempt PATCH on foreign job
  const foreignPatchReq = createMockRequest('http://localhost:3001/api/jobs', {
    method: 'PATCH',
    token: tokenB,
    body: { jobId: foreignJob.id, actualValue: 999999, status: 'DEAD' },
  });
  const foreignPatchRes = await jobsPatch(foreignPatchReq);
  const foreignStatus = foreignPatchRes.status;
  const foreignText = await foreignPatchRes.text();

  // Attempt PATCH on unknown job
  const unknownPatchReq = createMockRequest('http://localhost:3001/api/jobs', {
    method: 'PATCH',
    token: tokenB,
    body: { jobId: unknownJobId, actualValue: 999999, status: 'DEAD' },
  });
  const unknownPatchRes = await jobsPatch(unknownPatchReq);
  const unknownStatus = unknownPatchRes.status;
  const unknownText = await unknownPatchRes.text();

  assert.equal(foreignStatus, 404, 'Cross-tenant job PATCH must return 404');
  assert.equal(unknownStatus, 404, 'Unknown job PATCH must return 404');
  assert.equal(
    foreignText,
    unknownText,
    'Foreign job PATCH response must be byte-identical to unknown job PATCH response'
  );

  // Assert row was NOT modified in the database
  const refreshedJobA = db.getJob(TENANT_A, foreignJob.id);
  assert.equal(
    refreshedJobA?.actual_value,
    initialValue,
    'Foreign job value in DB must NOT be modified by cross-tenant request'
  );
  assert.notEqual(refreshedJobA?.status, 'DEAD');
});

test('I5: Nested Resource Write — Foreign Conversation Message Injection Returns Byte-Identical 404', async () => {
  const tokenB = createSessionToken({ accountId: TENANT_B, role: 'owner', isDemo: false });

  const convsA = db.getConversations(TENANT_A);
  assert.ok(convsA.length > 0);
  const foreignConvId = convsA[0].id;
  const unknownConvId = 'conv-nonexistent-random-77777';

  const initialMessagesA = db.getMessages(TENANT_A, foreignConvId)?.length || 0;

  // Attempt POST into foreign conversation
  const foreignPostReq = createMockRequest('http://localhost:3001/api/conversations', {
    method: 'POST',
    token: tokenB,
    body: { conversationId: foreignConvId, bodyText: 'Unauthorized cross-tenant injection' },
  });
  const foreignPostRes = await conversationsPost(foreignPostReq);
  const foreignStatus = foreignPostRes.status;
  const foreignText = await foreignPostRes.text();

  // Attempt POST into unknown conversation
  const unknownPostReq = createMockRequest('http://localhost:3001/api/conversations', {
    method: 'POST',
    token: tokenB,
    body: { conversationId: unknownConvId, bodyText: 'Unauthorized cross-tenant injection' },
  });
  const unknownPostRes = await conversationsPost(unknownPostReq);
  const unknownStatus = unknownPostRes.status;
  const unknownText = await unknownPostRes.text();

  assert.equal(foreignStatus, 404, 'Message POST into foreign conversation must return 404');
  assert.equal(unknownStatus, 404, 'Message POST into unknown conversation must return 404');
  assert.equal(
    foreignText,
    unknownText,
    'Cross-tenant message injection response must be byte-identical to unknown ID response'
  );

  // Assert no message was appended
  const afterMessagesA = db.getMessages(TENANT_A, foreignConvId)?.length || 0;
  assert.equal(afterMessagesA, initialMessagesA, 'No cross-tenant messages may be injected into Tenant A conversation');
});

test('I6: Job by ID Lookup (GET /api/jobs?jobId=...) Returns Byte-Identical 404', async () => {
  const tokenB = createSessionToken({ accountId: TENANT_B, role: 'owner', isDemo: false });

  const jobsA = db.getJobs(TENANT_A);
  assert.ok(jobsA.length > 0);
  const foreignJobId = jobsA[0].id;
  const unknownJobId = 'job-nonexistent-random-66666';

  const foreignReq = createMockRequest(`http://localhost:3001/api/jobs?jobId=${foreignJobId}`, {
    token: tokenB,
  });
  const foreignRes = await jobsGet(foreignReq);
  const foreignText = await foreignRes.text();

  const unknownReq = createMockRequest(`http://localhost:3001/api/jobs?jobId=${unknownJobId}`, {
    token: tokenB,
  });
  const unknownRes = await jobsGet(unknownReq);
  const unknownText = await unknownRes.text();

  assert.equal(foreignRes.status, 404);
  assert.equal(unknownRes.status, 404);
  assert.equal(foreignText, unknownText);
  assert.equal(foreignText, JSON.stringify({ error: 'Not found' }));
});

test('I7: Database-Level Query Scoping (Every Query Pre-Filtered by account_id)', () => {
  // Direct repository assertions ensuring queries filter by account_id in query
  const jobsB = db.getJobs(TENANT_B);
  for (const j of jobsB) {
    assert.equal(j.account_id, TENANT_B);
  }

  const convsB = db.getConversations(TENANT_B);
  for (const c of convsB) {
    assert.equal(c.account_id, TENANT_B);
  }

  // Cross-tenant update directly via repository must return null and update zero rows
  const jobsA = db.getJobs(TENANT_A);
  const jobA = jobsA[0];
  const initialJobStatus = jobA.status;

  const result = db.updateJob(TENANT_B, jobA.id, { status: 'DEAD' });
  assert.equal(result, null, 'Updating foreign job scoped by tenant B must return null');

  const refreshed = db.getJob(TENANT_A, jobA.id);
  assert.equal(refreshed?.status, initialJobStatus, 'Foreign job must remain unmodified');
});

test('I8: Fail-Closed Ownership Assertion (Rejects Undefined/Missing Tenant)', () => {
  const { assertTenantOwnership, isOwnedByTenant } = require('../src/lib/tenant-isolation');

  // Matching tenant -> true
  assert.equal(isOwnedByTenant(TENANT_A, TENANT_A), true);

  // Mismatched tenant -> false
  assert.equal(isOwnedByTenant(TENANT_A, TENANT_B), false);

  // Missing resource account ID -> MUST fail closed (false), NOT pass open
  assert.equal(isOwnedByTenant(TENANT_A, undefined), false);
  assert.equal(isOwnedByTenant(TENANT_A, null), false);

  assert.throws(() => {
    assertTenantOwnership(TENANT_A, undefined);
  }, /TenantIsolationViolation/);
});

