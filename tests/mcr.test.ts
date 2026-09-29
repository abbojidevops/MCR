import test from 'node:test';
import assert from 'node:assert/strict';

// Import domain modules
import { db } from '@/db/repository';
import { TwilioService } from '@/lib/telecom/twilio-service';
import { checkQuietHours, inferTimezoneFromPhone } from '@/lib/quiet-hours';
import { isStopKeyword, isStartKeyword, isHelpKeyword } from '@/lib/compliance-machine';
import { getCarrierGuide, CARRIER_GUIDES } from '@/lib/carrier-guides';
import { generateDailySummary, generateWeeklyReport } from '@/lib/reports';

test('1. Strict Multi-Tenant Isolation', () => {
  const accountA = 'acc-apex-plumbing';
  const accountB = 'acc-coolbreeze-hvac';

  // db.assertTenantAccess should succeed when IDs match
  assert.doesNotThrow(() => {
    db.assertTenantAccess(accountA, accountA);
  });

  // db.assertTenantAccess should throw when account IDs do not match
  assert.throws(
    () => {
      db.assertTenantAccess(accountA, accountB);
    },
    /TENANT_ISOLATION_VIOLATION/,
    'Should throw tenant isolation violation when tenant IDs do not match'
  );

  // Jobs for Account A must only belong to Account A
  const jobsA = db.getJobs(accountA);
  for (const job of jobsA) {
    assert.equal(job.account_id, accountA, 'All jobs returned must belong exclusively to Account A');
  }

  // Conversations for Account A must only belong to Account A
  const convsA = db.getConversations(accountA);
  for (const conv of convsA) {
    assert.equal(conv.account_id, accountA, 'All conversations returned must belong exclusively to Account A');
  }
});

test('2. Webhook Idempotency (Twilio & Stripe)', async () => {
  const eventId = `CA_IDEMPOTENT_TEST_${Date.now()}`;

  // First time: not processed
  assert.equal(db.isWebhookProcessed('twilio_voice', eventId), false);

  // Mark as processed
  db.markWebhookProcessed('twilio_voice', eventId, 'voice_call_missed');

  // Second time: recognized as processed
  assert.equal(db.isWebhookProcessed('twilio_voice', eventId), true);

  // Calling TwilioService.handleInboundCall with identical CallSid should return idempotent flag
  const result = await TwilioService.handleInboundCall({
    CallSid: eventId,
    From: '+12175551122',
    To: '+12175550190',
  });

  assert.equal(result.textBackTriggered, false);
  assert.match(result.reason, /idempotent/i);
});

test('3. Missed-Call Detection & Text-Back Delivery', async () => {
  const callSid = `CA_MISSED_TEST_${Date.now()}`;
  const caller = `+1217555${Math.floor(1000 + Math.random() * 9000)}`;

  const result = await TwilioService.handleInboundCall({
    CallSid: callSid,
    From: caller,
    To: '+12175550190', // Apex Plumbing registered number
    CallStatus: 'no-answer',
  });

  assert.equal(result.textBackTriggered, true, 'Text-back must be triggered for valid missed call');
  assert.match(result.twiml, /<Response>/, 'Must return valid TwiML response');

  // Verify conversation and message were created in DB
  const contact = db.getOrCreateContact('acc-apex-plumbing', caller);
  const conv = db.getOrCreateConversation('acc-apex-plumbing', contact.id);
  const messages = db.getMessages('acc-apex-plumbing', conv.id);

  assert.ok(messages.length >= 1, 'Outbound text-back message must be saved');
  assert.equal(messages[0].direction, 'outbound');
  assert.match(messages[0].body, /Apex Plumbing/);
});

test('4. 2-Hour Deduplication Window (No Repeated Text-Backs)', async () => {
  const repeatCaller = `+1217555${Math.floor(1000 + Math.random() * 9000)}`;

  // Call 1: First missed call
  const call1 = await TwilioService.handleInboundCall({
    CallSid: `CA_CALL1_${Date.now()}`,
    From: repeatCaller,
    To: '+12175550190',
    CallStatus: 'no-answer',
  });
  assert.equal(call1.textBackTriggered, true, 'First call should send text-back');

  // Call 2: Second call within 2 hours
  const call2 = await TwilioService.handleInboundCall({
    CallSid: `CA_CALL2_${Date.now()}`,
    From: repeatCaller,
    To: '+12175550190',
    CallStatus: 'busy',
  });

  assert.equal(call2.textBackTriggered, false, 'Second call within 2h must be deduplicated');
  assert.match(call2.reason, /deduplicated/i);
});

test('5. SMS Suppression (STOP / UNSUBSCRIBE / START)', async () => {
  const stopCaller = `+1217555${Math.floor(1000 + Math.random() * 9000)}`;

  assert.equal(isStopKeyword('STOP'), true);
  assert.equal(isStopKeyword('stop'), true);
  assert.equal(isStopKeyword('UNSUBSCRIBE'), true);
  assert.equal(isStopKeyword('CANCEL'), true);
  assert.equal(isStopKeyword('Hello'), false);

  assert.equal(isStartKeyword('START'), true);
  assert.equal(isStartKeyword('UNSTOP'), true);

  // Send STOP message
  const stopResult = await TwilioService.handleInboundSms({
    MessageSid: `SM_STOP_${Date.now()}`,
    From: stopCaller,
    To: '+12175550190',
    Body: 'STOP',
  });

  assert.equal(stopResult.stepUpdated, 'STOPPED');
  assert.match(stopResult.replyMessage || '', /unsubscribed/i);

  // Verify number is suppressed
  const isSuppressed = db.isNumberSuppressed('acc-apex-plumbing', stopCaller);
  assert.equal(isSuppressed, true, 'Caller must be added to suppression list');

  // Subsequent call should be suppressed
  const callResult = await TwilioService.handleInboundCall({
    CallSid: `CA_SUPP_${Date.now()}`,
    From: stopCaller,
    To: '+12175550190',
    CallStatus: 'no-answer',
  });
  assert.equal(callResult.textBackTriggered, false);
  assert.match(callResult.reason, /suppression/i);

  // Send START to opt back in
  const startResult = await TwilioService.handleInboundSms({
    MessageSid: `SM_START_${Date.now()}`,
    From: stopCaller,
    To: '+12175550190',
    Body: 'START',
  });
  assert.equal(startResult.stepUpdated, 'ACTIVE');
  assert.equal(db.isNumberSuppressed('acc-apex-plumbing', stopCaller), false, 'Caller must be un-suppressed');
});

test('6. TCPA Quiet Hours Compliance (8 AM - 9 PM)', () => {
  const tz = 'America/New_York';

  // 12:00 PM (inside 8am-9pm)
  const noon = new Date('2026-03-15T16:00:00Z'); // 12 PM EDT
  const checkNoon = checkQuietHours(tz, 8, 21, noon);
  assert.equal(checkNoon.isWithinHours, true);

  // 11:30 PM (outside 8am-9pm)
  const lateNight = new Date('2026-03-15T03:30:00Z'); // 11:30 PM EDT previous day
  const checkLate = checkQuietHours(tz, 8, 21, lateNight);
  assert.equal(checkLate.isWithinHours, false);
  assert.ok(checkLate.nextAllowedSendTime);

  // Area code fallback test
  const chicagoTimezone = inferTimezoneFromPhone('+13125550100');
  assert.equal(chicagoTimezone, 'America/Chicago');
});

test('7. Qualification State Machine & Emergency Job Card Creation', async () => {
  const qualCaller = `+1217555${Math.floor(1000 + Math.random() * 9000)}`;

  // Step 1: Inbound call creates intake session at ASK_EMERGENCY
  await TwilioService.handleInboundCall({
    CallSid: `CA_QUAL_${Date.now()}`,
    From: qualCaller,
    To: '+12175550190',
    CallStatus: 'no-answer',
  });

  // Step 2: Customer replies "YES, bursting leak in bathroom"
  const reply1 = await TwilioService.handleInboundSms({
    MessageSid: `SM_Q1_${Date.now()}`,
    From: qualCaller,
    To: '+12175550190',
    Body: 'YES, water is bursting from my bathroom sink!',
  });
  assert.equal(reply1.stepUpdated, 'ASK_PROBLEM');
  assert.match(reply1.replyMessage || '', /issue|experiencing/i);

  // Step 3: Customer provides problem details
  const reply2 = await TwilioService.handleInboundSms({
    MessageSid: `SM_Q2_${Date.now()}`,
    From: qualCaller,
    To: '+12175550190',
    Body: 'The shutoff valve snapped off and won\'t close',
  });
  assert.equal(reply2.stepUpdated, 'ASK_ADDRESS');
  assert.match(reply2.replyMessage || '', /address/i);

  // Step 4: Customer gives address
  const reply3 = await TwilioService.handleInboundSms({
    MessageSid: `SM_Q3_${Date.now()}`,
    From: qualCaller,
    To: '+12175550190',
    Body: '456 Oak Street, Springfield',
  });
  assert.equal(reply3.stepUpdated, 'ASK_PHOTO');
  assert.match(reply3.replyMessage || '', /photo/i);

  // Step 5: Customer sends photo / finishes qualification
  const reply4 = await TwilioService.handleInboundSms({
    MessageSid: `SM_Q4_${Date.now()}`,
    From: qualCaller,
    To: '+12175550190',
    Body: 'Sent photo!',
    MediaUrl0: 'https://images.example.com/burst-pipe.jpg',
  });
  assert.equal(reply4.stepUpdated, 'QUALIFIED');
  assert.equal(reply4.jobCreated, true, 'Job ticket must be created upon qualification');

  // Verify created job card in database
  const jobs = db.getJobs('acc-apex-plumbing');
  const createdJob = jobs[0];
  assert.equal(createdJob.status, 'NEW');
  assert.equal(createdJob.is_emergency, true, 'Emergency keyword must flag emergency = true');
  assert.match(createdJob.address || '', /456 Oak/);
});

test('8. Carrier Forwarding Code Generation', () => {
  const guideVerizon = getCarrierGuide('verizon', '+1 (217) 555-0190');
  assert.ok(guideVerizon);
  assert.equal(guideVerizon.forward_no_answer_code, '*712175550190');
  assert.equal(guideVerizon.cancel_forward_code, '*73');

  const guideATT = getCarrierGuide('att', '+1 (217) 555-0190');
  assert.ok(guideATT);
  assert.equal(guideATT.forward_no_answer_code, '*61*2175550190#');
});

test('9. Subscription Billing States & Usage Tracking', () => {
  const subInfo = db.getSubscription('acc-apex-plumbing');
  assert.ok(subInfo.subscription);
  assert.ok(subInfo.plan);
  assert.ok(subInfo.usage);

  assert.equal(subInfo.plan?.id, 'pro');
  assert.equal(subInfo.subscription?.status, 'active');
  assert.ok((subInfo.usage?.calls_count ?? 0) >= 0);
  assert.ok((subInfo.usage?.sms_count ?? 0) >= 0);
});

test('10. Daily & Weekly Recovery Report Computation', () => {
  const daily = generateDailySummary('acc-apex-plumbing');
  assert.ok(daily);
  assert.ok(daily.summaryText);
  assert.equal(daily.businessName, 'Apex Plumbing & Rooter');

  const weekly = generateWeeklyReport('acc-apex-plumbing');
  assert.ok(weekly);
  assert.ok(weekly.estimatedRecoveredValue > 0);
  assert.ok(weekly.responseRatePercent >= 0);
  assert.ok(weekly.recoveryRatePercent >= 0);
  assert.match(weekly.summaryText, /recovered/i);
});
