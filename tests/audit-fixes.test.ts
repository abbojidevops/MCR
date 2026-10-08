(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { db } from '@/db/repository';
import { createSessionToken } from '@/lib/session';
import { PATCH as settingsPatchHandler } from '@/app/api/settings/route';
import {
  TENANT_EDITABLE_PROFILE_FIELDS,
  PRIVILEGED_PROFILE_FIELDS,
  partitionSettingsUpdates,
  isTenantEditableProfileField,
} from '@/lib/settings-fields';
import {
  shouldExposeDemoCredentials,
  hasExplicitDemoFlag,
  hasStagingEnvironmentName,
  describeDemoModeDisclosure,
} from '@/lib/demo-mode';

const ROOT = process.cwd();

function read(relPath: string): string {
  const full = join(ROOT, relPath);
  assert.ok(existsSync(full), `expected source file to exist: ${relPath}`);
  return readFileSync(full, 'utf8');
}

function mockRequest(
  url: string,
  options: { method?: string; body?: any; cookieToken?: string } = {}
): NextRequest {
  const headers = new Headers();
  if (options.body) headers.set('content-type', 'application/json');
  if (options.cookieToken) headers.set('cookie', `mcr_session=${options.cookieToken}`);
  return new NextRequest(new URL(url, 'http://localhost:3001'), {
    method: options.method || 'GET',
    headers,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

// ============================================================================
// 1. Settings field allow-list (mass-assignment / privilege escalation)
// ============================================================================

test('SET-1: privileged profile fields are never tenant-editable', () => {
  for (const field of PRIVILEGED_PROFILE_FIELDS) {
    assert.equal(
      isTenantEditableProfileField(field),
      false,
      `${field} must NOT be tenant-editable`
    );
    const { permitted, rejected } = partitionSettingsUpdates({ [field]: 'attacker-value' });
    assert.deepEqual(permitted, {}, `${field} must be refused, not permitted`);
    assert.deepEqual(rejected, [field]);
  }
});

test('SET-2: partitionSettingsUpdates keeps allow-listed fields and reports the rest', () => {
  const { permitted, rejected } = partitionSettingsUpdates({
    business_name: 'Legit Plumbing Co',
    custom_emergency_keywords: ['sump pump'],
    account_id: 'acc-someone-else',
    is_demo: true,
    id: 'bp-forged',
  });

  assert.deepEqual(Object.keys(permitted).sort(), ['business_name', 'custom_emergency_keywords']);
  assert.deepEqual(rejected.sort(), ['account_id', 'id', 'is_demo']);
});

test('SET-3: partitionSettingsUpdates rejects non-object payloads', () => {
  for (const payload of [null, undefined, 'string', 42, true, [1, 2, 3]]) {
    const { permitted, rejected } = partitionSettingsUpdates(payload);
    assert.deepEqual(permitted, {});
    assert.deepEqual(rejected, []);
  }
});

test('SET-4: PATCH /api/settings refuses a mass-assignment attempt with 400 and mutates nothing', async () => {
  const accountId = 'acc-apex-plumbing';
  const token = createSessionToken({
    accountId,
    userId: 'usr-demo-owner',
    role: 'owner',
    isDemo: true,
  });

  const before = db.getBusinessProfile(accountId);
  assert.ok(before, 'seed profile must exist for the test tenant');
  const originalAccountId = before.account_id;
  const originalDemoFlag = before.is_demo;

  const req = mockRequest('http://localhost:3001/api/settings', {
    method: 'PATCH',
    cookieToken: token,
    body: {
      updates: {
        business_name: 'Should Not Be Written',
        account_id: 'acc-coolbreeze-hvac',
        is_demo: false,
        ein: '00-0000000',
        crm_webhook_secret: 'attacker-secret',
      },
    },
  });

  const res = await settingsPatchHandler(req);
  const data = await res.json();

  assert.equal(res.status, 400, 'mass assignment must be rejected with 400');
  assert.ok(Array.isArray(data.rejectedFields), 'response must enumerate rejected fields');
  for (const field of ['account_id', 'is_demo', 'ein']) {
    assert.ok(
      data.rejectedFields.includes(field),
      `${field} must appear in rejectedFields`
    );
  }

  const after = db.getBusinessProfile(accountId);
  assert.ok(after, 'profile must still exist');
  assert.equal(after.account_id, originalAccountId, 'account_id must be unchanged');
  assert.equal(after.is_demo, originalDemoFlag, 'is_demo must be unchanged');
  assert.notEqual(after.business_name, 'Should Not Be Written', 'no field may be written');
});

test('SET-5: PATCH /api/settings accepts an allow-listed field', async () => {
  const accountId = 'acc-apex-plumbing';
  const token = createSessionToken({
    accountId,
    userId: 'usr-demo-owner',
    role: 'owner',
    isDemo: true,
  });

  const original = db.getBusinessProfile(accountId);
  const req = mockRequest('http://localhost:3001/api/settings', {
    method: 'PATCH',
    cookieToken: token,
    body: { updates: { business_name: 'Allow-Listed Rename' } },
  });

  const res = await settingsPatchHandler(req);
  const data = await res.json();

  assert.equal(res.status, 200, 'allow-listed update must succeed');
  assert.equal(data.success, true);
  assert.equal(db.getBusinessProfile(accountId)?.business_name, 'Allow-Listed Rename');

  // Restore the seed value so later tests see the original fixture.
  if (original) db.updateBusinessProfile(accountId, { business_name: original.business_name });
});

test('SET-6: forwarding_configured stays writable for the carrier wizard', () => {
  assert.ok(
    TENANT_EDITABLE_PROFILE_FIELDS.includes('forwarding_configured'),
    'the forwarding page legitimately PATCHes forwarding_configured'
  );
});

// ============================================================================
// 2. Demo-mode credential gating
// ============================================================================

test('DEMO-1: production with no flag withholds demo credentials', () => {
  assert.equal(shouldExposeDemoCredentials({ NODE_ENV: 'production' }), false);
  assert.equal(hasExplicitDemoFlag({ NODE_ENV: 'production' }), false);
  assert.match(describeDemoModeDisclosure({ NODE_ENV: 'production' }), /withheld/);
});

test('DEMO-2: an explicit opt-in flag exposes credentials even in production', () => {
  for (const key of ['MCR_DEMO_MODE', 'DEMO_MODE']) {
    assert.equal(shouldExposeDemoCredentials({ NODE_ENV: 'production', [key]: 'true' }), true);
    assert.equal(hasExplicitDemoFlag({ NODE_ENV: 'production', [key]: 'true' }), true);
  }
});

test('DEMO-3: a named staging environment exposes credentials', () => {
  for (const key of ['MCR_ENVIRONMENT', 'APP_ENV', 'RAILWAY_ENVIRONMENT', 'VERCEL_ENV']) {
    assert.equal(shouldExposeDemoCredentials({ NODE_ENV: 'production', [key]: 'staging' }), true);
  }
  assert.equal(hasStagingEnvironmentName({ MCR_ENVIRONMENT: 'demo' }), true);
  assert.equal(hasStagingEnvironmentName({ MCR_ENVIRONMENT: 'production' }), false);
});

test('DEMO-4: local development exposes credentials', () => {
  assert.equal(shouldExposeDemoCredentials({ NODE_ENV: 'development' }), true);
  assert.equal(shouldExposeDemoCredentials({}), true);
});

test('DEMO-5: falsy flag values do not unlock demo credentials in production', () => {
  for (const value of ['false', '0', 'no', 'off', '', '  ']) {
    assert.equal(
      shouldExposeDemoCredentials({ NODE_ENV: 'production', MCR_DEMO_MODE: value }),
      false,
      `MCR_DEMO_MODE=${JSON.stringify(value)} must not unlock demo mode`
    );
  }
});

test('DEMO-6: the login page does not hardcode credentials', () => {
  const source = read('src/app/login/login-form.tsx');
  assert.ok(
    !/ApexDemo2026/i.test(source),
    'login form must not embed a literal demo password'
  );
  assert.ok(
    !/demo@apexplumbing\.com/i.test(source),
    'login form must not embed a literal demo email'
  );
  assert.ok(
    source.includes('credentials'),
    'login form should render a credentials block when the server supplies one'
  );
});

// ============================================================================
// 3. Operator console reachability (admin sign-in surface)
// ============================================================================

test('OPS-1: /admin/login is rewritten onto the public operator sign-in route', () => {
  const middleware = read('src/middleware.ts');
  assert.match(middleware, /\/admin\/login/);
  assert.match(middleware, /NextResponse\.rewrite/);
  assert.match(middleware, /operator-login/i);
});

test('OPS-2: anonymous HTML navigations to /admin redirect to the sign-in screen', () => {
  const middleware = read('src/middleware.ts');
  assert.match(middleware, /isDocumentNavigation/);
  assert.match(middleware, /searchParams\.set\('next'/);
  assert.match(middleware, /WWW-Authenticate/, 'API callers keep the 401 contract');
});

test('OPS-3: the operator sign-in page exists and posts to the admin login API', () => {
  const page = read('src/app/operator-login/operator-login-form.tsx');
  assert.match(page, /\/api\/admin\/login/);
  assert.match(page, /503/, 'must surface the unset-ADMIN_PASSWORD state');
  assert.match(page, /429/, 'must give rate-limit-specific copy');
  assert.match(page, /searchParams\.get\('next'\)/, 'must honour the ?next= redirect target');
});

test('OPS-4: every admin surface offers a sign-out affordance', () => {
  const shell = read('src/app/admin/admin-shell.tsx');
  assert.match(shell, /\/api\/auth\/logout/);
  assert.match(shell, /Sign Out/i);
});

// ============================================================================
// 4. Honesty regressions in the tenant dashboard
// ============================================================================

test('HON-1: settings page no longer renders non-persisted form controls', () => {
  const source = read('src/app/dashboard/settings/page.tsx');
  for (const dead of ['openTime', 'closeTime', 'collectAddress', 'collectPhotos']) {
    assert.ok(
      !new RegExp(`\\b${dead}\\b`).test(source),
      `${dead} had no backend consumer and must not appear in the settings page`
    );
  }
  assert.ok(!/100% Protected/.test(source), 'unearned compliance badge must be gone');
  assert.ok(
    !/A2P 10DLC Registration In Progress/.test(source),
    'hardcoded registration-status card must be gone'
  );
});

test('HON-2: settings page reads the real billing field names', () => {
  const source = read('src/app/dashboard/settings/page.tsx');
  assert.ok(source.includes('usage?.calls_count'), 'must read usage.calls_count');
  assert.ok(source.includes('currentPlan?.included_calls'), 'must read currentPlan.included_calls');
  assert.ok(
    !source.includes('calls_processed'),
    'calls_processed is not a field returned by /api/billing'
  );
  assert.ok(
    !source.includes('call_cap'),
    'call_cap is not a field returned by /api/billing'
  );
});

test('HON-3: every settings save handler reports failure to the user', () => {
  const source = read('src/app/dashboard/settings/page.tsx');
  const catchBlocks = source.match(/catch \(err[^)]*\) \{/g) || [];
  const errorReports = source.match(/setToastError\(/g) || [];
  assert.ok(
    errorReports.length >= catchBlocks.length,
    `every catch (${catchBlocks.length}) must set an error toast (${errorReports.length} found)`
  );
});

test('HON-4: jobs activity timeline is derived from recorded timestamps only', () => {
  const source = read('src/app/dashboard/jobs/page.tsx');
  for (const fabricated of [
    'Owner Notified',
    'Dispatched in <30 seconds',
    'Auto Text-Back: Dispatched',
  ]) {
    assert.ok(
      !source.includes(fabricated),
      `jobs timeline must not assert "${fabricated}" unconditionally`
    );
  }
  for (const ts of [
    'first_call_time',
    'text_back_time',
    'qualified_time',
    'contacted_time',
    'booked_time',
    'completed_time',
    'dead_time',
  ]) {
    assert.ok(source.includes(ts), `timeline should be derived from ${ts}`);
  }
});

test('HON-5: the missed-call dedupe window copy matches the implementation', () => {
  // The window is enforced inside db.recordCall().
  const repository = read('src/db/repository.ts');
  const match = repository.match(/twoHoursAgo\s*=\s*new Date\(Date\.now\(\)\s*-\s*(\d+)\s*\*\s*60\s*\*\s*60\s*\*\s*1000\)/);
  assert.ok(match, 'the dedupe window must be expressed as an explicit hour constant');
  const hours = Number(match![1]);

  for (const page of [
    'src/app/dashboard/missed-calls/page.tsx',
    'src/app/dashboard/page.tsx',
  ]) {
    const source = read(page);
    const copies = source.match(/last (\d+) hours?/gi) || [];
    for (const copy of copies) {
      const stated = Number(copy.match(/(\d+)/)![1]);
      assert.equal(
        stated,
        hours,
        `${page} says "${copy}" but DEDUPE_WINDOW_MS is ${hours} hour(s)`
      );
    }
  }
});

test('HON-6: forwarding status is labelled self-reported, not carrier-verified', () => {
  const source = read('src/app/dashboard/forwarding/page.tsx');
  assert.ok(
    source.includes('Self-Reported'),
    'the badge must say the status is self-reported'
  );
  assert.ok(
    !source.includes("? 'Live' : 'Unverified'"),
    'the old badge implied MCR had verified the carrier network'
  );
  assert.ok(
    !source.includes('Verification Call Succeeded'),
    'a simulated call cannot verify real carrier rollover'
  );
});

test('HON-7: the carrier matrix no longer presents fabricated benchmark results', () => {
  const source = read('src/app/admin/carrier-matrix/page.tsx');
  assert.ok(
    !/missedCallTimingMs\s*[:=]\s*\d/.test(source),
    'hardcoded per-carrier rollover timings were fabricated'
  );
  assert.ok(
    !source.includes('Live Validation'),
    'an always-passing validation button is not evidence'
  );
  assert.ok(source.includes('CARRIER_GUIDES'), 'the page should render the real carrier reference');
});

test('HON-8: the concierge page no longer fakes a dispatch action', () => {
  const source = read('src/app/admin/concierge/page.tsx');
  assert.ok(
    !source.includes('Dispatch Concierge SMS'),
    'the dispatch button mutated nothing'
  );
  assert.ok(source.includes('/api/admin/fleet'), 'it should render real fleet telemetry');
});

test('HON-9: billing UI never implies a live payment gateway when Stripe is off', () => {
  const route = read('src/app/api/billing/route.ts');
  assert.ok(route.includes('liveGateway'), 'GET /api/billing must disclose the gateway state');
  const page = read('src/app/dashboard/billing/page.tsx');
  assert.ok(
    page.includes('liveGateway'),
    'the billing page must consume the disclosed gateway state'
  );
});

test('HON-10: the risk register counts are derived, not hardcoded', () => {
  const source = read('src/app/admin/risks/page.tsx');
  assert.ok(
    !source.includes('100% Mitigations Architected'),
    'unearned mitigation claim must be removed'
  );
  assert.ok(source.includes('counts.total'), 'totals must be computed from the register');
  assert.ok(source.includes('counts.highImpact'), 'high/critical counts must be computed');
});
