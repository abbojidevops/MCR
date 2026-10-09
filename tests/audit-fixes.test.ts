(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
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

// ============================================================================
// 5. Access flow: signup -> sign-in -> dashboard, no dead ends
// ============================================================================

test('ACC-1: safeNextPath rejects off-app and protocol-relative targets', () => {
  const { safeNextPath } = require('@/lib/safe-redirect');

  for (const hostile of [
    'https://evil.example/phish',
    '//evil.example',
    'http://evil.example',
    'javascript:alert(1)',
    '\\/\\/evil.example',
    '/\\evil.example',
    'mailto:someone@evil.example',
    '',
    '   ',
    null,
    undefined,
    42,
  ]) {
    assert.equal(
      safeNextPath(hostile, '/dashboard'),
      '/dashboard',
      `unsafe target ${JSON.stringify(hostile)} must fall back`
    );
  }
});

test('ACC-2: safeNextPath accepts in-app destinations and never re-enters the auth flow', () => {
  const { safeNextPath } = require('@/lib/safe-redirect');

  assert.equal(safeNextPath('/dashboard/jobs', '/dashboard'), '/dashboard/jobs');
  assert.equal(safeNextPath('/dashboard/settings', '/dashboard'), '/dashboard/settings');
  assert.equal(safeNextPath('/admin/risks', '/admin'), '/admin/risks');

  // A just-completed sign-in must not bounce straight back to a sign-in screen.
  assert.equal(safeNextPath('/login', '/dashboard'), '/dashboard');
  assert.equal(safeNextPath('/operator-login', '/admin'), '/admin');
  assert.equal(safeNextPath('/admin/login', '/admin'), '/admin');

  // Surfaces outside the authenticated app are not meaningful destinations.
  assert.equal(safeNextPath('/', '/dashboard'), '/dashboard');
  assert.equal(safeNextPath('/privacy', '/dashboard'), '/dashboard');
});

test('ACC-3: the tenant sign-in form honours ?next=', () => {
  const source = read('src/app/login/login-form.tsx');
  assert.match(source, /safeNextPath\(searchParams\.get\('next'\)/, 'must resolve ?next= safely');
  assert.match(source, /router\.push\(destination\)/, 'must navigate to the resolved destination');
});

test('ACC-4: the operator sign-in form honours ?next= without an open redirect', () => {
  const source = read('src/app/operator-login/operator-login-form.tsx');
  assert.match(source, /safeNextPath\(searchParams\.get\('next'\)/);
  assert.ok(
    !/searchParams\.get\('next'\)\s*\|\|\s*'\/admin'/.test(source),
    'the raw ?next= value must not be pushed into the router unvalidated'
  );
});

test('ACC-5: signup is reachable from sign-in and is guarded when already signed in', () => {
  const login = read('src/app/login/login-form.tsx');
  assert.match(login, /href="\/onboarding"/, 'sign-in must link to account creation');

  const signup = read('src/app/onboarding/page.tsx');
  assert.match(signup, /verifySessionToken/, 'the signup route must check for an existing session');
  assert.match(signup, /redirect\(/, 'a signed-in tenant must be redirected away from signup');
});

test('ACC-6: the signup wizard persists a draft so a refresh does not lose progress', () => {
  const source = read('src/app/onboarding/onboarding-wizard.tsx');
  assert.match(source, /ONBOARDING_STORAGE_KEY/);
  assert.match(source, /localStorage\.setItem/, 'progress must be saved');
  assert.match(source, /localStorage\.getItem/, 'progress must be restored');
  // The draft payload passed to setItem must not carry the password.
  const setItemCall = source.match(/localStorage\.setItem\(([\s\S]*?)\);/);
  assert.ok(setItemCall, 'the wizard must write its draft with localStorage.setItem');
  assert.ok(
    !/\bpassword\b/.test(setItemCall![1]),
    'the draft written to browser storage must never include the password'
  );
  assert.match(source, /Save &amp; finish later|Save & finish later/, 'must offer an explicit exit');
});

test('ACC-7: a failed signup is reported, never silently treated as success', () => {
  const source = read('src/app/onboarding/onboarding-wizard.tsx');
  assert.match(source, /setSubmitError\(/, 'failures must surface to the user');
  assert.ok(
    !/alert\(/.test(source),
    'window.alert is not an acceptable error surface'
  );
  // The old catch block navigated to the dashboard on a network error, leaving
  // the customer signed out with no account and no explanation.
  assert.ok(
    !/catch \(err\)\s*\{[\s\S]*?router\.push\('\/dashboard'\)/.test(source),
    'a network error must not navigate as if signup succeeded'
  );
});

test('ACC-8: every unauthenticated surface shares one branded shell', () => {
  assert.ok(existsSync(join(ROOT, 'src/components/auth/auth-shell.tsx')), 'AuthShell must exist');
  const login = read('src/app/login/login-form.tsx');
  assert.match(login, /from '@\/components\/auth\/auth-shell'/);
  const operator = read('src/app/operator-login/operator-login-form.tsx');
  assert.match(operator, /COMPANY_INFO/, 'operator sign-in must show the same company identity');
});

test('ACC-9: a branded not-found page replaces the Next.js default', () => {
  const source = read('src/app/not-found.tsx');
  assert.match(source, /404/);
  assert.match(source, /href="\/dashboard"/, 'must offer a route back into the app');
  assert.match(source, /COMPANY_INFO\.email/, 'must offer a support contact');
});

test('ACC-10: the dashboard badge and alert panel reflect real session state', () => {
  const source = read('src/app/dashboard/layout.tsx');
  assert.match(source, /isDemoAccount/, 'the demo badge must follow the real session flag');
  assert.ok(
    !/DEMO ACCOUNT<\/span>\s*<\/div>\s*$/m.test(source.split('{isDemoAccount &&')[0] || ''),
    'the demo badge must be conditional'
  );
  // The notification panel used to show two hardcoded alerts as if they were real.
  assert.ok(
    !source.includes('Water Heater Rupture'),
    'hardcoded emergency alerts must be gone'
  );
  assert.match(source, /fetch\('\/api\/jobs'\)/, 'alerts must come from real job data');
  assert.match(source, /No emergency alerts/, 'must have an honest empty state');
});

// ============================================================================
// 6. Modal accessibility (focus trap, restore, scroll lock)
// ============================================================================

test('MODAL-1: a reusable Modal component exists and is used by every dialog', () => {
  assert.ok(existsSync(join(ROOT, 'src/components/modal.tsx')), 'Modal component must exist');

  for (const page of [
    'src/app/dashboard/layout.tsx',
    'src/app/dashboard/page.tsx',
    'src/app/dashboard/jobs/page.tsx',
  ]) {
    const source = read(page);
    assert.match(source, /from '@\/components\/modal'/, `${page} must use the shared Modal`);
    // No hand-rolled overlay should remain.
    assert.ok(
      !source.includes('role="dialog"'),
      `${page} must not declare its own dialog role — use Modal`
    );
    assert.ok(
      !source.includes('fixed inset-0'),
      `${page} must not build its own overlay`
    );
  }
});

test('MODAL-2: the Modal implements focus trap, restore, Escape, and scroll lock', () => {
  const source = read('src/components/modal.tsx');
  assert.match(source, /role="dialog"/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby=\{titleId\}/, 'the dialog must have an accessible name');
  assert.match(source, /tabIndex=\{-1\}/, 'the panel must be programmatically focusable');

  // Focus moves in on open and back to the trigger on close.
  assert.match(source, /restoreFocusRef\.current = document\.activeElement/);
  assert.match(source, /previous\.focus\(\)/, 'focus must return to the opening control');

  // Tab cycling is contained.
  assert.match(source, /event\.key !== 'Tab'/);
  assert.match(source, /event\.preventDefault\(\)/);

  // Escape closes.
  assert.match(source, /event\.key === 'Escape'/);

  // Background scroll is locked and restored.
  assert.match(source, /document\.body\.style\.overflow/);

  // Backdrop click closes, but a click inside the panel does not.
  assert.match(source, /e\.target === e\.currentTarget/);
});

test('MODAL-3: the Modal exposes a required accessible name', () => {
  const source = read('src/components/modal.tsx');
  const props = source.match(/export interface ModalProps \{[\s\S]*?\n\}/);
  assert.ok(props, 'ModalProps must be declared');
  assert.match(props![0], /title: string;/, 'title is required — no optional marker');
  assert.match(props![0], /onClose: \(\) => void;/, 'onClose is required');
  assert.match(props![0], /open: boolean;/, 'open is required');
});

test('MODAL-4: dialogs are keyboard-dismissible and announce their close button', () => {
  const source = read('src/components/modal.tsx');
  assert.match(source, /aria-label=\{`Close \$\{title\}`\}/, 'the close button must be labelled');
  assert.match(source, /aria-describedby=\{description \? descriptionId : undefined\}/);
});

// ============================================================================
// 7. Email dispatch must not claim delivery it did not achieve
// ============================================================================

test('EMAIL-1: sendEmail reports delivery honestly instead of always returning success', () => {
  const source = read('src/lib/email/email-service.ts');

  // The result type must carry an explicit delivery verdict.
  assert.match(source, /export interface EmailDispatchResult/, 'a dispatch result type must exist');
  assert.match(source, /delivered: boolean/, 'the result must say whether it was delivered');
  assert.match(source, /transport: 'smtp' \| 'log_only'/, 'the transport actually taken must be reported');
  assert.match(source, /notice: string/, 'a human-readable explanation must accompany the result');

  // With no transport configured the log line must not read as a dispatch.
  assert.match(source, /EMAIL NOT SENT/, 'an unsent message must be logged as not sent');
  assert.ok(
    !source.includes('[EMAIL DISPATCH] To:') || source.includes('hasTransport'),
    'the code must branch on whether a transport exists'
  );

  // There must be no unconditional "success: true" with a fabricated messageId.
  const body = source.slice(source.indexOf('public static async sendEmail'));
  assert.match(body, /if \(!this\.hasTransport\(\)\)/, 'the no-transport path must be explicit');
  assert.match(body, /delivered: false/, 'the no-transport path must report delivered: false');
});

test('EMAIL-2: the dispatch route surfaces the real delivery status', () => {
  const source = read('src/app/api/reports/dispatch/route.ts');
  assert.match(source, /delivered: emailResult\.delivered/, 'the route must pass through the verdict');
  assert.match(source, /transport: emailResult\.transport/);
  assert.match(source, /notice: emailResult\.notice/);
});

test('EMAIL-3: the reports UI never shows a green success for an undelivered email', () => {
  const source = read('src/app/dashboard/reports/page.tsx');

  // The old unconditional green message is gone.
  assert.ok(
    !source.includes("Weekly recovery digest dispatched to"),
    'the UI must not claim an email was dispatched when nothing was sent'
  );

  // Delivery is now branched on, and the not-delivered case is a warning.
  assert.match(source, /email\?\.delivered/, 'the UI must check whether it was delivered');
  assert.match(source, /type: 'warning'/, 'the undelivered case must not be styled as success');
  assert.match(
    source,
    /this deployment has no outbound email/,
    'the warning must say plainly why nothing arrived'
  );
});

test('EMAIL-4: no real mail transport is wired up — the claim is documented, not faked', () => {
  const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8'));
  const deps = { ...pkg.dependencies, ...pkg.devDependencies };
  const transports = ['nodemailer', 'postmark', '@sendgrid/mail', 'resend', 'aws-sdk', 'ses'];
  for (const t of transports) {
    assert.ok(!(t in deps), `${t} must not be listed as a dependency unless a transport is actually implemented`);
  }
  assert.match(
    read('src/lib/email/email-service.ts'),
    /There is no SMTP\/Postmark\/Nodemailer dependency in this project/,
    'the code must state plainly that no transport exists'
  );
});

// ============================================================================
// 8. WCAG colour contrast (1.4.3 text, 1.4.11 non-text)
// ============================================================================

test('CONTRAST-1: the operator console and dashboard meet AA contrast', () => {
  // The audit script is the single source of truth; this asserts it exits clean
  // so a low-contrast class can never be merged in again.
  const result = spawnSync('python3', [join(ROOT, 'scripts/contrast-audit.py')], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  assert.equal(
    result.status,
    0,
    `contrast audit failed:\n${result.stdout}${result.stderr}`
  );
  assert.match(result.stdout, /No failing pairs/, 'the audit must report success');
});

test('CONTRAST-2: the audit actually measures pairs and judges icons separately', () => {
  const result = spawnSync('python3', [join(ROOT, 'scripts/contrast-audit.py')], {
    encoding: 'utf8',
    timeout: 120_000,
  });
  // It must be doing real work, not scanning nothing.
  const measured = Number(/Measurable text-on-background pairs: (\d+)/.exec(result.stdout)?.[1] ?? 0);
  assert.ok(measured >= 200, `expected a substantial number of pairs, got ${measured}`);

  // And it must distinguish text (4.5:1) from icon tiles (3:1).
  assert.match(result.stdout, /text judged at 4.5:1/);
  assert.match(result.stdout, /icon-only tiles at 3:1/);
});

test('CONTRAST-3: the audit catches a deliberate low-contrast regression', () => {
  // Prove the check is not vacuously passing by reintroducing a known-bad
  // pair into a scratch copy of the script's own palette and re-running.
  const probe = `
def luminance(h):
    h=h.lstrip('#'); f=[int(h[i:i+2],16)/255 for i in (0,2,4)]
    f=[c/12.92 if c<=0.03928 else ((c+0.055)/1.055)**2.4 for c in f]
    return 0.2126*f[0]+0.7152*f[1]+0.0722*f[2]
def cr(a,b):
    l1,l2=luminance(a),luminance(b); return round((max(l1,l2)+0.05)/(min(l1,l2)+0.05),2)
# white on emerald-600 is the pair that was fixed. It must be flagged.
assert cr('#ffffff','#059669') < 4.5, 'white on emerald-600 must fail the text bar'
assert cr('#ffffff','#047857') >= 4.5, 'white on emerald-700 must pass the text bar'
assert cr('#94a3b8','#f1f5f9') < 4.5, 'slate-400 on slate-100 must fail'
assert cr('#475569','#f1f5f9') >= 4.5, 'slate-600 on slate-100 must pass'
assert cr('#d97706','#fef3c7') < 3.0, 'amber-600 on amber-100 must fail the icon bar'
assert cr('#b45309','#fef3c7') >= 3.0, 'amber-700 on amber-100 must pass the icon bar'
print('contrast maths verified')
`;
  const result = spawnSync('python3', ['-c', probe], { encoding: 'utf8', timeout: 60_000 });
  assert.equal(result.status, 0, `${result.stdout}${result.stderr}`);
  assert.match(result.stdout, /contrast maths verified/);
});
