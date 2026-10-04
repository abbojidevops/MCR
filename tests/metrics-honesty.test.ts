(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Domain and Auth modules
import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { computeMetrics } from '@/lib/metrics';
import { generateDailySummary, generateWeeklyReport } from '@/lib/reports';
import { DEFAULT_AVERAGE_TICKET, DEFAULT_GROSS_MARGIN } from '@/lib/constants';

// Route handler
import { GET as reportsGet } from '@/app/api/reports/route';

const TENANT_A = 'acc-apex-plumbing';
const EMPTY_TENANT = 'acc-empty-tenant-testing';

function createMockRequest(
  url: string,
  options: { method?: string; token?: string; headers?: Record<string, string> } = {}
) {
  const reqHeaders = new Headers(options.headers || {});
  if (options.token) {
    reqHeaders.set('cookie', `${SESSION_COOKIE_NAME}=${options.token}`);
  }

  return new NextRequest(new URL(url, 'http://localhost:3001'), {
    method: options.method || 'GET',
    headers: reqHeaders,
  });
}

test('M1: Empty period reports empty (0 calls, $0 revenue for quiet window)', async () => {
  // Querying a historical quiet window where no calls took place must return 0,
  // NEVER falling back to all-time seed calls or fabricated demo figures.
  const quietWindow = {
    startDate: '2021-01-01T00:00:00.000Z',
    endDate: '2021-01-02T23:59:59.999Z',
  };

  const metrics = computeMetrics(TENANT_A, quietWindow);

  assert.equal(metrics.missedCallsCount, 0, 'Empty window must report 0 missed calls');
  assert.equal(metrics.textsDeliveredCount, 0, 'Empty window must report 0 texts delivered');
  assert.equal(metrics.customersRespondedCount, 0, 'Empty window must report 0 customer responses');
  assert.equal(metrics.qualifiedLeadsCount, 0, 'Empty window must report 0 qualified leads');
  assert.equal(metrics.bookedJobsCount, 0, 'Empty window must report 0 booked jobs');
  assert.equal(metrics.completedJobsCount, 0, 'Empty window must report 0 completed jobs');
  assert.equal(metrics.confirmedRevenue, 0, 'Empty window must report 0 confirmed revenue');
  assert.equal(metrics.bookedRevenue, 0, 'Empty window must report 0 booked revenue');
  assert.equal(metrics.pipelineEstimatedValue, 0, 'Empty window must report $0 pipeline');
  assert.equal(metrics.totalPotentialValue, 0, 'Empty window must report $0 total potential value');
  assert.equal(metrics.potentialMissedCallValue, 0, 'Empty window must report $0 potential missed call value');
  assert.equal(metrics.recoveredJobsList.length, 0, 'Empty window must have empty recovered jobs list');
});

test('M2: Period label accurately tracks explicit start/end dates', async () => {
  const customWindow = {
    startDate: '2021-01-01T00:00:00.000Z',
    endDate: '2021-01-02T23:59:59.999Z',
  };

  const metrics = computeMetrics(TENANT_A, customWindow);

  assert.ok(
    metrics.periodLabel.includes('Jan 1, 2021') && metrics.periodLabel.includes('Jan 2, 2021'),
    `Period label must accurately describe specified window, got: ${metrics.periodLabel}`
  );
  assert.ok(
    !metrics.periodLabel.includes('Current Month'),
    'Period label for explicit window must not claim to be Current Month'
  );
});

test('M3: No invented counts in text-back gap analysis', async () => {
  const quietWindow = {
    startDate: '2021-01-01T00:00:00.000Z',
    endDate: '2021-01-02T23:59:59.999Z',
  };

  const metrics = computeMetrics(TENANT_A, quietWindow);
  const gap = metrics.textBackGapAnalysis;

  assert.equal(gap.suppressedDedupe, 0, 'Gap analysis must not invent dedupe suppression count');
  assert.equal(gap.suppressedOptOut, 0, 'Gap analysis must not invent opt-out suppression count');
  assert.equal(gap.suppressedQuietHours, 0, 'Gap analysis must not invent quiet hours suppression count');
  assert.equal(gap.failedDelivery, 0, 'Gap analysis must not invent delivery failure count');
  assert.equal(gap.totalUndelivered, 0, 'Gap analysis total undelivered must be 0 for 0 missed calls');
});

test('M4: Single owner: Daily and Weekly reports match computeMetrics exactly', async () => {
  const targetDate = new Date('2021-01-01T12:00:00.000Z');
  const daily = generateDailySummary(TENANT_A, targetDate);

  const startOfDay = new Date(targetDate);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(targetDate);
  endOfDay.setHours(23, 59, 59, 999);

  const underlyingMetrics = computeMetrics(TENANT_A, {
    startDate: startOfDay.toISOString(),
    endDate: endOfDay.toISOString(),
  });

  assert.equal(daily.missedCallsCount, underlyingMetrics.missedCallsCount);
  assert.equal(daily.textBacksSent, underlyingMetrics.textsDeliveredCount);
  assert.equal(daily.customersResponded, underlyingMetrics.customersRespondedCount);
  assert.equal(daily.qualifiedJobsCount, underlyingMetrics.qualifiedLeadsCount);
  assert.equal(daily.bookedJobsCount, underlyingMetrics.bookedJobsCount);
  assert.equal(daily.actualBookedRevenue, underlyingMetrics.confirmedRevenue);
});

test('M5: Prose summary reports 0 missed calls when 0 calls occur (no "1 missed calls" fallback)', async () => {
  const quietReference = new Date('2021-01-10T12:00:00.000Z');
  const weekly = generateWeeklyReport(TENANT_A, quietReference);

  assert.equal(weekly.missedCallsCount, 0, 'Weekly report missed calls must be 0');
  assert.ok(
    weekly.summaryText.includes('received 0 missed calls'),
    `Summary prose must honestly say "received 0 missed calls", got:\n${weekly.summaryText}`
  );
  assert.ok(
    !weekly.summaryText.includes('received 1 missed calls'),
    'Summary prose must not fall back to "1 missed calls"'
  );
});

test('M6: Traceable average ticket constant basis across metrics payload', async () => {
  const metrics = computeMetrics(TENANT_A);

  assert.equal(
    metrics.averageTicketAssumption,
    DEFAULT_AVERAGE_TICKET,
    `averageTicketAssumption must equal DEFAULT_AVERAGE_TICKET (${DEFAULT_AVERAGE_TICKET})`
  );
  assert.equal(
    metrics.grossMarginAssumption,
    DEFAULT_GROSS_MARGIN,
    `grossMarginAssumption must equal DEFAULT_GROSS_MARGIN (${DEFAULT_GROSS_MARGIN})`
  );
});

test('M7: /api/reports route respects explicit date filters and returns honest numbers', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: true });
  const req = createMockRequest(
    'http://localhost:3001/api/reports?startDate=2021-01-01T00:00:00.000Z&endDate=2021-01-02T23:59:59.999Z',
    { token: tokenA }
  );

  const res = await reportsGet(req);
  assert.equal(res.status, 200, '/api/reports should return 200 for authenticated caller');

  const data = await res.json();
  assert.equal(data.metrics.missedCallsCount, 0, 'Report endpoint must return 0 calls for empty window');
  assert.ok(
    data.metrics.periodLabel.includes('Jan 1, 2021') && data.metrics.periodLabel.includes('Jan 2, 2021'),
    `Report endpoint periodLabel must reflect explicit query date range, got: ${data.metrics.periodLabel}`
  );
});
