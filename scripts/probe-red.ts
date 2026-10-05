import fs from 'node:fs';
import path from 'node:path';
import { NextRequest } from 'next/server';

import { db } from '../src/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '../src/lib/session';
import { evaluateLaunchGates } from '../src/lib/launch-gate';
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
  reproduced: boolean;
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

async function runRedProbes(): Promise<void> {
  console.log('======================================================================');
  console.log('   MCR TASK 23: PROBE:RED — DEFECT REPRODUCTION RUNNER');
  console.log('======================================================================');
  console.log('Testing each finding from Round 2 audit. On a fixed build, all defects');
  console.log('should be BLOCKED. This runner expects defects to reproduce and exits');
  console.log('non-zero when active controls prevent their reproduction.\n');

  const baselineCounts = db.getTableCounts();
  const baselineWebhooks = db.getProcessedWebhooks();
  const results: ProbeResult[] = [];

  try {
    // ------------------------------------------------------------------------
    // PROBE 1: Task 15 — submit_registration Field Injection & ID Synthesis
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 1/7] Task 15: submit_registration Injected Fields ---');
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

    const p1Req = `POST /api/compliance (action: submit_registration, injected: campaign_sid, status, last_updated_by, carrier_source)`;
    const p1Res = `Status: ${res1.status}, Body: ${JSON.stringify(body1)}`;
    console.log(`Request Sent:     ${p1Req}`);
    console.log(`Response Got:     ${p1Res}`);

    // Defect reproduction check:
    // Buggy behavior accepted injection with 200 and synthesized brand_sid
    const p1Reproduced = res1.status === 200 && body1.compliance?.campaign_sid === 'CM_injected_by_customer';
    if (p1Reproduced) {
      console.log('RED: submit_registration injection — REPRODUCED (Injected carrier fields accepted verbatim)\n');
    } else {
      console.log(`RED: submit_registration injection — BLOCKED (Status ${res1.status}: ${body1.error || 'rejected'})\n`);
    }
    results.push({
      task: 'Task 15',
      name: 'submit_registration injection',
      reproduced: p1Reproduced,
      requestSummary: p1Req,
      responseSummary: p1Res,
      detail: p1Reproduced ? 'Defect reproduced' : 'Blocked by whitelist validation',
    });

    // ------------------------------------------------------------------------
    // PROBE 2: Task 16 — Carrier Webhook Default Plaintext Secret Header
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 2/7] Task 16: Forged Carrier Webhook Plaintext Secret Header ---');
    const webhookBody = {
      action: 'set_status',
      accountId: 'acc-coolbreeze-hvac',
      targetStatus: 'sms_live',
    };
    const req2 = createMockRequest('http://localhost:3001/api/compliance', {
      method: 'POST',
      headers: {
        'x-carrier-webhook-secret': 'mcr-carrier-webhook-secret-2026',
      },
      body: webhookBody,
    });

    const res2 = await compliancePost(req2);
    const body2 = await res2.json();

    const p2Req = `POST /api/compliance (x-carrier-webhook-secret: mcr-carrier-webhook-secret-2026, targetStatus: sms_live)`;
    const p2Res = `Status: ${res2.status}, Body: ${JSON.stringify(body2)}`;
    console.log(`Request Sent:     ${p2Req}`);
    console.log(`Response Got:     ${p2Res}`);

    // Defect reproduction check:
    // Buggy behavior allowed anonymous plaintext secret to set sms_live across tenants with 200 OK
    const p2Reproduced = res2.status === 200 && body2.compliance?.status === 'sms_live';
    if (p2Reproduced) {
      console.log('RED: forged carrier-webhook header — REPRODUCED (Anonymous caller altered tenant status)\n');
    } else {
      console.log(`RED: forged carrier-webhook header — BLOCKED (Status ${res2.status}: ${body2.error})\n`);
    }
    results.push({
      task: 'Task 16',
      name: 'forged carrier-webhook header',
      reproduced: p2Reproduced,
      requestSummary: p2Req,
      responseSummary: p2Res,
      detail: p2Reproduced ? 'Defect reproduced' : 'Blocked by fail-closed signature requirement',
    });

    // ------------------------------------------------------------------------
    // PROBE 3: Task 17 — Seed Data Satisfies Carrier Launch Gate
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 3/7] Task 17: Seed Data Satisfies Carrier Launch Gate ---');
    const gateReport = evaluateLaunchGates();
    const carrierGate = gateReport.gates.find((g) => g.id === 'a2p_10dlc_carrier_verified');

    const p3Req = `evaluateLaunchGates() on committed seed database (checking gate: a2p_10dlc_carrier_verified)`;
    const p3Res = `Status: ${carrierGate?.status}, StatusReason: "${carrierGate?.statusReason}"`;
    console.log(`Request Sent:     ${p3Req}`);
    console.log(`Response Got:     ${p3Res}`);

    // Defect reproduction check:
    // Buggy behavior passed the gate because acc-coolbreeze-hvac did not contain substring "demo"
    const p3Reproduced = carrierGate?.status === 'passed';
    if (p3Reproduced) {
      console.log('RED: seed data satisfies carrier launch gate — REPRODUCED (Seed data falsely passed carrier gate)\n');
    } else {
      console.log(`RED: seed data satisfies carrier launch gate — BLOCKED (Gate status is '${carrierGate?.status}')\n`);
    }
    results.push({
      task: 'Task 17',
      name: 'seed data satisfies carrier launch gate',
      reproduced: p3Reproduced,
      requestSummary: p3Req,
      responseSummary: p3Res,
      detail: p3Reproduced ? 'Defect reproduced' : 'Blocked by is_demo flag and provenance check',
    });

    // ------------------------------------------------------------------------
    // PROBE 4: Task 18 — Static Prerendered Compliance Claim Page
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 4/7] Task 18: Static Prerendered Compliance Claim Page ---');
    const compPagePath = path.join(process.cwd(), 'src', 'app', 'compliance', 'page.tsx');
    const compSource = fs.readFileSync(compPagePath, 'utf-8');

    const p4Req = `Check src/app/compliance/page.tsx dynamic export & prerender config`;
    const hasForceDynamic = compSource.includes("export const dynamic = 'force-dynamic'");
    const p4Res = `Exports force-dynamic: ${hasForceDynamic}`;
    console.log(`Request Sent:     ${p4Req}`);
    console.log(`Response Got:     ${p4Res}`);

    // Defect reproduction check:
    // Buggy behavior statically prerendered compliance page without dynamic = 'force-dynamic'
    const p4Reproduced = !hasForceDynamic;
    if (p4Reproduced) {
      console.log('RED: static claim page — REPRODUCED (Page missing export const dynamic = force-dynamic)\n');
    } else {
      console.log(`RED: static claim page — BLOCKED (Page exports force-dynamic and re-derives per request)\n`);
    }
    results.push({
      task: 'Task 18',
      name: 'static claim page',
      reproduced: p4Reproduced,
      requestSummary: p4Req,
      responseSummary: p4Res,
      detail: p4Reproduced ? 'Defect reproduced' : 'Blocked by force-dynamic per-request derivation',
    });

    // ------------------------------------------------------------------------
    // PROBE 5: Task 19 — Synthesized Live Identifiers
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 5/7] Task 19: Synthesized Live Telecom Identifiers ---');
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

    // Defect reproduction check:
    // Buggy behavior synthesized BN_LIVE_${Date.now()} without calling carrier
    const p5Reproduced = Boolean(p5ResObj && p5ResObj.brandSid && p5ResObj.brandSid.startsWith('BN_LIVE_'));
    if (p5Reproduced) {
      console.log('RED: synthesized live identifiers — REPRODUCED (Fabricated BN_LIVE_ identifier returned)\n');
    } else {
      console.log(`RED: synthesized live identifiers — BLOCKED (Client returned failure without synthesized ID)\n`);
    }
    results.push({
      task: 'Task 19',
      name: 'synthesized live identifiers',
      reproduced: p5Reproduced,
      requestSummary: p5Req,
      responseSummary: p5Res,
      detail: p5Reproduced ? 'Defect reproduced' : 'Live path refuses to synthesize identifiers',
    });

    // ------------------------------------------------------------------------
    // PROBE 6: Task 20 — Simulator Payload Equality
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 6/7] Task 20: Simulator Alters Customer Paid Metrics ---');
    const fixture = tracker.createAccount('Probe Sim Corp', 'plumbing', '+12175556633');
    const fixtureId = fixture.account.id;

    const metricsBefore = computeMetrics(fixtureId);
    const dailyBefore = generateDailySummary(fixtureId);
    const weeklyBefore = generateWeeklyReport(fixtureId);

    // Run simulated inbound call
    await TwilioService.handleInboundCall({
      CallSid: 'CA_SIM_PROBE_' + Date.now(),
      From: '+12175554411',
      To: '+12175556633',
    });

    const metricsAfter = computeMetrics(fixtureId);
    const dailyAfter = generateDailySummary(fixtureId);
    const weeklyAfter = generateWeeklyReport(fixtureId);

    // Clean up immediately
    tracker.cleanup();

    const p6Req = `TwilioService.handleInboundCall (simulated CA_SIM_ call) -> compare metrics & prose reports before vs after`;
    const deltaCalls = metricsAfter.missedCallsCount - metricsBefore.missedCallsCount;
    const deltaRev = metricsAfter.confirmedRevenue - metricsBefore.confirmedRevenue;
    const proseIdentical =
      dailyBefore.summaryText === dailyAfter.summaryText &&
      weeklyBefore.summaryText === weeklyAfter.summaryText;

    const p6Res = `Calls delta: ${deltaCalls}, Revenue delta: ${deltaRev}, Prose identical: ${proseIdentical}`;
    console.log(`Request Sent:     ${p6Req}`);
    console.log(`Response Got:     ${p6Res}`);

    // Defect reproduction check:
    // If defect existed, simulated call would alter missedCallsCount, confirmedRevenue, or prose
    const p6Reproduced = deltaCalls > 0 || deltaRev > 0 || !proseIdentical;
    if (p6Reproduced) {
      console.log('RED: simulator alters customer metrics — REPRODUCED (Simulated call polluted paid metrics)\n');
    } else {
      console.log(`RED: simulator alters customer metrics — BLOCKED (Paid metrics strictly invariant, 0 delta)\n`);
    }
    results.push({
      task: 'Task 20',
      name: 'simulator alters customer metrics',
      reproduced: p6Reproduced,
      requestSummary: p6Req,
      responseSummary: p6Res,
      detail: p6Reproduced ? 'Defect reproduced' : 'Simulated records excluded from paid metrics and prose',
    });

    // ------------------------------------------------------------------------
    // PROBE 7: Task 21b — Spoofed X-Forwarded-For Evades Rate Limiter
    // ------------------------------------------------------------------------
    console.log('--- [PROBE 7/7] Task 21b: Spoofed X-Forwarded-For Evades Rate Limiter ---');
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

    const p7Req = `10 failed logins with rotating X-Forwarded-For headers from untrusted connection`;
    const p7Res = `Throttled at attempt: ${throttledAttempt || 'NONE (bypassed)'}`;
    console.log(`Request Sent:     ${p7Req}`);
    console.log(`Response Got:     ${p7Res}`);

    // Defect reproduction check:
    // If defect existed, rotating XFF would never throttle (throttledAttempt === 0)
    const p7Reproduced = throttledAttempt === 0;
    if (p7Reproduced) {
      console.log('RED: spoofed XFF evades rate limiter — REPRODUCED (Rate limiter defeated by rotating header)\n');
    } else {
      console.log(`RED: spoofed XFF evades rate limiter — BLOCKED (Throttled at attempt ${throttledAttempt} with 429)\n`);
    }
    results.push({
      task: 'Task 21b',
      name: 'spoofed XFF evades rate limiter',
      reproduced: p7Reproduced,
      requestSummary: p7Req,
      responseSummary: p7Res,
      detail: p7Reproduced ? 'Defect reproduced' : 'Untrusted XFF rejected, fallback socket IP throttled',
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
    console.error('❌ [Probe Red Hygiene Violation] Database tables modified:', { baselineCounts, postCounts });
  }

  // ------------------------------------------------------------------------
  // SUMMARY
  // ------------------------------------------------------------------------
  const total = results.length;
  const reproducedCount = results.filter((r) => r.reproduced).length;
  const blockedCount = total - reproducedCount;

  console.log('======================================================================');
  console.log('   PROBE:RED SUMMARY');
  console.log(`   Total probes:             ${total}`);
  console.log(`   Defects reproduced:       ${reproducedCount}`);
  console.log(`   Defects blocked by fixes: ${blockedCount}`);
  console.log('======================================================================');

  if (reproducedCount === 0) {
    console.log('\n❌ [probe:red FAILED AS EXPECTED]');
    console.log('   0 of 7 defects could be reproduced against the fixed build.');
    console.log('   Every defect in the round 2 audit was blocked by active security and honesty controls.');
    console.log('   (Exiting with code 1 as specified for probe:red on fixed build)\n');
    process.exit(1);
  } else {
    console.log(`\n⚠️ [probe:red FOUND DEFECTS] ${reproducedCount} defects reproduced.`);
    process.exit(0);
  }
}

runRedProbes().catch((err) => {
  console.error('Unhandled probe:red error:', err);
  process.exit(1);
});
