(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';

import { db } from '@/db/repository';
import { createFixtureTracker, TestFixtureTracker, assertAccountCount } from '@/lib/test-hygiene';
import { POST as onboardingHandler } from '@/app/api/onboarding/route';
import { evaluateLaunchGates } from '@/lib/launch-gate';

const tracker = createFixtureTracker();

function createMockRequest(url: string, options: { method?: string; body?: any; headers?: Record<string, string> } = {}) {
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

test('T1: Exact ID Deletion — db.deleteAccount Deletes Specific Target Only', () => {
  const initialAccounts = db.getAllAccounts().map((a) => a.id);
  const initialCount = initialAccounts.length;

  // Create isolated fixture account
  const { account } = db.createAccount(
    'Temp Hygiene Plumbing',
    'plumbing',
    '+12175559090',
    'Hygiene Owner',
    'Verizon Wireless'
  );

  assert.equal(db.getAccountCount(), initialCount + 1, 'Account count must increment by 1');
  assert.ok(db.getAccount(account.id), 'Created account must exist in db');

  // Delete exactly by ID
  const deleted = db.deleteAccount(account.id);
  assert.equal(deleted, true, 'db.deleteAccount must return true on successful deletion');
  assert.equal(db.getAccount(account.id), undefined, 'Deleted account must no longer exist in db');
  assert.equal(db.getAccountCount(), initialCount, 'Account count must return to exact initial count');

  // Verify baseline seed accounts untouched
  for (const seedId of initialAccounts) {
    assert.ok(db.getAccount(seedId), `Seed account ${seedId} must remain intact`);
  }
});

test('T2: Rejection of Pattern / Broad Matchers — db.deleteAccount Rejects Wildcards and Empty IDs', () => {
  // Reject wildcard pattern %
  assert.throws(
    () => {
      db.deleteAccount('acc-%');
    },
    /pattern or wildcard/,
    'db.deleteAccount must strictly reject SQL LIKE wildcard %'
  );

  // Reject wildcard pattern *
  assert.throws(
    () => {
      db.deleteAccount('acc-*');
    },
    /pattern or wildcard/,
    'db.deleteAccount must strictly reject glob wildcard *'
  );

  // Reject empty string
  assert.throws(
    () => {
      db.deleteAccount('');
    },
    /non-empty string/,
    'db.deleteAccount must reject empty string'
  );

  // Reject whitespace
  assert.throws(
    () => {
      db.deleteAccount('   ');
    },
    /pattern or wildcard/,
    'db.deleteAccount must reject whitespace-only string'
  );
});

test('T3: Fixture Tracker Helper — Tracks Created IDs and Cascades Deletion', () => {
  const localTracker = new TestFixtureTracker();
  const initialCount = db.getAccountCount();

  const created = localTracker.createAccount(
    'Cascade Test Rooter',
    'plumbing',
    '+12175558181',
    'Cascade Owner'
  );

  assert.equal(localTracker.getTrackedAccountIds().length, 1);
  assert.equal(localTracker.getTrackedAccountIds()[0], created.account.id);
  assert.equal(db.getAccountCount(), initialCount + 1);

  // Verify child entities exist before cleanup
  const profile = db.getBusinessProfile(created.account.id);
  assert.ok(profile, 'Business profile must exist');
  const numbers = db.getPhoneNumbers(created.account.id);
  assert.ok(numbers.length >= 1, 'Phone number must exist');

  // Execute tracker cleanup
  const cleaned = localTracker.cleanup();
  assert.equal(cleaned, 1, 'Tracker must report 1 account cleaned');
  assert.equal(localTracker.getTrackedAccountIds().length, 0, 'Tracker must empty its tracked list');

  // Verify account and all child entities were cascaded
  assert.equal(db.getAccount(created.account.id), undefined);
  assert.equal(db.getBusinessProfile(created.account.id), undefined);
  assert.equal(db.getPhoneNumbers(created.account.id).length, 0);
  assert.equal(db.getAccountCount(), initialCount);
});

test('T4: Signup Route Fixture Capture — Captures Response ID and Cleans Up Pristine DB', async () => {
  const localTracker = new TestFixtureTracker();
  const initialCount = db.getAccountCount();
  const uniqueNum = Math.floor(1000 + Math.random() * 9000);
  const email = `hygiene_signup_${uniqueNum}@example.com`;

  const req = createMockRequest('http://localhost:3001/api/onboarding', {
    method: 'POST',
    body: {
      email,
      password: 'StrongHygiene2026!',
      businessName: `Hygiene Plumbing ${uniqueNum}`,
      trade: 'plumbing',
      phone: `+1217555${uniqueNum}`,
    },
  });

  const res = await onboardingHandler(req);
  assert.equal(res.status, 200, 'Signup route must return 200');
  const body = await res.json();

  // Capture response ID with tracker
  const capturedId = localTracker.recordSignupResponse(body);
  assert.ok(capturedId.startsWith('acc-'));
  assert.equal(capturedId, body.account.id);
  assert.equal(db.getAccountCount(), initialCount + 1);

  // Verify credentials exist
  const cred = db.findCredentialByEmail(email);
  assert.ok(cred);
  assert.equal(cred.account_id, capturedId);

  // Execute cleanup
  const cleaned = localTracker.cleanup();
  assert.equal(cleaned, 1);

  // Assert credentials and account deleted
  assert.equal(db.findCredentialByEmail(email), undefined);
  assert.equal(db.getAccount(capturedId), undefined);
  assert.equal(db.getAccountCount(), initialCount);
});

test('T5: Database State Invariance — Database Leaves Account Count Identical', () => {
  // Snapshot count
  const countBefore = db.getAccountCount();
  assert.ok(countBefore >= 2, 'Must have at least 2 seed accounts');

  // Create two fixtures via suite tracker
  const fix1 = tracker.createAccount('Fixture One', 'plumbing', '+12175551010');
  const fix2 = tracker.createAccount('Fixture Two', 'hvac', '+12175552020');

  assert.equal(db.getAccountCount(), countBefore + 2);

  // Cleanup suite tracker
  const cleaned = tracker.cleanup();
  assert.equal(cleaned, 2);

  const countAfter = db.getAccountCount();
  assert.equal(countAfter, countBefore, 'Count after cleanup must strictly equal count before');
});

test('T6: Concurrency Policy — package.json Enforces --test-concurrency=1', () => {
  const pkgPath = path.join(process.cwd(), 'package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const testScript = pkg.scripts?.test || '';

  assert.ok(
    testScript.includes('--test-concurrency=1'),
    'package.json test script MUST include --test-concurrency=1 to prevent race conditions on shared database'
  );
});

test('T7: Deliverable Documentation — TEST_HYGIENE.md Exists and Explains All Five Rules', () => {
  const docPath = path.join(process.cwd(), 'TEST_HYGIENE.md');
  assert.ok(fs.existsSync(docPath), 'TEST_HYGIENE.md must exist in repository root');
  const docContent = fs.readFileSync(docPath, 'utf-8');

  assert.ok(docContent.includes('Exact ID Deletion'), 'Doc must explain Rule 1: Exact ID Deletion');
  assert.ok(docContent.includes('Never Use Patterns'), 'Doc must explain Rule 2: Never Use Patterns');
  assert.ok(docContent.includes('Record Fixture IDs'), 'Doc must explain Rule 3: Record Fixture IDs');
  assert.ok(docContent.includes('Invariance in CI'), 'Doc must explain Rule 4: Verify Account Count Invariance in CI');
  assert.ok(docContent.includes('Concurrency = 1'), 'Doc must explain Rule 5: Concurrency = 1');
});

test('T8: Multi-Table Invariance — All Six Tables Tracked and Invariant Across Fixtures', () => {
  const localTracker = new TestFixtureTracker();
  const countsBefore = db.getTableCounts();

  // 1. Create a fixture tenant with child records across tables
  const created = localTracker.createAccount('Multi-Table Tenant', 'plumbing', '+12175557766');
  const accId = created.account.id;

  // Add credentials
  db.createUserCredential({
    user_id: `user-${Date.now().toString(36)}`,
    account_id: accId,
    email: `multitable_${Date.now()}@example.com`,
    password_hash: 'scrypt$16384$8$1$fakehash',
    algorithm: 'scrypt',
  });

  // Add a call record
  db.recordCall({
    accountId: accId,
    fromNumber: '+12175550011',
    toNumber: '+12175557766',
    callStatus: 'no-answer',
    twilioCallSid: `CA_TEST_${Date.now()}`,
  });

  // Verify counts increased
  const countsDuring = db.getTableCounts();
  assert.equal(countsDuring.accounts, countsBefore.accounts + 1);
  assert.equal(countsDuring.credentials, countsBefore.credentials + 1);
  assert.equal(countsDuring.calls, countsBefore.calls + 1);

  // 2. Clean up via tracker (cascades to all child tables)
  const deleted = localTracker.cleanup();
  assert.equal(deleted, 1);

  // Verify all 6 tables returned to exact baseline counts
  const countsAfter = db.getTableCounts();
  assert.deepEqual(countsAfter, countsBefore, 'All six table counts must return to exact baseline counts');
});

test('T9: Gate Stability Invariance — evaluateLaunchGates() Preserves Identical Statuses', () => {
  const gatesBefore = evaluateLaunchGates().gates.map((g) => ({ id: g.id, status: g.status }));

  // Evaluate gates again
  const gatesAfter = evaluateLaunchGates().gates.map((g) => ({ id: g.id, status: g.status }));

  // Assert exact gate status invariance
  assert.deepEqual(
    gatesAfter,
    gatesBefore,
    'All launch gate evaluations must remain stable and identical'
  );
});

test('T10: Threat Model Demonstration — Leaked Registration Moves Carrier Gate (Negative Proof)', () => {
  const localTracker = new TestFixtureTracker();

  // Baseline gate evaluation
  const baseReport = evaluateLaunchGates();
  const carrierGateBefore = baseReport.gates.find((g) => g.id === 'a2p_10dlc_carrier_verified')!;
  assert.equal(carrierGateBefore.status, 'failed', 'In baseline state, carrier gate must be failed');

  // Simulate a test that creates a carrier-verified non-demo tenant
  const created = localTracker.createAccount('Threat Model Contractor', 'plumbing', '+12175559988');
  const accId = created.account.id;
  db.updateAccount(accId, { is_demo: false });

  const brandSid = 'BN0123456789abcdef0123456789abcdef';
  const campaignSid = 'CM0123456789abcdef0123456789abcdef';

  db.recordComplianceTransition(
    accId,
    'campaign_approved',
    'carrier_webhook',
    'tcr_carrier_webhook',
    'TCR campaign approved',
    {
      carrier_source: 'carrier_api',
      brand_sid: brandSid,
      campaign_sid: campaignSid,
    }
  );

  // Demonstrate that leaving this fixture in DB would GREEN the gate!
  const leakedReport = evaluateLaunchGates();
  const carrierGateLeaked = leakedReport.gates.find((g) => g.id === 'a2p_10dlc_carrier_verified')!;
  assert.equal(
    carrierGateLeaked.status,
    'passed',
    'Leaked carrier-verified registration improperly greens the launch gate!'
  );

  // Now perform exact cleanup
  localTracker.cleanup();

  // Gate must return to failed
  const restoredReport = evaluateLaunchGates();
  const carrierGateRestored = restoredReport.gates.find((g) => g.id === 'a2p_10dlc_carrier_verified')!;
  assert.equal(
    carrierGateRestored.status,
    'failed',
    'Exact fixture deletion restores launch gate to honest failed state'
  );
});

// Suite Teardown
test.after(() => {
  tracker.cleanup();
});
