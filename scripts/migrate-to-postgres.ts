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
  console.log(
    `   ✓ Found ${dbData.accounts?.length || 0} accounts, ${dbData.jobs?.length || 0} jobs, ${dbData.callRecords?.length || 0} call records.\n`
  );

  const pool = getPostgresPool()!;

  console.log('4. Migrating Entities to PostgreSQL ...');
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
          [
            p.id,
            p.name,
            p.monthly_price_cents,
            p.included_calls,
            p.included_sms,
            p.included_numbers || 1,
            p.max_users || 2,
            JSON.stringify(p.features || []),
          ]
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
          [
            acc.id,
            acc.name,
            acc.slug,
            acc.status,
            acc.plan_tier,
            acc.trial_ends_at || new Date().toISOString(),
            acc.created_at || new Date().toISOString(),
            acc.updated_at || new Date().toISOString(),
          ]
        );
      }
      console.log(`   ✓ Migrated ${dbData.accounts.length} tenant accounts.`);
    }

    // 4.3 User Credentials
    if (dbData.userCredentials?.length) {
      for (const cred of dbData.userCredentials) {
        await client.query(
          `INSERT INTO user_credentials (id, user_id, account_id, email, password_hash, algorithm, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           ON CONFLICT (id) DO UPDATE SET
             email = EXCLUDED.email,
             password_hash = EXCLUDED.password_hash,
             algorithm = EXCLUDED.algorithm;`,
          [
            cred.id,
            cred.user_id,
            cred.account_id,
            cred.email.toLowerCase(),
            cred.password_hash,
            cred.algorithm || 'scrypt',
            cred.created_at || new Date().toISOString(),
            cred.updated_at || new Date().toISOString(),
          ]
        );
      }
      console.log(`   ✓ Migrated ${dbData.userCredentials.length} user credentials.`);
    }

    // 4.4 Business Profiles
    if (dbData.profiles?.length) {
      for (const prof of dbData.profiles) {
        await client.query(
          `INSERT INTO business_profiles (
             id, account_id, business_name, legal_name, trade, is_demo, ein, address, city, state, zip,
             timezone, website, emergency_phone, notification_phone, carrier_name, forwarding_configured,
             average_ticket, custom_emergency_keywords, custom_intake_question, crm_webhook_url,
             crm_webhook_secret, crm_webhook_events, created_at, updated_at
           ) VALUES (
             $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
             $18, $19::jsonb, $20, $21, $22, $23::jsonb, $24, $25
           )
           ON CONFLICT (account_id) DO UPDATE SET
             business_name = EXCLUDED.business_name,
             legal_name = EXCLUDED.legal_name,
             trade = EXCLUDED.trade,
             is_demo = EXCLUDED.is_demo,
             ein = EXCLUDED.ein,
             address = EXCLUDED.address,
             city = EXCLUDED.city,
             state = EXCLUDED.state,
             zip = EXCLUDED.zip,
             timezone = EXCLUDED.timezone,
             website = EXCLUDED.website,
             emergency_phone = EXCLUDED.emergency_phone,
             notification_phone = EXCLUDED.notification_phone,
             carrier_name = EXCLUDED.carrier_name,
             forwarding_configured = EXCLUDED.forwarding_configured,
             average_ticket = EXCLUDED.average_ticket,
             custom_emergency_keywords = EXCLUDED.custom_emergency_keywords,
             custom_intake_question = EXCLUDED.custom_intake_question,
             crm_webhook_url = EXCLUDED.crm_webhook_url,
             crm_webhook_secret = EXCLUDED.crm_webhook_secret,
             crm_webhook_events = EXCLUDED.crm_webhook_events,
             updated_at = EXCLUDED.updated_at;`,
          [
            prof.id || prof.account_id,
            prof.account_id,
            prof.business_name,
            prof.legal_name || null,
            prof.trade || 'plumbing',
            prof.is_demo ?? false,
            prof.ein || null,
            prof.address || null,
            prof.city || null,
            prof.state || null,
            prof.zip || null,
            prof.timezone || 'America/Chicago',
            prof.website || null,
            prof.emergency_phone || null,
            prof.notification_phone || null,
            prof.carrier_name || null,
            prof.forwarding_configured ?? false,
            Number.isFinite(prof.average_ticket) ? prof.average_ticket : null,
            JSON.stringify(Array.isArray(prof.custom_emergency_keywords) ? prof.custom_emergency_keywords : []),
            prof.custom_intake_question || null,
            prof.crm_webhook_url || null,
            prof.crm_webhook_secret || null,
            JSON.stringify(
              Array.isArray(prof.crm_webhook_events)
                ? prof.crm_webhook_events
                : ['job.created', 'job.booked', 'job.updated']
            ),
            prof.created_at || new Date().toISOString(),
            prof.updated_at || new Date().toISOString(),
          ]
        );
      }
      console.log(`   ✓ Migrated ${dbData.profiles.length} business profiles and editable settings.`);
    }

    // 4.5 Phone Numbers
    if (dbData.phoneNumbers?.length) {
      for (const num of dbData.phoneNumbers) {
        await client.query(
          `INSERT INTO phone_numbers (id, account_id, phone_number, formatted_number, twilio_sid, status)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (phone_number) DO UPDATE SET
             status = EXCLUDED.status;`,
          [
            num.id,
            num.account_id,
            num.phone_number,
            num.formatted_number || num.phone_number,
            num.twilio_sid,
            num.status || 'active',
          ]
        );
      }
      console.log(`   ✓ Migrated ${dbData.phoneNumbers.length} phone numbers.`);
    }

    // 4.6 Contacts
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

    // 4.7 Call Records
    if (dbData.callRecords?.length) {
      for (const cr of dbData.callRecords) {
        await client.query(
          `INSERT INTO call_records (id, account_id, twilio_call_sid, from_number, to_number, call_status, missed_reason, forwarded_status, text_back_status, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
           ON CONFLICT (twilio_call_sid) DO UPDATE SET
             text_back_status = EXCLUDED.text_back_status;`,
          [
            cr.id,
            cr.account_id,
            cr.twilio_call_sid,
            cr.from_number,
            cr.to_number,
            cr.call_status,
            cr.missed_reason || 'no-answer',
            cr.forwarded_status || 'direct',
            cr.text_back_status || 'sent',
            cr.created_at || new Date().toISOString(),
            cr.updated_at || new Date().toISOString(),
          ]
        );
      }
      console.log(`   ✓ Migrated ${dbData.callRecords.length} call records.`);
    }

    // 4.8 Conversations
    if (dbData.conversations?.length) {
      for (const conv of dbData.conversations) {
        await client.query(
          `INSERT INTO conversations (id, account_id, contact_id, status, last_message_at, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             last_message_at = EXCLUDED.last_message_at;`,
          [
            conv.id,
            conv.account_id,
            conv.contact_id,
            conv.status || 'active',
            conv.last_message_at || new Date().toISOString(),
            conv.created_at || new Date().toISOString(),
            conv.updated_at || new Date().toISOString(),
          ]
        );
      }
      console.log(`   ✓ Migrated ${dbData.conversations.length} conversations.`);
    }

    // 4.9 Messages
    if (dbData.messages?.length) {
      for (const msg of dbData.messages) {
        await client.query(
          `INSERT INTO messages (id, account_id, conversation_id, direction, from_number, to_number, body, twilio_message_sid, status, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             body = EXCLUDED.body;`,
          [
            msg.id,
            msg.account_id,
            msg.conversation_id,
            msg.direction,
            msg.from_number,
            msg.to_number,
            msg.body,
            msg.twilio_message_sid || `msg_sid_${msg.id}`,
            msg.status || 'delivered',
            msg.created_at || new Date().toISOString(),
          ]
        );
      }
      console.log(`   ✓ Migrated ${dbData.messages.length} messages.`);
    }

    // 4.10 Jobs
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

    // 4.11 Subscriptions
    if (dbData.subscriptions?.length) {
      for (const s of dbData.subscriptions) {
        await client.query(
          `INSERT INTO subscriptions (id, account_id, plan_id, status, stripe_customer_id, current_period_end)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (account_id) DO UPDATE SET
             status = EXCLUDED.status,
             plan_id = EXCLUDED.plan_id;`,
          [
            s.id,
            s.account_id,
            s.plan_id,
            s.status,
            s.stripe_customer_id,
            s.current_period_end || new Date().toISOString(),
          ]
        );
      }
      console.log(`   ✓ Migrated ${dbData.subscriptions.length} subscriptions.`);
    }

    // 4.12 Compliance Registrations
    if (dbData.compliance?.length) {
      for (const comp of dbData.compliance) {
        await client.query(
          `INSERT INTO compliance_registrations (id, account_id, legal_name, ein, business_type, address, website, contact_name, contact_email, contact_phone, brand_sid, campaign_sid, status, rejection_reason, sample_messages, created_at, updated_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
           ON CONFLICT (account_id) DO UPDATE SET
             status = EXCLUDED.status,
             brand_sid = EXCLUDED.brand_sid,
             campaign_sid = EXCLUDED.campaign_sid;`,
          [
            comp.id,
            comp.account_id,
            comp.legal_name,
            comp.ein || null,
            comp.business_type || 'LLC',
            comp.address || null,
            comp.website || null,
            comp.contact_name || null,
            comp.contact_email || null,
            comp.contact_phone || null,
            comp.brand_sid || null,
            comp.campaign_sid || null,
            comp.status,
            comp.rejection_reason || null,
            JSON.stringify(comp.sample_messages || []),
            comp.created_at || new Date().toISOString(),
            comp.updated_at || new Date().toISOString(),
          ]
        );
      }
      console.log(`   ✓ Migrated ${dbData.compliance.length} compliance registrations.`);
    }

    // 4.13 Consent Logs
    if (dbData.consentLogs?.length) {
      for (const cl of dbData.consentLogs) {
        await client.query(
          `INSERT INTO consent_logs (id, account_id, phone_number, consent_type, consent_status, source, ip_address, audit_notes, created_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO NOTHING;`,
          [
            cl.id,
            cl.account_id,
            cl.phone_number,
            cl.consent_type,
            cl.consent_status,
            cl.source,
            cl.ip_address || null,
            cl.audit_notes || null,
            cl.created_at || new Date().toISOString(),
          ]
        );
      }
      console.log(`   ✓ Migrated ${dbData.consentLogs.length} consent logs.`);
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
