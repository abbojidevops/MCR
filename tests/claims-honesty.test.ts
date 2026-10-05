(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'fs';
import path from 'path';

import {
  getDerivedComplianceClaim,
  validateClaimHonesty,
  STANDARD_UNREGISTERED_COPY,
  FORBIDDEN_UNREGISTERED_WORDS,
} from '@/lib/marketing-claims';
import { getSystemCarrierLiveStatus } from '@/lib/marketing-claims-server';
import { checkQuietHours } from '@/lib/quiet-hours';
import { STOP_KEYWORDS, isStopKeyword } from '@/lib/compliance-machine';

test('MKT-1: Derived Unregistered Copy Matches Mandated Text Exactly', () => {
  const claim = getDerivedComplianceClaim(false);

  assert.equal(claim.isLive, false);
  assert.equal(
    claim.topBannerText,
    '10DLC registration support — brand and campaign submitted through The Campaign Registry as part of onboarding; texting activates when your campaign is approved. Voice alerts work immediately.'
  );
  assert.equal(claim.heroBadgeTitle, '10DLC Registration Support');
  assert.equal(claim.compliancePageBadge, '10DLC Registration Support in Onboarding');
  assert.equal(claim.compliancePageStatusText, STANDARD_UNREGISTERED_COPY);
});

test('MKT-2: Forbidden Words ("registered", "compliant", "certified") NEVER Appear in Unregistered Claim', () => {
  const claim = getDerivedComplianceClaim(false);

  const fieldsToCheck = [
    claim.topBannerText,
    claim.heroBadgeTitle,
    claim.heroBadgeSubtitle,
    claim.compliancePageBadge,
    claim.compliancePageStatusText,
  ];

  for (const field of fieldsToCheck) {
    for (const forbidden of FORBIDDEN_UNREGISTERED_WORDS) {
      const regex = new RegExp(`\\b${forbidden}\\b`, 'i');
      assert.equal(
        regex.test(field),
        false,
        `Field "${field}" must not contain forbidden word "${forbidden}" while unregistered`
      );
    }
    const valResult = validateClaimHonesty(field, false);
    assert.equal(valResult.valid, true, `Field "${field}" failed validateClaimHonesty: ${valResult.violation}`);
  }
});

test('MKT-3: Validator Rejection — validateClaimHonesty Catches Forbidden Words in Unregistered Claims', () => {
  const badClaim1 = 'A2P 10DLC registered with quiet hours protection';
  const badClaim2 = 'TCPA & 10DLC Compliant software';
  const badClaim3 = 'Carrier certified network deliverability';

  assert.equal(validateClaimHonesty(badClaim1, false).valid, false);
  assert.equal(validateClaimHonesty(badClaim2, false).valid, false);
  assert.equal(validateClaimHonesty(badClaim3, false).valid, false);

  // When live, these claims become valid
  assert.equal(validateClaimHonesty(badClaim1, true).valid, true);
  assert.equal(validateClaimHonesty(badClaim2, true).valid, true);
  assert.equal(validateClaimHonesty(badClaim3, true).valid, true);
});

test('MKT-4: Live System Status Derivation — Accurately Reflects System Carrier Status', () => {
  const isLive = getSystemCarrierLiveStatus();
  // In demo / initial test state, no non-demo accounts have carrier_webhook sms_live
  assert.equal(typeof isLive, 'boolean');

  const liveClaim = getDerivedComplianceClaim(true);
  assert.equal(liveClaim.isLive, true);
  assert.ok(liveClaim.heroBadgeTitle.includes('Compliant') || liveClaim.heroBadgeTitle.includes('Registered'));
});

test('MKT-5: Source-Level Regression Guard — Landing & Compliance Pages Have No Hardcoded Untruthful Badges', () => {
  const landingPath = path.join(process.cwd(), 'src/app/page.tsx');
  const compliancePath = path.join(process.cwd(), 'src/app/compliance/page.tsx');

  const landingSrc = fs.readFileSync(landingPath, 'utf-8');
  const complianceSrc = fs.readFileSync(compliancePath, 'utf-8');

  // Verify that typed static badges were removed from JSX
  assert.ok(
    !landingSrc.includes('<span>TCPA &amp; 10DLC Compliant</span>'),
    'src/app/page.tsx must not contain typed "TCPA & 10DLC Compliant" span'
  );
  assert.ok(
    !landingSrc.includes('A2P 10DLC registered with full TCPA quiet hours protection'),
    'src/app/page.tsx must not contain typed "A2P 10DLC registered" string'
  );
  assert.ok(
    !complianceSrc.includes('Carrier Verified Telecom Architecture'),
    'src/app/compliance/page.tsx must not contain hardcoded "Carrier Verified Telecom Architecture"'
  );

  // Verify that both pages import and use getDerivedComplianceClaim
  assert.ok(
    landingSrc.includes('getDerivedComplianceClaim'),
    'src/app/page.tsx must import and use getDerivedComplianceClaim'
  );
  assert.ok(
    complianceSrc.includes('getDerivedComplianceClaim'),
    'src/app/compliance/page.tsx must import and use getDerivedComplianceClaim'
  );
});

test('MKT-6: TCPA Quiet Hours Enforcement Linkage & Revocation Keywords Asserted', () => {
  // 1. Recipient-local quiet hours (08:00–21:00) verified in code
  const daytimeCheck = checkQuietHours('America/Chicago', 8, 21, new Date('2026-06-15T19:00:00Z')); // 2 PM CDT
  assert.equal(daytimeCheck.isWithinHours, true, '2:00 PM must be within quiet hours window');

  const lateNightCheck = checkQuietHours('America/Chicago', 8, 21, new Date('2026-06-16T04:00:00Z')); // 11 PM CDT
  assert.equal(lateNightCheck.isWithinHours, false, '11:00 PM must be outside quiet hours window');

  // 2. Minimum of seven revocation keywords supported
  const requiredKeywords = ['STOP', 'STOPALL', 'QUIT', 'END', 'REVOKE', 'OPT OUT', 'CANCEL', 'UNSUBSCRIBE'];
  for (const kw of requiredKeywords) {
    assert.equal(isStopKeyword(kw), true, `Keyword "${kw}" must be recognized as STOP keyword`);
  }
  assert.ok(STOP_KEYWORDS.size >= 7, 'Must support at least 7 revocation keywords');
});

test('MKT-7 (T18): Claim Page Exports dynamic = "force-dynamic" and revalidate = 0', async () => {
  const compliancePath = path.join(process.cwd(), 'src/app/compliance/page.tsx');
  const complianceSrc = fs.readFileSync(compliancePath, 'utf-8');

  // Source-level assertions
  assert.ok(
    complianceSrc.includes("export const dynamic = 'force-dynamic'"),
    'src/app/compliance/page.tsx must export dynamic = "force-dynamic"'
  );
  assert.ok(
    complianceSrc.includes('export const revalidate = 0'),
    'src/app/compliance/page.tsx must export revalidate = 0'
  );

  // Runtime module exports assertions
  const complianceModule = await import('@/app/compliance/page');
  assert.equal(complianceModule.dynamic, 'force-dynamic', 'Module export dynamic must be "force-dynamic"');
  assert.equal(complianceModule.revalidate, 0, 'Module export revalidate must be 0');
});

test('MKT-8 (T18): In-Process Dynamic Re-derivation — Unregistered -> Live -> Unregistered Without Rebuild', async () => {
  const { db } = await import('@/db/repository');
  const { default: CompliancePage } = await import('@/app/compliance/page');

  const baselineAccounts = db.getAllAccounts();
  assert.equal(baselineAccounts.length, 2, 'Must have exactly 2 accounts at baseline');

  // Helper to extract all text content from React component render tree
  function extractNodeText(node: any): string {
    if (!node) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractNodeText).join(' ');
    if (node.props && node.props.children) {
      return extractNodeText(node.props.children);
    }
    return '';
  }

  // 1. Initial State: Unregistered copy rendered
  const initialElement = CompliancePage();
  const initialText = extractNodeText(initialElement);
  assert.ok(
    initialText.includes('10DLC Registration Support in Onboarding'),
    'Initial render must contain unregistered badge'
  );
  assert.ok(
    !initialText.includes('Carrier Verified Telecom Architecture'),
    'Initial render must NOT contain live carrier badge'
  );

  // 2. Flip underlying database record to verified live state
  const originalComp = { ...db.getCompliance('acc-coolbreeze-hvac')! };
  assert.ok(originalComp, 'Target account compliance record must exist');

  try {
    db.updateCompliance('acc-coolbreeze-hvac', {
      status: 'sms_live',
      carrier_source: 'carrier_api',
      brand_sid: 'BN0123456789abcdef0123456789abcdef',
      campaign_sid: 'CM0123456789abcdef0123456789abcdef',
      last_updated_by: 'carrier_webhook',
    });

    // 3. Second Render in same process without rebuild: Live copy rendered
    const liveElement = CompliancePage();
    const liveText = extractNodeText(liveElement);
    assert.ok(
      liveText.includes('Carrier Verified Telecom Architecture'),
      'Rendered copy must dynamically flip to live badge without rebuild'
    );
    assert.ok(
      !liveText.includes('10DLC Registration Support in Onboarding'),
      'Rendered copy must not contain unregistered badge when live'
    );
  } finally {
    // 4. Flip back to original state
    db.updateCompliance('acc-coolbreeze-hvac', {
      status: originalComp.status,
      carrier_source: originalComp.carrier_source,
      brand_sid: originalComp.brand_sid,
      campaign_sid: originalComp.campaign_sid,
      last_updated_by: originalComp.last_updated_by,
    });
  }

  // 5. Third Render in same process: Unregistered copy restored
  const restoredElement = CompliancePage();
  const restoredText = extractNodeText(restoredElement);
  assert.ok(
    restoredText.includes('10DLC Registration Support in Onboarding'),
    'Rendered copy must dynamically return to unregistered badge'
  );
  assert.ok(
    !restoredText.includes('Carrier Verified Telecom Architecture'),
    'Rendered copy must no longer contain live badge'
  );

  // Hygiene invariance check
  assert.equal(db.getAllAccounts().length, 2, 'Account count invariant 2 -> 2 preserved');
});

test('MKT-9 (T18): Launch Gate and System Carrier Live Status Use Identical Predicate and Never Disagree', async () => {
  const { db } = await import('@/db/repository');
  const { evaluateLaunchGates } = await import('@/lib/launch-gate');
  const { getSystemCarrierLiveStatus } = await import('@/lib/marketing-claims-server');

  // Baseline
  const baselineLive = getSystemCarrierLiveStatus();
  const baselineGate = evaluateLaunchGates().gates.find((g) => g.id === 'a2p_10dlc_carrier_verified');
  assert.equal(baselineLive, false);
  assert.equal(baselineGate?.status, 'failed');

  // With verified record
  const originalComp = { ...db.getCompliance('acc-coolbreeze-hvac')! };
  try {
    db.updateCompliance('acc-coolbreeze-hvac', {
      status: 'sms_live',
      carrier_source: 'carrier_api',
      brand_sid: 'BN0123456789abcdef0123456789abcdef',
      campaign_sid: 'CM0123456789abcdef0123456789abcdef',
      last_updated_by: 'carrier_webhook',
    });

    const activeLive = getSystemCarrierLiveStatus();
    const activeGate = evaluateLaunchGates().gates.find((g) => g.id === 'a2p_10dlc_carrier_verified');
    assert.equal(activeLive, true, 'getSystemCarrierLiveStatus must return true');
    assert.equal(activeGate?.status, 'passed', 'Gate must pass when carrier verified');
  } finally {
    db.updateCompliance('acc-coolbreeze-hvac', {
      status: originalComp.status,
      carrier_source: originalComp.carrier_source,
      brand_sid: originalComp.brand_sid,
      campaign_sid: originalComp.campaign_sid,
      last_updated_by: originalComp.last_updated_by,
    });
  }

  // Restored
  const restoredLive = getSystemCarrierLiveStatus();
  const restoredGate = evaluateLaunchGates().gates.find((g) => g.id === 'a2p_10dlc_carrier_verified');
  assert.equal(restoredLive, false);
  assert.equal(restoredGate?.status, 'failed');
});

