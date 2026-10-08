-- ============================================================================
-- MCR - Missed Call Revenue Recovery for Local Service Businesses
-- Production-Ready Multi-Tenant PostgreSQL Schema
-- ============================================================================

-- Extensions
--
-- This schema intentionally declares NO extensions.
-- All primary keys are application-generated VARCHAR(100) identifiers, so neither
-- "uuid-ossp" nor "pgcrypto" is referenced anywhere below.
--
-- Deployment rule: managed PostgreSQL providers (Railway, Render, RDS, Cloud SQL)
-- frequently run the application role without the privilege required to
-- CREATE EXTENSION, and slim/self-hosted PostgreSQL images may not ship the
-- contrib modules at all. Because scripts/db-init.mjs applies this file inside a
-- single transaction, a single unauthorized CREATE EXTENSION statement aborts the
-- entire schema and fails the deployment. Keep this file free of extension
-- dependencies; if UUID generation is ever required, use the core built-in
-- gen_random_uuid() (PostgreSQL 13+) rather than a contrib extension.

-- 1. USERS & IDENTITY
CREATE TABLE IF NOT EXISTS users (
    id VARCHAR(100) PRIMARY KEY,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    full_name VARCHAR(150) NOT NULL,
    phone VARCHAR(30),
    role VARCHAR(50) DEFAULT 'owner', -- 'owner', 'manager', 'technician', 'admin'
    is_active BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 2. ACCOUNTS / TENANTS
CREATE TABLE IF NOT EXISTS accounts (
    id VARCHAR(100) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    slug VARCHAR(100) UNIQUE NOT NULL,
    status VARCHAR(50) DEFAULT 'trial', -- 'trial', 'active', 'past_due', 'paused', 'canceled'
    plan_tier VARCHAR(50) DEFAULT 'starter', -- 'starter', 'pro', 'business'
    trial_ends_at TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '14 days'),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 3. ACCOUNT_USERS (Multi-tenant user assignment)
CREATE TABLE IF NOT EXISTS account_users (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'member', -- 'owner', 'admin', 'member'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, user_id)
);


-- 3b. USER CREDENTIALS (Secure Password Storage)
CREATE TABLE IF NOT EXISTS user_credentials (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) NOT NULL,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    email VARCHAR(255) UNIQUE NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    algorithm VARCHAR(50) DEFAULT 'scrypt',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_user_credentials_email ON user_credentials(email);
CREATE INDEX IF NOT EXISTS idx_user_credentials_account ON user_credentials(account_id);

-- 4. BUSINESS PROFILES
CREATE TABLE IF NOT EXISTS business_profiles (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) UNIQUE NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    business_name VARCHAR(255) NOT NULL,
    legal_name VARCHAR(255),
    trade VARCHAR(100) NOT NULL, -- 'plumbing', 'hvac', 'electrical', 'garage_door', 'locksmith', 'roofing', 'landscaping', 'pest_control'
    ein VARCHAR(50),
    address VARCHAR(255),
    city VARCHAR(100),
    state VARCHAR(50),
    zip VARCHAR(20),
    timezone VARCHAR(50) DEFAULT 'America/New_York',
    website VARCHAR(255),
    emergency_phone VARCHAR(30),
    notification_phone VARCHAR(30),
    carrier_name VARCHAR(100),
    forwarding_configured BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 5. BUSINESS HOURS
CREATE TABLE IF NOT EXISTS business_hours (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    day_of_week INT NOT NULL CHECK (day_of_week BETWEEN 0 AND 6), -- 0=Sunday, 6=Saturday
    open_time TIME DEFAULT '08:00:00',
    close_time TIME DEFAULT '17:00:00',
    is_closed BOOLEAN DEFAULT FALSE,
    UNIQUE(account_id, day_of_week)
);

-- 6. PHONE NUMBERS (Twilio Provisioned / Connected Numbers)
CREATE TABLE IF NOT EXISTS phone_numbers (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    phone_number VARCHAR(30) UNIQUE NOT NULL, -- E.164 formatted
    formatted_number VARCHAR(30) NOT NULL,
    twilio_sid VARCHAR(100) UNIQUE,
    status VARCHAR(50) DEFAULT 'active', -- 'pending', 'active', 'released'
    capabilities JSONB DEFAULT '{"voice": true, "sms": true, "mms": true}',
    carrier_sid VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 7. PHONE NUMBER ASSIGNMENTS
CREATE TABLE IF NOT EXISTS phone_number_assignments (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    phone_number_id VARCHAR(100) NOT NULL REFERENCES phone_numbers(id) ON DELETE CASCADE,
    assigned_user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
    purpose VARCHAR(100) DEFAULT 'missed_call_recovery',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 8. CONTACTS (Customers who called)
CREATE TABLE IF NOT EXISTS contacts (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    phone_number VARCHAR(30) NOT NULL,
    full_name VARCHAR(150),
    email VARCHAR(255),
    address TEXT,
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, phone_number)
);

-- 9. CALL RECORDS
CREATE TABLE IF NOT EXISTS call_records (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    twilio_call_sid VARCHAR(100) UNIQUE NOT NULL,
    from_number VARCHAR(30) NOT NULL,
    to_number VARCHAR(30) NOT NULL,
    direction VARCHAR(20) DEFAULT 'inbound',
    start_time TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    end_time TIMESTAMPTZ,
    duration INT DEFAULT 0,
    call_status VARCHAR(50) NOT NULL, -- 'completed', 'busy', 'no-answer', 'canceled', 'failed'
    missed_reason VARCHAR(100), -- 'no-answer', 'busy', 'after-hours', 'manual'
    forwarded_status VARCHAR(50), -- 'conditionally-forwarded', 'direct', 'fallback'
    text_back_status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'sent', 'suppressed', 'deduplicated', 'failed'
    deduplication_state VARCHAR(50) DEFAULT 'first_call',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 10. CALL EVENTS
CREATE TABLE IF NOT EXISTS call_events (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    call_record_id VARCHAR(100) REFERENCES call_records(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 11. CONVERSATIONS (SMS Threads)
CREATE TABLE IF NOT EXISTS conversations (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    contact_id VARCHAR(100) NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    status VARCHAR(50) DEFAULT 'active', -- 'active', 'closed', 'archived'
    last_message_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    deduplication_key VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 12. MESSAGES
CREATE TABLE IF NOT EXISTS messages (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    conversation_id VARCHAR(100) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    direction VARCHAR(20) NOT NULL, -- 'inbound', 'outbound'
    from_number VARCHAR(30) NOT NULL,
    to_number VARCHAR(30) NOT NULL,
    body TEXT NOT NULL,
    media_urls JSONB DEFAULT '[]',
    twilio_message_sid VARCHAR(100) UNIQUE,
    status VARCHAR(50) DEFAULT 'delivered', -- 'queued', 'sent', 'delivered', 'failed', 'received'
    error_code VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 13. INTAKE SESSIONS (SMS Qualification Engine)
CREATE TABLE IF NOT EXISTS intake_sessions (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    conversation_id VARCHAR(100) NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
    trade VARCHAR(100) NOT NULL,
    current_step VARCHAR(50) DEFAULT 'ASK_EMERGENCY', -- 'NEW', 'ASK_EMERGENCY', 'ASK_PROBLEM', 'ASK_ADDRESS', 'ASK_PHOTO', 'QUALIFIED', 'COMPLETED'
    is_emergency BOOLEAN DEFAULT FALSE,
    problem_description TEXT,
    address TEXT,
    photo_urls JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'in_progress', -- 'in_progress', 'completed', 'abandoned', 'escalated'
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 14. INTAKE QUESTIONS (Configurable per Trade)
CREATE TABLE IF NOT EXISTS intake_questions (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) REFERENCES accounts(id) ON DELETE CASCADE, -- NULL for system defaults
    trade VARCHAR(100) NOT NULL,
    step_order INT NOT NULL,
    question_key VARCHAR(50) NOT NULL,
    question_text TEXT NOT NULL,
    question_type VARCHAR(50) DEFAULT 'text', -- 'boolean', 'text', 'address', 'photo'
    options JSONB DEFAULT '[]',
    is_required BOOLEAN DEFAULT TRUE,
    is_active BOOLEAN DEFAULT TRUE
);

-- 15. INTAKE ANSWERS
CREATE TABLE IF NOT EXISTS intake_answers (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    intake_session_id VARCHAR(100) NOT NULL REFERENCES intake_sessions(id) ON DELETE CASCADE,
    question_key VARCHAR(50) NOT NULL,
    answer_text TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 16. JOBS (Recovered Job Cards)
CREATE TABLE IF NOT EXISTS jobs (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    contact_id VARCHAR(100) NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
    intake_session_id VARCHAR(100) REFERENCES intake_sessions(id) ON DELETE SET NULL,
    conversation_id VARCHAR(100) REFERENCES conversations(id) ON DELETE SET NULL,
    title VARCHAR(255) NOT NULL,
    trade VARCHAR(100) NOT NULL,
    problem TEXT,
    is_emergency BOOLEAN DEFAULT FALSE,
    address TEXT,
    photo_urls JSONB DEFAULT '[]',
    status VARCHAR(50) DEFAULT 'NEW', -- 'NEW', 'CONTACTED', 'BOOKED', 'DEAD'
    estimated_value NUMERIC(10, 2) DEFAULT 350.00,
    actual_value NUMERIC(10, 2),
    notes TEXT,
    first_call_time TIMESTAMPTZ,
    text_back_time TIMESTAMPTZ,
    qualified_time TIMESTAMPTZ,
    contacted_time TIMESTAMPTZ,
    booked_time TIMESTAMPTZ,
    dead_time TIMESTAMPTZ,
    assigned_user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 17. JOB STATUS HISTORY
CREATE TABLE IF NOT EXISTS job_status_history (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    job_id VARCHAR(100) NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
    previous_status VARCHAR(50),
    new_status VARCHAR(50) NOT NULL,
    changed_by_user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
    reason TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 18. NOTIFICATIONS
CREATE TABLE IF NOT EXISTS notifications (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id VARCHAR(100) REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(255) NOT NULL,
    body TEXT NOT NULL,
    type VARCHAR(50) DEFAULT 'missed_call', -- 'missed_call', 'emergency', 'qualified_job', 'daily_summary', 'weekly_report'
    is_read BOOLEAN DEFAULT FALSE,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 19. NOTIFICATION PREFERENCES
CREATE TABLE IF NOT EXISTS notification_preferences (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    user_id VARCHAR(100) NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel_sms BOOLEAN DEFAULT TRUE,
    channel_push BOOLEAN DEFAULT TRUE,
    channel_email BOOLEAN DEFAULT TRUE,
    notify_on_missed_call BOOLEAN DEFAULT TRUE,
    notify_on_emergency BOOLEAN DEFAULT TRUE,
    notify_on_qualified_job BOOLEAN DEFAULT TRUE,
    phone_number VARCHAR(30),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, user_id)
);

-- 20. CANNED REPLIES
CREATE TABLE IF NOT EXISTS canned_replies (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    title VARCHAR(150) NOT NULL,
    shortcut VARCHAR(50),
    body TEXT NOT NULL,
    trade VARCHAR(100),
    is_default BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 21. SUPPRESSION LIST (STOP / Opt-Out)
CREATE TABLE IF NOT EXISTS suppression_list (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    phone_number VARCHAR(30) NOT NULL,
    opt_out_type VARCHAR(50) DEFAULT 'sms_stop', -- 'sms_stop', 'manual', 'complaint'
    reason TEXT,
    source VARCHAR(50) DEFAULT 'inbound_sms',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(account_id, phone_number)
);

-- 22. CONSENT LOGS (Immutable Compliance Evidence)
CREATE TABLE IF NOT EXISTS consent_logs (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    phone_number VARCHAR(30) NOT NULL,
    consent_type VARCHAR(50) NOT NULL, -- 'inbound_call_opt_in', 'explicit_consent', 'opt_out'
    consent_status VARCHAR(50) NOT NULL, -- 'granted', 'revoked'
    source VARCHAR(100) NOT NULL,
    ip_address VARCHAR(50),
    audit_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 23. COMPLIANCE REGISTRATIONS (A2P 10DLC)
CREATE TABLE IF NOT EXISTS compliance_registrations (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) UNIQUE NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    legal_name VARCHAR(255) NOT NULL,
    ein VARCHAR(50),
    business_type VARCHAR(50) DEFAULT 'LLC', -- 'LLC', 'Corporation', 'Sole Proprietorship', 'Partnership'
    address VARCHAR(255),
    website VARCHAR(255),
    contact_name VARCHAR(150),
    contact_email VARCHAR(255),
    contact_phone VARCHAR(30),
    brand_sid VARCHAR(100),
    campaign_sid VARCHAR(100),
    status VARCHAR(50) DEFAULT 'signed_up', -- 'signed_up', 'brand_submitted', 'brand_approved', 'campaign_submitted', 'campaign_approved', 'number_linked', 'sms_live', 'rejected'
    rejection_reason TEXT,
    sample_messages JSONB DEFAULT '["[Business Name] - sorry we missed your call. How can we help?", "Thanks for the details. A technician is on the way."]',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 24. COMPLIANCE EVENTS
CREATE TABLE IF NOT EXISTS compliance_events (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    compliance_id VARCHAR(100) NOT NULL REFERENCES compliance_registrations(id) ON DELETE CASCADE,
    event_type VARCHAR(100) NOT NULL,
    status VARCHAR(50) NOT NULL,
    details TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 25. SUBSCRIPTION PLANS
CREATE TABLE IF NOT EXISTS subscription_plans (
    id VARCHAR(50) PRIMARY KEY, -- 'starter', 'pro', 'business'
    name VARCHAR(100) NOT NULL,
    monthly_price_cents INT NOT NULL,
    included_calls INT NOT NULL,
    included_sms INT NOT NULL,
    included_numbers INT DEFAULT 1,
    max_users INT DEFAULT 2,
    features JSONB DEFAULT '[]',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 26. SUBSCRIPTIONS
CREATE TABLE IF NOT EXISTS subscriptions (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) UNIQUE NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    plan_id VARCHAR(50) NOT NULL REFERENCES subscription_plans(id),
    stripe_customer_id VARCHAR(100),
    stripe_subscription_id VARCHAR(100) UNIQUE,
    status VARCHAR(50) DEFAULT 'trialing', -- 'trialing', 'active', 'past_due', 'canceled', 'unpaid', 'paused'
    current_period_start TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    current_period_end TIMESTAMPTZ DEFAULT (CURRENT_TIMESTAMP + INTERVAL '30 days'),
    cancel_at_period_end BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 27. USAGE RECORDS
CREATE TABLE IF NOT EXISTS usage_records (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    period_start TIMESTAMPTZ NOT NULL,
    period_end TIMESTAMPTZ NOT NULL,
    calls_count INT DEFAULT 0,
    sms_count INT DEFAULT 0,
    mms_count INT DEFAULT 0,
    numbers_count INT DEFAULT 1,
    overage_amount_cents INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 28. INVOICES
CREATE TABLE IF NOT EXISTS invoices (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    stripe_invoice_id VARCHAR(100) UNIQUE,
    amount_due_cents INT NOT NULL,
    amount_paid_cents INT DEFAULT 0,
    status VARCHAR(50) DEFAULT 'paid', -- 'paid', 'open', 'void', 'uncollectible'
    invoice_url TEXT,
    pdf_url TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 29. PAYMENT EVENTS
CREATE TABLE IF NOT EXISTS payment_events (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    stripe_event_id VARCHAR(100) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    payload JSONB,
    status VARCHAR(50) DEFAULT 'processed',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 30. WEBHOOK EVENTS (Idempotency Tracking)
CREATE TABLE IF NOT EXISTS webhook_events (
    id VARCHAR(100) PRIMARY KEY,
    provider VARCHAR(50) NOT NULL, -- 'twilio_voice', 'twilio_sms', 'stripe'
    event_id VARCHAR(150) UNIQUE NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    account_id VARCHAR(100) REFERENCES accounts(id) ON DELETE SET NULL,
    payload JSONB NOT NULL,
    status VARCHAR(50) DEFAULT 'pending', -- 'pending', 'processed', 'ignored', 'failed'
    processed_at TIMESTAMPTZ,
    error TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 31. AUDIT LOGS
CREATE TABLE IF NOT EXISTS audit_logs (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) REFERENCES accounts(id) ON DELETE CASCADE,
    user_id VARCHAR(100) REFERENCES users(id) ON DELETE SET NULL,
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(100) NOT NULL,
    resource_id VARCHAR(100),
    metadata JSONB DEFAULT '{}',
    ip_address VARCHAR(50),
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 32. SYSTEM ERRORS
CREATE TABLE IF NOT EXISTS system_errors (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) REFERENCES accounts(id) ON DELETE SET NULL,
    error_code VARCHAR(100) NOT NULL,
    message TEXT NOT NULL,
    stack_trace TEXT,
    endpoint VARCHAR(255),
    context JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 33. ADMIN USERS
CREATE TABLE IF NOT EXISTS admin_users (
    id VARCHAR(100) PRIMARY KEY,
    user_id VARCHAR(100) UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    role VARCHAR(50) DEFAULT 'super_admin',
    permissions JSONB DEFAULT '["*"]',
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- 34. TRADE TEMPLATES
CREATE TABLE IF NOT EXISTS trade_templates (
    id VARCHAR(50) PRIMARY KEY, -- 'plumbing', 'hvac', 'electrical', 'garage_door', 'locksmith', 'roofing', 'landscaping', 'pest_control'
    display_name VARCHAR(100) NOT NULL,
    initial_text_back TEXT NOT NULL,
    emergency_keywords JSONB DEFAULT '[]',
    questions JSONB DEFAULT '[]',
    canned_replies JSONB DEFAULT '[]',
    is_active BOOLEAN DEFAULT TRUE
);

-- 35. MEDIA ATTACHMENTS (Photos sent by callers)
CREATE TABLE IF NOT EXISTS media_attachments (
    id VARCHAR(100) PRIMARY KEY,
    account_id VARCHAR(100) NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
    intake_session_id VARCHAR(100) REFERENCES intake_sessions(id) ON DELETE CASCADE,
    job_id VARCHAR(100) REFERENCES jobs(id) ON DELETE SET NULL,
    file_name VARCHAR(255) NOT NULL,
    file_url TEXT NOT NULL,
    mime_type VARCHAR(100),
    file_size INT,
    storage_path TEXT,
    created_at TIMESTAMPTZ DEFAULT CURRENT_TIMESTAMP
);

-- ============================================================================
-- INDEXES FOR HIGH-THROUGHPUT MULTI-TENANT QUERYING
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_accounts_slug ON accounts(slug);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_number ON phone_numbers(phone_number);
CREATE INDEX IF NOT EXISTS idx_phone_numbers_account ON phone_numbers(account_id);
CREATE INDEX IF NOT EXISTS idx_call_records_account ON call_records(account_id);
CREATE INDEX IF NOT EXISTS idx_call_records_twilio_sid ON call_records(twilio_call_sid);
CREATE INDEX IF NOT EXISTS idx_call_records_from_number ON call_records(from_number);
CREATE INDEX IF NOT EXISTS idx_conversations_account ON conversations(account_id);
CREATE INDEX IF NOT EXISTS idx_conversations_contact ON conversations(contact_id);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_account ON messages(account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_account ON jobs(account_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_emergency ON jobs(is_emergency);
CREATE INDEX IF NOT EXISTS idx_suppression_phone ON suppression_list(account_id, phone_number);
CREATE INDEX IF NOT EXISTS idx_webhook_events_lookup ON webhook_events(provider, event_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_account ON audit_logs(account_id);
