(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { getCarrierGuide, CARRIER_GUIDES } from '@/lib/carrier-guides';

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
