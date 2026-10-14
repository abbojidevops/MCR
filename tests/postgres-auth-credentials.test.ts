import './test-env';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { db } from '@/db/repository';
import { closePostgresPool } from '@/db/postgres';
import { hashPasswordSync } from '@/lib/auth/password';
import { POST as loginHandler } from '@/app/api/auth/login/route';
import { POST as onboardingHandler } from '@/app/api/onboarding/route';

const SECURE_TEST_DATABASE_URL =
  'postgresql://mcr_user:CredentialPersistSecure2026%21@127.0.0.1:5433/mcr_db';

type QueryCall = { sql: string; values: unknown[] };
type QueryResult = { rows?: any[]; rowCount?: number };
type FakeQuery = (sql: string, values: unknown[]) => QueryResult | Promise<QueryResult>;

async function withFakePostgres<T>(
  fakeQuery: FakeQuery,
  run: (calls: QueryCall[]) => Promise<T>
): Promise<T> {
  const originalUrl = process.env.DATABASE_URL;
  const originalQuery = (Pool.prototype as any).query;
  const originalConnect = (Pool.prototype as any).connect;
  const calls: QueryCall[] = [];

  await closePostgresPool();
  process.env.DATABASE_URL = SECURE_TEST_DATABASE_URL;
  const dispatchQuery = async (sql: string, values: unknown[] = []) => {
    calls.push({ sql: String(sql), values });
    return fakeQuery(String(sql), values);
  };
  (Pool.prototype as any).query = dispatchQuery;
  (Pool.prototype as any).connect = async function () {
    return {
      query: dispatchQuery,
      release: () => {},
    };
  };

  try {
    return await run(calls);
  } finally {
    await closePostgresPool();
    (Pool.prototype as any).query = originalQuery;
    (Pool.prototype as any).connect = originalConnect;
    if (originalUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = originalUrl;
  }
}

function makeTenant() {
  const originalUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    return db.createAccount(
      `Credential Persistence Test ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`,
      'plumbing',
      '+12175559876',
      'Credential Test Owner',
      'Verizon Wireless'
    );
  } finally {
    if (originalUrl !== undefined) process.env.DATABASE_URL = originalUrl;
  }
}

function makeCredential(accountId: string, email: string, passwordHash = 'scrypt$16384$8$1$salt$hash') {
  return {
    user_id: `usr-${accountId}`,
    account_id: accountId,
    email,
    password_hash: passwordHash,
    algorithm: 'scrypt' as const,
  };
}

function cleanupAccount(accountId: string): void {
  const originalUrl = process.env.DATABASE_URL;
  delete process.env.DATABASE_URL;
  try {
    db.deleteAccount(accountId);
  } finally {
    if (originalUrl !== undefined) process.env.DATABASE_URL = originalUrl;
  }
}

test('PGCRED-1: new credentials are inserted into PostgreSQL before entering the local cache', async () => {
  const created = makeTenant();
  const accountId = created.account.id;
  const email = `pgcred_${Date.now()}@example.test`;
  const passwordHash = 'scrypt$16384$8$1$test-salt$test-hash';

  try {
    await withFakePostgres(
      async (sql, values) => {
        if (sql.includes('INSERT INTO user_credentials')) {
          const [id, userId, tenantId, address, hash, algorithm, createdAt, updatedAt] = values;
          return {
            rows: [{
              id, user_id: userId, account_id: tenantId, email: address,
              password_hash: hash, algorithm, created_at: createdAt, updated_at: updatedAt,
            }],
            rowCount: 1,
          };
        }
        return { rows: [], rowCount: 1 };
      },
      async (calls) => {
        const credential = await db.createUserCredentialPersistent(
          makeCredential(accountId, email, passwordHash)
        );

        assert.equal(credential.email, email);
        assert.equal(credential.password_hash, passwordHash);
        assert.equal(db.findCredentialByEmail(email)?.id, credential.id);

        const ensureIndex = calls.findIndex((call) => call.sql.includes('INSERT INTO accounts'));
        const credentialIndex = calls.findIndex((call) => call.sql.includes('INSERT INTO user_credentials'));
        assert.ok(ensureIndex >= 0, 'credential write must ensure its account parent exists');
        assert.ok(credentialIndex > ensureIndex, 'credential must be inserted after the parent account');
        assert.match(calls[credentialIndex].sql, /ON CONFLICT \(email\) DO NOTHING[\s\S]*RETURNING \*/);
        assert.equal(calls[credentialIndex].values[2], accountId);
        assert.equal(calls[credentialIndex].values[3], email);
        assert.equal(calls[credentialIndex].values[4], passwordHash);
      }
    );
  } finally {
    await closePostgresPool();
    cleanupAccount(accountId);
  }
});

test('PGCRED-2: PostgreSQL reads win, legacy-only rows fall back, and stale SQL-backed cache entries fail closed', async () => {
  const created = makeTenant();
  const accountId = created.account.id;
  const email = `pgcred_read_${Date.now()}@example.test`;
  const legacyEmail = `pgcred_legacy_${Date.now()}@example.test`;
  const local = db.createUserCredential(makeCredential(accountId, email, 'local-hash'));
  const legacy = db.createUserCredential(makeCredential(accountId, legacyEmail, 'legacy-hash'));
  const postgresRow = {
    ...local,
    password_hash: 'postgres-hash',
    updated_at: new Date('2026-10-01T12:00:00.000Z'),
  };
  let mode: 'postgres' | 'missing' | 'error' = 'postgres';

  try {
    await withFakePostgres(
      async (sql) => {
        if (sql.includes('SELECT * FROM user_credentials')) {
          if (mode === 'error') throw new Error('simulated PostgreSQL read failure');
          if (mode === 'missing') return { rows: [], rowCount: 0 };
          return { rows: [postgresRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      async () => {
        const fromPostgres = await db.findCredentialByEmailPersistent(email.toUpperCase());
        assert.equal(fromPostgres?.password_hash, 'postgres-hash');
        assert.equal(fromPostgres?.updated_at, '2026-10-01T12:00:00.000Z');
        assert.equal(db.findCredentialByEmail(email)?.password_hash, 'postgres-hash');

        mode = 'missing';
        const staleSqlBackedCredential = await db.findCredentialByEmailPersistent(email);
        assert.equal(staleSqlBackedCredential, undefined, 'a previously PostgreSQL-backed hash must not revive from JSON');
        const legacyFallback = await db.findCredentialByEmailPersistent(legacyEmail);
        assert.equal(legacyFallback?.id, legacy.id, 'pre-migration JSON credentials remain compatible');

        mode = 'error';
        await assert.rejects(
          db.findCredentialByEmailPersistent(legacyEmail),
          /Credential lookup failed/
        );
      }
    );
  } finally {
    await closePostgresPool();
    cleanupAccount(accountId);
  }
});

test('PGCRED-3: onboarding persists a new credential and the same account can log in from PostgreSQL', async () => {
  const accountIdsBefore = new Set(db.getAllAccounts().map((account) => account.id));
  const unique = `${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const email = `pgcred_signup_${unique}@example.test`;
  const password = 'CredentialSignup2026!';
  const passwordHash = hashPasswordSync(password, `salt-${unique}`);
  let insertedCredential: Record<string, unknown> | null = null;

  try {
    await withFakePostgres(
      async (sql, values) => {
        if (sql.includes('SELECT * FROM user_credentials')) {
          return { rows: insertedCredential && insertedCredential.email === values[0] ? [insertedCredential] : [], rowCount: insertedCredential ? 1 : 0 };
        }
        if (sql.includes('INSERT INTO user_credentials')) {
          const [id, userId, accountId, address, hash, algorithm, createdAt, updatedAt] = values;
          insertedCredential = {
            id, user_id: userId, account_id: accountId, email: address,
            password_hash: hash, algorithm, created_at: createdAt, updated_at: updatedAt,
          };
          return { rows: [insertedCredential], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      },
      async (calls) => {
        const signup = await onboardingHandler(new NextRequest('http://localhost:3001/api/onboarding', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            email,
            password,
            businessName: `Credential Test ${unique}`,
            trade: 'plumbing',
            phone: '+12175550199',
          }),
        }));
        assert.equal(signup.status, 200);
        const signupBody = await signup.json();
        const accountId = signupBody.account.id as string;
        assert.ok(insertedCredential, 'the signup row must be present in the fake PostgreSQL store');
        assert.equal(insertedCredential?.email, email);
        assert.ok(calls.some((call) => call.sql.includes('INSERT INTO user_credentials')));

        const login = await loginHandler(new NextRequest('http://localhost:3001/api/auth/login', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ email, password }),
        }));
        assert.equal(login.status, 200);
        assert.match(login.headers.get('set-cookie') || '', /mcr_session=/);
        assert.ok(
          calls.some((call) => call.sql.includes('SELECT * FROM user_credentials')),
          'login must read the shared PostgreSQL credential instead of relying only on process memory'
        );
        const insertIndex = calls.findIndex((call) => call.sql.includes('INSERT INTO user_credentials'));
        const loginReadIndex = calls.findIndex(
          (call, index) => index > insertIndex && call.sql.includes('SELECT * FROM user_credentials')
        );
        assert.ok(insertIndex >= 0);
        assert.ok(loginReadIndex > insertIndex, 'credential persistence must complete before the login read');
        assert.ok(db.getAccount(accountId));
      }
    );
  } finally {
    await closePostgresPool();
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    for (const account of db.getAllAccounts()) {
      if (!accountIdsBefore.has(account.id)) db.deleteAccount(account.id);
    }
    if (originalUrl !== undefined) process.env.DATABASE_URL = originalUrl;
  }
});

test('PGCRED-4: a failed PostgreSQL credential write does not report a cached credential', async () => {
  const created = makeTenant();
  const accountId = created.account.id;
  const email = `pgcred_failure_${Date.now()}@example.test`;

  try {
    await withFakePostgres(
      async (sql) => {
        if (sql.includes('INSERT INTO user_credentials')) {
          throw new Error('simulated PostgreSQL credential write failure');
        }
        return { rows: [], rowCount: 1 };
      },
      async () => {
        await assert.rejects(
          db.createUserCredentialPersistent(makeCredential(accountId, email)),
          /Credential persistence failed/
        );
        assert.equal(db.findCredentialByEmail(email), undefined);
      }
    );
  } finally {
    await closePostgresPool();
    cleanupAccount(accountId);
  }
});
