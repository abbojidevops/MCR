(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Domain and Auth modules
import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { TwilioService } from '@/lib/telecom/twilio-service';
import { getDispatchedAlerts, clearDispatchedAlerts } from '@/lib/alert-dispatcher';

// Route handlers
import { GET as settingsGet, PATCH as settingsPatch } from '@/app/api/settings/route';

const TENANT_A = 'acc-apex-plumbing';
const TEST_PHONE = '+12175558833';

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

test('CUSTOM-1: Contractor Saves Custom Emergency Keywords & Intake Question via PATCH /api/settings', async () => {
  const token = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile);

  const originalKeywords = profile.custom_emergency_keywords;
  const originalQuestion = profile.custom_intake_question;

  try {
    const patchReq = createMockRequest('http://localhost:3001/api/settings', {
      method: 'PATCH',
      token,
      body: {
        updates: {
          custom_intake_question: 'What plumbing fixture or pipe is broken today?',
          custom_emergency_keywords: ['slab leak', 'sump pump', 'water heater explosion'],
        },
      },
    });

    const patchRes = await settingsPatch(patchReq);
    assert.equal(patchRes.status, 200, 'Settings PATCH must return 200 OK');
    const patchData = await patchRes.json();
    assert.equal(patchData.success, true);
    assert.equal(patchData.profile.custom_intake_question, 'What plumbing fixture or pipe is broken today?');
    assert.deepEqual(patchData.profile.custom_emergency_keywords, [
      'slab leak',
      'sump pump',
      'water heater explosion',
    ]);

    // Verify GET /api/settings returns persisted values
    const getReq = createMockRequest('http://localhost:3001/api/settings', {
      token,
    });
    const getRes = await settingsGet(getReq);
    assert.equal(getRes.status, 200);
    const getData = await getRes.json();
    assert.equal(getData.profile.custom_intake_question, 'What plumbing fixture or pipe is broken today?');
    assert.deepEqual(getData.profile.custom_emergency_keywords, [
      'slab leak',
      'sump pump',
      'water heater explosion',
    ]);
  } finally {
    // Restore profile
    db.updateBusinessProfile(TENANT_A, {
      custom_emergency_keywords: originalKeywords,
      custom_intake_question: originalQuestion,
    });
  }
});

test('CUSTOM-2: Customer SMS with Custom Emergency Keyword Triggers Emergency Triage & Alert', async () => {
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile);

  const originalKeywords = profile.custom_emergency_keywords;

  // Add custom keyword "tankless coil rupture"
  db.updateBusinessProfile(TENANT_A, {
    custom_emergency_keywords: ['tankless coil rupture', 'slab leak'],
  });

  const contact = db.getOrCreateContact(TENANT_A, TEST_PHONE);
  const conversation = db.getOrCreateConversation(TENANT_A, contact.id);
  const intake = db.getOrCreateIntakeSession(TENANT_A, conversation.id, 'plumbing');
  intake.is_emergency = false;

  const initialAlerts = getDispatchedAlerts().length;

  let createdMessageSids: string[] = [];
  try {
    const inboundRes = await TwilioService.handleInboundSms({
      MessageSid: `SM_CUSTOM_TEST_${Date.now()}`,
      From: TEST_PHONE,
      To: '+12175550190',
      Body: 'Help! We had a tankless coil rupture and water is spraying everywhere!',
    });

    // Verify emergency detected
    const updatedIntake = db.getOrCreateIntakeSession(TENANT_A, conversation.id, 'plumbing');
    assert.equal(updatedIntake.is_emergency, true, 'Custom keyword must flag intake as emergency');

    // Verify critical alert dispatched
    const currentAlerts = getDispatchedAlerts();
    assert.ok(currentAlerts.length > initialAlerts, 'Must dispatch emergency alert');
    const latestAlert = currentAlerts[currentAlerts.length - 1];
    assert.equal(latestAlert.level, 'critical');
    assert.equal(latestAlert.source, 'sms_emergency_keyword_triage');
    assert.match(latestAlert.message, /tankless coil rupture/);
  } finally {
    // Cleanup created messages
    const msgs = db.getMessages(TENANT_A, conversation.id) || [];
    for (const m of msgs) {
      if (m.from_number === TEST_PHONE || m.to_number === TEST_PHONE) {
        db.deleteMessage(m.id);
      }
    }
    // Delete conversation created for this test (also cascades messages and intake session)
    db.deleteConversation(TENANT_A, conversation.id);

    // Restore profile
    db.updateBusinessProfile(TENANT_A, {
      custom_emergency_keywords: originalKeywords,
    });
  }
});

test('CUSTOM-3: Intake Step ASK_PROBLEM Interpolates Contractor Custom Intake Question', async () => {
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile);

  const originalQuestion = profile.custom_intake_question;
  const customPrompt = 'What specific plumbing fixture needs urgent repair?';

  db.updateBusinessProfile(TENANT_A, {
    custom_intake_question: customPrompt,
  });

  const contact = db.getOrCreateContact(TENANT_A, '+12175559944');
  const conversation = db.getOrCreateConversation(TENANT_A, contact.id);
  const intake = db.getOrCreateIntakeSession(TENANT_A, conversation.id, 'plumbing');
  intake.current_step = 'ASK_EMERGENCY';

  try {
    const inboundRes = await TwilioService.handleInboundSms({
      MessageSid: `SM_PROMPT_TEST_${Date.now()}`,
      From: '+12175559944',
      To: '+12175550190',
      Body: 'No, this is a scheduled repair not an active flood',
    });

    assert.ok(inboundRes.replyMessage, 'Must return next reply');
    assert.ok(
      inboundRes.replyMessage.includes(customPrompt),
      `Reply message must include custom intake question. Got: "${inboundRes.replyMessage}"`
    );
  } finally {
    // Cleanup created messages
    const msgs = db.getMessages(TENANT_A, conversation.id) || [];
    for (const m of msgs) {
      if (m.from_number === '+12175559944' || m.to_number === '+12175559944') {
        db.deleteMessage(m.id);
      }
    }
    // Delete conversation created for this test (cascades messages and intake session)
    db.deleteConversation(TENANT_A, conversation.id);

    // Restore profile
    db.updateBusinessProfile(TENANT_A, {
      custom_intake_question: originalQuestion,
    });
  }
});

test('CUSTOM-4: Unsupported after-hours controls are rejected, not saved as working settings', async () => {
  const token = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const profile = db.getBusinessProfile(TENANT_A);
  assert.ok(profile);
  const before = { ...profile };

  const patchReq = createMockRequest('http://localhost:3001/api/settings', {
    method: 'PATCH',
    token,
    body: {
      updates: {
        after_hours_enabled: false,
        after_hours_message: 'We are closed until 7am.',
      },
    },
  });

  const patchRes = await settingsPatch(patchReq);
  assert.equal(patchRes.status, 400);
  const patchData = await patchRes.json();
  assert.match(patchData.error, /not available for tenant editing/i);
  assert.deepEqual(patchData.rejectedFields.sort(), ['after_hours_enabled', 'after_hours_message']);
  assert.deepEqual(db.getBusinessProfile(TENANT_A), before, 'rejected fields must not mutate the profile');
});
