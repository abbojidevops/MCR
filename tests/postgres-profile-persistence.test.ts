(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { NextRequest } from 'next/server';
import { Pool } from 'pg';
import { db } from '@/db/repository';
import { closePostgresPool } from '@/db/postgres';
import { createSessionToken } from '@/lib/session';
import { PATCH as settingsPatch } from '@/app/api/settings/route';
import { TENANT_EDITABLE_PROFILE_FIELDS } from '@/lib/settings-fields';

const ROOT = process.cwd();
const SECURE_TEST_DATABASE_URL =
  'postgresql://mcr_user:ProfilePersistSecure2026%21@127.0.0.1:5433/mcr_db';

type QueryCall = { sql: string; values: unknown[] };
type FakeQuery = (sql: string, values: unknown[]) => { rows?: any[]; rowCount?: number } | Promise<{ rows?: any[]; rowCount?: number }>;

async function withFakePostgres<T>(fakeQuery: FakeQuery, run: (calls: QueryCall[]) => Promise<T>): Promise<T> {
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
      `Postgres Profile Test ${Date.now()} ${Math.random().toString(36).slice(2, 6)}`,
      'plumbing',
      '+12175559876',
      'Persistence Test Owner',
      'Verizon Wireless'
    );
  } finally {
    if (originalUrl !== undefined) process.env.DATABASE_URL = originalUrl;
  }
}

function makeRequest(accountId: string, updates: Record<string, unknown>): NextRequest {
  const token = createSessionToken({ accountId, role: 'owner', isDemo: false });
  return new NextRequest(new URL('http://localhost:3001/api/settings'), {
    method: 'PATCH',
    headers: {
      'content-type': 'application/json',
      cookie: `mcr_session=${token}`,
    },
    body: JSON.stringify({ updates }),
  });
}

test('PGPROFILE-0: a new tenant account and its initial profile are persisted together', async () => {
  const created = makeTenant();
  const accountId = created.account.id;

  try {
    await withFakePostgres(
      async () => ({ rows: [], rowCount: 1 }),
      async (calls) => {
        const profile = await db.persistAccountAndBusinessProfile(accountId);
        assert.equal(profile?.account_id, accountId);
        assert.ok(calls.some((call) => call.sql.includes('INSERT INTO accounts')));
        const profileWrite = calls.find((call) => call.sql.includes('INSERT INTO business_profiles'));
        assert.ok(profileWrite, 'signup must insert the business profile after its parent account');
        assert.equal(profileWrite.values[1], accountId);
        assert.equal(profileWrite.values[2], created.profile.business_name);
        assert.equal(profileWrite.values[18], '[]');
        assert.equal(profileWrite.values[22], '["job.created","job.booked","job.updated"]');
      }
    );
  } finally {
    await closePostgresPool();
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    db.deleteAccount(accountId);
    if (originalUrl !== undefined) process.env.DATABASE_URL = originalUrl;
  }
});

test('PGPROFILE-1: profile changes update every submitted editable field in PostgreSQL', async () => {
  const created = makeTenant();
  const accountId = created.account.id;

  try {
    await withFakePostgres(
      async (sql) => {
        if (sql.includes('SELECT * FROM business_profiles')) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 1 };
      },
      async (calls) => {
        const updated = await db.updateBusinessProfilePersistent(accountId, {
          business_name: 'Persisted Plumbing Co',
          custom_emergency_keywords: ['slab leak', 'pump failure'],
          custom_intake_question: 'What stopped working?',
          crm_webhook_url: 'https://crm.example.test/hooks/mcr',
          crm_webhook_secret: 'test-secret',
          crm_webhook_events: ['job.created', 'job.booked'],
        });

        assert.equal(updated?.business_name, 'Persisted Plumbing Co');
        const profileWrites = calls.filter((call) => call.sql.includes('UPDATE business_profiles SET'));
        assert.equal(profileWrites.length, 1, 'save the requested profile fields in one targeted update');
        const profileWrite = profileWrites[0];
        assert.match(profileWrite.sql, /UPDATE business_profiles SET[\s\S]*RETURNING \*/);
        assert.equal(profileWrite.values[0], accountId);
        assert.equal(profileWrite.values[1], 'Persisted Plumbing Co');
        assert.equal(profileWrite.values[2], '["slab leak","pump failure"]');
        assert.equal(profileWrite.values[3], 'What stopped working?');
        assert.equal(profileWrite.values[4], 'https://crm.example.test/hooks/mcr');
        assert.equal(profileWrite.values[5], 'test-secret');
        assert.equal(profileWrite.values[6], '["job.created","job.booked"]');
      }
    );
  } finally {
    await closePostgresPool();
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    db.deleteAccount(accountId);
    if (originalUrl !== undefined) process.env.DATABASE_URL = originalUrl;
  }
});

test('PGPROFILE-2: a fresh process cache hydrates the complete profile from PostgreSQL', async () => {
  const created = makeTenant();
  const accountId = created.account.id;
  const row = {
    id: created.profile.id,
    account_id: accountId,
    business_name: 'Restored from PostgreSQL',
    legal_name: 'Restored Services LLC',
    trade: 'hvac',
    is_demo: false,
    ein: null,
    address: '88 Main Street',
    city: 'Denver',
    state: 'CO',
    zip: '80202',
    timezone: 'America/Denver',
    website: 'https://restored.example.test',
    emergency_phone: '+13035550101',
    notification_phone: '+13035550102',
    carrier_name: 'T-Mobile',
    forwarding_configured: true,
    average_ticket: '425.50',
    custom_emergency_keywords: ['furnace leak', 'no heat'],
    custom_intake_question: 'What is the thermostat showing?',
    crm_webhook_url: 'https://crm.example.test/restore',
    crm_webhook_secret: 'restored-secret',
    crm_webhook_events: ['job.booked'],
    created_at: new Date('2026-01-02T03:04:05.000Z'),
    updated_at: new Date('2026-08-09T10:11:12.000Z'),
  };

  try {
    await withFakePostgres(
      async (sql) => sql.includes('SELECT * FROM business_profiles')
        ? { rows: [row], rowCount: 1 }
        : { rows: [], rowCount: 1 },
      async () => {
        const profile = await db.hydrateBusinessProfileFromPostgres(accountId);
        assert.equal(profile?.business_name, 'Restored from PostgreSQL');
        assert.equal(profile?.trade, 'hvac');
        assert.equal(profile?.timezone, 'America/Denver');
        assert.equal(profile?.average_ticket, 425.5);
        assert.deepEqual(profile?.custom_emergency_keywords, ['furnace leak', 'no heat']);
        assert.equal(profile?.custom_intake_question, 'What is the thermostat showing?');
        assert.equal(profile?.crm_webhook_secret, 'restored-secret');
        assert.deepEqual(profile?.crm_webhook_events, ['job.booked']);
        assert.equal(profile?.updated_at, '2026-08-09T10:11:12.000Z');
        assert.equal(db.getBusinessProfile(accountId)?.business_name, 'Restored from PostgreSQL');
      }
    );
  } finally {
    await closePostgresPool();
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    db.deleteAccount(accountId);
    if (originalUrl !== undefined) process.env.DATABASE_URL = originalUrl;
  }
});

test('PGPROFILE-3: failed PostgreSQL writes do not update the local profile cache', async () => {
  const created = makeTenant();
  const accountId = created.account.id;
  const originalBusinessName = created.profile.business_name;

  try {
    await withFakePostgres(
      async (sql) => {
        if (sql.includes('UPDATE business_profiles SET')) {
          throw new Error('simulated PostgreSQL write failure');
        }
        return { rows: [], rowCount: 1 };
      },
      async () => {
        await assert.rejects(
          db.updateBusinessProfilePersistent(accountId, { business_name: 'Must Not Be Saved' }),
          /simulated PostgreSQL write failure/
        );
        assert.equal(db.getBusinessProfile(accountId)?.business_name, originalBusinessName);
      }
    );
  } finally {
    await closePostgresPool();
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    db.deleteAccount(accountId);
    if (originalUrl !== undefined) process.env.DATABASE_URL = originalUrl;
  }
});

test('PGPROFILE-4: settings API returns an explicit failure instead of claiming a failed save', async () => {
  const created = makeTenant();
  const accountId = created.account.id;
  const originalBusinessName = created.profile.business_name;

  try {
    await withFakePostgres(
      async (sql) => {
        if (sql.includes('SELECT * FROM business_profiles')) return { rows: [], rowCount: 0 };
        if (sql.includes('UPDATE business_profiles SET')) {
          throw new Error('database unavailable');
        }
        return { rows: [], rowCount: 1 };
      },
      async () => {
        const response = await settingsPatch(
          makeRequest(accountId, { business_name: 'Not Actually Saved' })
        );
        const body = await response.json();
        assert.equal(response.status, 503);
        assert.equal(body.success, undefined);
        assert.match(body.error, /Your changes were not saved/);
        assert.equal(db.getBusinessProfile(accountId)?.business_name, originalBusinessName);
      }
    );
  } finally {
    await closePostgresPool();
    const originalUrl = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    db.deleteAccount(accountId);
    if (originalUrl !== undefined) process.env.DATABASE_URL = originalUrl;
  }
});

test('PGPROFILE-5: schema upgrades old profile tables and migration includes all supported profile fields', () => {
  const schema = readFileSync(join(ROOT, 'src/db/schema.sql'), 'utf8');
  const migration = readFileSync(join(ROOT, 'scripts/migrate-to-postgres.ts'), 'utf8');

  for (const column of [
    'is_demo',
    'average_ticket',
    'custom_emergency_keywords',
    'custom_intake_question',
    'crm_webhook_url',
    'crm_webhook_secret',
    'crm_webhook_events',
  ]) {
    assert.match(schema, new RegExp(`ADD COLUMN IF NOT EXISTS ${column}\\b`), `${column} must be added to existing deployments`);
    assert.match(migration, new RegExp(`prof\\.${column}\\b`), `${column} must be imported from the file store`);
  }

  const settingsPage = readFileSync(join(ROOT, 'src/app/dashboard/settings/page.tsx'), 'utf8');
  assert.match(settingsPage, /Weekly business-hour scheduling is not available/);
  assert.doesNotMatch(settingsPage, /After-Hours Auto Text-Back/);
  assert.equal(TENANT_EDITABLE_PROFILE_FIELDS.includes('after_hours_enabled' as any), false);
  assert.equal(TENANT_EDITABLE_PROFILE_FIELDS.includes('after_hours_message' as any), false);
});
