(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';

// Domain modules
import { db } from '@/db/repository';
import { SimulationEngine } from '@/lib/simulator';
import {
  computeMetrics,
  effectiveCallsForAccount,
  effectiveJobsForAccount,
  effectiveConversationsForAccount,
  getSimulatedExclusions,
} from '@/lib/metrics';
import { generateDailySummary, generateWeeklyReport } from '@/lib/reports';

const TEST_ACCOUNT = 'acc-apex-plumbing';

test('P1: Call Recording Provenance — SID prefix CA_SIM_ derived unconditionally', () => {
  // 1. Inbound call with CA_SIM_ prefix
  const simSid = `CA_SIM_test_${Date.now()}`;
  const { callRecord: simCall } = db.recordCall({
    accountId: TEST_ACCOUNT,
    twilioCallSid: simSid,
    fromNumber: '+12175550101',
    toNumber: '+12175550190',
    callStatus: 'no-answer',
  });

  assert.equal(simCall.is_simulated, true, 'Calls with CA_SIM_ prefix must derive is_simulated: true');

  // 2. Inbound call with real carrier SID (non-simulated)
  const realSid = `CA_REAL_${Date.now()}`;
  const { callRecord: realCall } = db.recordCall({
    accountId: TEST_ACCOUNT,
    twilioCallSid: realSid,
    fromNumber: '+12175550102',
    toNumber: '+12175550190',
    callStatus: 'no-answer',
  });

  assert.equal(realCall.is_simulated, false, 'Calls without CA_SIM_ prefix must be is_simulated: false');
});

test('P2: Downstream Provenance Inheritance — Conversations, Intake Sessions, and Jobs inherit is_simulated', () => {
  const simSid = `CA_SIM_inherit_${Date.now()}`;
  const testNumber = `+1217555${Math.floor(1000 + Math.random() * 9000)}`;

  // 1. Record simulated call
  const { callRecord } = db.recordCall({
    accountId: TEST_ACCOUNT,
    twilioCallSid: simSid,
    fromNumber: testNumber,
    toNumber: '+12175550190',
    callStatus: 'no-answer',
  });
  assert.equal(callRecord.is_simulated, true);

  // 2. Resolve Contact and Conversation
  const contact = db.getOrCreateContact(TEST_ACCOUNT, testNumber, 'Test Simulator Caller');
  const conv = db.getOrCreateConversation(TEST_ACCOUNT, contact.id, callRecord.is_simulated);
  assert.equal(conv.is_simulated, true, 'Conversation must inherit is_simulated from originating call');

  // 3. Resolve Intake Session
  const intake = db.getOrCreateIntakeSession(TEST_ACCOUNT, conv.id, 'plumbing');
  assert.equal(intake.is_simulated, true, 'Intake session must inherit is_simulated from conversation');

  // 4. Create Job Card linked to intake session and conversation
  const job = db.createJob({
    account_id: TEST_ACCOUNT,
    contact_id: contact.id,
    intake_session_id: intake.id,
    conversation_id: conv.id,
    call_record_id: callRecord.id,
    title: 'Plumbing - Leaking Pipe (Simulated)',
    trade: 'plumbing',
    problem: 'Simulated leak under sink',
    is_emergency: false,
    status: 'NEW',
    estimated_value: 450,
    photo_urls: [],
  });

  // CRITICAL JOB INHERITANCE ASSERTION (tested by mutation check)
  assert.equal(job.is_simulated, true, 'Job card must inherit is_simulated from originating call/intake/conv');
});

test('P3: Full Metrics Payload Equality — Entire metrics payload is identical before and after simulation', async () => {
  const fixedEnd = new Date().toISOString();

  // Capture initial metrics payload
  const metricsBefore = computeMetrics(TEST_ACCOUNT, { preset: 'all', endDate: fixedEnd });

  // Execute an entire simulation sequence (missed call + qualification reply)
  const simCaller = `+1217555${Math.floor(1000 + Math.random() * 9000)}`;
  const simCallResult = await SimulationEngine.simulateMissedCall(TEST_ACCOUNT, simCaller, 'Metrics Isolation Tester');
  assert.ok(simCallResult.callRecordId);

  await SimulationEngine.simulateCustomerReply(TEST_ACCOUNT, simCaller, 'Yes, emergency pipe break');
  await SimulationEngine.simulateCustomerReply(TEST_ACCOUNT, simCaller, 'Water is flowing in the basement');
  await SimulationEngine.simulateCustomerReply(TEST_ACCOUNT, simCaller, '456 Oak Street');
  const finalReply = await SimulationEngine.simulateCustomerReply(TEST_ACCOUNT, simCaller, 'none');
  assert.equal(finalReply.stepUpdated, 'QUALIFIED');

  // Capture metrics payload after simulation with same range
  const metricsAfter = computeMetrics(TEST_ACCOUNT, { preset: 'all', endDate: fixedEnd });

  // Acceptance Criterion 4: entire metrics payload MUST be identical field-by-field
  assert.deepEqual(
    metricsAfter,
    metricsBefore,
    'The entire metrics payload must remain 100% identical before and after simulation run'
  );
});

test('P4: Individual Reader Verification — Every customer-facing KPI and list excludes simulated records', () => {
  const effectiveCalls = effectiveCallsForAccount(TEST_ACCOUNT);
  const effectiveJobs = effectiveJobsForAccount(TEST_ACCOUNT);
  const effectiveConvs = effectiveConversationsForAccount(TEST_ACCOUNT);

  // Assert none of the effective items are simulated
  for (const call of effectiveCalls) {
    assert.notEqual(call.is_simulated, true, `Call ${call.id} in effectiveCalls must not be simulated`);
  }
  for (const job of effectiveJobs) {
    assert.notEqual(job.is_simulated, true, `Job ${job.id} in effectiveJobs must not be simulated`);
  }
  for (const conv of effectiveConvs) {
    assert.notEqual(conv.is_simulated, true, `Conversation ${conv.id} in effectiveConvs must not be simulated`);
  }

  const metrics = computeMetrics(TEST_ACCOUNT);

  // Assert counts match strictly effective non-simulated sets
  assert.equal(metrics.missedCallsCount, effectiveCalls.length);
  assert.equal(metrics.potentialMissedCallValue, effectiveCalls.length * 650);
  assert.equal(metrics.qualifiedLeadsCount, effectiveJobs.length);

  // Assert needs-attention and recovered lists contain zero simulated jobs
  for (const item of metrics.needsAttention) {
    const rawJob = db.getJob(TEST_ACCOUNT, item.jobId);
    assert.notEqual(rawJob?.is_simulated, true, `Needs Attention item ${item.id} must not be simulated`);
  }
  for (const item of metrics.recoveredJobsList) {
    const rawJob = db.getJob(TEST_ACCOUNT, item.id);
    assert.notEqual(rawJob?.is_simulated, true, `Recovered Jobs item ${item.id} must not be simulated`);
  }
});

test('P5: Summary Prose Invariance — Daily and weekly report prose remain unchanged after simulated calls', async () => {
  // Capture initial prose reports
  const dailyBefore = generateDailySummary(TEST_ACCOUNT);
  const weeklyBefore = generateWeeklyReport(TEST_ACCOUNT);

  // Run simulated call
  const simCaller = `+1217555${Math.floor(1000 + Math.random() * 9000)}`;
  await SimulationEngine.simulateMissedCall(TEST_ACCOUNT, simCaller, 'Prose Invariance Tester');

  // Capture post-simulation prose reports
  const dailyAfter = generateDailySummary(TEST_ACCOUNT);
  const weeklyAfter = generateWeeklyReport(TEST_ACCOUNT);

  // Acceptance Criterion 3: Summary prose must not change missed call counts
  assert.equal(dailyAfter.missedCallsCount, dailyBefore.missedCallsCount);
  assert.equal(dailyAfter.summaryText, dailyBefore.summaryText, 'Daily summary prose must remain unchanged');

  assert.equal(weeklyAfter.missedCallsCount, weeklyBefore.missedCallsCount);
  assert.equal(weeklyAfter.summaryText, weeklyBefore.summaryText, 'Weekly report prose must remain unchanged');
});

test('P6: Non-Deletion & Dashboard Disclosure — Rows persist and exclusions are disclosed', () => {
  const allCalls = db.getCallRecords(TEST_ACCOUNT);
  const simCalls = allCalls.filter((c) => c.is_simulated);

  // Acceptance Criterion 5: Simulated rows STAY in the database (never wiped)
  assert.ok(simCalls.length > 0, 'Simulated calls must remain persisted in repository');

  // Acceptance Criterion 6: Exclusion disclosure
  const exclusions = getSimulatedExclusions(TEST_ACCOUNT);
  assert.equal(exclusions.callsCount, simCalls.length);
  assert.ok(exclusions.disclosure, 'Disclosure text must be provided when simulated records exist');
  assert.match(exclusions.disclosure!, /simulated call/i);
  assert.match(exclusions.disclosure!, /excluded from these numbers/i);
});
