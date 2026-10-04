(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  TRADE_TEMPLATES,
  getTradeTemplate,
  getAllTradeTemplates,
  isEmergencyKeyword,
  formatInitialTextBack,
} from '@/lib/trade-templates';
import { TradeKey } from '@/types';

test('TRADE-1: All Eight Home Service Trade Templates Registered', () => {
  const expectedTrades: TradeKey[] = [
    'plumbing',
    'hvac',
    'electrical',
    'garage_door',
    'locksmith',
    'roofing',
    'landscaping',
    'pest_control',
  ];

  const allTemplates = getAllTradeTemplates();
  assert.equal(allTemplates.length, 8, 'Must have exactly 8 specialized trade templates');

  for (const trade of expectedTrades) {
    const template = getTradeTemplate(trade);
    assert.ok(template, `Template must exist for ${trade}`);
    assert.equal(template.id, trade);
    assert.ok(template.display_name.length > 0);
    assert.ok(template.initial_text_back.includes('{{business_name}}'));
    assert.ok(template.emergency_keywords.length > 0);
    assert.ok(template.questions.length >= 3);
    assert.ok(template.canned_replies.length >= 2);
  }
});

test('TRADE-2: Cross-Trade Emergency Keyword Detection', () => {
  // Plumbing
  assert.equal(isEmergencyKeyword('plumbing', 'My basement is flooded with water'), true);
  assert.equal(isEmergencyKeyword('plumbing', 'I need a standard faucet quote'), false);

  // Electrical
  assert.equal(isEmergencyKeyword('electrical', 'Our outlet is sparking and smoking!'), true);
  assert.equal(isEmergencyKeyword('electrical', 'Need an extra ceiling light installed'), false);

  // Garage Door
  assert.equal(isEmergencyKeyword('garage_door', 'My garage door snapped spring and is stuck halfway'), true);

  // HVAC
  assert.equal(isEmergencyKeyword('hvac', 'Furnace is completely out and freezing inside'), true);
});

test('TRADE-3: Initial Automated Text-Back Business Name Interpolation', () => {
  const text = formatInitialTextBack('plumbing', 'Apex Rooter Pros');
  assert.ok(text.includes('Apex Rooter Pros'));
  assert.ok(!text.includes('{{business_name}}'));
  assert.ok(text.includes('Reply STOP to opt out'));
});
