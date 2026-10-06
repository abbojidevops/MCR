(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { getCarrierGuide, CARRIER_GUIDES } from '@/lib/carrier-guides';
import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';

// Route handlers
import { GET as settingsGet, PATCH as settingsPatch } from '@/app/api/settings/route';
import { GET as setupStatusGet } from '@/app/api/setup-status/route';

const TENANT_A = 'acc-apex-plumbing';

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

test('CARRIER-1: Verizon Wireless CCF Dial String Formatting', () => {
  const guide = getCarrierGuide('verizon', '+1 (217) 555-0190');
  assert.ok(guide, 'Verizon guide must exist');
  assert.equal(guide.forward_no_answer_code, '*712175550190');
  assert.equal(guide.cancel_forward_code, '*73');
  assert.ok(guide.supports_conditional_forwarding);
  assert.ok(guide.instructions.some((inst) => inst.includes('*712175550190')));
});

test('CARRIER-2: AT&T Wireless GSM Dial Code Termination', () => {
  const guide = getCarrierGuide('att', '+12175550190');
  assert.ok(guide, 'AT&T guide must exist');
  assert.equal(guide.forward_no_answer_code, '*61*2175550190#');
  assert.equal(guide.forward_busy_code, '*67*2175550190#');
  assert.match(guide.cancel_forward_code, /#61#/);
});

test('CARRIER-3: T-Mobile GSM Delay Timer & Country Code Insertion', () => {
  const guide = getCarrierGuide('tmobile', '217-555-0190');
  assert.ok(guide, 'T-Mobile guide must exist');
  assert.equal(guide.forward_no_answer_code, '**61*12175550190*11*20#');
  assert.equal(guide.cancel_forward_code, '##004#');
  assert.ok(guide.instructions.some((inst) => inst.includes('20 seconds')));
});

test('CARRIER-4: VoIP / Office PBX Web Configuration Instructions', () => {
  const guide = getCarrierGuide('voip_landline', '+12175550190');
  assert.ok(guide, 'VoIP guide must exist');
  assert.equal(guide.forward_no_answer_code, 'Web Portal Setting');
  assert.ok(guide.notes.includes('caller ID'));
  assert.ok(guide.instructions.some((inst) => inst.includes('2175550190')));
});

test('CARRIER-5: Comprehensive Carrier Matrix Coverage', () => {
  const supportedCarriers = ['verizon', 'att', 'tmobile', 'xfinity', 'mint', 'cricket', 'voip_landline'];
  for (const cid of supportedCarriers) {
    const guide = getCarrierGuide(cid, '2175550190');
    assert.ok(guide, `Guide must exist for carrier: ${cid}`);
    assert.ok(guide.forward_no_answer_code.length > 0);
    assert.ok(guide.cancel_forward_code.length > 0);
    assert.ok(guide.instructions.length > 0);
  }
});

test('CARRIER-6: MVNO Virtual Carrier Dial String & Network Mapping', () => {
  // Spectrum and Xfinity on Verizon network
  const xfinityGuide = getCarrierGuide('xfinity', '2175550190');
  assert.ok(xfinityGuide);
  assert.equal(xfinityGuide.forward_no_answer_code, '*712175550190');
  assert.equal(xfinityGuide.cancel_forward_code, '*73');

  const spectrumGuide = getCarrierGuide('spectrum', '2175550190');
  assert.ok(spectrumGuide);
  assert.equal(spectrumGuide.forward_no_answer_code, '*712175550190');
  assert.equal(spectrumGuide.cancel_forward_code, '*73');

  // Cricket on AT&T network
  const cricketGuide = getCarrierGuide('cricket', '2175550190');
  assert.ok(cricketGuide);
  assert.equal(cricketGuide.forward_no_answer_code, '*004*2175550190#');
  assert.equal(cricketGuide.cancel_forward_code, '##004#');

  // Mint on T-Mobile network
  const mintGuide = getCarrierGuide('mint', '2175550190');
  assert.ok(mintGuide);
  assert.equal(mintGuide.forward_no_answer_code, '**004*12175550190#');
  assert.equal(mintGuide.cancel_forward_code, '##004#');
});

test('CARRIER-7: Contractor Updates Forwarding Status via PATCH /api/settings', async () => {
  const token = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile);

  const originalForwardingConfigured = profile.forwarding_configured;

  try {
    // 1. Mark as Active (forwarding_configured: true)
    const patchReq = createMockRequest('http://localhost:3001/api/settings', {
      method: 'PATCH',
      token,
      body: {
        updates: {
          forwarding_configured: true,
        },
      },
    });

    const patchRes = await settingsPatch(patchReq);
    assert.equal(patchRes.status, 200, 'PATCH /api/settings must return 200 OK');
    const patchData = await patchRes.json();
    assert.equal(patchData.success, true);
    assert.equal(patchData.profile.forwarding_configured, true);

    // 2. Verify GET /api/settings returns updated profile
    const getReq = createMockRequest('http://localhost:3001/api/settings', { token });
    const getRes = await settingsGet(getReq);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.profile.forwarding_configured, true);

    // 3. Mark as Inactive (forwarding_configured: false)
    const resetReq = createMockRequest('http://localhost:3001/api/settings', {
      method: 'PATCH',
      token,
      body: {
        updates: {
          forwarding_configured: false,
        },
      },
    });

    const resetRes = await settingsPatch(resetReq);
    assert.equal(resetRes.status, 200);
    const resetData = await resetRes.json();
    assert.equal(resetData.profile.forwarding_configured, false);
  } finally {
    // Exact restoration of tenant profile
    db.updateBusinessProfile(TENANT_A, {
      forwarding_configured: originalForwardingConfigured,
    });
  }
});

test('CARRIER-8: Setup-Status Route Synchronizes with Forwarding Verification', async () => {
  const token = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile);

  const originalForwardingConfigured = profile.forwarding_configured;

  try {
    // Set to true
    db.updateBusinessProfile(TENANT_A, { forwarding_configured: true });
    const req1 = createMockRequest('http://localhost:3001/api/setup-status', { token });
    const res1 = await setupStatusGet(req1);
    assert.equal(res1.status, 200);
    const data1 = await res1.json();
    assert.equal(data1.forwardingConfigured, true, 'setup-status must reflect verified forwarding');

    // Set to false
    db.updateBusinessProfile(TENANT_A, { forwarding_configured: false });
    const req2 = createMockRequest('http://localhost:3001/api/setup-status', { token });
    const res2 = await setupStatusGet(req2);
    assert.equal(res2.status, 200);
    const data2 = await res2.json();
    assert.equal(data2.forwardingConfigured, false, 'setup-status must reflect unverified forwarding');
  } finally {
    db.updateBusinessProfile(TENANT_A, {
      forwarding_configured: originalForwardingConfigured,
    });
  }
});

test('CARRIER-9: Database State Hygiene Preservation Across Carrier Forwarding Updates', () => {
  const countsBefore = db.getTableCounts();
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile);

  const originalStatus = profile.forwarding_configured;

  try {
    db.updateBusinessProfile(TENANT_A, { forwarding_configured: !originalStatus });
    const countsDuring = db.getTableCounts();
    assert.deepEqual(countsDuring, countsBefore, 'Row counts in all 7 tables must remain strictly identical');
  } finally {
    db.updateBusinessProfile(TENANT_A, { forwarding_configured: originalStatus });
  }

  const countsAfter = db.getTableCounts();
  assert.deepEqual(countsAfter, countsBefore, 'Database state must be 100% invariant after test completion');
});
