import fs from 'fs';
import path from 'path';
// Static imports are REQUIRED here. Reaching these helpers through a dynamic
// `require('./postgres')` breaks in the production build: webpack emits
// src/db/postgres.ts as an async module, so the dynamically required namespace is
// returned before its named exports are materialized. getPostgresPool() would then
// throw "… is not a function", which the surrounding try/catch reduced to a
// console warning — every PostgreSQL write silently no-opped while the API still
// reported success. Static imports let the bundler link the real exports.
import {
  getPostgresPool,
  isPostgresConfigured as isPostgresConfiguredFromPg,
} from './postgres';
import {
  Account,
  BusinessProfile,
  CallRecord,
  CannedReply,
  ComplianceRegistration,
  ComplianceHistoryEntry,
  ComplianceProvenance,
  ComplianceStatus,
  ConsentLog,
  Contact,
  Conversation,
  IntakeSession,
  JobCard,
  JobStatus,
  Message,
  Notification,
  PhoneNumber,
  Subscription,
  SubscriptionPlan,
  SuppressionEntry,
  UsageRecord,
  TradeKey,
  UserCredential,
} from '@/types';
import {
  SEED_ACCOUNTS,
  SEED_CALL_RECORDS,
  SEED_CANNED_REPLIES,
  SEED_COMPLIANCE,
  SEED_CONTACTS,
  SEED_CONVERSATIONS,
  SEED_JOBS,
  SEED_MESSAGES,
  SEED_NOTIFICATIONS,
  SEED_PHONE_NUMBERS,
  SEED_PLANS,
  SEED_PROFILES,
  SEED_SUBSCRIPTIONS,
  SEED_USAGE,
  SEED_USER_CREDENTIALS,
} from './seed-data';


interface DatabaseState {
  accounts: Account[];
  profiles: BusinessProfile[];
  phoneNumbers: PhoneNumber[];
  contacts: Contact[];
  callRecords: CallRecord[];
  conversations: Conversation[];
  messages: Message[];
  intakeSessions: IntakeSession[];
  jobs: JobCard[];
  cannedReplies: CannedReply[];
  suppressionList: SuppressionEntry[];
  consentLogs: ConsentLog[];
  compliance: ComplianceRegistration[];
  plans: SubscriptionPlan[];
  subscriptions: Subscription[];
  usage: UsageRecord[];
  notifications: Notification[];
  processedWebhooks: Record<string, { processedAt: string; provider: string; eventType: string }>;
  auditLogs: { id: string; accountId: string; action: string; timestamp: string; details?: any }[];
  userCredentials: UserCredential[];
  revokedSessions: string[];
}

// The data directory must resolve the same way here and in scripts/db-init.mjs
// (which probes it for the staging volume requirement), otherwise the pre-deploy
// check could pass while the runtime writes somewhere else entirely.
const DATA_DIR = process.env.MCR_DATA_DIR || path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'mcr_db.json');

const BUSINESS_PROFILE_UPSERT_SQL = `
  INSERT INTO business_profiles (
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
    updated_at = EXCLUDED.updated_at
`;

const ACCOUNT_UPSERT_SQL = `
  INSERT INTO accounts (id, name, slug, status, plan_tier, trial_ends_at, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (id) DO UPDATE SET
    name = EXCLUDED.name,
    slug = EXCLUDED.slug,
    status = EXCLUDED.status,
    plan_tier = EXCLUDED.plan_tier,
    trial_ends_at = EXCLUDED.trial_ends_at,
    updated_at = EXCLUDED.updated_at
`;

const ACCOUNT_ENSURE_SQL = `
  INSERT INTO accounts (id, name, slug, status, plan_tier, trial_ends_at, created_at, updated_at)
  VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
  ON CONFLICT (id) DO NOTHING
`;

const BUSINESS_PROFILE_MUTABLE_COLUMNS = new Set<string>([
  'business_name', 'legal_name', 'trade', 'is_demo', 'ein', 'address', 'city', 'state', 'zip',
  'timezone', 'website', 'emergency_phone', 'notification_phone', 'carrier_name',
  'forwarding_configured', 'average_ticket', 'custom_emergency_keywords',
  'custom_intake_question', 'crm_webhook_url', 'crm_webhook_secret', 'crm_webhook_events',
]);
const BUSINESS_PROFILE_JSON_COLUMNS = new Set(['custom_emergency_keywords', 'crm_webhook_events']);

function jsonStringArray(value: unknown, fallback: string[] = []): string {
  const values = Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string')
    : fallback;
  return JSON.stringify(values);
}

function parsePostgresStringArray(value: unknown): string[] | undefined {
  let parsed = value;
  if (typeof parsed === 'string') {
    try {
      parsed = JSON.parse(parsed);
    } catch {
      return undefined;
    }
  }
  if (!Array.isArray(parsed)) return undefined;
  return parsed.filter((item): item is string => typeof item === 'string');
}

function postgresTimestampToIso(value: unknown): string {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? value : parsed.toISOString();
  }
  return new Date().toISOString();
}

function mapPostgresBusinessProfile(row: any): BusinessProfile {
  const profile: BusinessProfile = {
    id: String(row.id),
    account_id: String(row.account_id),
    business_name: String(row.business_name || ''),
    trade: (row.trade || 'plumbing') as TradeKey,
    timezone: String(row.timezone || 'America/New_York'),
    forwarding_configured: Boolean(row.forwarding_configured),
    created_at: postgresTimestampToIso(row.created_at),
    updated_at: postgresTimestampToIso(row.updated_at),
  };

  const stringFields: (keyof BusinessProfile)[] = [
    'legal_name', 'ein', 'address', 'city', 'state', 'zip', 'website',
    'emergency_phone', 'notification_phone', 'carrier_name', 'custom_intake_question',
    'crm_webhook_url', 'crm_webhook_secret',
  ];
  for (const field of stringFields) {
    const value = row[field];
    if (value !== null && value !== undefined) {
      (profile as any)[field] = String(value);
    }
  }

  if (row.is_demo !== null && row.is_demo !== undefined) profile.is_demo = Boolean(row.is_demo);
  if (row.average_ticket !== null && row.average_ticket !== undefined) {
    const averageTicket = Number(row.average_ticket);
    if (Number.isFinite(averageTicket)) profile.average_ticket = averageTicket;
  }

  const customKeywords = parsePostgresStringArray(row.custom_emergency_keywords);
  if (customKeywords) profile.custom_emergency_keywords = customKeywords;
  const webhookEvents = parsePostgresStringArray(row.crm_webhook_events);
  if (webhookEvents) profile.crm_webhook_events = webhookEvents;

  return profile;
}

class DatabaseRepository {
  private state: DatabaseState;
  private initialized = false;
  /**
   * Most recent PostgreSQL dual-persistence failure, if any.
   * Surfaced by getPostgresPersistenceStatus() so a deployment that advertises
   * PostgreSQL storage but silently fails to write is visible to operators rather
   * than degrading to a console warning.
   */
  private lastPostgresPersistError: { operation: string; message: string; at: string } | null = null;
  private pendingAccountProfileWrites = new Map<string, Promise<BusinessProfile | null>>();

  constructor() {
    this.state = this.getInitialState();
    this.loadFromFile();
  }

  private getInitialState(): DatabaseState {
    return {
      accounts: [...SEED_ACCOUNTS],
      profiles: [...SEED_PROFILES],
      phoneNumbers: [...SEED_PHONE_NUMBERS],
      contacts: [...SEED_CONTACTS],
      callRecords: [...SEED_CALL_RECORDS],
      conversations: [...SEED_CONVERSATIONS],
      messages: [...SEED_MESSAGES],
      intakeSessions: [],
      jobs: [...SEED_JOBS],
      cannedReplies: [...SEED_CANNED_REPLIES],
      suppressionList: [],
      consentLogs: [],
      compliance: [...SEED_COMPLIANCE],
      plans: [...SEED_PLANS],
      subscriptions: [...SEED_SUBSCRIPTIONS],
      usage: [...SEED_USAGE],
      notifications: [...SEED_NOTIFICATIONS],
      processedWebhooks: {},
      auditLogs: [],
      userCredentials: [...SEED_USER_CREDENTIALS],
      revokedSessions: [],
    };
  }

  private loadFromFile() {
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (fs.existsSync(DB_FILE)) {
        const raw = fs.readFileSync(DB_FILE, 'utf-8');
        const parsed = JSON.parse(raw);
        this.state = {
          ...this.getInitialState(),
          ...parsed,
          userCredentials: parsed.userCredentials || [...SEED_USER_CREDENTIALS],
          revokedSessions: parsed.revokedSessions || [],
        };
        // Normalize simulation provenance
        this.state.callRecords.forEach((c) => {
          if (c.twilio_call_sid?.startsWith('CA_SIM_')) c.is_simulated = true;
        });
        this.state.conversations.forEach((conv) => {
          const simCall = this.state.callRecords.find((c) => c.is_simulated && c.account_id === conv.account_id);
          if (simCall && (conv as any).id?.includes('conv-sim')) conv.is_simulated = true;
        });
        this.state.jobs.forEach((j) => {
          if (j.call_record_id && this.state.callRecords.find((c) => c.id === j.call_record_id)?.is_simulated) {
            j.is_simulated = true;
          }
        });
      } else {
        this.saveToFile();
      }
      this.initialized = true;
    } catch (err) {
      console.warn('Repository file storage fallback to in-memory:', err);
      this.state = this.getInitialState();
    }
  }

  private saveToFile() {
    if (process.env.NODE_ENV === 'test') {
      return;
    }
    try {
      if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
      }
      fs.writeFileSync(DB_FILE, JSON.stringify(this.state, null, 2), 'utf-8');
    } catch (err) {
      console.error('Failed to write repository file:', err);
    }
  }


  public resetDatabase(): void {
    this.state = this.getInitialState();
    this.saveToFile();
  }

  // --------------------------------------------------------------------------
  // User Credentials & Authentication
  // --------------------------------------------------------------------------
  public findCredentialByEmail(email: string): UserCredential | undefined {
    const normalized = email.trim().toLowerCase();
    return this.state.userCredentials.find((c) => c.email.toLowerCase() === normalized);
  }

  public findCredentialByAccountId(accountId: string): UserCredential | undefined {
    return this.state.userCredentials.find((c) => c.account_id === accountId);
  }

  public getAllUserCredentials(): UserCredential[] {
    return [...this.state.userCredentials];
  }

  public getAllSubscriptions(): Subscription[] {
    return [...this.state.subscriptions];
  }

  public getAllCompliance(): ComplianceRegistration[] {
    return [...this.state.compliance];
  }

  public getAllJobs(): JobCard[] {
    return [...this.state.jobs];
  }

  public getAllConversations(): Conversation[] {
    return [...this.state.conversations];
  }

  public getAllCallRecords(): CallRecord[] {
    return [...this.state.callRecords];
  }

  public getTableCounts(): {
    accounts: number;
    credentials: number;
    compliance: number;
    jobs: number;
    conversations: number;
    calls: number;
    consentLogs: number;
  } {
    return {
      accounts: this.state.accounts.length,
      credentials: this.state.userCredentials.length,
      compliance: this.state.compliance.length,
      jobs: this.state.jobs.length,
      conversations: this.state.conversations.length,
      calls: this.state.callRecords.length,
      consentLogs: this.state.consentLogs.length,
    };
  }

  public getTableSnapshots(): {
    accounts: string[];
    credentials: string[];
    compliance: string[];
    jobs: string[];
    conversations: string[];
    calls: string[];
    consentLogs: string[];
  } {
    return {
      accounts: this.state.accounts.map((a) => a.id).sort(),
      credentials: this.state.userCredentials.map((c) => c.id).sort(),
      compliance: this.state.compliance.map((c) => c.id).sort(),
      jobs: this.state.jobs.map((j) => j.id).sort(),
      conversations: this.state.conversations.map((c) => c.id).sort(),
      calls: this.state.callRecords.map((c) => c.id).sort(),
      consentLogs: this.state.consentLogs.map((c) => c.id).sort(),
    };
  }

  public getAllConsentLogs(): ConsentLog[] {
    return [...this.state.consentLogs];
  }

  public recordConsentLog(log: Omit<ConsentLog, 'id' | 'created_at'>): ConsentLog {
    const entry: ConsentLog = {
      ...log,
      id: `consent-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
    };
    this.state.consentLogs.push(entry);
    this.saveToFile();
    return entry;
  }

  public createUserCredential(cred: Omit<UserCredential, 'id' | 'created_at' | 'updated_at'>): UserCredential {
    const newCred: UserCredential = {
      id: `cred-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      user_id: cred.user_id,
      account_id: cred.account_id,
      email: cred.email.trim().toLowerCase(),
      password_hash: cred.password_hash,
      algorithm: 'scrypt',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.state.userCredentials.push(newCred);
    this.saveToFile();
    return newCred;
  }

  public revokeSession(tokenOrSignature: string): void {
    if (!tokenOrSignature) return;
    const key = tokenOrSignature.includes('.') ? tokenOrSignature.split('.')[1] : tokenOrSignature;
    if (!this.state.revokedSessions.includes(key)) {
      this.state.revokedSessions.push(key);
      this.saveToFile();
    }
  }

  public isSessionRevoked(tokenOrSignature: string): boolean {
    if (!tokenOrSignature) return true;
    const key = tokenOrSignature.includes('.') ? tokenOrSignature.split('.')[1] : tokenOrSignature;
    return this.state.revokedSessions.includes(key) || this.state.revokedSessions.includes(tokenOrSignature);
  }

  public clearRevokedSessions(): void {
    this.state.revokedSessions = [];
    this.saveToFile();
  }

  // --------------------------------------------------------------------------
  // Multi-Tenant Isolation Enforcer
  // --------------------------------------------------------------------------
  public assertTenantAccess(requestedAccountId: string, resourceAccountId: string) {

    if (requestedAccountId !== resourceAccountId) {
      throw new Error(`TENANT_ISOLATION_VIOLATION: Access denied to tenant ${resourceAccountId}`);
    }
  }

  // --------------------------------------------------------------------------
  // Accounts & Profiles
  // --------------------------------------------------------------------------
  public getAccount(accountId: string): Account | undefined {
    return this.state.accounts.find((a) => a.id === accountId);
  }

  public getAllAccounts(): Account[] {
    return [...this.state.accounts];
  }

  public getBusinessProfile(accountId: string): BusinessProfile | undefined {
    return this.state.profiles.find((p) => p.account_id === accountId);
  }

  /**
   * Refresh the in-memory profile from PostgreSQL when a tenant request starts.
   * The file-backed profile remains the local/dev fallback when PostgreSQL is not
   * configured or when a tenant has not yet been migrated to the profile table.
   */
  public async hydrateBusinessProfileFromPostgres(accountId: string): Promise<BusinessProfile | undefined> {
    if (!this.isPostgresConfigured()) return this.getBusinessProfile(accountId);

    const pool = getPostgresPool();
    if (!pool) throw new Error('PostgreSQL is configured but its connection pool is unavailable');

    const result = await pool.query(
      'SELECT * FROM business_profiles WHERE account_id = $1 LIMIT 1',
      [accountId]
    );
    const row = result.rows?.[0];
    if (!row) return this.getBusinessProfile(accountId);

    const profile = mapPostgresBusinessProfile(row);
    const existingIndex = this.state.profiles.findIndex((item) => item.account_id === accountId);
    if (existingIndex >= 0) {
      this.state.profiles[existingIndex] = profile;
    } else {
      this.state.profiles.push(profile);
    }
    return profile;
  }

  /** Load all persisted profiles for operator screens that show every tenant. */
  public async hydrateAllBusinessProfilesFromPostgres(): Promise<void> {
    if (!this.isPostgresConfigured()) return;

    const pool = getPostgresPool();
    if (!pool) throw new Error('PostgreSQL is configured but its connection pool is unavailable');
    const result = await pool.query('SELECT * FROM business_profiles');

    for (const row of result.rows || []) {
      const profile = mapPostgresBusinessProfile(row);
      const existingIndex = this.state.profiles.findIndex((item) => item.account_id === profile.account_id);
      if (existingIndex >= 0) this.state.profiles[existingIndex] = profile;
      else this.state.profiles.push(profile);
    }
  }

  /**
   * Persist the account and its initial profile atomically before a new tenant
   * is reported as onboarded. Existing synchronous createAccount callers
   * also queue this write; API routes can await it for an honest success result.
   */
  public async persistAccountAndBusinessProfile(accountId: string): Promise<BusinessProfile | null> {
    const pending = this.pendingAccountProfileWrites.get(accountId);
    if (pending) return pending;

    const account = this.getAccount(accountId);
    const profile = this.getBusinessProfile(accountId);
    if (!account || !profile) return null;

    const write = (async () => {
      if (this.isPostgresConfigured()) {
        const pool = getPostgresPool();
        if (!pool) throw new Error('PostgreSQL is configured but its connection pool is unavailable');

        const client = await pool.connect();
        try {
          await client.query('BEGIN');
          await client.query(ACCOUNT_UPSERT_SQL, [
            account.id,
            account.name,
            account.slug,
            account.status,
            account.plan_tier,
            account.trial_ends_at,
            account.created_at,
            account.updated_at,
          ]);
          await this.upsertBusinessProfileWithPool(client, profile);
          await client.query('COMMIT');
        } catch (err) {
          await client.query('ROLLBACK').catch(() => {});
          throw err;
        } finally {
          client.release();
        }
      }
      this.saveToFile();
      return profile;
    })().catch((err: any) => {
      if (this.isPostgresConfigured()) {
        this.recordPostgresPersistFailure(`persistAccountAndBusinessProfile(${accountId})`, err?.message);
      }
      throw err;
    });

    this.pendingAccountProfileWrites.set(accountId, write);
    write.then(
      () => {
        if (this.pendingAccountProfileWrites.get(accountId) === write) {
          this.pendingAccountProfileWrites.delete(accountId);
        }
      },
      () => {
        if (this.pendingAccountProfileWrites.get(accountId) === write) {
          this.pendingAccountProfileWrites.delete(accountId);
        }
      }
    );
    return write;
  }

  /**
   * Awaitable, fail-closed profile mutation for API routes. If PostgreSQL is
   * configured, the change is committed there before the in-memory/file copy is
   * changed; a failed database write is never reported as a successful save.
   */
  public async updateBusinessProfilePersistent(
    accountId: string,
    updates: Partial<BusinessProfile>
  ): Promise<BusinessProfile | null> {
    const pending = this.pendingAccountProfileWrites.get(accountId);
    if (pending) await pending;

    const currentProfile = this.getBusinessProfile(accountId);
    if (!currentProfile) return null;

    const updated: BusinessProfile = {
      ...currentProfile,
      ...updates,
      updated_at: new Date().toISOString(),
    };

    if (this.isPostgresConfigured()) {
      const pool = getPostgresPool();
      if (!pool) throw new Error('PostgreSQL is configured but its connection pool is unavailable');
      const account = this.getAccount(accountId);
      if (!account) throw new Error('Cannot persist business profile without its tenant account');

      try {
        // Ensure the foreign-key parent exists without overwriting account status
        // or plan changes owned by other parts of the application.
        await pool.query(ACCOUNT_ENSURE_SQL, [
          account.id,
          account.name,
          account.slug,
          account.status,
          account.plan_tier,
          account.trial_ends_at,
          account.created_at,
          account.updated_at,
        ]);

        const fields = Object.entries(updates).filter(([field]) =>
          BUSINESS_PROFILE_MUTABLE_COLUMNS.has(field)
        );
        const values: unknown[] = [accountId];
        const assignments: string[] = [];
        for (const [field, value] of fields) {
          values.push(
            BUSINESS_PROFILE_JSON_COLUMNS.has(field)
              ? jsonStringArray(value)
              : field === 'average_ticket'
                ? (Number.isFinite(value) ? value : null)
                : (value ?? null)
          );
          const cast = BUSINESS_PROFILE_JSON_COLUMNS.has(field) ? '::jsonb' : '';
          assignments.push(`${field} = $${values.length}${cast}`);
        }
        values.push(updated.updated_at);
        assignments.push(`updated_at = $${values.length}`);

        const result = await pool.query(
          `UPDATE business_profiles SET ${assignments.join(', ')} WHERE account_id = $1 RETURNING *`,
          values
        );
        if (result.rows?.[0]) {
          Object.assign(updated, mapPostgresBusinessProfile(result.rows[0]));
        } else if (!result.rowCount) {
          // A tenant imported from the file store may not have a profile row yet.
          await this.upsertBusinessProfileWithPool(pool, updated);
        }
      } catch (err: any) {
        this.recordPostgresPersistFailure(`updateBusinessProfile(${accountId})`, err?.message);
        throw err;
      }
    }

    const profileIndex = this.state.profiles.findIndex((item) => item.account_id === accountId);
    if (profileIndex >= 0) this.state.profiles[profileIndex] = updated;
    this.saveToFile();
    return updated;
  }

  /** Synchronous file-store mutation retained for local unit fixtures. */
  public updateBusinessProfile(accountId: string, updates: Partial<BusinessProfile>): BusinessProfile | null {
    const profile = this.state.profiles.find((p) => p.account_id === accountId);
    if (!profile) return null;
    Object.assign(profile, updates, { updated_at: new Date().toISOString() });
    this.saveToFile();
    return profile;
  }

  private async upsertBusinessProfileWithPool(pool: any, profile: BusinessProfile): Promise<void> {
    const defaultWebhookEvents = ['job.created', 'job.booked', 'job.updated'];
    await pool.query(BUSINESS_PROFILE_UPSERT_SQL, [
      profile.id,
      profile.account_id,
      profile.business_name,
      profile.legal_name ?? null,
      profile.trade,
      profile.is_demo ?? false,
      profile.ein ?? null,
      profile.address ?? null,
      profile.city ?? null,
      profile.state ?? null,
      profile.zip ?? null,
      profile.timezone,
      profile.website ?? null,
      profile.emergency_phone ?? null,
      profile.notification_phone ?? null,
      profile.carrier_name ?? null,
      profile.forwarding_configured ?? false,
      Number.isFinite(profile.average_ticket) ? profile.average_ticket : null,
      jsonStringArray(profile.custom_emergency_keywords),
      profile.custom_intake_question ?? null,
      profile.crm_webhook_url ?? null,
      profile.crm_webhook_secret ?? null,
      jsonStringArray(profile.crm_webhook_events, defaultWebhookEvents),
      profile.created_at,
      profile.updated_at,
    ]);
  }

  public updateAccount(accountId: string, updates: Partial<Account>): Account | null {
    const account = this.state.accounts.find((a) => a.id === accountId);
    if (!account) return null;
    Object.assign(account, updates, { updated_at: new Date().toISOString() });
    this.saveToFile();
    return account;
  }


  public createAccount(
    name: string,
    trade: TradeKey,
    phone: string,
    ownerName: string,
    carrierName: string
  ): { account: Account; profile: BusinessProfile; phoneNumber: PhoneNumber } {
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
    const accountId = `acc-${slug}-${Date.now().toString(36)}`;

    const account: Account = {
      id: accountId,
      name,
      slug,
      status: 'trial',
      plan_tier: 'pro',
      trial_ends_at: new Date(Date.now() + 14 * 86400000).toISOString(),
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const profile: BusinessProfile = {
      id: `prof-${Date.now().toString(36)}`,
      account_id: accountId,
      business_name: name,
      trade,
      carrier_name: carrierName,
      timezone: 'America/New_York',
      notification_phone: phone,
      emergency_phone: phone,
      forwarding_configured: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const digits = phone.replace(/\D/g, '').slice(-10);
    const mockMcrNumber = `+1${digits.slice(0, 3)}555${digits.slice(-4)}`;

    const phoneNumber: PhoneNumber = {
      id: `phone-${Date.now().toString(36)}`,
      account_id: accountId,
      phone_number: mockMcrNumber,
      formatted_number: `+1 (${mockMcrNumber.slice(2, 5)}) ${mockMcrNumber.slice(5, 8)}-${mockMcrNumber.slice(8)}`,
      status: 'active',
      capabilities: { voice: true, sms: true, mms: true },
      created_at: new Date().toISOString(),
    };

    const compliance: ComplianceRegistration = {
      id: `comp-${Date.now().toString(36)}`,
      account_id: accountId,
      legal_name: `${name} LLC`,
      business_type: 'LLC',
      contact_name: ownerName,
      contact_phone: phone,
      status: 'signed_up',
      sample_messages: [
        `${name} — sorry we missed your call. How can we help?`,
      ],
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const subscription: Subscription = {
      id: `sub-${Date.now().toString(36)}`,
      account_id: accountId,
      plan_id: 'pro',
      status: 'trialing',
      current_period_start: new Date().toISOString(),
      current_period_end: new Date(Date.now() + 14 * 86400000).toISOString(),
      cancel_at_period_end: false,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    const usage: UsageRecord = {
      id: `use-${Date.now().toString(36)}`,
      account_id: accountId,
      period_start: new Date().toISOString(),
      period_end: new Date(Date.now() + 30 * 86400000).toISOString(),
      calls_count: 0,
      sms_count: 0,
      mms_count: 0,
      numbers_count: 1,
      overage_amount_cents: 0,
      created_at: new Date().toISOString(),
    };

    this.state.accounts.push(account);
    this.state.profiles.push(profile);
    this.state.phoneNumbers.push(phoneNumber);
    this.state.compliance.push(compliance);
    this.state.subscriptions.push(subscription);
    this.state.usage.push(usage);

    this.saveToFile();

    // Preserve the legacy synchronous API, but include the profile in its queued
    // PostgreSQL write. User-facing signup routes await the same write below.
    if (this.isPostgresConfigured()) {
      void this.persistAccountAndBusinessProfile(account.id).catch(() => {});
    }
    return { account, profile, phoneNumber };
  }

  public getAccountCount(): number {
    return this.state.accounts.length;
  }

  public deleteAccount(accountId: string): boolean {
    if (!accountId || typeof accountId !== 'string') {
      throw new Error('deleteAccount requires a non-empty string accountId');
    }
    // Never allow pattern/wildcard deletion or broad matchers
    if (accountId.includes('%') || accountId.includes('*') || accountId.includes('?') || accountId.trim() === '') {
      throw new Error(`deleteAccount rejects pattern or wildcard accountId: "${accountId}". Exact ID required.`);
    }

    const cleanId = accountId.trim();
    const existingIndex = this.state.accounts.findIndex((a) => a.id === cleanId);
    if (existingIndex === -1) {
      return false;
    }

    // Exact ID deletion across all collections
    this.state.accounts.splice(existingIndex, 1);
    this.state.profiles = this.state.profiles.filter((p) => p.account_id !== cleanId);
    this.state.phoneNumbers = this.state.phoneNumbers.filter((p) => p.account_id !== cleanId);
    this.state.compliance = this.state.compliance.filter((c) => c.account_id !== cleanId);
    this.state.subscriptions = this.state.subscriptions.filter((s) => s.account_id !== cleanId);
    this.state.usage = this.state.usage.filter((u) => u.account_id !== cleanId);
    this.state.userCredentials = this.state.userCredentials.filter((c) => c.account_id !== cleanId);
    this.state.auditLogs = this.state.auditLogs.filter((a) => a.accountId !== cleanId);
    this.state.jobs = this.state.jobs.filter((j) => j.account_id !== cleanId);
    this.state.conversations = this.state.conversations.filter((c) => c.account_id !== cleanId);
    this.state.messages = this.state.messages.filter((m) => m.account_id !== cleanId);
    this.state.contacts = this.state.contacts.filter((c) => c.account_id !== cleanId);
    this.state.callRecords = this.state.callRecords.filter((c) => c.account_id !== cleanId);
    this.state.intakeSessions = this.state.intakeSessions.filter((i) => i.account_id !== cleanId);
    this.state.cannedReplies = this.state.cannedReplies.filter((r) => r.account_id !== cleanId);
    this.state.suppressionList = this.state.suppressionList.filter((s) => s.account_id !== cleanId);
    this.state.consentLogs = this.state.consentLogs.filter((c) => c.account_id !== cleanId);
    this.state.notifications = this.state.notifications.filter((n) => n.account_id !== cleanId);

    // Dual persistence: PostgreSQL deletion if configured
    if (this.isPostgresConfigured()) {
      try {
        const pool = getPostgresPool();
        if (pool) {
          pool.query('DELETE FROM accounts WHERE id = $1', [cleanId]).catch((err: any) => {
            this.recordPostgresPersistFailure(`deleteAccount(${cleanId})`, err?.message);
          });
        }
      } catch (err: any) {
        console.warn('[Postgres deleteAccount pool error]:', err?.message);
      }
    }

    this.saveToFile();
    return true;
  }

  // --------------------------------------------------------------------------
  // Phone Number Resolution
  // --------------------------------------------------------------------------
  public getPhoneNumberByNumber(phoneNumber: string): PhoneNumber | undefined {
    const clean = phoneNumber.replace(/\D/g, '');
    return this.state.phoneNumbers.find((p) => p.phone_number.replace(/\D/g, '').endsWith(clean.slice(-10)));
  }

  public getPhoneNumbers(accountId: string): PhoneNumber[] {
    return this.state.phoneNumbers.filter((p) => p.account_id === accountId);
  }

  // --------------------------------------------------------------------------
  // Contacts
  // --------------------------------------------------------------------------
  public getOrCreateContact(accountId: string, rawPhone: string, fullName?: string): Contact {
    const clean = rawPhone.replace(/\D/g, '');
    let contact = this.state.contacts.find(
      (c) => c.account_id === accountId && c.phone_number.replace(/\D/g, '').endsWith(clean.slice(-10))
    );
    if (!contact) {
      contact = {
        id: `cont-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        account_id: accountId,
        phone_number: rawPhone,
        full_name: fullName || 'Unknown Caller',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.state.contacts.push(contact);
      this.saveToFile();
    } else if (fullName && (contact.full_name === 'Caller' || contact.full_name === 'Unknown Caller' || !contact.full_name)) {
      contact.full_name = fullName;
      contact.updated_at = new Date().toISOString();
      this.saveToFile();
    }
    return contact;
  }

  public getContact(contactId: string): Contact | undefined {
    return this.state.contacts.find((c) => c.id === contactId);
  }

  // --------------------------------------------------------------------------
  // Call Records & Deduplication (2-Hour Window)
  // --------------------------------------------------------------------------
  public recordCall(params: {
    accountId: string;
    twilioCallSid: string;
    fromNumber: string;
    toNumber: string;
    duration?: number;
    callStatus: CallRecord['call_status'];
    missedReason?: CallRecord['missed_reason'];
    forwardedStatus?: CallRecord['forwarded_status'];
  }): { callRecord: CallRecord; isDeduplicated: boolean } {
    const fromClean = params.fromNumber.replace(/\D/g, '').slice(-10);

    // Deduplication check: Has caller called this account within the last 2 hours?
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const recentCall = this.state.callRecords.find(
      (c) =>
        c.account_id === params.accountId &&
        c.from_number.replace(/\D/g, '').endsWith(fromClean) &&
        c.created_at >= twoHoursAgo &&
        c.text_back_status === 'sent'
    );

    const isDeduplicated = !!recentCall;
    const isSimulated = Boolean(params.twilioCallSid && params.twilioCallSid.startsWith('CA_SIM_'));

    const callRecord: CallRecord = {
      id: `call-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      account_id: params.accountId,
      twilio_call_sid: params.twilioCallSid,
      from_number: params.fromNumber,
      to_number: params.toNumber,
      direction: 'inbound',
      start_time: new Date().toISOString(),
      duration: params.duration || 0,
      call_status: params.callStatus,
      missed_reason: params.missedReason || 'no-answer',
      forwarded_status: params.forwardedStatus || 'conditionally-forwarded',
      text_back_status: isDeduplicated ? 'deduplicated' : 'pending',
      deduplication_state: isDeduplicated ? 'duplicate_suppressed' : 'first_call',
      is_simulated: isSimulated,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.state.callRecords.unshift(callRecord);

    // Track usage
    const usage = this.state.usage.find((u) => u.account_id === params.accountId);
    if (usage) {
      usage.calls_count += 1;
    }

    this.saveToFile();
    return { callRecord, isDeduplicated };
  }

  public updateCallRecord(callId: string, updates: Partial<CallRecord>): void {
    const call = this.state.callRecords.find((c) => c.id === callId || c.twilio_call_sid === callId);
    if (call) {
      Object.assign(call, updates, { updated_at: new Date().toISOString() });
      this.saveToFile();
    }
  }

  public getCallRecords(accountId: string): CallRecord[] {
    return this.state.callRecords.filter((c) => c.account_id === accountId);
  }

  public getCallBySid(sid: string): CallRecord | undefined {
    return this.state.callRecords.find((c) => c.twilio_call_sid === sid || c.id === sid);
  }

  public createOutboundBridgeCall(params: {
    accountId: string;
    twilioCallSid: string;
    fromNumber: string;
    toNumber: string;
    contractorPhone?: string;
  }): CallRecord {
    const isSimulated =
      params.twilioCallSid.startsWith('CA_MOCK_') || params.twilioCallSid.startsWith('CA_SIM_');

    const callRecord: CallRecord = {
      id: `call-bridge-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      account_id: params.accountId,
      twilio_call_sid: params.twilioCallSid,
      from_number: params.fromNumber,
      to_number: params.toNumber,
      direction: 'outbound',
      start_time: new Date().toISOString(),
      duration: 0,
      call_status: 'completed',
      text_back_status: 'suppressed',
      deduplication_state: 'first_call',
      is_simulated: isSimulated,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    this.state.callRecords.unshift(callRecord);

    const usage = this.state.usage.find((u) => u.account_id === params.accountId);
    if (usage) {
      usage.calls_count += 1;
    }

    this.saveToFile();
    return callRecord;
  }

  public deleteCallRecord(callId: string): boolean {
    const idx = this.state.callRecords.findIndex((c) => c.id === callId || c.twilio_call_sid === callId);
    if (idx === -1) return false;
    this.state.callRecords.splice(idx, 1);
    this.saveToFile();
    return true;
  }

  // --------------------------------------------------------------------------
  // Conversations & Messages
  // --------------------------------------------------------------------------
  public getOrCreateConversation(accountId: string, contactId: string, isSimulated?: boolean): Conversation {
    let conv = this.state.conversations.find((c) => c.account_id === accountId && c.contact_id === contactId);
    if (!conv) {
      conv = {
        id: `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        account_id: accountId,
        contact_id: contactId,
        status: 'active',
        is_simulated: !!isSimulated,
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.state.conversations.unshift(conv);
      this.saveToFile();
    } else if (isSimulated && !conv.is_simulated) {
      conv.is_simulated = true;
      this.saveToFile();
    }
    return conv;
  }

  public getConversations(accountId: string): (Conversation & { contact?: Contact; latestMessage?: Message })[] {
    const accountConvs = this.state.conversations.filter((c) => c.account_id === accountId);
    return accountConvs.map((conv) => {
      const contact = this.state.contacts.find((ct) => ct.id === conv.contact_id);
      const messages = this.state.messages.filter((m) => m.conversation_id === conv.id);
      const latestMessage = messages[messages.length - 1];
      return {
        ...conv,
        contact,
        latestMessage,
        latest_message: latestMessage,
        messageCount: messages.length,
        message_count: messages.length,
      };
    });
  }

  public getConversation(accountId: string, conversationId: string): (Conversation & { contact?: Contact }) | undefined {
    const conv = this.state.conversations.find((c) => c.id === conversationId && c.account_id === accountId);
    if (!conv) return undefined;
    const contact = this.state.contacts.find((ct) => ct.id === conv.contact_id);
    return { ...conv, contact };
  }

  public getMessages(accountId: string, conversationId: string): Message[] | null {
    const conv = this.state.conversations.find((c) => c.id === conversationId && c.account_id === accountId);
    if (!conv) {
      return null;
    }
    return this.state.messages.filter((m) => m.conversation_id === conversationId && m.account_id === accountId);
  }

  public addMessage(params: {
    accountId: string;
    conversationId: string;
    direction: 'inbound' | 'outbound';
    fromNumber: string;
    toNumber: string;
    body: string;
    mediaUrls?: string[];
    twilioMessageSid?: string;
  }): Message | null {
    const conv = this.state.conversations.find((c) => c.id === params.conversationId && c.account_id === params.accountId);
    if (!conv) {
      return null;
    }
    conv.last_message_at = new Date().toISOString();
    conv.updated_at = new Date().toISOString();

    const isSimulatedMessage = Boolean(
      conv.is_simulated || (params.twilioMessageSid && params.twilioMessageSid.startsWith('SM_SIM_'))
    );
    if (isSimulatedMessage && !conv.is_simulated) {
      conv.is_simulated = true;
    }

    const message: Message = {
      id: `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      account_id: params.accountId,
      conversation_id: params.conversationId,
      direction: params.direction,
      from_number: params.fromNumber,
      to_number: params.toNumber,
      body: params.body,
      media_urls: params.mediaUrls || [],
      twilio_message_sid: params.twilioMessageSid,
      status: params.direction === 'inbound' ? 'received' : 'delivered',
      is_simulated: isSimulatedMessage,
      created_at: new Date().toISOString(),
    };

    this.state.messages.push(message);

    // Track usage
    const usage = this.state.usage.find((u) => u.account_id === params.accountId);
    if (usage) {
      usage.sms_count += 1;
      if (params.mediaUrls && params.mediaUrls.length > 0) {
        usage.mms_count += params.mediaUrls.length;
      }
    }

    this.saveToFile();
    return message;
  }

  public updateConversation(
    accountId: string,
    conversationId: string,
    updates: Partial<Conversation>
  ): Conversation | undefined {
    const conv = this.state.conversations.find((c) => c.id === conversationId && c.account_id === accountId);
    if (!conv) return undefined;
    Object.assign(conv, updates, { updated_at: new Date().toISOString() });
    this.saveToFile();
    return conv;
  }

  public deleteMessage(messageId: string): boolean {
    const idx = this.state.messages.findIndex((m) => m.id === messageId);
    if (idx === -1) return false;
    this.state.messages.splice(idx, 1);
    this.saveToFile();
    return true;
  }

  public deleteConversation(accountId: string, conversationId: string): boolean {
    const idx = this.state.conversations.findIndex((c) => c.id === conversationId && c.account_id === accountId);
    if (idx === -1) return false;
    this.state.conversations.splice(idx, 1);
    this.state.messages = this.state.messages.filter((m) => m.conversation_id !== conversationId);
    this.state.intakeSessions = this.state.intakeSessions.filter((s) => s.conversation_id !== conversationId);
    this.saveToFile();
    return true;
  }


  // --------------------------------------------------------------------------
  // Intake Sessions
  // --------------------------------------------------------------------------
  public getOrCreateIntakeSession(accountId: string, conversationId: string, trade: TradeKey): IntakeSession {
    let session = this.state.intakeSessions.find((s) => s.conversation_id === conversationId);
    const conv = this.state.conversations.find((c) => c.id === conversationId);
    const isSimulated = conv?.is_simulated === true;
    if (!session) {
      session = {
        id: `intake-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        account_id: accountId,
        conversation_id: conversationId,
        trade,
        current_step: 'ASK_EMERGENCY',
        is_emergency: false,
        photo_urls: [],
        status: 'in_progress',
        is_simulated: isSimulated,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.state.intakeSessions.push(session);
      this.saveToFile();
    } else if (isSimulated && !session.is_simulated) {
      session.is_simulated = true;
      this.saveToFile();
    }
    return session;
  }

  public updateIntakeSession(sessionId: string, updates: Partial<IntakeSession>): IntakeSession {
    const session = this.state.intakeSessions.find((s) => s.id === sessionId);
    if (!session) throw new Error(`Intake session ${sessionId} not found`);
    Object.assign(session, updates, { updated_at: new Date().toISOString() });
    this.saveToFile();
    return session;
  }

  // --------------------------------------------------------------------------
  // Job Cards
  // --------------------------------------------------------------------------
  public getJobs(accountId: string): (JobCard & { contact?: Contact })[] {
    const accountJobs = this.state.jobs.filter((j) => j.account_id === accountId);
    return accountJobs.map((job) => {
      const contact = this.state.contacts.find((c) => c.id === job.contact_id);
      return { ...job, contact };
    });
  }

  public getJob(accountId: string, jobId: string): (JobCard & { contact?: Contact }) | undefined {
    const job = this.state.jobs.find((j) => j.id === jobId && j.account_id === accountId);
    if (!job) return undefined;
    const contact = this.state.contacts.find((c) => c.id === job.contact_id);
    return { ...job, contact };
  }

  public createJob(jobData: Omit<JobCard, 'id' | 'created_at' | 'updated_at'>): JobCard {
    const now = new Date().toISOString();
    const defaultRecoverySource = `Missed Call — ${new Date().toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}`;

    // Inherit simulation provenance downstream from call, intake session, or conversation
    let isSimulated = Boolean(jobData.is_simulated);
    if (!isSimulated && jobData.call_record_id) {
      const origCall = this.state.callRecords.find((c) => c.id === jobData.call_record_id);
      if (origCall?.is_simulated) isSimulated = true;
    }
    if (!isSimulated && jobData.intake_session_id) {
      const origIntake = this.state.intakeSessions.find((s) => s.id === jobData.intake_session_id);
      if (origIntake?.is_simulated) isSimulated = true;
    }
    if (!isSimulated && jobData.conversation_id) {
      const origConv = this.state.conversations.find((c) => c.id === jobData.conversation_id);
      if (origConv?.is_simulated) isSimulated = true;
    }

    // Duplicate Prevention: Check if job already exists for this intake session, conversation, or call
    const existing = this.state.jobs.find(
      (j) =>
        j.account_id === jobData.account_id &&
        ((jobData.intake_session_id && j.intake_session_id === jobData.intake_session_id) ||
          (jobData.conversation_id && j.conversation_id === jobData.conversation_id) ||
          (jobData.call_record_id && j.call_record_id === jobData.call_record_id) ||
          (jobData.contact_id && j.contact_id === jobData.contact_id && j.status === 'NEW'))
    );

    if (existing) {
      Object.assign(existing, jobData, {
        is_simulated: isSimulated || existing.is_simulated || false,
        recovery_source: existing.recovery_source || jobData.recovery_source || defaultRecoverySource,
        updated_at: now,
      });
      this.saveToFile();
      return existing;
    }

    const job: JobCard = {
      id: `job-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      recovery_source: jobData.recovery_source || defaultRecoverySource,
      ...jobData,
      is_simulated: isSimulated,
      created_at: now,
      updated_at: now,
    };
    this.state.jobs.unshift(job);
    this.saveToFile();
    return job;
  }

  public updateJobStatus(accountId: string, jobId: string, newStatus: JobStatus, actualValue?: number): JobCard {
    const job = this.state.jobs.find((j) => j.id === jobId && j.account_id === accountId);
    if (!job) throw new Error(`Job ${jobId} not found for account ${accountId}`);

    const now = new Date().toISOString();
    job.status = newStatus;
    job.updated_at = now;

    if (newStatus === 'CONTACTED' && !job.contacted_time) {
      job.contacted_time = now;
    } else if (newStatus === 'BOOKED') {
      if (!job.booked_time) job.booked_time = now;
      if (actualValue !== undefined) job.actual_value = actualValue;
    } else if (newStatus === 'COMPLETED') {
      if (!job.completed_time) job.completed_time = now;
      if (!job.booked_time) job.booked_time = now;
      if (actualValue !== undefined) {
        job.actual_value = actualValue;
      } else if (job.actual_value === undefined) {
        job.actual_value = job.estimated_value;
      }
    } else if (newStatus === 'DEAD' && !job.dead_time) {
      job.dead_time = now;
    }

    this.saveToFile();
    return job;
  }

  public updateJob(accountId: string, jobId: string, updates: Partial<JobCard>): JobCard | null {
    const job = this.state.jobs.find((j) => j.id === jobId && j.account_id === accountId);
    if (!job) return null;


    const now = new Date().toISOString();
    Object.assign(job, updates, { updated_at: now });

    if (updates.status === 'CONTACTED' && !job.contacted_time) {
      job.contacted_time = now;
    } else if (updates.status === 'BOOKED' && !job.booked_time) {
      job.booked_time = now;
    } else if (updates.status === 'COMPLETED') {
      if (!job.completed_time) job.completed_time = now;
      if (!job.booked_time) job.booked_time = now;
      if (updates.actual_value !== undefined) {
        job.actual_value = updates.actual_value;
      } else if (job.actual_value === undefined) {
        job.actual_value = job.estimated_value;
      }
    } else if (updates.status === 'DEAD' && !job.dead_time) {
      job.dead_time = now;
    }

    this.saveToFile();
    return job;
  }

  // --------------------------------------------------------------------------
  // Suppression & Opt-Out
  // --------------------------------------------------------------------------
  public isNumberSuppressed(accountId: string, phoneNumber: string): boolean {
    const clean = phoneNumber.replace(/\D/g, '').slice(-10);
    return this.state.suppressionList.some(
      (s) => s.account_id === accountId && s.phone_number.replace(/\D/g, '').endsWith(clean)
    );
  }

  public addSuppression(accountId: string, phoneNumber: string, reason: string = 'User sent STOP'): void {
    const clean = phoneNumber.replace(/\D/g, '').slice(-10);
    if (!this.isNumberSuppressed(accountId, phoneNumber)) {
      this.state.suppressionList.push({
        id: `supp-${Date.now().toString(36)}`,
        account_id: accountId,
        phone_number: phoneNumber,
        opt_out_type: 'sms_stop',
        reason,
        source: 'inbound_sms',
        created_at: new Date().toISOString(),
      });

      // Immutable consent log
      this.state.consentLogs.push({
        id: `consent-${Date.now().toString(36)}`,
        account_id: accountId,
        phone_number: phoneNumber,
        consent_type: 'opt_out',
        consent_status: 'revoked',
        source: 'inbound_sms_stop',
        audit_notes: `Suppression registered: ${reason}`,
        created_at: new Date().toISOString(),
      });

      this.saveToFile();
    }
  }

  public removeSuppression(accountId: string, phoneNumber: string): void {
    const clean = phoneNumber.replace(/\D/g, '').slice(-10);
    this.state.suppressionList = this.state.suppressionList.filter(
      (s) => !(s.account_id === accountId && s.phone_number.replace(/\D/g, '').endsWith(clean))
    );

    // Consent log
    this.state.consentLogs.push({
      id: `consent-${Date.now().toString(36)}`,
      account_id: accountId,
      phone_number: phoneNumber,
      consent_type: 'explicit_consent',
      consent_status: 'granted',
      source: 'inbound_sms_start',
      audit_notes: 'User opted back in via START / UNSTOP',
      created_at: new Date().toISOString(),
    });

    this.saveToFile();
  }

  public deleteSuppression(accountId: string, phoneNumber: string): boolean {
    const clean = phoneNumber.replace(/\D/g, '').slice(-10);
    const initialLen = this.state.suppressionList.length;
    this.state.suppressionList = this.state.suppressionList.filter(
      (s) => !(s.account_id === accountId && s.phone_number.replace(/\D/g, '').endsWith(clean))
    );
    const removed = this.state.suppressionList.length < initialLen;
    if (removed) {
      this.saveToFile();
    }
    return removed;
  }

  // --------------------------------------------------------------------------
  // Notifications
  // --------------------------------------------------------------------------
  public getNotifications(accountId: string): Notification[] {
    return this.state.notifications.filter((n) => n.account_id === accountId);
  }

  public addNotification(notification: Omit<Notification, 'id' | 'created_at'>): Notification {
    const notif: Notification = {
      id: `notif-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      ...notification,
      created_at: new Date().toISOString(),
    };
    this.state.notifications.unshift(notif);
    this.saveToFile();
    return notif;
  }

  public markNotificationRead(accountId: string, notifId: string): void {
    const notif = this.state.notifications.find((n) => n.id === notifId && n.account_id === accountId);
    if (notif) {
      notif.is_read = true;
      this.saveToFile();
    }
  }

  // --------------------------------------------------------------------------
  // Canned Replies
  // --------------------------------------------------------------------------
  public getCannedReplies(accountId: string): CannedReply[] {
    return this.state.cannedReplies.filter((c) => c.account_id === accountId);
  }

  public addCannedReply(reply: Omit<CannedReply, 'id' | 'created_at'>): CannedReply {
    const cr: CannedReply = {
      id: `canned-${Date.now().toString(36)}`,
      ...reply,
      created_at: new Date().toISOString(),
    };
    this.state.cannedReplies.push(cr);
    this.saveToFile();
    return cr;
  }

  // --------------------------------------------------------------------------
  // Compliance
  // --------------------------------------------------------------------------
  public getCompliance(accountId: string): ComplianceRegistration | undefined {
    return this.state.compliance.find((c) => c.account_id === accountId);
  }

  public updateCompliance(accountId: string, updates: Partial<ComplianceRegistration>): ComplianceRegistration {
    let comp = this.state.compliance.find((c) => c.account_id === accountId);
    if (!comp) {
      comp = {
        id: `comp-${Date.now().toString(36)}`,
        account_id: accountId,
        legal_name: 'Business LLC',
        business_type: 'LLC',
        status: 'signed_up',
        sample_messages: [],
        last_updated_by: 'customer',
        status_history: [],
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.state.compliance.push(comp);
    }
    if (!comp.status_history) comp.status_history = [];
    Object.assign(comp, updates, { updated_at: new Date().toISOString() });
    this.saveToFile();
    return comp;
  }

  public recordComplianceTransition(
    accountId: string,
    toStatus: ComplianceStatus,
    updatedBy: ComplianceProvenance,
    actorId?: string,
    reason?: string,
    extraUpdates?: Partial<ComplianceRegistration>
  ): ComplianceRegistration {
    let comp = this.state.compliance.find((c) => c.account_id === accountId);
    const now = new Date().toISOString();
    if (!comp) {
      comp = {
        id: `comp-${Date.now().toString(36)}`,
        account_id: accountId,
        legal_name: 'Business LLC',
        business_type: 'LLC',
        status: 'signed_up',
        sample_messages: [],
        last_updated_by: updatedBy,
        status_history: [],
        created_at: now,
        updated_at: now,
      };
      this.state.compliance.push(comp);
    }
    if (!comp.status_history) comp.status_history = [];

    const historyEntry: ComplianceHistoryEntry = {
      id: `chist-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`,
      from_status: comp.status,
      to_status: toStatus,
      updated_by: updatedBy,
      actor_id: actorId,
      reason,
      timestamp: now,
    };

    comp.status_history.push(historyEntry);
    comp.status = toStatus;
    comp.last_updated_by = updatedBy;
    comp.updated_at = now;

    if (toStatus === 'rejected') {
      comp.rejection_reason = reason || 'Carrier compliance verification failed';
    } else if (comp.rejection_reason && (toStatus === 'brand_submitted' || toStatus === 'brand_approved')) {
      comp.rejection_reason = undefined;
    }

    if (extraUpdates) {
      Object.assign(comp, extraUpdates);
    }

    this.saveToFile();

    this.logAudit(accountId, 'COMPLIANCE_STATUS_TRANSITION', {
      fromStatus: historyEntry.from_status,
      toStatus: historyEntry.to_status,
      updatedBy,
      actorId,
      reason,
    });

    return comp;
  }

  // --------------------------------------------------------------------------
  // Subscriptions & Usage
  // --------------------------------------------------------------------------
  public getPlans(): SubscriptionPlan[] {
    return this.state.plans;
  }

  public getSubscription(accountId: string): { subscription?: Subscription; plan?: SubscriptionPlan; usage?: UsageRecord } {
    const subscription = this.state.subscriptions.find((s) => s.account_id === accountId);
    const plan = subscription ? this.state.plans.find((p) => p.id === subscription.plan_id) : undefined;
    const usage = this.state.usage.find((u) => u.account_id === accountId);
    return { subscription, plan, usage };
  }

  public updateSubscription(
    accountId: string,
    updates: Partial<Subscription>
  ): Subscription | undefined {
    const sub = this.state.subscriptions.find((s) => s.account_id === accountId);
    if (!sub) return undefined;
    Object.assign(sub, updates, { updated_at: new Date().toISOString() });
    this.saveToFile();
    return sub;
  }

  public createSubscription(
    subData: Omit<Subscription, 'id' | 'created_at' | 'updated_at'>
  ): Subscription {
    const newSub: Subscription = {
      ...subData,
      id: `sub-${Date.now()}-${Math.random().toString(36).substring(2, 6)}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };
    this.state.subscriptions.push(newSub);
    this.saveToFile();
    return newSub;
  }

  // --------------------------------------------------------------------------
  // Webhook Idempotency
  // --------------------------------------------------------------------------
  public isWebhookProcessed(provider: string, eventId: string): boolean {
    const key = `${provider}:${eventId}`;
    return !!this.state.processedWebhooks[key];
  }

  public markWebhookProcessed(provider: string, eventId: string, eventType: string): void {
    const key = `${provider}:${eventId}`;
    this.state.processedWebhooks[key] = {
      processedAt: new Date().toISOString(),
      provider,
      eventType,
    };
    this.saveToFile();
  }

  // --------------------------------------------------------------------------
  // Audit Logging
  // --------------------------------------------------------------------------
  public logAudit(accountId: string, action: string, details?: any): void {
    this.state.auditLogs.unshift({
      id: `audit-${Date.now().toString(36)}`,
      accountId,
      action,
      timestamp: new Date().toISOString(),
      details,
    });
    this.saveToFile();
  }

  public getAuditLogs(accountId?: string): { id: string; accountId: string; action: string; timestamp: string; details?: any }[] {
    if (accountId) {
      return this.state.auditLogs.filter((a) => a.accountId === accountId);
    }
    return [...this.state.auditLogs];
  }

  public deleteAuditLog(id: string): boolean {
    const idx = this.state.auditLogs.findIndex((a) => a.id === id);
    if (idx >= 0) {
      this.state.auditLogs.splice(idx, 1);
      this.saveToFile();
      return true;
    }
    return false;
  }

  public clearAuditLogs(): void {
    this.state.auditLogs = [];
    this.saveToFile();
  }

  // --------------------------------------------------------------------------
  // Persistence Health
  // --------------------------------------------------------------------------
  private recordPostgresPersistFailure(operation: string, message?: string): void {
    this.lastPostgresPersistError = {
      operation,
      message: message || 'unknown error',
      at: new Date().toISOString(),
    };
    console.error(
      `[Postgres dual-persistence FAILED] ${operation}: ${message || 'unknown error'} — the write was NOT persisted to PostgreSQL.`
    );
  }

  /**
   * Operator-facing storage diagnostics: which engine is actually serving reads,
   * whether writes are dual-persisted to PostgreSQL, and the last write failure.
   */
  public getPostgresPersistenceStatus() {
    const configured = this.isPostgresConfigured();
    let connected = false;
    try {
      connected = configured && getPostgresPool() !== null;
    } catch {
      connected = false;
    }
    return {
      configured,
      poolAvailable: connected,
      lastPersistError: this.lastPostgresPersistError,
    };
  }

  public isPostgresConfigured(): boolean {
    // Must reflect the SAME check the persistence paths use. Previously this fell
    // back to a bare `Boolean(process.env.DATABASE_URL)` when the dynamic require
    // failed, so getStorageEngine() advertised "postgresql" while the writes went
    // nowhere and the deployment looked healthy.
    return isPostgresConfiguredFromPg();
  }

  public getStorageEngine(): 'postgresql' | 'file_json' {
    return this.isPostgresConfigured() ? 'postgresql' : 'file_json';
  }

  public async deleteAccountFromPostgres(accountId: string): Promise<boolean> {
    const cleanId = accountId.trim();
    if (!cleanId || cleanId.includes('*') || cleanId.includes('%')) {
      return false;
    }
    if (this.isPostgresConfigured()) {
      try {
        const pool = getPostgresPool();
        if (pool) {
          const res = await pool.query('DELETE FROM accounts WHERE id = $1', [cleanId]);
          return (res?.rowCount ?? 0) > 0;
        }
      } catch (err: any) {
        console.warn('[Postgres deleteAccountFromPostgres error]:', err?.message);
      }
    }
    return false;
  }

  public getProcessedWebhooks(): Record<string, { processedAt: string; provider: string; eventType: string }> {
    return { ...this.state.processedWebhooks };
  }

  public clearProcessedWebhooks(): void {
    this.state.processedWebhooks = {};
    this.saveToFile();
  }

  public deleteUserCredential(id: string): boolean {
    const idx = this.state.userCredentials.findIndex((c) => c.id === id);
    if (idx >= 0) {
      this.state.userCredentials.splice(idx, 1);
      this.saveToFile();
      return true;
    }
    return false;
  }

  public deleteConsentLog(id: string): boolean {
    const idx = this.state.consentLogs.findIndex((c) => c.id === id);
    if (idx >= 0) {
      this.state.consentLogs.splice(idx, 1);
      this.saveToFile();
      return true;
    }
    return false;
  }

  public deleteSubscription(id: string): boolean {
    const idx = this.state.subscriptions.findIndex((s) => s.id === id);
    if (idx >= 0) {
      this.state.subscriptions.splice(idx, 1);
      this.saveToFile();
      return true;
    }
    return false;
  }
}

// Global Singleton
export const db = new DatabaseRepository();

