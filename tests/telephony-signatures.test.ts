(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

import { db } from '@/db/repository';
import { TwilioService } from '@/lib/telecom/twilio-service';
import { POST as smsWebhookPost } from '@/app/api/webhooks/twilio/sms/route';
import { POST as voiceWebhookPost } from '@/app/api/webhooks/twilio/voice/route';

const TEST_SECRET = 'test_twilio_secret_token_f928a30d8c11e7';
const FORGED_SECRET = 'forged_attacker_secret_token_00000000';
const WEBHOOK_URL = 'http://localhost:3001/api/webhooks/twilio/sms';
const VOICE_WEBHOOK_URL = 'http://localhost:3001/api/webhooks/twilio/voice';

function createFormRequest(
  url: string,
  params: Record<string, string>,
  signature?: string | null
) {
  const searchParams = new URLSearchParams();
  for (const [key, val] of Object.entries(params)) {
    searchParams.set(key, val);
  }
  const bodyString = searchParams.toString();

  const headers = new Headers({
    'Content-Type': 'application/x-www-form-urlencoded',
  });
  if (signature) {
    headers.set('x-twilio-signature', signature);
  }

  return new NextRequest(new URL(url), {
    method: 'POST',
    headers,
    body: bodyString,
  });
}

test('W1: Fail-Closed when TWILIO_AUTH_TOKEN is not configured (503 Service Unavailable)', async () => {
  const originalToken = process.env.TWILIO_AUTH_TOKEN;
  try {
    delete process.env.TWILIO_AUTH_TOKEN;

    const reqSms = createFormRequest(WEBHOOK_URL, {
      From: '+15550007777',
      To: '+12175550190',
      Body: 'test fail closed',
      MessageSid: 'SM_fail_closed_test',
    });
    const resSms = await smsWebhookPost(reqSms);
    assert.equal(resSms.status, 503, 'SMS webhook must return 503 when TWILIO_AUTH_TOKEN is not configured');

    const reqVoice = createFormRequest(VOICE_WEBHOOK_URL, {
      From: '+15550007777',
      To: '+12175550190',
      CallSid: 'CA_fail_closed_test',
    });
    const resVoice = await voiceWebhookPost(reqVoice);
    assert.equal(resVoice.status, 503, 'Voice webhook must return 503 when TWILIO_AUTH_TOKEN is not configured');
  } finally {
    process.env.TWILIO_AUTH_TOKEN = originalToken;
  }
});

test('W2: Unsigned Requests Refused with 403 Forbidden and writes nothing', async () => {
  process.env.TWILIO_AUTH_TOKEN = TEST_SECRET;

  const probeSid = `SM_unsigned_probe_${Date.now()}`;
  const req = createFormRequest(
    WEBHOOK_URL,
    {
      From: '+15550007777',
      To: '+12175550190',
      Body: 'unsigned probe message',
      MessageSid: probeSid,
    },
    null // no signature header
  );

  const res = await smsWebhookPost(req);
  assert.equal(res.status, 403, 'Unsigned request must be refused 403 Forbidden');

  // Verify nothing was written to database
  assert.equal(
    db.isWebhookProcessed('twilio_sms', probeSid),
    false,
    'Unsigned request must not write to processed webhooks'
  );
});

test('W3: Forged / Wrong Signature Refused with 403 Forbidden', async () => {
  process.env.TWILIO_AUTH_TOKEN = TEST_SECRET;

  const params = {
    From: '+15550007777',
    To: '+12175550190',
    Body: 'forged probe',
    MessageSid: `SM_forged_${Date.now()}`,
  };

  // Sign using wrong/attacker secret
  const forgedSignature = TwilioService.computeSignature(FORGED_SECRET, WEBHOOK_URL, params);

  const req = createFormRequest(WEBHOOK_URL, params, forgedSignature);
  const res = await smsWebhookPost(req);
  assert.equal(res.status, 403, 'Forged signature must be rejected with 403');
  assert.equal(db.isWebhookProcessed('twilio_sms', params.MessageSid), false);
});

test('W4: Tampered Parameter Value Fails Verification with 403', async () => {
  process.env.TWILIO_AUTH_TOKEN = TEST_SECRET;

  const originalParams = {
    From: '+15550007777',
    To: '+12175550190',
    Body: 'valid message',
    MessageSid: `SM_tampered_${Date.now()}`,
  };

  // Compute signature for original params
  const validSignature = TwilioService.computeSignature(TEST_SECRET, WEBHOOK_URL, originalParams);

  // Tamper the body parameters before sending
  const tamperedParams = {
    ...originalParams,
    Body: 'tampered message injection',
  };

  const req = createFormRequest(WEBHOOK_URL, tamperedParams, validSignature);
  const res = await smsWebhookPost(req);
  assert.equal(res.status, 403, 'Tampered request must fail signature check with 403');
});

test('W5: Genuine Signed SMS Request is Accepted (200 OK) and Returns TwiML', async () => {
  process.env.TWILIO_AUTH_TOKEN = TEST_SECRET;

  const params = {
    From: '+12175559821', // John Smith
    To: '+12175550190', // Apex Plumbing registered number
    Body: 'HELP',
    MessageSid: `SM_genuine_${Date.now()}`,
  };

  const signature = TwilioService.computeSignature(TEST_SECRET, WEBHOOK_URL, params);
  const req = createFormRequest(WEBHOOK_URL, params, signature);

  const res = await smsWebhookPost(req);
  assert.equal(res.status, 200, 'Genuine signed SMS webhook must answer 200');

  const twiml = await res.text();
  assert.ok(twiml.includes('<Response>'), 'Must return valid TwiML response');
  assert.equal(db.isWebhookProcessed('twilio_sms', params.MessageSid), true);
});

test('W6: Genuine Signed Voice Request Triggers Missed-Call Recovery & Text-Back (200 OK)', async () => {
  process.env.TWILIO_AUTH_TOKEN = TEST_SECRET;

  const callSid = `CA_genuine_voice_${Date.now()}`;
  const callerNumber = `+1217555${Math.floor(1000 + Math.random() * 9000)}`;

  const params = {
    CallSid: callSid,
    From: callerNumber,
    To: '+12175550190',
    CallStatus: 'no-answer',
    Direction: 'inbound',
  };

  const signature = TwilioService.computeSignature(TEST_SECRET, VOICE_WEBHOOK_URL, params);
  const req = createFormRequest(VOICE_WEBHOOK_URL, params, signature);

  const res = await voiceWebhookPost(req);
  assert.equal(res.status, 200, 'Genuine signed voice webhook must answer 200');

  const twiml = await res.text();
  assert.ok(twiml.includes('<Hangup/>'), 'Voice webhook must return polite hangup TwiML');

  // Verify call recorded in database
  const callRecord = db.getCallBySid(callSid);
  assert.ok(callRecord, 'Call record must be created in repository');
  assert.equal(callRecord.from_number, callerNumber);
  assert.equal(callRecord.text_back_status, 'sent');
  assert.equal(db.isWebhookProcessed('twilio_voice', callSid), true);
});

test('W7: Replay Protection & Idempotency (Same Sid Twice Does Not Duplicate)', async () => {
  process.env.TWILIO_AUTH_TOKEN = TEST_SECRET;

  const replaySid = `CA_replay_test_${Date.now()}`;
  const params = {
    CallSid: replaySid,
    From: '+12175558833',
    To: '+12175550190',
    CallStatus: 'no-answer',
  };

  const signature = TwilioService.computeSignature(TEST_SECRET, VOICE_WEBHOOK_URL, params);

  // Send request 1 -> processed
  const req1 = createFormRequest(VOICE_WEBHOOK_URL, params, signature);
  const res1 = await voiceWebhookPost(req1);
  assert.equal(res1.status, 200);

  const callsBefore = db.getCallRecords('acc-apex-plumbing').length;

  // Send request 2 (exact same CallSid replayed) -> recognized as duplicate
  const req2 = createFormRequest(VOICE_WEBHOOK_URL, params, signature);
  const res2 = await voiceWebhookPost(req2);
  assert.equal(res2.status, 200);

  const callsAfter = db.getCallRecords('acc-apex-plumbing').length;
  assert.equal(callsAfter, callsBefore, 'Replayed webhook must not create a second call record');
});

test('W8: Cryptographic Unit Assertions (TwilioService.validateSignature)', () => {
  const url = 'https://example.com/api/webhooks/twilio/sms';
  const params = { From: '+12175551234', Body: 'hello' };
  const sig = TwilioService.computeSignature(TEST_SECRET, url, params);

  // 1. Valid signature passes
  assert.equal(TwilioService.validateSignature(TEST_SECRET, sig, url, params), true);

  // 2. Missing authToken fails closed
  assert.equal(TwilioService.validateSignature('', sig, url, params), false);
  assert.equal(TwilioService.validateSignature(undefined, sig, url, params), false);

  // 3. Null / missing signature fails
  assert.equal(TwilioService.validateSignature(TEST_SECRET, null, url, params), false);
  assert.equal(TwilioService.validateSignature(TEST_SECRET, '', url, params), false);

  // 4. Forged signature fails
  assert.equal(TwilioService.validateSignature(TEST_SECRET, 'invalid_sig==', url, params), false);

  // 5. Wrong secret fails
  assert.equal(TwilioService.validateSignature(FORGED_SECRET, sig, url, params), false);

  // 6. Wrong URL fails
  assert.equal(TwilioService.validateSignature(TEST_SECRET, sig, 'https://different.com/webhook', params), false);
});
