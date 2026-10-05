(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Domain and Auth modules
import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { TwilioClient } from '@/lib/telecom/twilio-client';
import { clearDispatchedAlerts, getDispatchedAlerts } from '@/lib/alert-dispatcher';

// Route handlers
import { GET as conversationsGet, POST as conversationsPost } from '@/app/api/conversations/route';

const TENANT_A = 'acc-apex-plumbing';
const TENANT_B = 'acc-coolbreeze-hvac';
const CONV_ID = 'conv-john-smith';

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

test('INBOX-1: Successful Manual Outbound SMS Dispatch via Twilio & Message History Update', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const initialMessages = db.getMessages(TENANT_A, CONV_ID) || [];
  const initialCount = initialMessages.length;

  const testBody = `Test contractor manual reply ${Date.now()}`;
  const req = createMockRequest('http://localhost:3001/api/conversations', {
    method: 'POST',
    token: tokenA,
    body: {
      conversationId: CONV_ID,
      bodyText: testBody,
      referenceDate: '2026-10-05T14:00:00-05:00', // 2:00 PM Central (daytime)
    },
  });

  let createdMessageId: string | undefined;
  try {
    const res = await conversationsPost(req);
    assert.equal(res.status, 200, 'Manual outbound SMS POST must return 200');

    const data = await res.json();
    assert.equal(data.success, true);
    assert.ok(data.message, 'Must return created message record');
    assert.equal(data.message.body, testBody);
    assert.equal(data.message.direction, 'outbound');
    assert.ok(data.sid, 'Must return Twilio message SID');
    assert.equal(data.message.twilio_message_sid, data.sid);

    createdMessageId = data.message.id;

    // Verify message was appended to repository
    const updatedMessages = db.getMessages(TENANT_A, CONV_ID) || [];
    assert.equal(updatedMessages.length, initialCount + 1, 'Message count must increment by 1');
    const latest = updatedMessages[updatedMessages.length - 1];
    assert.equal(latest.id, createdMessageId);
    assert.equal(latest.body, testBody);
  } finally {
    if (createdMessageId) {
      db.deleteMessage(createdMessageId);
    }
  }
});

test('INBOX-2: TCPA Opt-Out Suppression Blocks Manual Replies with 403 Forbidden', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const conv = db.getConversation(TENANT_A, CONV_ID);
  assert.ok(conv && conv.contact?.phone_number, 'Target conversation must exist with phone number');

  const recipientPhone = conv.contact.phone_number;
  const initialMessages = db.getMessages(TENANT_A, CONV_ID)?.length || 0;

  // Add suppression directly to test state
  db.addSuppression(TENANT_A, recipientPhone, 'Test STOP opt-out simulation');
  // Record the consent log created by addSuppression to clean it up for hygiene
  const consentLogs = (db as any).state.consentLogs;
  const createdConsentId = consentLogs[consentLogs.length - 1]?.id;

  try {
    const req = createMockRequest('http://localhost:3001/api/conversations', {
      method: 'POST',
      token: tokenA,
      body: {
        conversationId: CONV_ID,
        bodyText: 'Attempting to reply to customer who texted STOP',
        referenceDate: '2026-10-05T14:00:00-05:00',
      },
    });

    const res = await conversationsPost(req);
    assert.equal(res.status, 403, 'Must return 403 Forbidden when recipient is suppressed');

    const data = await res.json();
    assert.equal(data.code, 'TCPA_SUPPRESSED');
    assert.equal(data.isSuppressed, true);
    assert.match(data.error, /opted out/i);

    // Verify zero messages were appended
    const currentMessages = db.getMessages(TENANT_A, CONV_ID)?.length || 0;
    assert.equal(currentMessages, initialMessages, 'No message may be recorded when suppressed');
  } finally {
    db.deleteSuppression(TENANT_A, recipientPhone);
    if (createdConsentId) {
      db.deleteConsentLog(createdConsentId);
    }
  }
});

test('INBOX-3: TCPA Quiet Hours Compliance — 422 Rejection and Emergency Override Approval', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const initialMessages = db.getMessages(TENANT_A, CONV_ID)?.length || 0;

  // Late night reference date: 11:30 PM (23:30) Central
  const lateNightDate = '2026-10-05T23:30:00-05:00';

  // 1. Without emergency override -> 422 Unprocessable Entity
  const nonEmergencyReq = createMockRequest('http://localhost:3001/api/conversations', {
    method: 'POST',
    token: tokenA,
    body: {
      conversationId: CONV_ID,
      bodyText: 'Just following up on your inquiry from earlier today.',
      emergencyOverride: false,
      referenceDate: lateNightDate,
    },
  });

  const blockedRes = await conversationsPost(nonEmergencyReq);
  assert.equal(blockedRes.status, 422, 'Must return 422 during quiet hours without emergency override');

  const blockedData = await blockedRes.json();
  assert.equal(blockedData.code, 'QUIET_HOURS_VIOLATION');
  assert.equal(blockedData.quietHours.isWithinHours, false);
  assert.match(blockedData.error, /quiet hours/i);

  assert.equal(
    db.getMessages(TENANT_A, CONV_ID)?.length,
    initialMessages,
    'Message must not be saved when quiet hours block triggers'
  );

  // 2. With emergency override -> 200 OK
  let createdMessageId: string | undefined;
  try {
    const emergencyReq = createMockRequest('http://localhost:3001/api/conversations', {
      method: 'POST',
      token: tokenA,
      body: {
        conversationId: CONV_ID,
        bodyText: 'EMERGENCY: Shut off your main water valve immediately to prevent basement flood.',
        emergencyOverride: true,
        referenceDate: lateNightDate,
      },
    });

    const allowedRes = await conversationsPost(emergencyReq);
    assert.equal(allowedRes.status, 200, 'Must allow send during quiet hours when emergency override is true');

    const allowedData = await allowedRes.json();
    assert.equal(allowedData.success, true);
    createdMessageId = allowedData.message.id;

    assert.equal(
      db.getMessages(TENANT_A, CONV_ID)?.length,
      initialMessages + 1,
      'Emergency message must be recorded'
    );
  } finally {
    if (createdMessageId) {
      db.deleteMessage(createdMessageId);
    }
  }
});

test('INBOX-4: Carrier Outbound Failure Dispatches Critical Alert & Returns 502', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });
  const initialMessages = db.getMessages(TENANT_A, CONV_ID)?.length || 0;

  // Intercept TwilioClient.sendSms temporarily
  const originalSendSms = TwilioClient.sendSms;
  TwilioClient.sendSms = async () => ({
    sid: '',
    status: 'failed',
    error: 'Twilio Error 30008: Unknown error while delivering SMS to carrier network',
  });

  try {
    const req = createMockRequest('http://localhost:3001/api/conversations', {
      method: 'POST',
      token: tokenA,
      body: {
        conversationId: CONV_ID,
        bodyText: 'This message will fail at carrier level',
        referenceDate: '2026-10-05T14:00:00-05:00',
      },
    });

    const res = await conversationsPost(req);
    assert.equal(res.status, 502, 'Must return 502 Bad Gateway on carrier failure');

    const data = await res.json();
    assert.equal(data.status, 'failed');
    assert.equal(data.code, 'CARRIER_DISPATCH_FAILED');
    assert.match(data.error, /Carrier dispatch failed/);

    // Verify critical alert was logged to administrator audit telemetry
    const alerts = getDispatchedAlerts(TENANT_A);
    const failureAlert = alerts.find((a) => a.title === 'Manual SMS Dispatch Failure');
    assert.ok(failureAlert, 'Critical alert must be dispatched for carrier failure');
    assert.equal(failureAlert.level, 'critical');
    assert.match(failureAlert.message, /Manual SMS dispatch failed/);

    // Verify message was not saved to conversation
    assert.equal(db.getMessages(TENANT_A, CONV_ID)?.length, initialMessages);
  } finally {
    TwilioClient.sendSms = originalSendSms;
    clearDispatchedAlerts();
  }
});

test('INBOX-5: Tenant Isolation on Conversation Read & Write (404 Byte-Identical)', async () => {
  const tokenB = createSessionToken({ accountId: TENANT_B, role: 'owner', isDemo: false });

  // 1. Cross-tenant GET: Tenant B attempts to read Tenant A's conversation
  const foreignGetReq = createMockRequest(`http://localhost:3001/api/conversations?conversationId=${CONV_ID}`, {
    token: tokenB,
  });
  const unknownGetReq = createMockRequest(`http://localhost:3001/api/conversations?conversationId=conv-non-existent`, {
    token: tokenB,
  });

  const foreignGetRes = await conversationsGet(foreignGetReq);
  const unknownGetRes = await conversationsGet(unknownGetReq);

  assert.equal(foreignGetRes.status, 404);
  assert.equal(unknownGetRes.status, 404);
  assert.equal(await foreignGetRes.text(), await unknownGetRes.text(), 'Must be byte-identical 404');

  // 2. Cross-tenant POST: Tenant B attempts to post to Tenant A's conversation
  const foreignPostReq = createMockRequest('http://localhost:3001/api/conversations', {
    method: 'POST',
    token: tokenB,
    body: {
      conversationId: CONV_ID,
      bodyText: 'Unauthorized intrusion attempt',
    },
  });
  const unknownPostReq = createMockRequest('http://localhost:3001/api/conversations', {
    method: 'POST',
    token: tokenB,
    body: {
      conversationId: 'conv-non-existent',
      bodyText: 'Unauthorized intrusion attempt',
    },
  });

  const foreignPostRes = await conversationsPost(foreignPostReq);
  const unknownPostRes = await conversationsPost(unknownPostReq);

  assert.equal(foreignPostRes.status, 404);
  assert.equal(unknownPostRes.status, 404);
  assert.equal(await foreignPostRes.text(), await unknownPostRes.text(), 'Must be byte-identical 404');
});

test('INBOX-6: Inbox Listing & Thread Enrichment (isSuppressed, quietHours)', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: false });

  // 1. GET all conversations
  const listReq = createMockRequest('http://localhost:3001/api/conversations', { token: tokenA });
  const listRes = await conversationsGet(listReq);
  assert.equal(listRes.status, 200);

  const listData = await listRes.json();
  assert.ok(Array.isArray(listData.conversations), 'Must return conversations array');
  assert.ok(listData.conversations.length > 0);
  for (const c of listData.conversations) {
    assert.equal(typeof c.isSuppressed, 'boolean', 'Every conversation must indicate isSuppressed');
  }

  // 2. GET single conversation thread with enrichment
  const threadReq = createMockRequest(`http://localhost:3001/api/conversations?conversationId=${CONV_ID}`, {
    token: tokenA,
  });
  const threadRes = await conversationsGet(threadReq);
  assert.equal(threadRes.status, 200);

  const threadData = await threadRes.json();
  assert.ok(Array.isArray(threadData.messages), 'Must return messages array');
  assert.equal(typeof threadData.isSuppressed, 'boolean', 'Must return isSuppressed flag');
  assert.ok(threadData.quietHours, 'Must return quietHours status object');
  assert.equal(typeof threadData.quietHours.isWithinHours, 'boolean');
  assert.ok(threadData.conversation, 'Must return conversation object');
  assert.equal(threadData.conversation.id, CONV_ID);
});
