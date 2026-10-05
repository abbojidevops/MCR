(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { db } from '@/db/repository';
import { evaluateLaunchGates, LaunchGateReport } from '@/lib/launch-gate';
import { createFixtureTracker } from '@/lib/test-hygiene';
import { hashPasswordSync } from '@/lib/auth/password';
import { isCarrierVerifiedRegistration } from '@/lib/compliance-machine';
import { POST as onboardingHandler } from '@/app/api/onboarding/route';
import { TwilioService } from '@/lib/telecom/twilio-service';

const tracker = createFixtureTracker();

function createMockRequest(
  url: string,
  options: { method?: string; body?: any; headers?: Record<string, string> } = {}
) {
  const reqHeaders = new Headers(options.headers || {});
  if (options.body) {
    reqHeaders.set('content-type', 'application/json');
  }
  return new NextRequest(new URL(url, 'http://localhost:3001'), {
    method: options.method || 'GET',
    headers: reqHeaders,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

test('G1: Live State Evidence Naming — Every Automated Gate Reads Live Records and Names Evidence', () => {
  const report = evaluateLaunchGates();

  assert.ok(report.totalAutomatedGates > 0, 'Must have automated gates evaluated');
  assert.ok(report.gates.length > 0, 'Must have gates returned');

  // Verify that every gate has a valid structure and does not rely on static file existence
  for (const gate of report.gates) {
    assert.ok(gate.id, 'Gate must have an id');
    assert.ok(gate.label, 'Gate must have a label');
    assert.ok(gate.description, 'Gate must have a description');

    if (!gate.isManual) {
      assert.ok(
        gate.status === 'passed' || gate.status === 'failed',
        `Automated gate ${gate.id} must have status passed or failed`
      );

      // If passed, must provide concrete evidence
      if (gate.status === 'passed') {
        assert.ok(gate.evidence, `Passed gate ${gate.id} must provide evidence`);
        assert.ok(gate.evidence.details, `Passed gate ${gate.id} must include evidence details`);
        assert.ok(gate.evidence.timestamp, `Passed gate ${gate.id} must include evidence timestamp`);
      }

      // If failed, must specify why and include failure details
      if (gate.status === 'failed') {
        assert.ok(gate.statusReason, `Failed gate ${gate.id} must have statusReason`);
        assert.ok(gate.evidence?.details, `Failed gate ${gate.id} must provide shortfall details`);
      }
    }
  }

  // Legal terms cannot be satisfied by file existence alone
  const legalGate = report.gates.find((g) => g.id === 'legal_consent_recorded');
  assert.ok(legalGate, 'legal_consent_recorded gate must exist');
  assert.equal(legalGate.isManual, false);
  // Without consent logs in DB, it must fail despite /privacy or /terms routes existing on disk
  if (db.getAllConsentLogs().length === 0) {
    assert.equal(legalGate.status, 'failed');
    assert.match(legalGate.statusReason, /persistence store|static page existence is insufficient/i);
  }
});

test('G2: Customer Authentication Assertion — Derived from Credential Store via Scrypt Hash', () => {
  const report = evaluateLaunchGates();
  const authGate = report.gates.find((g) => g.id === 'customer_authentication_live');

  assert.ok(authGate, 'customer_authentication_live gate must exist');
  assert.equal(authGate.isManual, false, 'Auth gate must be an automated gate');
  assert.equal(authGate.status, 'passed', 'Customer auth gate must pass using live credential store');

  // Verify that evidence names the tenant, credential ID, timestamp, and details
  assert.ok(authGate.evidence, 'Evidence must be present');
  assert.ok(authGate.evidence.tenantId, 'Evidence must name the tenant ID');
  assert.ok(authGate.evidence.recordId, 'Evidence must name the credential record ID');
  assert.ok(authGate.evidence.timestamp, 'Evidence must name the credential creation timestamp');
  assert.match(
    authGate.evidence.details,
    /authenticates against credential store/i,
    'Evidence details must confirm scrypt credential store authentication'
  );

  // Verify tenant account exists in live DB
  const account = db.getAccount(authGate.evidence.tenantId!);
  assert.ok(account, 'Tenant named in evidence must exist in live accounts table');
  assert.equal(account.id, authGate.evidence.tenantId);
});

test('G3: Manual Gates Handling — Marked isManual: true and Excluded from Pass Count', () => {
  const report = evaluateLaunchGates();

  const manualGates = report.gates.filter((g) => g.isManual);
  assert.ok(manualGates.length >= 4, 'Must have at least 4 designated manual gates');

  for (const mg of manualGates) {
    assert.equal(mg.isManual, true, `Gate ${mg.id} must have isManual: true`);
    assert.equal(mg.status, 'manual', `Gate ${mg.id} must have status: manual`);
    assert.match(mg.statusReason, /Manual verification required/i, 'Must state manual verification required');
  }

  // Denominator and pass count verification:
  // manualGates must NOT be counted in passedAutomatedGates or totalAutomatedGates
  assert.equal(report.manualGates, manualGates.length, 'manualGates count must match');
  assert.equal(
    report.totalGates,
    report.totalAutomatedGates + report.manualGates,
    'Total gates must equal automated + manual'
  );

  const automatedGates = report.gates.filter((g) => !g.isManual);
  const actualPassedAutomated = automatedGates.filter((g) => g.status === 'passed').length;

  assert.equal(
    report.passedAutomatedGates,
    actualPassedAutomated,
    'passedAutomatedGates must strictly equal passed count of automated gates'
  );
  assert.equal(
    report.totalAutomatedGates,
    automatedGates.length,
    'totalAutomatedGates must strictly equal length of automated gates'
  );

  // Nothing defaults to passed: launch ready is false if any automated gate is not passed
  if (report.passedAutomatedGates < report.totalAutomatedGates) {
    assert.equal(report.isLaunchReady, false, 'isLaunchReady must be false when any automated gate is blocked');
  }
});

test('G4: Dynamic Dual-Sided Stability Under Legitimate Database Changes', () => {
  // --- Side 1: TCPA Consent Logs Dynamic Transition ---
  // A: Initial state: Ensure no consent logs exist
  const initialLogs = db.getAllConsentLogs();
  for (const log of initialLogs) {
    db.deleteConsentLog(log.id);
  }

  let repA = evaluateLaunchGates();
  let consentGate = repA.gates.find((g) => g.id === 'legal_consent_recorded')!;
  assert.equal(consentGate.status, 'failed', 'Without consent logs, gate must fail');
  assert.ok(consentGate.evidence?.details.includes('0 consent log records'), 'Shortfall details reported');

  // B: Legitimate insertion: Record a valid consent entry in DB
  const createdLog = db.recordConsentLog({
    account_id: 'acc-coolbreeze-hvac',
    phone_number: '+12175550199',
    consent_type: 'inbound_call_opt_in',
    consent_status: 'granted',
    source: 'voice_call_intake',
    audit_notes: 'Caller gave explicit verbal consent to receive job dispatch updates',
  });

  let repB = evaluateLaunchGates();
  consentGate = repB.gates.find((g) => g.id === 'legal_consent_recorded')!;
  assert.equal(consentGate.status, 'passed', 'With valid consent log, gate must immediately pass');
  assert.equal(consentGate.evidence?.tenantId, 'acc-coolbreeze-hvac');
  assert.equal(consentGate.evidence?.recordId, createdLog.id);
  assert.equal(consentGate.evidence?.timestamp, createdLog.created_at);

  // C: Legitimate removal: Delete the consent log
  db.deleteConsentLog(createdLog.id);
  let repC = evaluateLaunchGates();
  consentGate = repC.gates.find((g) => g.id === 'legal_consent_recorded')!;
  assert.equal(consentGate.status, 'failed', 'After deleting consent log, gate must fail again');

  // --- Side 2: Three Paying Customers Dynamic Transition ---
  const initialSubs = db.getAllSubscriptions();
  const subGateBefore = evaluateLaunchGates().gates.find((g) => g.id === 'three_paying_customers')!;
  assert.equal(subGateBefore.status, 'failed', 'Initially fewer than 3 paying non-demo customers');

  // Add 3 non-demo paying subscriptions with real non-demo accounts
  const a1 = tracker.createAccount('Pilot 1', 'plumbing', '+12175550991');
  const a2 = tracker.createAccount('Pilot 2', 'hvac', '+12175550992');
  const a3 = tracker.createAccount('Pilot 3', 'electrical', '+12175550993');

  const sub1 = db.createSubscription({
    account_id: a1.account.id,
    plan_id: 'pro',
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 86400000 * 30).toISOString(),
    cancel_at_period_end: false,
  });
  const sub2 = db.createSubscription({
    account_id: a2.account.id,
    plan_id: 'pro',
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 86400000 * 30).toISOString(),
    cancel_at_period_end: false,
  });
  const sub3 = db.createSubscription({
    account_id: a3.account.id,
    plan_id: 'business',
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 86400000 * 30).toISOString(),
    cancel_at_period_end: false,
  });

  const repSubsPassed = evaluateLaunchGates();
  const subGateAfter = repSubsPassed.gates.find((g) => g.id === 'three_paying_customers')!;
  assert.equal(subGateAfter.status, 'passed', 'With 3 paying subscriptions, gate passes');
  assert.ok(subGateAfter.evidence?.tenantId?.includes(a1.account.id));
  assert.ok(subGateAfter.evidence?.recordId?.includes(sub1.id));

  // Clean up subscriptions
  db.deleteSubscription(sub1.id);
  db.deleteSubscription(sub2.id);
  db.deleteSubscription(sub3.id);

  const repSubsRestored = evaluateLaunchGates();
  const subGateRestored = repSubsRestored.gates.find((g) => g.id === 'three_paying_customers')!;
  assert.equal(subGateRestored.status, 'failed', 'After removing subscriptions, gate returns to failed');

  // Ensure initial state invariance
  for (const log of initialLogs) {
    db.recordConsentLog(log);
  }
  tracker.cleanup();
});

// ============================================================================
// TASK 17 — Carrier Gate Hardening & Flag-Based Verification Tests
// ============================================================================

test('T17-1: Committed Seed Data Starts Honest and Fails Carrier Gate ("seeded row cannot pass" test)', () => {
  const report = evaluateLaunchGates();
  const carrierGate = report.gates.find((g) => g.id === 'a2p_10dlc_carrier_verified')!;

  assert.ok(carrierGate, 'a2p_10dlc_carrier_verified gate must exist');
  assert.equal(carrierGate.status, 'failed', 'Clean repository clone must start RED for carrier gate');
  assert.match(
    carrierGate.evidence?.details || '',
    /No non-demo accounts have carrier-asserted.*approved status/i,
    'Evidence details must state shortfall in carrier verification'
  );

  // Directly verify every seeded compliance record in committed DB fails carrier predicate
  const compliances = db.getAllCompliance();
  for (const comp of compliances) {
    const acc = db.getAccount(comp.account_id);
    assert.equal(
      isCarrierVerifiedRegistration(comp, acc),
      false,
      `Seeded compliance ${comp.id} for account ${comp.account_id} must NOT satisfy carrier predicate`
    );
  }
});

test('T17-2: Gate Reads is_demo Flag, Not account_id Substring (No Demo Substring Bypass)', () => {
  // Account ID contains NO "demo" substring, but is_demo flag is true
  const created = tracker.createAccount('Flag Bypass Contractor', 'plumbing', '+12175550881');
  const accId = created.account.id;
  db.updateAccount(accId, { is_demo: true });

  // Add carrier-approved compliance record with 32-hex identifiers and carrier_api provenance
  db.recordComplianceTransition(
    accId,
    'campaign_approved',
    'carrier_webhook',
    'tcr_carrier_webhook',
    'Carrier approved campaign',
    {
      carrier_source: 'carrier_api',
      brand_sid: 'BN0123456789abcdef0123456789abcdef',
      campaign_sid: 'CM0123456789abcdef0123456789abcdef',
    }
  );

  // The gate must FAIL because account.is_demo is true (even though accountId has no 'demo' substring)
  const report = evaluateLaunchGates();
  const carrierGate = report.gates.find((g) => g.id === 'a2p_10dlc_carrier_verified')!;
  assert.equal(carrierGate.status, 'failed', 'Gate must reject demo account despite account_id not including demo substring');

  // Verify predicate directly returns false
  const comp = db.getCompliance(accId);
  const acc = db.getAccount(accId);
  assert.equal(isCarrierVerifiedRegistration(comp, acc), false);

  tracker.cleanup();
});

test('T17-3: Gate Rejects Seed-Shaped Records Lacking Carrier Provenance or 32-Hex Identifiers ("seed-shaped record cannot pass" test)', () => {
  const created = tracker.createAccount('Non-Demo Contractor', 'hvac', '+12175550882');
  const accId = created.account.id;
  db.updateAccount(accId, { is_demo: false });

  // Case A: carrier_source is 'demo' -> Gate must fail
  db.recordComplianceTransition(
    accId,
    'campaign_approved',
    'admin',
    'tcr_admin',
    'Manual approval',
    {
      carrier_source: 'demo',
      brand_sid: 'BN0123456789abcdef0123456789abcdef',
      campaign_sid: 'CM0123456789abcdef0123456789abcdef',
    }
  );
  let report = evaluateLaunchGates();
  let carrierGate = report.gates.find((g) => g.id === 'a2p_10dlc_carrier_verified')!;
  assert.equal(carrierGate.status, 'failed', 'Gate must reject carrier_source: demo');

  // Case B: provenance customer / admin without carrier provenance -> Gate must fail
  db.updateCompliance(accId, {
    carrier_source: null,
    last_updated_by: 'customer',
  });
  report = evaluateLaunchGates();
  carrierGate = report.gates.find((g) => g.id === 'a2p_10dlc_carrier_verified')!;
  assert.equal(carrierGate.status, 'failed', 'Gate must reject customer-written record');

  // Case C: Non-hex identifiers (e.g. clock-synthesized or non-32-hex) -> Gate must fail
  db.updateCompliance(accId, {
    carrier_source: 'carrier_api',
    brand_sid: 'BN_clock_synthesized_id',
    campaign_sid: 'CM_invalid_short',
  });
  report = evaluateLaunchGates();
  carrierGate = report.gates.find((g) => g.id === 'a2p_10dlc_carrier_verified')!;
  assert.equal(carrierGate.status, 'failed', 'Gate must reject invalid identifier shapes');

  tracker.cleanup();
});

test('T17-4: Carrier-Asserted Verification Passes and Evidence Traces All Fields', () => {
  const created = tracker.createAccount('Authentic Live Contractor', 'plumbing', '+12175550883');
  const accId = created.account.id;
  db.updateAccount(accId, { is_demo: false });

  const brandSid = 'BN0123456789abcdef0123456789abcdef';
  const campaignSid = 'CM0123456789abcdef0123456789abcdef';

  const trans = db.recordComplianceTransition(
    accId,
    'campaign_approved',
    'carrier_webhook',
    'tcr_carrier_webhook',
    'TCR campaign verified and approved',
    {
      carrier_source: 'carrier_api',
      brand_sid: brandSid,
      campaign_sid: campaignSid,
    }
  );

  const report = evaluateLaunchGates();
  const carrierGate = report.gates.find((g) => g.id === 'a2p_10dlc_carrier_verified')!;
  assert.equal(carrierGate.status, 'passed', 'Authentic carrier-verified non-demo account passes gate');

  // Acceptance Criterion 4: Evidence names the account, the record, the provenance source and timestamp
  assert.ok(carrierGate.evidence, 'Evidence must exist');
  assert.equal(carrierGate.evidence.tenantId, accId, 'Evidence must name tenantId');
  assert.equal(carrierGate.evidence.recordId, trans.id, 'Evidence must name recordId');
  assert.ok(carrierGate.evidence.timestamp, 'Evidence must name timestamp');
  assert.ok(carrierGate.evidence.details.includes('carrier_api'), 'Evidence must name provenance source');
  assert.ok(carrierGate.evidence.details.includes(brandSid), 'Evidence must name brand_sid');
  assert.ok(carrierGate.evidence.details.includes(campaignSid), 'Evidence must name campaign_sid');

  tracker.cleanup();
});

// ============================================================================
// TASK 24 — TCPA Consent Lifecycle & Gate 4 Invariance Tests
// ============================================================================

test('T24-1: Contractor Onboarding Records Explicit TCPA Consent with Client IP and Passes Gate 4', async () => {
  const uniqueNum = Math.floor(1000 + Math.random() * 9000);
  const email = `consent_contractor_${uniqueNum}@example.com`;
  const phone = `+1217555${uniqueNum}`;

  const req = createMockRequest('http://localhost:3001/api/onboarding', {
    method: 'POST',
    headers: {
      'x-forwarded-for': '203.0.113.195', // Untrusted spoof header ignored by secure client-ip resolver
    },
    body: {
      email,
      password: 'ConsentSecure2026!',
      businessName: `Consent Plumbing ${uniqueNum}`,
      trade: 'plumbing',
      phone,
    },
  });

  const res = await onboardingHandler(req);
  assert.equal(res.status, 200, 'Onboarding request must succeed with 200');
  const body = await res.json();
  const accountId = tracker.recordSignupResponse(body);

  // 1. Verify consent log exists in database
  const consentLogs = db.getAllConsentLogs().filter((c) => c.account_id === accountId);
  assert.equal(consentLogs.length, 1, 'Exactly one explicit consent log must be created on onboarding');

  const log = consentLogs[0];
  assert.equal(log.account_id, accountId);
  assert.equal(log.phone_number, phone);
  assert.equal(log.consent_type, 'explicit_consent');
  assert.equal(log.consent_status, 'granted');
  assert.equal(log.source, 'contractor_onboarding_portal');
  assert.ok(log.ip_address, 'Consent log must record client IP address');
  assert.equal(log.ip_address, '127.0.0.1', 'Normalized socket fallback IP must be recorded (spoofed header ignored)');
  assert.match(log.audit_notes || '', /explicitly accepted Terms of Service/i);

  // 2. Verify Gate 4 (legal_consent_recorded) passes with concrete evidence
  const report = evaluateLaunchGates();
  const consentGate = report.gates.find((g) => g.id === 'legal_consent_recorded')!;
  assert.equal(consentGate.status, 'passed', 'Gate 4 must pass with live consent record');
  assert.equal(consentGate.evidence?.tenantId, accountId);
  assert.equal(consentGate.evidence?.recordId, log.id);
  assert.equal(consentGate.evidence?.timestamp, log.created_at);
  assert.ok(consentGate.evidence?.details.includes(phone));
  assert.ok(consentGate.evidence?.details.includes('explicit_consent'));

  // 3. Teardown via tracker cascades deletion of account and consent log
  tracker.cleanup();

  const consentLogsAfter = db.getAllConsentLogs().filter((c) => c.account_id === accountId);
  assert.equal(consentLogsAfter.length, 0, 'Consent logs must cascade-delete with account');

  const reportAfter = evaluateLaunchGates();
  const consentGateAfter = reportAfter.gates.find((g) => g.id === 'legal_consent_recorded')!;
  assert.equal(consentGateAfter.status, 'failed', 'Gate 4 must return to failed after fixture cleanup');
});

test('T24-2: Inbound Voice Telephony Records Inbound Call Opt-In Consent and Cascades on Deletion', async () => {
  const created = tracker.createAccount('Voice Consent Rooter', 'plumbing', '+12175550912');
  const accId = created.account.id;
  const contractorNumber = created.phoneNumber.phone_number;
  const callerNumber = `+1217555${Math.floor(1000 + Math.random() * 9000)}`;
  const callSid = `CA_real_voice_${Date.now()}`;

  // Genuine non-simulated inbound call
  const callResult = await TwilioService.handleInboundCall({
    CallSid: callSid,
    From: callerNumber,
    To: contractorNumber,
    CallStatus: 'no-answer',
  });

  assert.ok(callResult.callRecordId);

  // Verify inbound_call_opt_in consent log recorded
  const consentLogs = db.getAllConsentLogs().filter((c) => c.account_id === accId);
  assert.equal(consentLogs.length, 1, 'Inbound call must record 1 inbound_call_opt_in consent log');

  const log = consentLogs[0];
  assert.equal(log.account_id, accId);
  assert.equal(log.phone_number, callerNumber);
  assert.equal(log.consent_type, 'inbound_call_opt_in');
  assert.equal(log.consent_status, 'granted');
  assert.equal(log.source, 'voice_call_intake');
  assert.match(log.audit_notes || '', /Caller initiated inbound call/i);

  // Teardown
  tracker.cleanup();

  const logsAfter = db.getAllConsentLogs().filter((c) => c.account_id === accId);
  assert.equal(logsAfter.length, 0, 'Consent logs must be deleted on account teardown');
});

test('T24-3: Inbound SMS Lifecycle Records Opt-Out on STOP and Resubscription Opt-In on START', async () => {
  const created = tracker.createAccount('SMS Consent HVAC', 'hvac', '+12175550913');
  const accId = created.account.id;
  const contractorNumber = created.phoneNumber.phone_number;
  const consumerNumber = `+1217555${Math.floor(1000 + Math.random() * 9000)}`;

  // 1. Consumer texts STOP -> opt_out revoked
  const stopRes = await TwilioService.handleInboundSms({
    MessageSid: `SM_stop_${Date.now()}`,
    From: consumerNumber,
    To: contractorNumber,
    Body: 'STOP',
  });
  assert.equal(stopRes.status, 'opt_out_processed');

  const stopLogs = db.getAllConsentLogs().filter((c) => c.account_id === accId && c.consent_type === 'opt_out');
  assert.equal(stopLogs.length, 1, 'STOP keyword must record opt_out consent log');
  assert.equal(stopLogs[0].consent_status, 'revoked');
  assert.equal(stopLogs[0].source, 'inbound_sms_stop');

  // Verify suppression list updated
  assert.equal(db.isNumberSuppressed(accId, consumerNumber), true);

  // 2. Consumer texts START -> explicit_consent granted
  const startRes = await TwilioService.handleInboundSms({
    MessageSid: `SM_start_${Date.now()}`,
    From: consumerNumber,
    To: contractorNumber,
    Body: 'START',
  });
  assert.equal(startRes.status, 'opt_in_processed');

  const startLogs = db.getAllConsentLogs().filter((c) => c.account_id === accId && c.consent_type === 'explicit_consent');
  assert.equal(startLogs.length, 1, 'START keyword must record explicit_consent log');
  assert.equal(startLogs[0].consent_status, 'granted');
  assert.equal(startLogs[0].source, 'inbound_sms_start');

  // Verify suppression list removed
  assert.equal(db.isNumberSuppressed(accId, consumerNumber), false);

  // Teardown
  tracker.cleanup();
  const allLogs = db.getAllConsentLogs().filter((c) => c.account_id === accId);
  assert.equal(allLogs.length, 0, 'All consent logs must be removed on cleanup');
});

// Suite Teardown: ensure all fixture accounts are strictly deleted
test.after(() => {
  tracker.cleanup();
});

