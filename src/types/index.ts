// ============================================================================
// Core Domain Types for MCR (Missed Call Recovery)
// ============================================================================

export type UserRole = 'owner' | 'manager' | 'technician' | 'admin';
export type AccountStatus = 'trial' | 'active' | 'past_due' | 'paused' | 'canceled';
export type PlanTier = 'starter' | 'pro' | 'business';

export interface User {
  id: string;
  email: string;
  password_hash: string;
  full_name: string;
  phone?: string;
  role: UserRole;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface UserCredential {
  id: string;
  user_id: string;
  account_id: string;
  email: string;
  password_hash: string; // scrypt$N$r$p$salt$hash
  algorithm: 'scrypt';
  created_at: string;
  updated_at: string;
}


export interface Account {
  id: string;
  name: string;
  slug: string;
  status: AccountStatus;
  plan_tier: PlanTier;
  is_demo?: boolean;
  trial_ends_at: string;
  created_at: string;
  updated_at: string;
}

export interface BusinessProfile {
  id: string;
  account_id: string;
  business_name: string;
  legal_name?: string;
  trade: TradeKey;
  is_demo?: boolean;
  ein?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  timezone: string;
  website?: string;
  emergency_phone?: string;
  notification_phone?: string;
  carrier_name?: string;
  forwarding_configured: boolean;
  average_ticket?: number;
  created_at: string;
  updated_at: string;
}

export interface BusinessHour {
  id: string;
  account_id: string;
  day_of_week: number; // 0=Sunday, 6=Saturday
  open_time: string; // '08:00:00'
  close_time: string; // '17:00:00'
  is_closed: boolean;
}

export interface PhoneNumber {
  id: string;
  account_id: string;
  phone_number: string; // E.164
  formatted_number: string;
  twilio_sid?: string;
  status: 'pending' | 'active' | 'released';
  capabilities: {
    voice: boolean;
    sms: boolean;
    mms: boolean;
  };
  carrier_sid?: string;
  created_at: string;
}

export type CallStatus = 'completed' | 'busy' | 'no-answer' | 'canceled' | 'failed';
export type MissedReason = 'no-answer' | 'busy' | 'after-hours' | 'manual';
export type ForwardedStatus = 'conditionally-forwarded' | 'direct' | 'fallback';
export type TextBackStatus = 'pending' | 'sent' | 'suppressed' | 'deduplicated' | 'failed';

export interface CallRecord {
  id: string;
  account_id: string;
  twilio_call_sid: string;
  from_number: string;
  to_number: string;
  direction: 'inbound' | 'outbound';
  start_time: string;
  end_time?: string;
  duration: number;
  call_status: CallStatus;
  missed_reason?: MissedReason;
  forwarded_status?: ForwardedStatus;
  text_back_status: TextBackStatus;
  deduplication_state: 'first_call' | 'duplicate_suppressed' | 'duplicate_escalated';
  is_simulated?: boolean;
  created_at: string;
  updated_at: string;
}

export interface Contact {
  id: string;
  account_id: string;
  phone_number: string;
  full_name?: string;
  email?: string;
  address?: string;
  notes?: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  account_id: string;
  contact_id: string;
  status: 'active' | 'closed' | 'archived';
  last_message_at: string;
  deduplication_key?: string;
  is_simulated?: boolean;
  created_at: string;
  updated_at: string;
  contact?: Contact;
  latest_message?: Message;
}

export interface Message {
  id: string;
  account_id: string;
  conversation_id: string;
  direction: 'inbound' | 'outbound';
  from_number: string;
  to_number: string;
  body: string;
  media_urls: string[];
  twilio_message_sid?: string;
  status: 'queued' | 'sent' | 'delivered' | 'failed' | 'received';
  error_code?: string;
  is_simulated?: boolean;
  created_at: string;
}

export type TradeKey =
  | 'plumbing'
  | 'hvac'
  | 'electrical'
  | 'garage_door'
  | 'locksmith'
  | 'roofing'
  | 'landscaping'
  | 'pest_control';

export type IntakeStep =
  | 'NEW'
  | 'ASK_EMERGENCY'
  | 'ASK_PROBLEM'
  | 'ASK_ADDRESS'
  | 'ASK_PHOTO'
  | 'QUALIFIED'
  | 'COMPLETED';

export interface IntakeSession {
  id: string;
  account_id: string;
  conversation_id: string;
  trade: TradeKey;
  current_step: IntakeStep;
  is_emergency: boolean;
  problem_description?: string;
  address?: string;
  photo_urls: string[];
  status: 'in_progress' | 'completed' | 'abandoned' | 'escalated';
  is_simulated?: boolean;
  created_at: string;
  updated_at: string;
}

export type JobStatus = 'NEW' | 'CONTACTED' | 'BOOKED' | 'COMPLETED' | 'DEAD';

export interface JobCard {
  id: string;
  account_id: string;
  contact_id: string;
  intake_session_id?: string;
  conversation_id?: string;
  call_record_id?: string;
  recovery_source?: string; // e.g. "Missed Call — September 29, 2026"
  title: string;
  trade: TradeKey;
  problem?: string;
  is_emergency: boolean;
  address?: string;
  photo_urls: string[];
  status: JobStatus;
  estimated_value: number;
  actual_value?: number;
  notes?: string;
  is_simulated?: boolean;
  first_call_time?: string;
  text_back_time?: string;
  qualified_time?: string;
  contacted_time?: string;
  booked_time?: string;
  completed_time?: string;
  dead_time?: string;
  assigned_user_id?: string;
  created_at: string;
  updated_at: string;
  contact?: Contact;
}

export interface CannedReply {
  id: string;
  account_id: string;
  title: string;
  shortcut?: string;
  body: string;
  trade?: TradeKey;
  is_default: boolean;
  created_at: string;
}

export interface SuppressionEntry {
  id: string;
  account_id: string;
  phone_number: string;
  opt_out_type: 'sms_stop' | 'manual' | 'complaint';
  reason?: string;
  source: string;
  created_at: string;
}

export interface ConsentLog {
  id: string;
  account_id: string;
  phone_number: string;
  consent_type: 'inbound_call_opt_in' | 'explicit_consent' | 'opt_out';
  consent_status: 'granted' | 'revoked';
  source: string;
  ip_address?: string;
  audit_notes?: string;
  created_at: string;
}

export type ComplianceStatus =
  | 'signed_up'
  | 'brand_submitted'
  | 'brand_approved'
  | 'campaign_submitted'
  | 'campaign_approved'
  | 'number_linked'
  | 'sms_live'
  | 'rejected';

export type ComplianceProvenance = 'customer' | 'carrier_webhook' | 'admin';

export interface ComplianceHistoryEntry {
  id: string;
  from_status: ComplianceStatus;
  to_status: ComplianceStatus;
  updated_by: ComplianceProvenance;
  actor_id?: string;
  reason?: string;
  timestamp: string;
}

export interface ComplianceRegistration {
  id: string;
  account_id: string;
  legal_name: string;
  ein?: string;
  business_type: string;
  address?: string;
  website?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  brand_sid?: string | null;
  campaign_sid?: string | null;
  status: ComplianceStatus;
  rejection_reason?: string;
  sample_messages: string[];
  last_updated_by?: ComplianceProvenance;
  carrier_source?: 'carrier_api' | 'operator_recorded' | 'carrier_webhook' | 'demo' | string | null;
  status_history?: ComplianceHistoryEntry[];
  created_at: string;
  updated_at: string;
}

export interface SubscriptionPlan {
  id: PlanTier;
  name: string;
  monthly_price_cents: number;
  included_calls: number;
  included_sms: number;
  included_numbers: number;
  max_users: number;
  features: string[];
}

export interface Subscription {
  id: string;
  account_id: string;
  plan_id: PlanTier;
  stripe_customer_id?: string;
  stripe_subscription_id?: string;
  status: 'trialing' | 'active' | 'past_due' | 'canceled' | 'unpaid' | 'paused';
  current_period_start: string;
  current_period_end: string;
  cancel_at_period_end: boolean;
  created_at: string;
  updated_at: string;
}

export interface UsageRecord {
  id: string;
  account_id: string;
  period_start: string;
  period_end: string;
  calls_count: number;
  sms_count: number;
  mms_count: number;
  numbers_count: number;
  overage_amount_cents: number;
  created_at: string;
}

export interface Notification {
  id: string;
  account_id: string;
  user_id?: string;
  title: string;
  body: string;
  type: 'missed_call' | 'emergency' | 'qualified_job' | 'daily_summary' | 'weekly_report';
  is_read: boolean;
  metadata?: Record<string, unknown>;
  created_at: string;
}

export interface NotificationPreference {
  id: string;
  account_id: string;
  user_id: string;
  channel_sms: boolean;
  channel_push: boolean;
  channel_email: boolean;
  notify_on_missed_call: boolean;
  notify_on_emergency: boolean;
  notify_on_qualified_job: boolean;
  phone_number?: string;
  created_at: string;
}

export interface TradeTemplate {
  id: TradeKey;
  display_name: string;
  initial_text_back: string;
  emergency_keywords: string[];
  questions: {
    key: string;
    text: string;
    type: 'boolean' | 'text' | 'address' | 'photo';
    step: IntakeStep;
  }[];
  canned_replies: {
    title: string;
    shortcut: string;
    body: string;
  }[];
}

export interface CarrierForwardingGuide {
  carrier_id: string;
  carrier_name: string;
  forward_no_answer_code: string;
  forward_busy_code: string;
  cancel_forward_code: string;
  instructions: string[];
  notes: string;
  supports_conditional_forwarding: boolean;
}
