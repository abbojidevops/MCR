(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';

// Domain and Auth modules
import { db } from '@/db/repository';
import {
  hashPassword,
  hashPasswordSync,
  verifyPassword,
  validatePasswordStrength,
} from '@/lib/auth/password';
import {
  createSessionToken,
  verifySessionToken,
  revokeSessionToken,
  SESSION_COOKIE_NAME,
} from '@/lib/session';
import {
  isLoginRateLimited,
  recordFailedLogin,
  resetLoginRateLimit,
  clearAllRateLimits,
} from '@/lib/auth/rate-limiter';
import { TENANT_SCOPED_API_ROUTES } from '@/lib/routes';
import { createFixtureTracker } from '@/lib/test-hygiene';

const fixtureTracker = createFixtureTracker();

// Import route handlers
import { POST as loginHandler } from '@/app/api/auth/login/route';
import { POST as logoutHandler } from '@/app/api/auth/logout/route';
import { POST as onboardingHandler } from '@/app/api/onboarding/route';

// Route handlers for enumerated tenant routes
import { GET as settingsGet } from '@/app/api/settings/route';
import { GET as billingGet } from '@/app/api/billing/route';
import { GET as jobsGet } from '@/app/api/jobs/route';
import { GET as jobsExportGet } from '@/app/api/jobs/export/route';
import { GET as conversationsGet } from '@/app/api/conversations/route';
import { GET as complianceGet } from '@/app/api/compliance/route';
import { GET as reportsGet } from '@/app/api/reports/route';
import { GET as dashboardGet } from '@/app/api/dashboard/route';
import { GET as dashboardStatsGet } from '@/app/api/dashboard/stats/route';
import { GET as callsGet } from '@/app/api/calls/route';
import { GET as setupStatusGet } from '@/app/api/setup-status/route';
import { GET as cannedRepliesGet } from '@/app/api/canned-replies/route';
import { GET as emailPreviewGet } from '@/app/api/email/preview/route';
import { GET as simulatorGet } from '@/app/api/simulator/route';
import { GET as integrationsWebhookGet } from '@/app/api/integrations/webhook/route';

// Helper to map route string to GET handler
const ROUTE_HANDLERS: Record<string, (req: NextRequest) => Promise<any>> = {
  '/api/settings': settingsGet,
  '/api/billing': billingGet,
  '/api/jobs': jobsGet,
  '/api/jobs/export': jobsExportGet,
  '/api/conversations': conversationsGet,
  '/api/compliance': complianceGet,
  '/api/reports': reportsGet,
  '/api/dashboard': dashboardGet,
  '/api/dashboard/stats': dashboardStatsGet,
  '/api/calls': callsGet,
  '/api/setup-status': setupStatusGet,
  '/api/canned-replies': cannedRepliesGet,
  '/api/email/preview': emailPreviewGet,
  '/api/simulator': simulatorGet,
  '/api/integrations/webhook': integrationsWebhookGet,
};

function createMockRequest(url: string, options: { method?: string; body?: any; cookie?: string; headers?: Record<string, string> } = {}) {
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

test('A1: Password Hashing & Verification (scrypt)', async () => {
  // 1. Minimum 12 character password enforcement
  assert.equal(validatePasswordStrength('').valid, false);
  assert.equal(validatePasswordStrength('short123').valid, false);
  assert.equal(validatePasswordStrength('12345678901').valid, false); // 11 chars
  assert.equal(validatePasswordStrength('123456789012').valid, true); // 12 chars

  // 2. Hash format verification: scrypt$N$r$p$salt$hash
  const pw = 'ApexSecurePass2026!';
  const hashed = await hashPassword(pw);
  const parts = hashed.split('$');
  assert.equal(parts[0], 'scrypt', 'Algorithm prefix must be scrypt');
  assert.equal(parts[1], '16384', 'N parameter must be 16384');
  assert.equal(parts[2], '8', 'r parameter must be 8');
  assert.equal(parts[3], '1', 'p parameter must be 1');
  assert.ok(parts[4].length >= 16, 'Salt must be present');
  assert.ok(parts[5].length >= 64, 'Derived hash must be present');

  // 3. Password verification passes for correct password
  const isValid = await verifyPassword(pw, hashed);
  assert.equal(isValid, true, 'Correct password must verify successfully');

  // 4. Password verification fails for wrong password
  const isWrong = await verifyPassword('WrongPassword123!', hashed);
  assert.equal(isWrong, false, 'Wrong password must be rejected');

  // 5. Per-user unique salt: hashing the same password twice produces different hashes
  const hashed2 = await hashPassword(pw);
  assert.notEqual(hashed, hashed2, 'Each hash must use a unique random salt');
});

test('A2: User Credentials Table Separation (Not On Accounts Row)', () => {
  const account = db.getAccount('acc-apex-plumbing');
  assert.ok(account, 'Apex account must exist');

  // Assert accounts table does NOT carry passwords
  assert.equal((account as any).password, undefined, 'Accounts table must not have password');
  assert.equal((account as any).password_hash, undefined, 'Accounts table must not have password_hash');
  assert.equal((account as any).salt, undefined, 'Accounts table must not have salt');

  // Assert credentials live in their own user_credentials store
  const cred = db.findCredentialByAccountId('acc-apex-plumbing');
  assert.ok(cred, 'User credential must exist in user_credentials table');
  assert.equal(cred.email, 'demo@apexplumbing.com');
  assert.equal(cred.algorithm, 'scrypt');
  assert.ok(cred.password_hash.startsWith('scrypt$16384$8$1$'));
});

test('A3: Session Token Signing, Verification & Server-Side Revocation', () => {
  const token = createSessionToken({
    accountId: 'acc-apex-plumbing',
    userId: 'usr-demo-owner',
    role: 'owner',
    isDemo: true,
  });

  // Valid token verifies cleanly
  const session = verifySessionToken(token);
  assert.ok(session, 'Valid token must verify');
  assert.equal(session.accountId, 'acc-apex-plumbing');

  // Tampered token fails
  const tampered = token.slice(0, -6) + 'xxxxxx';
  assert.equal(verifySessionToken(tampered), null, 'Tampered token must fail verification');

  // Server-side revocation invalidates the token
  revokeSessionToken(token);
  assert.equal(verifySessionToken(token), null, 'Revoked token must be rejected server-side');
});

test('A4: POST /api/auth/login Empty Password Returns 400', async () => {
  clearAllRateLimits();
  const req = createMockRequest('http://localhost:3001/api/auth/login', {
    method: 'POST',
    body: { email: 'demo@apexplumbing.com', password: '' },
  });

  const res = await loginHandler(req);
  assert.equal(res.status, 400, 'Empty password must answer 400 (not 401, not 500)');
  const body = await res.json();
  assert.match(body.error, /password is required/i);
});

test('A5: POST /api/auth/login Wrong Password Returns 401', async () => {
  clearAllRateLimits();
  const req = createMockRequest('http://localhost:3001/api/auth/login', {
    method: 'POST',
    body: { email: 'demo@apexplumbing.com', password: 'WrongPassword999!' },
  });

  const res = await loginHandler(req);
  assert.equal(res.status, 401, 'Wrong password must answer 401 (not 400, not 500)');
  const body = await res.json();
  assert.match(body.error, /invalid/i);
});

test('A6: Rate Limiting Throttles Brute Force Login Attempts (429)', async () => {
  clearAllRateLimits();
  const testEmail = 'bruteforce@test.com';
  const testIp = '192.168.1.100';

  // Perform 5 failed attempts
  for (let i = 0; i < 5; i++) {
    recordFailedLogin(testIp, testEmail);
  }

  // 6th attempt must be throttled
  const limitCheck = isLoginRateLimited(testIp, testEmail);
  assert.equal(limitCheck.limited, true, 'Rate limit must trigger after 5 failed attempts');

  // Dispatched through route handler
  const req = createMockRequest('http://localhost:3001/api/auth/login', {
    method: 'POST',
    body: { email: testEmail, password: 'WrongPassword123!' },
    headers: { 'x-real-ip': testIp },
  });

  const res = await loginHandler(req);
  assert.equal(res.status, 429, 'Throttled login must return 429');
  clearAllRateLimits();
});

test('A7: POST /api/auth/login Valid Credentials Issues Session Cookie (200)', async () => {
  clearAllRateLimits();
  const req = createMockRequest('http://localhost:3001/api/auth/login', {
    method: 'POST',
    body: { email: 'demo@apexplumbing.com', password: 'ApexDemo2026!Secure' },
  });

  const res = await loginHandler(req);
  assert.equal(res.status, 200, 'Valid credentials must return 200');
  const body = await res.json();
  assert.equal(body.success, true);
  assert.equal(body.accountId, 'acc-apex-plumbing');

  // Assert httpOnly session cookie was set
  const setCookieHeader = res.headers.get('set-cookie');
  assert.ok(setCookieHeader, 'Set-Cookie header must be present');
  assert.match(setCookieHeader, new RegExp(`${SESSION_COOKIE_NAME}=`));
  assert.match(setCookieHeader, /httponly/i);
});

test('A8: POST /api/onboarding Validates Credentials and Issues Session Cookie', async () => {
  const uniqueNum = Math.floor(1000 + Math.random() * 9000);
  const email = `plumber_${uniqueNum}@example.com`;

  // 1. Password < 12 characters rejected
  const reqShort = createMockRequest('http://localhost:3001/api/onboarding', {
    method: 'POST',
    body: {
      email,
      password: 'Short99!',
      businessName: 'Quality Rooter',
      trade: 'plumbing',
      phone: '+12175550199',
    },
  });
  const resShort = await onboardingHandler(reqShort);
  assert.equal(resShort.status, 400, 'Short password must return 400');

  // 2. Valid onboarding
  const reqValid = createMockRequest('http://localhost:3001/api/onboarding', {
    method: 'POST',
    body: {
      email,
      password: 'StrongPassword2026!',
      businessName: `Test Plumbing ${uniqueNum}`,
      trade: 'plumbing',
      phone: `+1217555${uniqueNum}`,
    },
  });
  const resValid = await onboardingHandler(reqValid);
  assert.equal(resValid.status, 200, 'Valid onboarding must return 200');

  // Capture fixture account ID via creation helper
  const validBody = await resValid.clone().json();
  const trackedId = fixtureTracker.recordSignupResponse(validBody);

  // Credentials stored in user_credentials table
  const cred = db.findCredentialByEmail(email);
  assert.ok(cred, 'Credentials must be saved in user_credentials');
  assert.equal(cred.account_id, trackedId);
  assert.ok(cred.password_hash.startsWith('scrypt$'));

  // Account row must NOT have password
  const account = db.getAccount(cred.account_id);
  assert.ok(account);
  assert.equal((account as any).password, undefined);

  // Response has session cookie
  const cookie = resValid.headers.get('set-cookie');
  assert.ok(cookie);
  assert.match(cookie, new RegExp(`${SESSION_COOKIE_NAME}=`));
});

test('A9: POST /api/auth/logout Invalidates Session Server-Side', async () => {
  const token = createSessionToken({ accountId: 'acc-apex-plumbing' });
  assert.ok(verifySessionToken(token));

  const req = createMockRequest('http://localhost:3001/api/auth/logout', {
    method: 'POST',
    cookie: token,
  });

  const res = await logoutHandler(req);
  assert.equal(res.status, 200);

  // Cookie cleared
  const cookie = res.headers.get('set-cookie');
  assert.ok(cookie);
  assert.match(cookie, /Max-Age=0/i);

  // Token invalidated server-side
  assert.equal(verifySessionToken(token), null, 'Token must be invalidated server-side after logout');
});

// A10: DYNAMIC TEST FOR ALL ROUTES IN ENUMERATION - REFUSE ANONYMOUS (401)
test('A10: All Enumerated Tenant Routes Refuse Anonymous Caller (401)', async () => {
  for (const route of TENANT_SCOPED_API_ROUTES) {
    const handler = ROUTE_HANDLERS[route];
    assert.ok(handler, `Handler for route ${route} must be mapped in test suite`);

    // Anonymous request with no cookie
    const req = createMockRequest(`http://localhost:3001${route}`);
    const res = await handler(req);

    assert.equal(
      res.status,
      401,
      `Route ${route} must strictly return 401 when accessed anonymously`
    );
  }
});

// A11: DYNAMIC TEST FOR ALL ROUTES IN ENUMERATION - ACCEPT AUTHENTICATED (200)
test('A11: All Enumerated Tenant Routes Accept Valid Session Cookie (200)', async () => {
  const token = createSessionToken({
    accountId: 'acc-apex-plumbing',
    userId: 'usr-demo-owner',
    role: 'owner',
    isDemo: true,
  });

  for (const route of TENANT_SCOPED_API_ROUTES) {
    const handler = ROUTE_HANDLERS[route];
    assert.ok(handler, `Handler for route ${route} must be mapped in test suite`);

    // Authenticated request with valid session cookie
    const req = createMockRequest(`http://localhost:3001${route}`, { cookie: token });
    const res = await handler(req);

    assert.equal(
      res.status,
      200,
      `Route ${route} must return 200 when accessed with a valid session cookie`
    );
  }
});

// Suite Teardown: Clean up exactly the tracked IDs created during the suite
test.after(() => {
  const cleaned = fixtureTracker.cleanup();
  assert.ok(cleaned >= 1, 'Suite teardown must clean up tracked fixture tenants');
});
