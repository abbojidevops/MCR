import { createSessionToken } from '../src/lib/session';
import { db } from '../src/db/repository';
import { TwilioService } from '../src/lib/telecom/twilio-service';
import assert from 'assert';

async function main() {
  console.log('====================================================');
  console.log('MCR ROUND 2 — RIGOROUS VERIFICATION AGAINST LIVE APP');
  console.log('====================================================\n');

  const BASE_URL = 'http://localhost:3001';

  // --------------------------------------------------------------------------
  // 1. PUBLIC LANDING PAGE AUDIT
  // --------------------------------------------------------------------------
  console.log('1. Checking Public Landing Page (/) ...');
  const homeRes = await fetch(`${BASE_URL}/`);
  assert.equal(homeRes.status, 200, 'Home page must return 200');
  const homeHtml = await homeRes.text();

  // No Dave Miller
  assert.ok(!homeHtml.includes('Dave Miller'), 'Dave Miller must NOT appear on public landing page');
  assert.ok(!homeHtml.includes('Verified Pilot Case Study'), 'Fake Verified Pilot Case Study heading must NOT appear');
  assert.ok(!homeHtml.includes('That single job paid for MCR for the entire year'), 'False ROI claim must NOT appear');
  assert.ok(!homeHtml.includes('(217) 555-0190'), 'Fictional 555-0190 test call prompt must NOT appear in hero');
  assert.ok(!homeHtml.includes('1209 Orange St'), 'Delaware CT Corp address must NOT appear');
  assert.ok(!homeHtml.includes('(888) 627-7326'), 'Unanswered 888 number must NOT appear');
  assert.ok(!homeHtml.includes('MCR-TRADE-REC-8841'), 'Fabricated TCR campaign ID must NOT appear');

  // Exact placeholder presence
  assert.ok(homeHtml.includes('Pilot results — coming soon'), 'Pilot placeholder heading must appear');
  assert.ok(
    homeHtml.includes('running our first pilots now') && homeHtml.includes('including the ones that look bad'),
    'Exact pilot placeholder text must appear'
  );

  // Honest 10DLC timeline
  assert.ok(homeHtml.includes('Brand registration takes minutes to 3 days'), 'Honest brand registration timeline must appear');
  assert.ok(homeHtml.includes('runs 3 days to 4 weeks'), 'Honest campaign approval timeline (3 days to 4 weeks) must appear');
  assert.ok(homeHtml.includes('$15 non-refundable vetting fee'), '$15 vetting fee must appear');
  console.log('   ✓ Public page is free of fabrication and displays honest placeholders and timelines.\n');

  // --------------------------------------------------------------------------
  // 2. ADMIN ROUTE LOCKDOWN AUDIT
  // --------------------------------------------------------------------------
  console.log('2. Checking /admin/* Route Lockdown (Unauthenticated) ...');
  const adminRoutes = [
    '/admin',
    '/admin/launch-gate',
    '/admin/risks',
    '/admin/concierge',
    '/admin/carrier-matrix',
  ];

  for (const route of adminRoutes) {
    const res = await fetch(`${BASE_URL}${route}`);
    assert.equal(res.status, 401, `${route} without cookie must return 401 Unauthorized`);
    console.log(`   ✓ ${route} -> 401 Unauthorized`);
  }

  // Admin access with signed admin session cookie
  const adminToken = createSessionToken({ role: 'admin', accountId: 'acc-admin' });
  const adminCookieHeader = `mcr_session=${adminToken}`;

  const authedAdminRes = await fetch(`${BASE_URL}/admin`, {
    headers: { Cookie: adminCookieHeader },
  });
  assert.equal(authedAdminRes.status, 200, '/admin with admin cookie must return 200');
  const authedAdminHtml = await authedAdminRes.text();

  assert.ok(!authedAdminHtml.includes('./data/mcr_db.json'), 'Filesystem path ./data/mcr_db.json must NOT appear');
  assert.ok(!authedAdminHtml.includes('99.98%'), 'Fabricated 99.98% telecom health must NOT appear');
  assert.ok(
    authedAdminHtml.includes('$<!-- -->0') || authedAdminHtml.includes('$0'),
    'MRR must compute to $0 for 0 active paying tenants'
  );
  assert.ok(authedAdminHtml.includes('not connected'), 'Unconnected telecom must render not connected');
  console.log('   ✓ /admin requires admin authentication, computes $0 MRR, and hides filesystem paths.\n');

  // --------------------------------------------------------------------------
  // 3. LAUNCH GATE LIVE STATE CHECK
  // --------------------------------------------------------------------------
  console.log('3. Checking /admin/launch-gate Live State ...');
  const gateRes = await fetch(`${BASE_URL}/admin/launch-gate`, {
    headers: { Cookie: adminCookieHeader },
  });
  assert.equal(gateRes.status, 200, '/admin/launch-gate with admin cookie must return 200');
  const gateHtml = await gateRes.text();

  assert.ok(!gateHtml.includes('LAUNCH APPROVED'), 'Launch gate must NOT render LAUNCH APPROVED when gates are pending');
  assert.ok(gateHtml.includes('LAUNCH BLOCKED'), 'Launch gate must render LAUNCH BLOCKED');
  assert.match(gateHtml, /3.*of.*16.*Gates Cleared/, 'Launch gate must compute approximately 3 of 16 passed');
  assert.ok(
    gateHtml.includes('This gate reflects system state only. It does not reflect legal review, which is a separate outstanding item.'),
    'Mandatory legal disclaimer must be present at top of launch gate'
  );
  console.log('   ✓ /admin/launch-gate computed 3 of 16 passed, blocked launch approval, and included disclaimer.\n');

  // --------------------------------------------------------------------------
  // 4. RISKS & ARCHITECTURE DECISIONS
  // --------------------------------------------------------------------------
  console.log('4. Checking /admin/risks Governance Sections ...');
  const risksRes = await fetch(`${BASE_URL}/admin/risks`, {
    headers: { Cookie: adminCookieHeader },
  });
  assert.equal(risksRes.status, 200);
  const risksHtml = await risksRes.text();

  assert.ok(risksHtml.includes('Open Legal Question: After-Hours SMS Policy'), 'After-hours legal question must appear');
  assert.ok(risksHtml.includes('Architecture Decision Record: Shared Pre-Registered Fallback Number'), 'Shared fallback ADR must appear');
  assert.ok(risksHtml.includes('Shared Fate Risk'), 'Shared fate risk analysis must appear');
  assert.ok(risksHtml.includes('Throughput Ceiling'), 'Throughput ceiling analysis must appear');
  assert.ok(risksHtml.includes('Suppression Migration'), 'Suppression migration analysis must appear');
  console.log('   ✓ /admin/risks contains after-hours legal question and shared fallback ADR.\n');

  // --------------------------------------------------------------------------
  // 5. CUSTOMER DASHBOARD COMPLIANCE WIDGET & NAVIGATION
  // --------------------------------------------------------------------------
  console.log('5. Checking /dashboard Setup Widget & Navigation ...');
  const dashRes = await fetch(`${BASE_URL}/dashboard`);
  assert.equal(dashRes.status, 200);
  const dashHtml = await dashRes.text();

  assert.ok(!dashHtml.includes('✓ 10DLC Verified'), 'Setup widget must NOT render false positive "✓ 10DLC Verified"');
  assert.ok(!dashHtml.includes('href="/admin"'), 'Customer dashboard must NOT contain link to /admin');
  console.log('   ✓ Customer dashboard has no Admin link and does not show false positive 10DLC verified.\n');

  // --------------------------------------------------------------------------
  // 6. AFTER-HOURS IMMEDIATE OWNER ALERT PRODUCT TEST
  // --------------------------------------------------------------------------
  console.log('6. Testing After-Hours Missed Call Engine ...');
  const lateNightCaller = `+1217555${Math.floor(1000 + Math.random() * 9000)}`;
  const callResult = await TwilioService.handleInboundCall({
    CallSid: `CA_LATE_NIGHT_${Date.now()}`,
    From: lateNightCaller,
    To: '+12175550190',
    CallStatus: 'no-answer',
    referenceDate: new Date('2026-10-01T03:00:00Z'), // 11:00 PM EDT (Outside quiet hours)
  });

  assert.equal(callResult.textBackTriggered, false, 'Consumer text-back must NOT trigger late at night');
  assert.match(callResult.reason, /Quiet hours enforced/i);

  // Check that owner notification was created immediately
  const notifs = db.getNotifications('acc-apex-plumbing');
  const emergencyNotif = notifs.find(
    (n) => n.metadata?.from === lateNightCaller && n.metadata?.immediateOwnerAlert === true
  );
  assert.ok(emergencyNotif, 'Owner must receive immediate emergency lead notification even during quiet hours');
  assert.equal(emergencyNotif?.metadata?.oneTapCallUrl, `tel:${lateNightCaller}`, 'Owner alert must have one-tap callback url');
  console.log('   ✓ Late-night call queued consumer SMS and immediately alerted owner with one-tap link.\n');

  console.log('====================================================');
  console.log('ALL ROUND 2 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  console.log('====================================================');
}

main().catch((err) => {
  console.error('❌ Verification failed:', err);
  process.exit(1);
});
