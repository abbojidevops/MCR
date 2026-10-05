import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { NextRequest } from 'next/server';

import { db } from '../src/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session';
import { evaluateLaunchGates } from '../src/lib/launch-gate';
import { isCarrierVerifiedRegistration } from '../src/lib/compliance-machine';
import { TwilioClient } from '../src/lib/telecom/twilio-client';
import { TwilioService } from '../src/lib/telecom/twilio-service';
import { computeMetrics } from '../src/lib/metrics';
import { generateDailySummary, generateWeeklyReport } from '../src/lib/reports';
import { POST as compliancePost } from '../src/app/api/compliance/route';
import { POST as loginPost } from '../src/app/api/auth/login/route';
import { createFixtureTracker } from '../src/lib/test-hygiene';

interface ProbeResult {
  task: string;
  name: string;
  passed: boolean;
  requestSummary: string;
  responseSummary: string;
  detail: string;
}

const tracker = createFixtureTracker();

function createMockRequest(
  url: string,
  options: {
    method?: string;
    body?: any;
    cookie?: string;
    headers?: Record<string, string>;
  } = {}
) {
  const reqHeaders = new Headers(options.headers || {});
  if (options.cookie) {
    reqHeaders.set('cookie', `${SESSION_COOKIE_NAME}=${options.cookie}`);
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

async function runGreenProbes(): Promise<void> {
  console.log('======================================================================');
  console.log('   MCR TASK 23: PROBE:GREEN — FIXED BUILD VERIFICATION RUNNER');
  console.log('======================================================================');
  console.log('Testing all fixed behaviors from Round 2 audit. All security controls,');
  console.log('honesty gates, and invariant guarantees are expected to PASS (exit 0).\n');

  const baselineCounts = db.getTableCounts();
  const baselineWebhooks = db.getProcessedWebhooks();
  const results: ProbeResult[] = [];

  try {
    // ------------------------------------------------------------------------
    // PROBE 1: Task 15 — submit_registration Whitelist & ID Honesty
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 1/7] Task 15: submit_registration Whitelist & ID Honesty ---');
    const customerToken = createSessionToken({ role: 'customer', accountId: 'acc-apex-plumbing' });
    const injectionBody = {
      action: 'submit_registration',
      registrationData: {
        legal_name: 'Alpha Mechanical LLC',
        ein: '88-7654321',
        business_type: 'LLC',
        campaign_sid: 'CM_injected_by_customer',
        status: 'sms_live',
        last_updated_by: 'carrier_webhook',
        carrier_source: 'carrier_api',
      },
    };

    const req1 = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      cookie: customerToken,
      body: injectionBody,
    });

    const res1 = await compliancePost(req1);
    const body1 = await res1.json();

    const p1Req = `POST /api/compliance (action: submit_registration, injected fields)`;
    const p1Res = `Status: ${res1.status}, Rejected: ${JSON.stringify(body1.rejected)}`;
    console.log(`Request Sent:     ${p1Req}`);
    console.log(`Response Got:     ${p1Res}`);

    // Verify rejection of injected fields
    const injectionRejected =
      res1.status === 400 &&
      Array.isArray(body1.rejected) &&
      body1.rejected.includes('campaign_sid') &&
      body1.rejected.includes('status') &&
      body1.rejected.includes('last_updated_by') &&
      body1.rejected.includes('carrier_source');

    // Verify valid submission via isolated fixture account
    const fixture1 = tracker.createAccount('Probe 1 Tenant', 'plumbing', '+12175551101');
    const fixture1Token = createSessionToken({ role: 'customer', accountId: fixture1.account.id });
    const validBody = {
      action: 'submit_registration',
      registrationData: {
        legal_name: 'Valid Plumbing Services Inc',
        ein: '12-3456789',
        business_type: 'LLC',
        address: '100 Main St, Chicago, IL 60601',
        website: 'https://validplumbing.com',
        contact_name: 'Jane Doe',
        contact_email: 'jane@validplumbing.com',
        contact_phone: '+12175551101',
        sample_messages: ['Thanks for calling Valid Plumbing!'],
      },
    };
    const req1Valid = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      cookie: fixture1Token,
      body: validBody,
    });
    const res1Valid = await compliancePost(req1Valid);
    const body1Valid = await res1Valid.json();

    const validSubmissionHonest =
      res1Valid.status === 200 &&
      body1Valid.compliance?.brand_sid === null &&
      body1Valid.compliance?.campaign_sid === null &&
      body1Valid.compliance?.last_updated_by === 'customer' &&
      body1Valid.compliance?.status === 'brand_submitted';

    const p1Passed = injectionRejected && validSubmissionHonest;
    if (p1Passed) {
      console.log('GREEN: submit_registration injection — PASSED (Injection rejected with 400, valid submission honest with null SIDs)\n');
    } else {
      console.log('GREEN: submit_registration injection — FAILED\n');
    }
    results.push({
      task: 'Task 15',
      name: 'submit_registration injection & ID honesty',
      passed: p1Passed,
      requestSummary: p1Req,
      responseSummary: p1Res,
      detail: 'Injected fields rejected with 400; valid submission preserves brand_sid: null and last_updated_by: customer',
    });

    // ------------------------------------------------------------------------
    // PROBE 2: Task 16 — Carrier Webhook Authentication & Replay Protection
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 2/7] Task 16: Carrier Webhook HMAC Authentication & Replay Protection ---');
    const webhookBody = {
      action: 'set_status',
      accountId: 'acc-coolbreeze-hvac',
      targetStatus: 'sms_live',
    };
    const req2Unsigned = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers: {
        'x-carrier-webhook-secret': 'mcr-carrier-webhook-secret-2026',
      },
      body: webhookBody,
    });

    const res2Unsigned = await compliancePost(req2Unsigned);
    const body2Unsigned = await res2Unsigned.json();

    const p2Req = `POST /api/compliance (x-carrier-webhook-secret: plaintext, targetStatus: sms_live)`;
    const p2Res = `Status: ${res2Unsigned.status}, Error: "${body2Unsigned.error}"`;
    console.log(`Request Sent:     ${p2Req}`);
    console.log(`Response Got:     ${p2Res}`);

    // Verify unauthenticated attempt is blocked (503 if secret unset, 401 if invalid HMAC)
    const unsignedBlocked = res2Unsigned.status === 503 || res2Unsigned.status === 401;

    // Verify HMAC and replay protection on configured secret
    const secretKey = 'test-carrier-hmac-probe-secret-key-32bytes!';
    const prevSecret = process.env.CARRIER_WEBHOOK_SECRET;
    process.env.CARRIER_WEBHOOK_SECRET = secretKey;

    let hmacPassed = false;
    let replayRejected = false;
    try {
      const fixture2 = tracker.createAccount('Probe 2 Webhook Tenant', 'plumbing', '+12175551102');
      const eventId = `evt-probe-${Date.now()}`;
      const timestamp = Date.now();
      const signedPayload = {
        action: 'advance_status',
        accountId: fixture2.account.id,
      };
      const rawBody = JSON.stringify(signedPayload);
      const signature = crypto.createHmac('sha256', secretKey).update(`${timestamp}.${rawBody}`).digest('hex');

      const headers = {
        'x-carrier-signature': `t=${timestamp},v1=${signature}`,
        'x-carrier-timestamp': String(timestamp),
        'x-carrier-event-id': eventId,
        'x-carrier-account-id': fixture2.account.id,
      };

      // 1. Valid signed request
      const req2Signed = createMockRequest('http://localhost:3001/api/compliance', {
        method: 'POST',
        headers,
        body: signedPayload,
      });
      const res2Signed = await compliancePost(req2Signed);
      const body2Signed = await res2Signed.json();
      hmacPassed =
        res2Signed.status === 200 &&
        body2Signed.compliance?.status === 'brand_submitted' &&
        body2Signed.compliance?.last_updated_by === 'carrier_webhook';

      // 2. Replay request with same event ID
      const req2Replay = createMockRequest('http://localhost:3001/api/compliance', {
        method: 'POST',
        headers,
        body: signedPayload,
      });
      const res2Replay = await compliancePost(req2Replay);
      replayRejected = res2Replay.status === 409;
    } finally {
      if (prevSecret !== undefined) process.env.CARRIER_WEBHOOK_SECRET = prevSecret;
      else delete process.env.CARRIER_WEBHOOK_SECRET;
    }

    const p2Passed = unsignedBlocked && hmacPassed && replayRejected;
    if (p2Passed) {
      console.log('GREEN: carrier webhook authentication — PASSED (Unsigned blocked with 503/401, signed succeeded, replay refused with 409)\n');
    } else {
      console.log('GREEN: carrier webhook authentication — FAILED\n');
    }
    results.push({
      task: 'Task 16',
      name: 'carrier webhook HMAC & replay protection',
      passed: p2Passed,
      requestSummary: p2Req,
      responseSummary: p2Res,
      detail: 'Unsigned blocked, valid HMAC accepted, replayed event rejected with 409',
    });

    // ------------------------------------------------------------------------
    // PROBE 3: Task 17 — Seed Data Cannot Satisfy Carrier Gate
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 3/7] Task 17: Seed Data Cannot Satisfy Carrier Gate ---');
    const gateReport = evaluateLaunchGates();
    const carrierGate = gateReport.gates.find((g) => g.id === 'a2p_10dlc_carrier_verified');

    const p3Req = `evaluateLaunchGates() on committed seed database`;
    const p3Res = `Gate Status: "${carrierGate?.status}", StatusReason: "${carrierGate?.statusReason}"`;
    console.log(`Request Sent:     ${p3Req}`);
    console.log(`Response Got:     ${p3Res}`);

    // Gate must be failed on baseline seed data; verify that all seeded accounts evaluate to false
    const seededCompliances = db.getAllCompliance();
    const seededHasLive = seededCompliances.some((c) => isCarrierVerifiedRegistration(c));
    const p3Passed = carrierGate?.status === 'failed' && seededHasLive === false;
    if (p3Passed) {
      console.log('GREEN: seed-satisfies-the-gate case — PASSED (Carrier gate reports failed; seed accounts cannot satisfy gate)\n');
    } else {
      console.log('GREEN: seed-satisfies-the-gate case — FAILED\n');
    }
    results.push({
      task: 'Task 17',
      name: 'seed-satisfies-the-gate case',
      passed: p3Passed,
      requestSummary: p3Req,
      responseSummary: p3Res,
      detail: 'Gate reads is_demo flag and provenance; seed data remains honestly failed',
    });

    // ------------------------------------------------------------------------
    // PROBE 4: Task 18 — Static Claim Page Re-Derives Dynamically Per Request
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 4/7] Task 18: Dynamic Per-Request Compliance Claims ---');
    const compPagePath = path.join(process.cwd(), 'src', 'app', 'compliance', 'page.tsx');
    const compSource = fs.readFileSync(compPagePath, 'utf-8');

    const p4Req = `Inspect src/app/compliance/page.tsx dynamic export`;
    const hasForceDynamic = compSource.includes("export const dynamic = 'force-dynamic'");
    const p4Res = `Exports force-dynamic: ${hasForceDynamic}`;
    console.log(`Request Sent:     ${p4Req}`);
    console.log(`Response Got:     ${p4Res}`);

    const p4Passed = hasForceDynamic;
    if (p4Passed) {
      console.log('GREEN: static claim page — PASSED (Page exports dynamic = force-dynamic and re-derives per request)\n');
    } else {
      console.log('GREEN: static claim page — FAILED\n');
    }
    results.push({
      task: 'Task 18',
      name: 'static claim page',
      passed: p4Passed,
      requestSummary: p4Req,
      responseSummary: p4Res,
      detail: 'Page exports force-dynamic; compliance copy re-derives per request',
    });

    // ------------------------------------------------------------------------
    // PROBE 5: Task 19 — Live Path Never Synthesizes Identifiers
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 5/7] Task 19: Live Path Never Synthesizes Identifiers ---');
    const prevMock = process.env.TWILIO_MOCK_MODE;
    const prevSid = process.env.TWILIO_ACCOUNT_SID;
    const prevToken = process.env.TWILIO_AUTH_TOKEN;
    const prevBase = process.env.TWILIO_API_BASE;

    process.env.TWILIO_MOCK_MODE = 'false';
    process.env.TWILIO_ACCOUNT_SID = 'AC_TEST_ACCOUNT_SID';
    process.env.TWILIO_AUTH_TOKEN = 'test_auth_token_secret';
    process.env.TWILIO_API_BASE = 'http://127.0.0.1:9'; // unreachable dead port

    let p5ResObj: any;
    try {
      p5ResObj = await TwilioClient.submitBrand({
        legalName: 'Test Inc',
        ein: '12-3456789',
        address: '123 Main St',
        city: 'Springfield',
        state: 'IL',
        zip: '62701',
        contactEmail: 'test@example.com',
        contactPhone: '+12175550100',
      });
    } finally {
      if (prevMock !== undefined) process.env.TWILIO_MOCK_MODE = prevMock;
      else delete process.env.TWILIO_MOCK_MODE;
      if (prevSid !== undefined) process.env.TWILIO_ACCOUNT_SID = prevSid;
      else delete process.env.TWILIO_ACCOUNT_SID;
      if (prevToken !== undefined) process.env.TWILIO_AUTH_TOKEN = prevToken;
      else delete process.env.TWILIO_AUTH_TOKEN;
      if (prevBase !== undefined) process.env.TWILIO_API_BASE = prevBase;
      else delete process.env.TWILIO_API_BASE;
    }

    const p5Req = `TwilioClient.submitBrand(...) in live mode against unreachable carrier`;
    const p5Res = `Result: ${JSON.stringify(p5ResObj)}`;
    console.log(`Request Sent:     ${p5Req}`);
    console.log(`Response Got:     ${p5Res}`);

    // Live branch must return failure without synthesizing BN_LIVE_ or CP_LIVE_
    const p5Passed = Boolean(p5ResObj && p5ResObj.ok === false && !p5ResObj.brandSid);
    if (p5Passed) {
      console.log('GREEN: synthesized live identifiers — PASSED (Live path returned failure with null/undefined brandSid; no synthesized IDs)\n');
    } else {
      console.log('GREEN: synthesized live identifiers — FAILED\n');
    }
    results.push({
      task: 'Task 19',
      name: 'synthesized live identifiers',
      passed: p5Passed,
      requestSummary: p5Req,
      responseSummary: p5Res,
      detail: 'Live carrier client never synthesizes identifiers on carrier error/unreachable',
    });

    // ------------------------------------------------------------------------
    // PROBE 6: Task 20 — Simulator Payload Equality
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 6/7] Task 20: Simulator Payload Equality ---');
    const fixture6 = tracker.createAccount('Probe 6 Sim Tenant', 'plumbing', '+12175551106');
    const fixture6Id = fixture6.account.id;

    const metricsBefore = computeMetrics(fixture6Id);
    const dailyBefore = generateDailySummary(fixture6Id);
    const weeklyBefore = generateWeeklyReport(fixture6Id);

    // Dispatch simulated call
    await TwilioService.handleInboundCall({
      CallSid: 'CA_SIM_PROBE_' + Date.now(),
      From: '+12175554499',
      To: '+12175551106',
    });

    const metricsAfter = computeMetrics(fixture6Id);
    const dailyAfter = generateDailySummary(fixture6Id);
    const weeklyAfter = generateWeeklyReport(fixture6Id);

    const deltaCalls = metricsAfter.missedCallsCount - metricsBefore.missedCallsCount;
    const deltaRev = metricsAfter.confirmedRevenue - metricsBefore.confirmedRevenue;
    const proseEqual =
      dailyBefore.summaryText === dailyAfter.summaryText &&
      weeklyBefore.summaryText === weeklyAfter.summaryText;

    const p6Req = `TwilioService.handleInboundCall (simulated call) -> check computeMetrics & prose reports`;
    const p6Res = `Calls delta: ${deltaCalls}, Revenue delta: ${deltaRev}, Prose identical: ${proseEqual}`;
    console.log(`Request Sent:     ${p6Req}`);
    console.log(`Response Got:     ${p6Res}`);

    const p6Passed = deltaCalls === 0 && deltaRev === 0 && proseEqual;
    if (p6Passed) {
      console.log('GREEN: simulator payload equality — PASSED (Payload equality strictly preserved; simulated call excluded from customer metrics)\n');
    } else {
      console.log('GREEN: simulator payload equality — FAILED\n');
    }
    results.push({
      task: 'Task 20',
      name: 'simulator payload equality',
      passed: p6Passed,
      requestSummary: p6Req,
      responseSummary: p6Res,
      detail: 'Simulated calls excluded from metrics and prose summaries with 0 delta',
    });

    // ------------------------------------------------------------------------
    // PROBE 7: Task 21b — Untrusted Client IP Rate Limiting
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 7/7] Task 21b: Untrusted Client IP Rate Limiting ---');
    let throttledAttempt = 0;
    for (let i = 1; i <= 10; i++) {
      const spoofedIp = `203.0.113.${100 + i}`;
      const req7 = createMockRequest('http://localhost:3001/api/auth/login', {
        method: 'POST',
        headers: {
          'x-forwarded-for': spoofedIp,
        },
        body: {
          email: 'admin@example.com',
          password: `wrong-pass-${i}`,
        },
      });
      const res7 = await loginPost(req7);
      if (res7.status === 429) {
        throttledAttempt = i;
        break;
      }
    }

    const p7Req = `10 failed logins with rotating X-Forwarded-For headers from untrusted socket`;
    const p7Res = `Throttled at attempt: ${throttledAttempt}`;
    console.log(`Request Sent:     ${p7Req}`);
    console.log(`Response Got:     ${p7Res}`);

    // Must throttle by attempt 6
    const p7Passed = throttledAttempt > 0 && throttledAttempt <= 6;
    if (p7Passed) {
      console.log(`GREEN: client IP rate limiting — PASSED (Rate limiter throttled attempt ${throttledAttempt} with 429; spoofed XFF rejected)\n`);
    } else {
      console.log('GREEN: client IP rate limiting — FAILED\n');
    }
    results.push({
      task: 'Task 21b',
      name: 'untrusted client IP rate limiting',
      passed: p7Passed,
      requestSummary: p7Req,
      responseSummary: p7Res,
      detail: `Rate limiter enforced 429 throttle on attempt ${throttledAttempt} despite spoofed XFF`,
    });

  } finally {
    tracker.cleanup();
    (db as any).state.processedWebhooks = baselineWebhooks;
    (db as any).saveToFile();
  }

  // Verify baseline hygiene
  const postCounts = db.getTableCounts();
  const countsMatch = JSON.stringify(baselineCounts) === JSON.stringify(postCounts);
  if (!countsMatch) {
    console.error('❌ [Probe Green Hygiene Violation] Database tables modified:', { baselineCounts, postCounts });
  }

  // ------------------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------------------
  const total = results.length;
  const passedCount = results.filter((r) => r.passed).length;
  const failedCount = total - passedCount;

  console.log('======================================================================');
  console.log('   PROBE:GREEN SUMMARY');
  console.log(`   Total probes: ${total}`);
  console.log(`   Passed:       ${passedCount}`);
  console.log(`   Failed:       ${failedCount}`);
  console.log('======================================================================');

  if (failedCount === 0) {
    console.log('\n✅ [probe:green PASSED]');
    console.log('   All 7 security controls and honesty invariants verified successfully.\n');
    process.exit(0);
  } else {
    console.error(`\n❌ [probe:green FAILED] ${failedCount} probes failed!`);
    process.exit(1);
  }
}

runGreenProbes().catch((err) => {
  console.error('Unhandled probe:green error:', err);
  process.exit(1);
});
