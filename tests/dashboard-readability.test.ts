(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Domain and Auth modules
import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { computeMetrics } from '@/lib/metrics';
import { EmailService } from '@/lib/email/email-service';
import { DEFAULT_AVERAGE_TICKET } from '@/lib/constants';

// Route handlers
import { GET as dashboardGet } from '@/app/api/dashboard/route';
import { GET as callsGet } from '@/app/api/calls/route';
import { GET as setupStatusGet } from '@/app/api/setup-status/route';

const TENANT_A = 'acc-apex-plumbing';
const TENANT_B = 'acc-coolbreeze-hvac';
const EMPTY_TENANT = 'acc-empty-tenant-testing';

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

test('D1: Route Authentication & Isolation for Dashboard Endpoints', async () => {
  // 1. Anonymous callers must receive 401 Unauthorized
  const anonDashReq = createMockRequest('http://localhost:3001/api/dashboard');
  const anonDashRes = await dashboardGet(anonDashReq);
  assert.equal(anonDashRes.status, 401, '/api/dashboard must require authentication');

  const anonCallsReq = createMockRequest('http://localhost:3001/api/calls');
  const anonCallsRes = await callsGet(anonCallsReq);
  assert.equal(anonCallsRes.status, 401, '/api/calls must require authentication');

  const anonSetupReq = createMockRequest('http://localhost:3001/api/setup-status');
  const anonSetupRes = await setupStatusGet(anonSetupReq);
  assert.equal(anonSetupRes.status, 401, '/api/setup-status must require authentication');

  // 2. Authenticated callers receive 200
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: true });
  const authDashReq = createMockRequest('http://localhost:3001/api/dashboard', { token: tokenA });
  const authDashRes = await dashboardGet(authDashReq);
  assert.equal(authDashRes.status, 200, 'Authenticated /api/dashboard must return 200');

  const authCallsReq = createMockRequest('http://localhost:3001/api/calls', { token: tokenA });
  const authCallsRes = await callsGet(authCallsReq);
  assert.equal(authCallsRes.status, 200, 'Authenticated /api/calls must return 200');

  const authSetupReq = createMockRequest('http://localhost:3001/api/setup-status', { token: tokenA });
  const authSetupRes = await setupStatusGet(authSetupReq);
  assert.equal(authSetupRes.status, 200, 'Authenticated /api/setup-status must return 200');
});

test('D2: Zero Calls Empty State Honesty', async () => {
  // Ensure EMPTY_TENANT has no calls in db
  const metrics = computeMetrics(EMPTY_TENANT, { preset: 'all' });

  assert.equal(metrics.missedCallsCount, 0, 'New account must have 0 missed calls');
  assert.equal(metrics.bookedJobsCount, 0, 'New account must have 0 booked jobs');
  assert.equal(metrics.completedJobsCount, 0, 'New account must have 0 completed jobs');
  assert.equal(metrics.confirmedRevenue, 0, 'New account must have $0 confirmed revenue');
  assert.equal(metrics.bookedRevenue, 0, 'New account must have $0 booked revenue');
  assert.equal(metrics.pipelineEstimatedValue, 0, 'New account must have $0 pipeline value');
  assert.equal(metrics.totalPotentialValue, 0, 'New account must have $0 total potential value');
  assert.equal(metrics.potentialMissedCallValue, 0, 'New account must have $0 potential missed call value');

  // Gap analysis must not invent dummy counts (no fallback to 1)
  assert.equal(metrics.textBackGapAnalysis.suppressedDedupe, 0, 'Suppressed dedupe must be 0 for empty account');
  assert.equal(metrics.textBackGapAnalysis.suppressedOptOut, 0, 'Suppressed opt-out must be 0 for empty account');
  assert.equal(metrics.textBackGapAnalysis.suppressedQuietHours, 0, 'Suppressed quiet hours must be 0 for empty account');
  assert.equal(metrics.textBackGapAnalysis.failedDelivery, 0, 'Failed delivery must be 0 for empty account');
  assert.equal(metrics.textBackGapAnalysis.totalUndelivered, 0, 'Total undelivered must be 0 for empty account');

  // Forwarding status must honestly report unconfigured for an unknown/empty profile
  assert.equal(metrics.forwardingStatus.configured, false, 'Unconfigured tenant must not default to configured: true');
  assert.equal(metrics.forwardingStatus.carrierName, '', 'Unconfigured tenant must not default to Verizon Wireless');
});

test('D3: Metric Traceability & Strict Revenue Figure Separation', async () => {
  const metrics = computeMetrics(TENANT_A, { preset: 'month' });

  // 1. Traceability of the 4 strictly separated revenue figures
  assert.equal(
    metrics.totalPotentialValue,
    metrics.confirmedRevenue + metrics.bookedRevenue + metrics.pipelineEstimatedValue,
    'Total potential value must be exact mathematical sum of confirmed + booked + pipeline'
  );

  // 2. Average ticket basis must be grounded
  assert.equal(metrics.averageTicketAssumption, DEFAULT_AVERAGE_TICKET, 'Must disclose default $650 ticket basis');
  assert.equal(
    metrics.potentialMissedCallValue,
    metrics.missedCallsCount * metrics.averageTicketAssumption,
    'Potential missed call value must equal missedCallsCount * averageTicketAssumption'
  );

  // 3. Summary payload matches top-level metrics
  assert.equal(metrics.summary.confirmedRevenue, metrics.confirmedRevenue);
  assert.equal(metrics.summary.bookedRevenue, metrics.bookedRevenue);
  assert.equal(metrics.summary.pipelineEstimatedValue, metrics.pipelineEstimatedValue);
  assert.equal(metrics.summary.totalPotentialValue, metrics.totalPotentialValue);
  assert.equal(metrics.summary.averageTicketAssumption, metrics.averageTicketAssumption);
});

test('D4: Compliance & Text-Back Setup Status Honesty', async () => {
  const tokenB = createSessionToken({ accountId: TENANT_B, role: 'owner', isDemo: false });
  const setupReq = createMockRequest('http://localhost:3001/api/setup-status', { token: tokenB });
  const setupRes = await setupStatusGet(setupReq);
  assert.equal(setupRes.status, 200);

  const setupData = await setupRes.json();
  const compliance = db.getCompliance(TENANT_B);

  // Tenant B is registered but brand_submitted / not yet sms_live
  assert.equal(setupData.complianceStatus, compliance?.status);
  if (compliance?.status !== 'sms_live') {
    assert.equal(setupData.textBackLive, false, 'textBackLive must be false until sms_live');
  } else {
    assert.equal(setupData.textBackLive, true, 'textBackLive must be true when sms_live');
  }
});

test('D5: Tenant Scoping on /api/calls and /api/setup-status', async () => {
  const tokenB = createSessionToken({ accountId: TENANT_B, role: 'owner', isDemo: false });

  // 1. Tenant B asks for calls with a spoofed account_id=TENANT_A parameter
  const callsReq = createMockRequest(`http://localhost:3001/api/calls?account_id=${TENANT_A}`, { token: tokenB });
  const callsRes = await callsGet(callsReq);
  assert.equal(callsRes.status, 200);

  const callsData = await callsRes.json();
  assert(Array.isArray(callsData.calls), 'Calls must be an array');

  // Verify that all returned calls belong strictly to TENANT_B, zero calls from TENANT_A
  for (const c of callsData.calls) {
    assert.equal(c.account_id, TENANT_B, 'Every returned call must belong to authenticated tenant B');
    assert.notEqual(c.account_id, TENANT_A, 'Tenant A calls must NEVER leak into Tenant B');
  }

  // 2. Setup status spoofing attempt
  const setupReq = createMockRequest(`http://localhost:3001/api/setup-status?account_id=${TENANT_A}`, { token: tokenB });
  const setupRes = await setupStatusGet(setupReq);
  const setupData = await setupRes.json();
  assert.equal(setupData.accountId, TENANT_B, 'Must return Tenant B account id regardless of query parameter');
});

test('D6: Email Service Honesty (No Fabricated 2,450 or 14 Fallbacks)', async () => {
  // Render weekly report with empty/zero data
  const rendered = EmailService.renderTemplate('weekly_report', {
    businessName: 'Zero Plumbing',
  });

  // Must not contain fabricated numbers like "2,450" or "14" or "720"
  assert(
    !rendered.subject.includes('2,450'),
    'Email subject must not default to fabricated $2,450'
  );
  assert(
    rendered.subject.includes('$0 in missed calls'),
    'Email subject must report $0 when no value exists'
  );
  assert(
    !rendered.html.includes('2,450'),
    'Email HTML must not contain fabricated $2,450'
  );
  assert(
    !rendered.html.includes('14<br>'),
    'Email HTML must not default to fabricated 14 missed calls'
  );
});

test('D7: Setup-Status Route Milestones Breakdown (5 Essential Onboarding Steps)', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const setupReq = createMockRequest('http://localhost:3001/api/setup-status', { token: tokenA });
  const setupRes = await setupStatusGet(setupReq);
  assert.equal(setupRes.status, 200);
  const data = await setupRes.json();

  assert.equal(data.totalSteps, 5, 'Must define exactly 5 core onboarding milestones');
  assert.equal(typeof data.completedSteps, 'number');
  assert.equal(typeof data.progressPercent, 'number');
  assert.ok(Array.isArray(data.milestones), 'Must return milestones array');
  assert.equal(data.milestones.length, 5);

  const stepIds = data.milestones.map((m: any) => m.id);
  assert.deepEqual(stepIds, ['profile', 'phone_number', 'forwarding', 'test_call', 'compliance']);

  // Verify milestone shapes
  for (const m of data.milestones) {
    assert.ok(m.id && m.label && m.description && m.href);
    assert.equal(typeof m.isComplete, 'boolean');
  }
});

test('D8: Dynamic Milestone Completion on Forwarding Toggle with State Invariance', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile);
  const originalForwarding = profile.forwarding_configured;

  try {
    // 1. Force forwarding_configured = false
    db.updateBusinessProfile(TENANT_A, { forwarding_configured: false });
    const reqFalse = createMockRequest('http://localhost:3001/api/setup-status', { token: tokenA });
    const resFalse = await setupStatusGet(reqFalse);
    const dataFalse = await resFalse.json();
    const forwardingMilestoneFalse = dataFalse.milestones.find((m: any) => m.id === 'forwarding');
    assert.equal(forwardingMilestoneFalse.isComplete, false);
    const stepsFalse = dataFalse.completedSteps;

    // 2. Force forwarding_configured = true
    db.updateBusinessProfile(TENANT_A, { forwarding_configured: true });
    const reqTrue = createMockRequest('http://localhost:3001/api/setup-status', { token: tokenA });
    const resTrue = await setupStatusGet(reqTrue);
    const dataTrue = await resTrue.json();
    const forwardingMilestoneTrue = dataTrue.milestones.find((m: any) => m.id === 'forwarding');
    assert.equal(forwardingMilestoneTrue.isComplete, true);
    assert.equal(dataTrue.completedSteps, stepsFalse + 1);
    assert.ok(dataTrue.progressPercent > dataFalse.progressPercent);
  } finally {
    // Restore pristine database state
    db.updateBusinessProfile(TENANT_A, { forwarding_configured: originalForwarding });
  }
});
