import fs from 'fs';
import path from 'path';
import {
  Account,
  BusinessProfile,
  CallRecord,
  CannedReply,
  ComplianceRegistration,
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
}

const DATA_DIR = path.join(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'mcr_db.json');

class DatabaseRepository {
  private state: DatabaseState;
  private initialized = false;

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
        this.state = { ...this.getInitialState(), ...parsed };
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

  public updateBusinessProfile(accountId: string, updates: Partial<BusinessProfile>): BusinessProfile {
    const profile = this.state.profiles.find((p) => p.account_id === accountId);
    if (!profile) throw new Error(`Profile not found for account ${accountId}`);
    Object.assign(profile, updates, { updated_at: new Date().toISOString() });
    this.saveToFile();
    return profile;
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
    return { account, profile, phoneNumber };
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

  // --------------------------------------------------------------------------
  // Conversations & Messages
  // --------------------------------------------------------------------------
  public getOrCreateConversation(accountId: string, contactId: string): Conversation {
    let conv = this.state.conversations.find((c) => c.account_id === accountId && c.contact_id === contactId);
    if (!conv) {
      conv = {
        id: `conv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
        account_id: accountId,
        contact_id: contactId,
        status: 'active',
        last_message_at: new Date().toISOString(),
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.state.conversations.unshift(conv);
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

  public getMessages(accountId: string, conversationId: string): Message[] {
    const conv = this.state.conversations.find((c) => c.id === conversationId);
    if (conv) {
      this.assertTenantAccess(accountId, conv.account_id);
    }
    return this.state.messages.filter((m) => m.conversation_id === conversationId);
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
  }): Message {
    const conv = this.state.conversations.find((c) => c.id === params.conversationId);
    if (conv) {
      this.assertTenantAccess(params.accountId, conv.account_id);
      conv.last_message_at = new Date().toISOString();
      conv.updated_at = new Date().toISOString();
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

  // --------------------------------------------------------------------------
  // Intake Sessions
  // --------------------------------------------------------------------------
  public getOrCreateIntakeSession(accountId: string, conversationId: string, trade: TradeKey): IntakeSession {
    let session = this.state.intakeSessions.find((s) => s.conversation_id === conversationId);
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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.state.intakeSessions.push(session);
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

  public updateJob(accountId: string, jobId: string, updates: Partial<JobCard>): JobCard {
    const job = this.state.jobs.find((j) => j.id === jobId && j.account_id === accountId);
    if (!job) throw new Error(`Job ${jobId} not found for account ${accountId}`);

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
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      this.state.compliance.push(comp);
    }
    Object.assign(comp, updates, { updated_at: new Date().toISOString() });
    this.saveToFile();
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

  // --------------------------------------------------------------------------
  // Persistence Health
  // --------------------------------------------------------------------------
  public isPostgresConfigured(): boolean {
    return Boolean(process.env.DATABASE_URL);
  }

  public getStorageEngine(): 'postgresql' | 'file_json' {
    return process.env.DATABASE_URL ? 'postgresql' : 'file_json';
  }
}

// Global Singleton
export const db = new DatabaseRepository();

