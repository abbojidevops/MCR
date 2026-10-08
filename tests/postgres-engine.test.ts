(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { db } from '@/db/repository';
import {
  isPostgresConfigured,
  getPostgresPool,
  checkPostgresConnection,
  initializePostgresSchema,
  closePostgresPool,
} from '@/db/postgres';
import { evaluateLaunchGates } from '@/lib/launch-gate';

const LIVE_POSTGRES_URL = 'postgresql://mcr_user:McrSecurePostgresPass2026!DbEngine@127.0.0.1:5433/mcr_db';

test('PG-1: Config Integrity & Burned Password Rejection', async () => {
  const originalUrl = process.env.DATABASE_URL;

  try {
    // 1. Unset DATABASE_URL
    delete process.env.DATABASE_URL;
    await closePostgresPool();
    assert.equal(isPostgresConfigured(), false, 'Unset DATABASE_URL must not be configured');
    assert.equal(db.isPostgresConfigured(), false, 'Repository must report postgres unconfigured');
    assert.equal(db.getStorageEngine(), 'file_json', 'Storage engine must be file_json');
    assert.equal(getPostgresPool(), null, 'Pool must be null when DATABASE_URL is unset');

    // 2. Burned passwords must be refused fail-closed
    const burnedUrls = [
      'postgresql://postgres:postgres@localhost:5432/mcr_db',
      'postgresql://mcr:mcr_password@localhost:5432/mcr_db',
      'postgresql://admin:password@localhost:5432/mcr_db',
      'postgresql://root:root@localhost:5432/mcr_db',
      'postgresql://user:123456@localhost:5432/mcr_db',
    ];

    for (const burned of burnedUrls) {
      process.env.DATABASE_URL = burned;
      await closePostgresPool();
      assert.equal(isPostgresConfigured(), false, `Burned URL "${burned}" must be rejected`);
      assert.equal(db.isPostgresConfigured(), false, `Repository must reject burned URL "${burned}"`);
      assert.equal(getPostgresPool(), null, `Pool must be refused for burned URL "${burned}"`);
    }

    // 3. Valid secure password accepted
    process.env.DATABASE_URL = LIVE_POSTGRES_URL;
    await closePostgresPool();
    assert.equal(isPostgresConfigured(), true, 'Valid rotated credentials must be accepted');
    assert.equal(db.isPostgresConfigured(), true, 'Repository must report postgres configured');
    assert.equal(db.getStorageEngine(), 'postgresql', 'Storage engine must report postgresql');
  } finally {
    if (originalUrl) {
      process.env.DATABASE_URL = originalUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    await closePostgresPool();
  }
});

test('PG-2: Live Database Engine Connectivity & Schema Structure', async () => {
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = LIVE_POSTGRES_URL;

  try {
    await closePostgresPool();

    // 1. Check live connectivity
    const connected = await checkPostgresConnection();
    assert.equal(connected, true, 'checkPostgresConnection must connect to live PostgreSQL 16');

    // 2. Initialize schema idempotently
    const schemaInit = await initializePostgresSchema();
    assert.equal(schemaInit.success, true, `Schema initialization must succeed: ${schemaInit.error}`);

    // 3. Verify core relational tables exist in information_schema
    const pool = getPostgresPool();
    assert.ok(pool, 'Postgres pool must be initialized');

    const result = await pool.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      ORDER BY table_name;
    `);

    const tableNames = new Set(result.rows.map((r: any) => r.table_name));
    const expectedTables = [
      'accounts',
      'user_credentials',
      'business_profiles',
      'phone_numbers',
      'contacts',
      'call_records',
      'conversations',
      'messages',
      'jobs',
      'subscriptions',
      'compliance_registrations',
      'consent_logs',
      'subscription_plans',
      'audit_logs',
      'webhook_events',
    ];

    for (const table of expectedTables) {
      assert.ok(tableNames.has(table), `PostgreSQL schema must contain table "${table}"`);
    }
  } finally {
    if (originalUrl) {
      process.env.DATABASE_URL = originalUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    await closePostgresPool();
  }
});

test('PG-3: Dual-Persistence Operations & Cascade Lifecycle', async () => {
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = LIVE_POSTGRES_URL;

  try {
    await closePostgresPool();
    const pool = getPostgresPool();
    assert.ok(pool, 'Pool must be available');

    const testAccountId = `acc-test-pg-${Date.now().toString(36)}`;
    const testProfileId = `prof-test-pg-${Date.now().toString(36)}`;

    // 1. Insert test account directly into PostgreSQL
    await pool.query(
      `INSERT INTO accounts (id, name, slug, status, plan_tier, trial_ends_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8);`,
      [
        testAccountId,
        'Test PG Account',
        'test-pg-account',
        'active',
        'pro',
        new Date().toISOString(),
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );

    // 2. Insert linked business profile to test cascading FK
    await pool.query(
      `INSERT INTO business_profiles (id, account_id, business_name, trade, carrier_name, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7);`,
      [
        testProfileId,
        testAccountId,
        'Test PG Business',
        'plumbing',
        'Verizon',
        new Date().toISOString(),
        new Date().toISOString(),
      ]
    );

    // Verify insertion succeeded
    const accCheck = await pool.query('SELECT id FROM accounts WHERE id = $1', [testAccountId]);
    assert.equal(accCheck.rowCount, 1, 'Inserted test account must exist in PostgreSQL');

    const profCheck = await pool.query('SELECT id FROM business_profiles WHERE id = $1', [testProfileId]);
    assert.equal(profCheck.rowCount, 1, 'Inserted business profile must exist in PostgreSQL');

    // 3. Delete account using db.deleteAccountFromPostgres
    const deleted = await db.deleteAccountFromPostgres(testAccountId);
    assert.equal(deleted, true, 'deleteAccountFromPostgres must return true');

    // 4. Verify cascade in PostgreSQL: both account and child profile deleted
    const accAfter = await pool.query('SELECT id FROM accounts WHERE id = $1', [testAccountId]);
    assert.equal(accAfter.rowCount, 0, 'Account must be deleted from PostgreSQL');

    const profAfter = await pool.query('SELECT id FROM business_profiles WHERE id = $1', [testProfileId]);
    assert.equal(profAfter.rowCount, 0, 'Child business profile must be cascaded and deleted from PostgreSQL');
  } finally {
    if (originalUrl) {
      process.env.DATABASE_URL = originalUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    await closePostgresPool();
  }
});

test('PG-4: Launch Gate Evaluation Dynamics (production_database_engine)', async () => {
  const originalUrl = process.env.DATABASE_URL;

  try {
    // 1. Without DATABASE_URL: Gate 8 must report failed
    delete process.env.DATABASE_URL;
    await closePostgresPool();
    let report = evaluateLaunchGates();
    let gate = report.gates.find((g) => g.id === 'production_database_engine');
    assert.ok(gate, 'production_database_engine gate must exist');
    assert.equal(gate.status, 'failed', 'Unset DATABASE_URL must fail Gate 8');
    assert.match(gate.statusReason, /PostgreSQL migration pending/i);
    assert.match(gate.evidence?.details || '', /Storage engine is file_json/i);

    // 2. With burned password: Gate 8 must report failed with insecure credentials reason
    process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5432/mcr_db';
    await closePostgresPool();
    report = evaluateLaunchGates();
    gate = report.gates.find((g) => g.id === 'production_database_engine');
    assert.ok(gate);
    assert.equal(gate.status, 'failed', 'Burned password must fail Gate 8');
    assert.match(gate.statusReason, /insecure or burned credentials/i);
    assert.match(gate.evidence?.details || '', /burned, default, or unauthenticated/i);

    // 3. With live valid PostgreSQL configured: Gate 8 must report passed
    process.env.DATABASE_URL = LIVE_POSTGRES_URL;
    await closePostgresPool();
    report = evaluateLaunchGates();
    gate = report.gates.find((g) => g.id === 'production_database_engine');
    assert.ok(gate);
    assert.equal(gate.status, 'passed', 'Live configured PostgreSQL engine must pass Gate 8');
    assert.match(gate.statusReason, /PostgreSQL database configured and connected/i);
    assert.match(gate.evidence?.details || '', /127\.0\.0\.1:5433/);
    assert.match(gate.evidence?.details || '', /database: mcr_db/);
    assert.match(gate.evidence?.details || '', /user: mcr_user/);
  } finally {
    if (originalUrl) {
      process.env.DATABASE_URL = originalUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    await closePostgresPool();
  }
});

test('PG-5: Application Dual-Persistence Writes Actually Reach PostgreSQL', async () => {
  // Regression guard for the production-build defect where src/db/repository.ts
  // reached the pool through a dynamic `require('./postgres')`. In the bundled
  // app that namespace has no materialized named exports, so getPostgresPool()
  // threw, the surrounding try/catch logged a warning, and EVERY account write
  // silently skipped PostgreSQL while the API still returned success.
  const originalUrl = process.env.DATABASE_URL;
  process.env.DATABASE_URL = LIVE_POSTGRES_URL;

  try {
    await closePostgresPool();
    const pool = getPostgresPool();
    assert.ok(pool, 'Pool must be available for the dual-persistence path');
    assert.equal(db.isPostgresConfigured(), true);
    assert.equal(db.getStorageEngine(), 'postgresql');

    const account = db.createAccount(
      'Dual Persistence Verification',
      'plumbing',
      '+12175559977',
      'Dual Persistence Owner',
      'Verizon Wireless'
    );
    const accountId = account.account.id;

    try {
      // The repository write is asynchronous; poll briefly for the row.
      let rowCount = 0;
      for (let attempt = 0; attempt < 20; attempt++) {
        const result = await pool.query('SELECT id FROM accounts WHERE id = $1', [accountId]);
        rowCount = result.rowCount || 0;
        if (rowCount === 1) break;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }

      assert.equal(
        rowCount,
        1,
        'db.createAccount() must persist the account into PostgreSQL, not only the file store'
      );

      const status = db.getPostgresPersistenceStatus();
      assert.equal(status.configured, true, 'Persistence status must report PostgreSQL configured');
      assert.equal(status.poolAvailable, true, 'Persistence status must report the pool available');
      assert.equal(
        status.lastPersistError,
        null,
        `Dual-persistence must not record write failures (saw: ${JSON.stringify(status.lastPersistError)})`
      );
    } finally {
      db.deleteAccount(accountId);
      await pool.query('DELETE FROM accounts WHERE id = $1', [accountId]).catch(() => {});
    }

    const afterDelete = await pool.query('SELECT id FROM accounts WHERE id = $1', [accountId]);
    assert.equal(afterDelete.rowCount, 0, 'db.deleteAccount() must remove the PostgreSQL row');
  } finally {
    if (originalUrl) {
      process.env.DATABASE_URL = originalUrl;
    } else {
      delete process.env.DATABASE_URL;
    }
    await closePostgresPool();
  }
});
