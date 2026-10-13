import './test-env';
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { NextRequest, NextResponse } from 'next/server';
import {
  getSessionSecret,
  getSessionSecretConfigurationError,
} from '@/lib/security/session-secret';
import { requireAdminAuth, requireTenantAuth } from '@/lib/authz';
import {
  createSessionToken,
  setSessionCookie,
  verifySessionToken,
} from '@/lib/session';

const STRONG_SESSION_SECRET =
  'f4c1a9d83b27e65094af1d2c8b7e035af61c2938d405eb7a19c2f8d6470ba3e5';

type RuntimeEnvironment = {
  NODE_ENV?: string;
  SESSION_SECRET?: string;
};

async function withRuntimeEnvironment<T>(
  env: RuntimeEnvironment,
  run: () => T | Promise<T>
): Promise<T> {
  const previous = {
    NODE_ENV: process.env.NODE_ENV,
    SESSION_SECRET: process.env.SESSION_SECRET,
  };

  if (env.NODE_ENV === undefined) delete (process.env as any).NODE_ENV;
  else (process.env as any).NODE_ENV = env.NODE_ENV;
  if (env.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
  else process.env.SESSION_SECRET = env.SESSION_SECRET;

  try {
    return await run();
  } finally {
    if (previous.NODE_ENV === undefined) delete (process.env as any).NODE_ENV;
    else (process.env as any).NODE_ENV = previous.NODE_ENV;
    if (previous.SESSION_SECRET === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = previous.SESSION_SECRET;
  }
}

test('production session signing fails closed when SESSION_SECRET is missing', async () => {
  await withRuntimeEnvironment({ NODE_ENV: 'production' }, async () => {
    const configurationError = getSessionSecretConfigurationError();
    assert.match(configurationError || '', /SESSION_SECRET must be configured/);
    assert.throws(() => getSessionSecret(), /SESSION_SECRET must be configured/);
    assert.throws(() => createSessionToken({ accountId: 'acc-apex-plumbing' }), /SESSION_SECRET must be configured/);
    assert.equal(verifySessionToken('e30.invalid-signature'), null);

    const cookieResponse = setSessionCookie(NextResponse.json({ success: true }), {
      accountId: 'acc-apex-plumbing',
    });
    assert.equal(cookieResponse.status, 503);
    assert.equal(cookieResponse.headers.get('set-cookie'), null);

    const request = new NextRequest('http://localhost/api/private');
    const tenantAuth = await requireTenantAuth(request);
    assert.ok(tenantAuth instanceof NextResponse);
    assert.equal(tenantAuth.status, 503);
    assert.match((await tenantAuth.json()).error, /SESSION_SECRET/);

    const adminAuth = await requireAdminAuth(request);
    assert.ok(adminAuth instanceof NextResponse);
    assert.equal(adminAuth.status, 503);
  });
});

test('production session signing rejects a configured but low-entropy secret', async () => {
  await withRuntimeEnvironment({ NODE_ENV: 'production', SESSION_SECRET: 'a'.repeat(64) }, async () => {
    const configurationError = getSessionSecretConfigurationError();
    assert.match(configurationError || '', /at least 32 bytes .* entropy/);
    assert.throws(() => getSessionSecret(), /at least 32 bytes .* entropy/);
    assert.throws(() => createSessionToken({ accountId: 'acc-apex-plumbing' }), /at least 32 bytes .* entropy/);
    assert.equal(verifySessionToken('e30.invalid-signature'), null);

    const auth = await requireTenantAuth(new NextRequest('http://localhost/api/private'));
    assert.ok(auth instanceof NextResponse);
    assert.equal(auth.status, 503);
  });
});

test('a strong production secret signs and verifies sessions', async () => {
  await withRuntimeEnvironment(
    { NODE_ENV: 'production', SESSION_SECRET: STRONG_SESSION_SECRET },
    () => {
      assert.equal(getSessionSecretConfigurationError(), null);
      assert.equal(getSessionSecret(), STRONG_SESSION_SECRET);

      const token = createSessionToken({
        accountId: 'acc-apex-plumbing',
        role: 'owner',
        isDemo: true,
      });
      const verified = verifySessionToken(token);
      assert.equal(verified?.accountId, 'acc-apex-plumbing');
      assert.equal(verified?.role, 'owner');
    }
  );
});

test('the session signer and edge verifier contain no predictable default key', () => {
  const sessionSource = readFileSync('src/lib/session.ts', 'utf8');
  const proxySource = readFileSync('src/proxy.ts', 'utf8');

  for (const source of [sessionSource, proxySource]) {
    assert.doesNotMatch(source, /mcr-prod-secret-signing-key/);
    assert.doesNotMatch(source, /SESSION_SECRET\s*\|\|/);
  }
});
