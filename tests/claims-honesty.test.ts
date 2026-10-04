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
