(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { NextRequest } from 'next/server';

import { db } from '@/db/repository';
import { TwilioService } from '@/lib/telecom/twilio-service';
import { TwilioClient } from '@/lib/telecom/twilio-client';
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

test('T19-1: Mock Mode Is Explicit and Unmistakable (is_simulated: true, non-hex prefixes)', async () => {
  const oldMock = process.env.TWILIO_MOCK_MODE;
  try {
    process.env.TWILIO_MOCK_MODE = 'true';

    // 1. Brand submission mock
    const brandRes = await TwilioClient.submitBrand({
      legalName: 'Alpha Mechanical LLC',
      ein: '88-7654321',
      address: '123 Test St',
      city: 'Chicago',
      state: 'IL',
      zip: '60601',
      contactEmail: 'owner@alpha.com',
      contactPhone: '+12175550100',
    });
    assert.equal(brandRes.ok, true);
    assert.equal(brandRes.status, 200);
    assert.equal(brandRes.is_simulated, true);
    assert.ok(brandRes.brandSid?.startsWith('BN_MOCK_'));
    // Must NOT match real carrier hex format (BN + 32 hex)
    assert.equal(/^BN[0-9a-fA-F]{32}$/.test(brandRes.brandSid!), false);

    // 2. Campaign submission mock
    const campRes = await TwilioClient.submitCampaign({
      brandSid: brandRes.brandSid!,
      description: 'Customer dispatch notices',
      sampleMessages: ['Hello from Alpha Mechanical'],
    });
    assert.equal(campRes.ok, true);
    assert.equal(campRes.status, 200);
    assert.equal(campRes.is_simulated, true);
    assert.ok(campRes.campaignSid?.startsWith('CM_MOCK_'));
    // Must NOT match real carrier hex format ((CM|QE) + 32 hex)
    assert.equal(/^(CM|QE)[0-9a-fA-F]{32}$/.test(campRes.campaignSid!), false);
  } finally {
    if (oldMock !== undefined) process.env.TWILIO_MOCK_MODE = oldMock;
    else delete process.env.TWILIO_MOCK_MODE;
  }
});

test('T19-2: Live Mode Against Stub Server — Success Returns Carrier\'s Exact ID and Provenance', async () => {
  const envBackup = {
    MOCK: process.env.TWILIO_MOCK_MODE,
    SID: process.env.TWILIO_ACCOUNT_SID,
    TOKEN: process.env.TWILIO_AUTH_TOKEN,
    BASE: process.env.TWILIO_API_BASE,
  };

  let stubServer: http.Server | null = null;
  let receivedAuthHeader = '';

  try {
    stubServer = http.createServer((req, res) => {
      receivedAuthHeader = req.headers.authorization || '';
      if (req.url === '/v1/Messaging/BrandRegistrations') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          sid: 'BN0123456789abcdef0123456789abcdef',
          status: 'in_progress',
        }));
      } else if (req.url === '/v1/Messaging/Campaigns') {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          sid: 'CM0123456789abcdef0123456789abcdef',
          status: 'in_progress',
        }));
      } else {
        res.writeHead(404);
        res.end();
      }
    });

    await new Promise<void>((resolve) => stubServer!.listen(0, '127.0.0.1', resolve));
    const port = (stubServer.address() as any).port;

    delete process.env.TWILIO_MOCK_MODE;
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_stub_account';
    process.env.TWILIO_AUTH_TOKEN = 'test_stub_token_12345';
    process.env.TWILIO_API_BASE = `http://127.0.0.1:${port}`;

    assert.equal(TwilioClient.isLive(), true);

    // 1. Submit brand
    const brandRes = await TwilioClient.submitBrand({
      legalName: 'Alpha Mechanical LLC',
      ein: '88-7654321',
      address: '123 Test St',
      city: 'Chicago',
      state: 'IL',
      zip: '60601',
      contactEmail: 'owner@alpha.com',
      contactPhone: '+12175550100',
    });
    assert.equal(brandRes.ok, true);
    assert.equal(brandRes.status, 200);
    assert.equal(brandRes.brandSid, 'BN0123456789abcdef0123456789abcdef');
    assert.equal(brandRes.is_simulated, undefined);
    assert.ok(receivedAuthHeader.startsWith('Basic '));

    // 2. Submit campaign
    const campRes = await TwilioClient.submitCampaign({
      brandSid: brandRes.brandSid!,
      description: 'Customer dispatch notices',
      sampleMessages: ['Hello from Alpha Mechanical'],
    });
    assert.equal(campRes.ok, true);
    assert.equal(campRes.status, 200);
    assert.equal(campRes.campaignSid, 'CM0123456789abcdef0123456789abcdef');
    assert.equal(campRes.is_simulated, undefined);
  } finally {
    if (stubServer) await new Promise((resolve) => stubServer!.close(resolve));
    if (envBackup.MOCK !== undefined) process.env.TWILIO_MOCK_MODE = envBackup.MOCK; else delete process.env.TWILIO_MOCK_MODE;
    if (envBackup.SID !== undefined) process.env.TWILIO_ACCOUNT_SID = envBackup.SID; else delete process.env.TWILIO_ACCOUNT_SID;
    if (envBackup.TOKEN !== undefined) process.env.TWILIO_AUTH_TOKEN = envBackup.TOKEN; else delete process.env.TWILIO_AUTH_TOKEN;
    if (envBackup.BASE !== undefined) process.env.TWILIO_API_BASE = envBackup.BASE; else delete process.env.TWILIO_API_BASE;
  }
});

test('T19-3: Live Mode Against Stub Server — 200 With No ID Records Nothing (Never Fabricates Identifier)', async () => {
  const envBackup = {
    MOCK: process.env.TWILIO_MOCK_MODE,
    SID: process.env.TWILIO_ACCOUNT_SID,
    TOKEN: process.env.TWILIO_AUTH_TOKEN,
    BASE: process.env.TWILIO_API_BASE,
  };

  let stubServer: http.Server | null = null;

  try {
    stubServer = http.createServer((_req, res) => {
      // Return 200 OK but with NO identifier inside payload
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        message: 'Request received and placed into queue, SID will be assigned asynchronously',
      }));
    });

    await new Promise<void>((resolve) => stubServer!.listen(0, '127.0.0.1', resolve));
    const port = (stubServer.address() as any).port;

    delete process.env.TWILIO_MOCK_MODE;
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_stub_account';
    process.env.TWILIO_AUTH_TOKEN = 'test_stub_token_12345';
    process.env.TWILIO_API_BASE = `http://127.0.0.1:${port}`;

    // 1. Submit brand: 200 with no sid must record nothing
    const brandRes = await TwilioClient.submitBrand({
      legalName: 'Alpha Mechanical LLC',
      ein: '88-7654321',
      address: '123 Test St',
      city: 'Chicago',
      state: 'IL',
      zip: '60601',
      contactEmail: 'owner@alpha.com',
      contactPhone: '+12175550100',
    });
    assert.equal(brandRes.ok, false);
    assert.equal(brandRes.status, 200);
    assert.equal(brandRes.brandSid, undefined, 'Must not synthesize or record brandSid when 200 lacks ID');
    assert.ok(brandRes.error?.includes('no identifier'));

    // 2. Submit campaign: 200 with no sid must record nothing
    const campRes = await TwilioClient.submitCampaign({
      brandSid: 'BN_whatever',
      description: 'Customer dispatch notices',
      sampleMessages: ['Hello from Alpha Mechanical'],
    });
    assert.equal(campRes.ok, false);
    assert.equal(campRes.status, 200);
    assert.equal(campRes.campaignSid, undefined, 'Must not synthesize or record campaignSid when 200 lacks ID');
    assert.ok(campRes.error?.includes('no identifier'));
  } finally {
    if (stubServer) await new Promise((resolve) => stubServer!.close(resolve));
    if (envBackup.MOCK !== undefined) process.env.TWILIO_MOCK_MODE = envBackup.MOCK; else delete process.env.TWILIO_MOCK_MODE;
    if (envBackup.SID !== undefined) process.env.TWILIO_ACCOUNT_SID = envBackup.SID; else delete process.env.TWILIO_ACCOUNT_SID;
    if (envBackup.TOKEN !== undefined) process.env.TWILIO_AUTH_TOKEN = envBackup.TOKEN; else delete process.env.TWILIO_AUTH_TOKEN;
    if (envBackup.BASE !== undefined) process.env.TWILIO_API_BASE = envBackup.BASE; else delete process.env.TWILIO_API_BASE;
  }
});

test('T19-4: Live Mode Against Stub Server — Unreachable Carrier Returns Failure and Does Not Throw / 500', async () => {
  const envBackup = {
    MOCK: process.env.TWILIO_MOCK_MODE,
    SID: process.env.TWILIO_ACCOUNT_SID,
    TOKEN: process.env.TWILIO_AUTH_TOKEN,
    BASE: process.env.TWILIO_API_BASE,
  };

  try {
    delete process.env.TWILIO_MOCK_MODE;
    process.env.TWILIO_ACCOUNT_SID = 'AC_test_stub_account';
    process.env.TWILIO_AUTH_TOKEN = 'test_stub_token_12345';
    // Port 1 will reliably refuse connection
    process.env.TWILIO_API_BASE = 'http://127.0.0.1:1';

    // 1. Submit brand to unreachable carrier
    const brandRes = await TwilioClient.submitBrand({
      legalName: 'Alpha Mechanical LLC',
      ein: '88-7654321',
      address: '123 Test St',
      city: 'Chicago',
      state: 'IL',
      zip: '60601',
      contactEmail: 'owner@alpha.com',
      contactPhone: '+12175550100',
    });
    assert.equal(brandRes.ok, false);
    assert.equal(brandRes.status, 0);
    assert.equal(brandRes.brandSid, undefined);
    assert.equal(brandRes.error, 'carrier unreachable');

    // 2. Submit campaign to unreachable carrier
    const campRes = await TwilioClient.submitCampaign({
      brandSid: 'BN_some_brand',
      description: 'Customer dispatch notices',
      sampleMessages: ['Hello from Alpha Mechanical'],
    });
    assert.equal(campRes.ok, false);
    assert.equal(campRes.status, 0);
    assert.equal(campRes.campaignSid, undefined);
    assert.equal(campRes.error, 'carrier unreachable');
  } finally {
    if (envBackup.MOCK !== undefined) process.env.TWILIO_MOCK_MODE = envBackup.MOCK; else delete process.env.TWILIO_MOCK_MODE;
    if (envBackup.SID !== undefined) process.env.TWILIO_ACCOUNT_SID = envBackup.SID; else delete process.env.TWILIO_ACCOUNT_SID;
    if (envBackup.TOKEN !== undefined) process.env.TWILIO_AUTH_TOKEN = envBackup.TOKEN; else delete process.env.TWILIO_AUTH_TOKEN;
    if (envBackup.BASE !== undefined) process.env.TWILIO_API_BASE = envBackup.BASE; else delete process.env.TWILIO_API_BASE;
  }
});
