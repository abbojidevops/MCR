(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

import {
  estimateSecretEntropyBits,
  validateAdminPassword,
  validateSessionSecret,
  validatePublicAppUrl,
  findLiveProcessingSwitches,
  SESSION_SECRET_MIN_BITS,
} from '@/lib/security/secret-strength';
import {
  runStagingRequirements,
  parsePostgresMajorVersion,
  databaseHostname,
} from '../scripts/staging-requirements';
import { validateDataDirectory, resolveDataDirectory } from '../scripts/db-init.mjs';

// 64 hex chars == 32 random bytes, the shape `openssl rand -hex 32` emits.
const STRONG_SESSION = 'f4c1a9d83b27e65094af1d2c8b7e035af61c2938d405eb7a19c2f8d6470ba3e5';

const COMPLETE_ENV: Record<string, string> = {
  ADMIN_PASSWORD: 'StagingAdminPass2026!',
  SESSION_SECRET: STRONG_SESSION,
  DATABASE_URL: 'postgresql://mcr_user:StrongStagingPass2026!Db@127.0.0.1:5433/mcr_db',
  NEXT_PUBLIC_APP_URL: 'https://mcr-staging.up.railway.app',
  TWILIO_MOCK_MODE: 'true',
};

// ---------------------------------------------------------------------------
// SR-1..SR-4 — SESSION_SECRET must carry ≥ 32 bytes (256 bits) of entropy
// ---------------------------------------------------------------------------

test('SR-1: Entropy Estimator Scores Real Encodings Accurately', () => {
  // 64 hex chars x 4 bits = exactly 256 bits (openssl rand -hex 32)
  assert.equal(Math.round(estimateSecretEntropyBits(STRONG_SESSION)), SESSION_SECRET_MIN_BITS);

  // 32 hex chars is only 16 bytes
  assert.equal(Math.round(estimateSecretEntropyBits('f4c1a9d83b27e65094af1d2c8b7e035a')), 128);

  // base64url of 32 bytes (44 chars x 6 bits)
  const base64 = 'Zk3pQv8xR2sT7wY1nB5cD9eF0gH4jK6mL2nP8qR3sT5uV7wX9yZ=';
  assert.ok(estimateSecretEntropyBits(base64) >= SESSION_SECRET_MIN_BITS);
});

test('SR-2: Long But Patterned Secrets Are Rejected by Entropy', () => {
  const patterned = [
    'a'.repeat(64), // one distinct character
    'abcd'.repeat(16), // repeating block
    '0123456789abcdef'.repeat(4), // repeated hex block
    'x'.repeat(40),
  ];

  for (const secret of patterned) {
    const result = validateSessionSecret(secret);
    assert.equal(result.ok, false, `"${secret.slice(0, 12)}…" must not satisfy the entropy requirement`);
    assert.match(result.error || '', /entropy/);
  }
});

test('SR-3: SESSION_SECRET Length and Entropy Are Both Enforced', () => {
  // Too short: reported as a length failure
  const short = validateSessionSecret('short');
  assert.equal(short.ok, false);
  assert.match(short.error || '', /at least 32/);

  // Missing entirely
  assert.equal(validateSessionSecret(undefined).ok, false);
  assert.equal(validateSessionSecret('   ').ok, false);

  // Strong value passes and reports its strength
  const strong = validateSessionSecret(STRONG_SESSION);
  assert.equal(strong.ok, true);
  assert.ok(strong.bits >= SESSION_SECRET_MIN_BITS);
});

test('SR-4: ADMIN_PASSWORD Policy Requires Length, Upper, Lower and Digit', () => {
  assert.equal(validateAdminPassword('Short1A').ok, false); // < 12
  assert.match(validateAdminPassword('Short1A').errors.join(), /at least 12/);

  assert.equal(validateAdminPassword('alllowercase12345').ok, false); // no upper
  assert.equal(validateAdminPassword('ALLUPPERCASE12345').ok, false); // no lower
  assert.equal(validateAdminPassword('NoDigitsHereAtAll!').ok, false); // no digit
  assert.equal(validateAdminPassword('StagingAdminPass2026!').ok, true);
  assert.equal(validateAdminPassword(undefined).ok, false);
});

// ---------------------------------------------------------------------------
// SR-5..SR-7 — App URL and live-processing switches
// ---------------------------------------------------------------------------

test('SR-5: NEXT_PUBLIC_APP_URL Must Be the Final HTTPS Domain', () => {
  assert.equal(validatePublicAppUrl('http://localhost:3000').ok, false);
  assert.equal(validatePublicAppUrl('http://localhost:3000').isLocalhost, true);
  assert.equal(validatePublicAppUrl('http://mcr.example.com').ok, false); // not https
  assert.equal(validatePublicAppUrl('').ok, false);
  assert.equal(validatePublicAppUrl('https://mcr-staging.up.railway.app').ok, true);
});

test('SR-6: Every Switch That Would Enable Live Processing Is Detected', () => {
  assert.deepEqual(findLiveProcessingSwitches({ TWILIO_MOCK_MODE: 'true' }), []);

  assert.match(findLiveProcessingSwitches({}).join(), /TWILIO_MOCK_MODE/);
  assert.match(findLiveProcessingSwitches({ TWILIO_MOCK_MODE: 'false' }).join(), /TWILIO_MOCK_MODE/);
  assert.match(
    findLiveProcessingSwitches({ TWILIO_MOCK_MODE: 'true', NEXT_PUBLIC_TWILIO_LIVE: 'true' }).join(),
    /NEXT_PUBLIC_TWILIO_LIVE/
  );
  assert.match(
    findLiveProcessingSwitches({ TWILIO_MOCK_MODE: 'true', NEXT_PUBLIC_STRIPE_LIVE: 'true' }).join(),
    /NEXT_PUBLIC_STRIPE_LIVE/
  );
  assert.match(
    findLiveProcessingSwitches({ TWILIO_MOCK_MODE: 'true', STRIPE_SECRET_KEY: 'sk_live_x' }).join(),
    /STRIPE_SECRET_KEY/
  );
  assert.match(
    findLiveProcessingSwitches({ TWILIO_MOCK_MODE: 'true', TWILIO_AUTH_TOKEN: 'token' }).join(),
    /TWILIO_AUTH_TOKEN/
  );
  assert.match(
    findLiveProcessingSwitches({ TWILIO_MOCK_MODE: 'true', CARRIER_WEBHOOK_SECRET: 'secret' }).join(),
    /CARRIER_WEBHOOK_SECRET/
  );
});

test('SR-7: PostgreSQL Version and Hostname Parsers Handle Real Inputs', () => {
  assert.equal(parsePostgresMajorVersion('16.2'), 16);
  assert.equal(parsePostgresMajorVersion('16'), 16);
  assert.equal(parsePostgresMajorVersion('15.6 (Debian 15.6-1.pgdg120+1)'), 15);
  assert.equal(parsePostgresMajorVersion('not-a-version'), null);
  assert.equal(parsePostgresMajorVersion(''), null);

  assert.equal(databaseHostname('postgresql://u:p@postgres.railway.internal:5432/mcr_db'), 'postgres.railway.internal');
  assert.equal(databaseHostname('postgresql://u:p@127.0.0.1:5433/mcr_db'), '127.0.0.1');
  assert.equal(databaseHostname('not a url'), null);
  assert.equal(databaseHostname(undefined), null);
});

// ---------------------------------------------------------------------------
// SR-8..SR-10 — Volume (data directory) writability
// ---------------------------------------------------------------------------

test('SR-8: Data Directory Check Detects an Unwritable Mount', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcr-vol-'));
  const readOnly = path.join(dir, 'data');
  fs.mkdirSync(readOnly, { recursive: true });
  fs.chmodSync(readOnly, 0o500); // r-x------ : not writable

  const previousSkip = process.env.MCR_SKIP_DATA_DIR_CHECK;
  const previousRequire = process.env.MCR_REQUIRE_PERSISTENT_DATA;
  delete process.env.MCR_SKIP_DATA_DIR_CHECK;
  delete process.env.MCR_REQUIRE_PERSISTENT_DATA;

  try {
    // Non-enforcing: reports the problem without throwing
    const advisory = validateDataDirectory({ dataDir: readOnly });
    assert.equal(advisory.writable, false);
    assert.match(advisory.warning || '', /NOT writable/);

    // Enforcing: fails loudly with actionable remediation
    assert.throws(
      () => validateDataDirectory({ dataDir: readOnly, enforce: true }),
      /NOT writable[\s\S]*UID 1001/,
      'An unwritable volume must fail loudly and name the required UID'
    );
  } finally {
    fs.chmodSync(readOnly, 0o700);
    fs.rmSync(dir, { recursive: true, force: true });
    if (previousSkip === undefined) delete process.env.MCR_SKIP_DATA_DIR_CHECK;
    else process.env.MCR_SKIP_DATA_DIR_CHECK = previousSkip;
    if (previousRequire === undefined) delete process.env.MCR_REQUIRE_PERSISTENT_DATA;
    else process.env.MCR_REQUIRE_PERSISTENT_DATA = previousRequire;
  }
});

test('SR-9: Data Directory Check Passes When Writable and Honours the Skip Flag', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mcr-vol-ok-'));
  try {
    const result = validateDataDirectory({ dataDir: dir });
    assert.equal(result.writable, true, 'A writable directory must pass');
    assert.equal(result.warning, null);
    assert.equal(fs.readdirSync(dir).length, 0, 'The probe file must be cleaned up');

    process.env.MCR_SKIP_DATA_DIR_CHECK = 'true';
    try {
      const skipped = validateDataDirectory({ dataDir: dir });
      assert.match(skipped.warning || '', /skipped/);
    } finally {
      delete process.env.MCR_SKIP_DATA_DIR_CHECK;
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('SR-10: Data Directory Defaults to the Mounted Volume Path in the Container', () => {
  const originalCwd = process.cwd();
  assert.equal(resolveDataDirectory(), path.join(originalCwd, 'data'));
  assert.equal(resolveDataDirectory({ dataDir: '/app/data' }), '/app/data');

  const previous = process.env.MCR_DATA_DIR;
  process.env.MCR_DATA_DIR = '/mnt/persistent';
  try {
    assert.equal(resolveDataDirectory(), '/mnt/persistent');
  } finally {
    if (previous === undefined) delete process.env.MCR_DATA_DIR;
    else process.env.MCR_DATA_DIR = previous;
  }
});

// ---------------------------------------------------------------------------
// SR-11..SR-12 — End-to-end requirements report
// ---------------------------------------------------------------------------

test('SR-11: Requirements Report Fails Actionably on Missing Configuration', async () => {
  const report = await runStagingRequirements(
    { NEXT_PUBLIC_APP_URL: 'http://localhost:3000' } as Record<string, string>,
    { skipLiveChecks: true }
  );

  assert.equal(report.ok, false, 'An unconfigured environment must not pass');

  const byId = Object.fromEntries(report.results.map((r) => [r.id, r]));
  assert.equal(byId['admin-password'].status, 'fail');
  assert.equal(byId['session-secret'].status, 'fail');
  assert.equal(byId['app-url'].status, 'fail');
  assert.equal(byId['database-url'].status, 'fail');
  assert.equal(byId['live-processing-off'].status, 'fail', 'TWILIO_MOCK_MODE must be required explicitly');

  // Never leak secret material, and always tell the operator what to do next.
  for (const result of report.results) {
    assert.equal(result.detail.includes(STRONG_SESSION), false);
  }
  assert.equal(report.manualSteps.length >= 10, true);
  assert.ok(report.manualSteps.some((s) => s.includes('${{Postgres.DATABASE_URL}}')));
  assert.ok(report.manualSteps.some((s) => s.includes('/app/data')));
});

test('SR-12: Requirements Report Passes a Fully Configured Staging Environment', async () => {
  const report = await runStagingRequirements(COMPLETE_ENV as Record<string, string>, {
    skipLiveChecks: false,
    dbTimeoutMs: 3000,
  });

  const byId = Object.fromEntries(report.results.map((r) => [r.id, r]));

  // Config-level requirements must all pass regardless of database availability.
  for (const id of ['admin-password', 'session-secret', 'app-url', 'database-url', 'live-processing-off', 'repo-topology']) {
    assert.equal(byId[id].status, 'pass', `${id} must pass: ${byId[id]?.detail}`);
  }

  // Volume check runs locally and must pass in this workspace.
  assert.equal(byId['volume'].status, 'pass', byId['volume'].detail);

  // The database in COMPLETE_ENV is not provisioned in this environment, so the
  // live checks must report a failure rather than a false pass.
  assert.equal(byId['postgres-16'].status, 'fail');
  assert.equal(byId['schema-initialized'].status, 'fail');
  assert.equal(report.ok, false);
});

test('SR-13: Requirements Report Keeps Live Processing Disabled by Default', async () => {
  // Anything that would enable live carrier/billing processing must be reported,
  // even when the rest of the environment is correct.
  const report = await runStagingRequirements(
    {
      ...COMPLETE_ENV,
      TWILIO_MOCK_MODE: 'false',
      TWILIO_AUTH_TOKEN: 'live-token-should-be-reported',
      NEXT_PUBLIC_STRIPE_LIVE: 'true',
    } as Record<string, string>,
    { skipLiveChecks: true }
  );

  const live = report.results.find((r) => r.id === 'live-processing-off');
  assert.equal(live?.status, 'fail');
  assert.match(live?.detail || '', /TWILIO_MOCK_MODE/);
  assert.match(live?.detail || '', /TWILIO_AUTH_TOKEN/);
  assert.match(live?.detail || '', /NEXT_PUBLIC_STRIPE_LIVE/);
  // The actual token value must never appear in the report.
  assert.equal(live?.detail.includes('live-token-should-be-reported'), false);
});

test('SR-14: The Runtime Data Directory Resolves Like the Pre-Deploy Probe', () => {
  // scripts/db-init.mjs probes MCR_DATA_DIR (the staging volume mount) before the
  // deploy. If the repository ignored that variable, the probe could pass while
  // the app persisted somewhere ephemeral instead.
  const repositorySource = fs
    .readFileSync(path.join(process.cwd(), 'src', 'db', 'repository.ts'), 'utf-8')
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');

  assert.match(
    repositorySource,
    /process\.env\.MCR_DATA_DIR\s*\|\|\s*path\.join\(process\.cwd\(\),\s*'data'\)/,
    'The repository must honour MCR_DATA_DIR, falling back to <cwd>/data'
  );

  // Both resolvers must agree for a given override.
  const override = '/mnt/staging-volume';
  const previous = process.env.MCR_DATA_DIR;
  process.env.MCR_DATA_DIR = override;
  try {
    assert.equal(resolveDataDirectory(), override, 'db-init must honour MCR_DATA_DIR');
  } finally {
    if (previous === undefined) delete process.env.MCR_DATA_DIR;
    else process.env.MCR_DATA_DIR = previous;
  }
});
