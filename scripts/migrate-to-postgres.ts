import fs from 'fs';
import path from 'path';
import { getPostgresPool, checkPostgresConnection, initializePostgresSchema } from '../src/db/postgres';

async function main() {
  console.log('====================================================');
  console.log('MCR — PostgreSQL Migration & Synchronization Tool');
  console.log('====================================================\n');

  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ Error: DATABASE_URL environment variable is not defined.');
    console.log('Example: DATABASE_URL=postgresql://mcr_user:<SECURE_PASSWORD>@localhost:5432/mcr_db');
    process.exit(1);
  }

  console.log('1. Checking PostgreSQL Connection ...');
  const connected = await checkPostgresConnection();
  if (!connected) {
    console.error('❌ Failed to connect to PostgreSQL at:', dbUrl);
    process.exit(1);
  }
  console.log('   ✓ Connected to PostgreSQL successfully.\n');

  console.log('2. Applying Schema (src/db/schema.sql) ...');
  const schemaResult = await initializePostgresSchema();
  if (!schemaResult.success) {
    console.error('❌ Schema initialization failed:', schemaResult.error);
    process.exit(1);
  }
  console.log('   ✓ PostgreSQL tables, foreign keys, and indexes initialized.\n');

  console.log('3. Loading JSON Database (data/mcr_db.json) ...');
  const jsonPath = path.join(process.cwd(), 'data', 'mcr_db.json');
  if (!fs.existsSync(jsonPath)) {
    console.error('❌ data/mcr_db.json not found!');
    process.exit(1);
  }
  const dbData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));
  console.log(`   ✓ Found ${dbData.accounts?.length || 0} accounts, ${dbData.jobs?.length || 0} jobs, ${dbData.callRecords?.length || 0} call records.\n`);

  const pool = getPostgresPool()!;

  console.log('4. Migrating Core Entities to PostgreSQL ...');
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    // 4.1 Plans
    if (dbData.plans?.length) {
      for (const p of dbData.plans) {
        await client.query(
          `INSERT INTO subscription_plans (id, name, monthly_price_cents, included_calls, included_sms, included_numbers, max_users, features)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             monthly_price_cents = EXCLUDED.monthly_price_cents,
             included_calls = EXCLUDED.included_calls,
             included_sms = EXCLUDED.included_sms;`,
          [p.id, p.name, p.monthly_price_cents, p.included_calls, p.included_sms, p.included_numbers || 1, p.max_users || 2, JSON.stringify(p.features || [])]
        );
      }
      console.log(`   ✓ Migrated ${dbData.plans.length} subscription plans.`);
    }

    // 4.2 Accounts
    if (dbData.accounts?.length) {
      for (const acc of dbData.accounts) {
        await client.query(
          `INSERT INTO accounts (id, name, slug, status, plan_tier, trial_ends_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             name = EXCLUDED.name,
             status = EXCLUDED.status,
             plan_tier = EXCLUDED.plan_tier;`,
          [acc.id, acc.name, acc.slug, acc.status, acc.plan_tier, acc.trial_ends_at || new Date().toISOString(), acc.created_at || new Date().toISOString(), acc.updated_at || new Date().toISOString()]
        );
      }
      console.log(`   ✓ Migrated ${dbData.accounts.length} tenant accounts.`);
    }

    // 4.3 Business Profiles
    if (dbData.profiles?.length) {
      for (const prof of dbData.profiles) {
        await client.query(
          `INSERT INTO business_profiles (id, account_id, business_name, trade, emergency_phone, notification_phone, timezone)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (account_id) DO UPDATE SET
             business_name = EXCLUDED.business_name,
             trade = EXCLUDED.trade,
             emergency_phone = EXCLUDED.emergency_phone;`,
          [prof.id || prof.account_id, prof.account_id, prof.business_name, prof.trade || 'plumbing', prof.emergency_phone, prof.notification_phone, prof.timezone || 'America/Chicago']
        );
      }
      console.log(`   ✓ Migrated ${dbData.profiles.length} business profiles.`);
    }

    // 4.4 Phone Numbers
    if (dbData.phoneNumbers?.length) {
      for (const num of dbData.phoneNumbers) {
        await client.query(
          `INSERT INTO phone_numbers (id, account_id, phone_number, formatted_number, twilio_sid, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (phone_number) DO UPDATE SET
             status = EXCLUDED.status;`,
          [num.id, num.account_id, num.phone_number, num.formatted_number || num.phone_number, num.twilio_sid, num.status || 'active']
        );
      }
      console.log(`   ✓ Migrated ${dbData.phoneNumbers.length} phone numbers.`);
    }

    // 4.5 Contacts
    if (dbData.contacts?.length) {
      for (const c of dbData.contacts) {
        await client.query(
          `INSERT INTO contacts (id, account_id, phone_number, full_name, email, address)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (account_id, phone_number) DO UPDATE SET
             full_name = EXCLUDED.full_name,
             address = EXCLUDED.address;`,
          [c.id, c.account_id, c.phone_number, c.full_name, c.email, c.address]
        );
      }
      console.log(`   ✓ Migrated ${dbData.contacts.length} customer contacts.`);
    }

    // 4.6 Jobs
    if (dbData.jobs?.length) {
      for (const j of dbData.jobs) {
        await client.query(
          `INSERT INTO jobs (id, account_id, contact_id, title, trade, problem, is_emergency, address, photo_urls, status, estimated_value, actual_value, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             actual_value = EXCLUDED.actual_value;`,
          [
            j.id,
            j.account_id,
            j.contact_id,
            j.title,
            j.trade,
            j.problem,
            j.is_emergency || false,
            j.address,
            JSON.stringify(j.photo_urls || []),
            j.status,
            j.estimated_value || 0,
            j.actual_value || null,
            j.notes || '',
            j.created_at || new Date().toISOString(),
            j.updated_at || new Date().toISOString(),
          ]
        );
      }
      console.log(`   ✓ Migrated ${dbData.jobs.length} jobs.`);
    }

    // 4.7 Subscriptions
    if (dbData.subscriptions?.length) {
      for (const s of dbData.subscriptions) {
        await client.query(
          `INSERT INTO subscriptions (id, account_id, plan_id, status, stripe_customer_id, current_period_end)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (account_id) DO UPDATE SET
             status = EXCLUDED.status,
             plan_id = EXCLUDED.plan_id;`,
          [s.id, s.account_id, s.plan_id, s.status, s.stripe_customer_id, s.current_period_end || new Date().toISOString()]
        );
      }
      console.log(`   ✓ Migrated ${dbData.subscriptions.length} subscriptions.`);
    }

    await client.query('COMMIT');
    console.log('\n====================================================');
    console.log('✅ POSTGRESQL MIGRATION COMPLETED SUCCESSFULLY!');
    console.log('====================================================');
  } catch (err: any) {
    await client.query('ROLLBACK');
    console.error('❌ Migration transaction rolled back:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(console.error);
