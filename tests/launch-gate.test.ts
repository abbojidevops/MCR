(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '@/db/repository';
import { evaluateLaunchGates, LaunchGateReport } from '@/lib/launch-gate';
import { createFixtureTracker } from '@/lib/test-hygiene';
import { hashPasswordSync } from '@/lib/auth/password';

const tracker = createFixtureTracker();

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

  // Add 3 non-demo paying subscriptions
  const sub1 = db.createSubscription({
    account_id: 'acc-pilot-1',
    plan_id: 'pro',
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 86400000 * 30).toISOString(),
    cancel_at_period_end: false,
  });
  const sub2 = db.createSubscription({
    account_id: 'acc-pilot-2',
    plan_id: 'pro',
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 86400000 * 30).toISOString(),
    cancel_at_period_end: false,
  });
  const sub3 = db.createSubscription({
    account_id: 'acc-pilot-3',
    plan_id: 'business',
    status: 'active',
    current_period_start: new Date().toISOString(),
    current_period_end: new Date(Date.now() + 86400000 * 30).toISOString(),
    cancel_at_period_end: false,
  });

  const repSubsPassed = evaluateLaunchGates();
  const subGateAfter = repSubsPassed.gates.find((g) => g.id === 'three_paying_customers')!;
  assert.equal(subGateAfter.status, 'passed', 'With 3 paying subscriptions, gate passes');
  assert.ok(subGateAfter.evidence?.tenantId?.includes('acc-pilot-1'));
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
