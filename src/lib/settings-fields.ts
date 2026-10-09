/**
 * MCR — Tenant-Editable Business Profile Field Allow-List
 *
 * `PATCH /api/settings` historically forwarded the raw request body straight into
 * `db.updateBusinessProfile()`, which does a blind `Object.assign`. That let any
 * authenticated tenant rewrite privileged columns on their own profile —
 * including `account_id` (a cross-tenant isolation break) and `is_demo`
 * (which controls simulator access and metric exclusion).
 *
 * Every mutation now passes through this allow-list. Anything outside it is
 * rejected loudly rather than silently persisted.
 */

export const TENANT_EDITABLE_PROFILE_FIELDS = [
  // Business identity & routing
  'business_name',
  'trade',
  'timezone',
  'notification_phone',
  'emergency_phone',
  'carrier_name',
  'forwarding_configured',

  // Intake qualification
  'custom_intake_question',
  'custom_emergency_keywords',

  // Outbound CRM integration
  'crm_webhook_url',
  'crm_webhook_secret',
  'crm_webhook_events',
] as const;

export type TenantEditableProfileField = (typeof TENANT_EDITABLE_PROFILE_FIELDS)[number];

const EDITABLE_SET = new Set<string>(TENANT_EDITABLE_PROFILE_FIELDS);

/** Fields that must never be writable by a tenant session, even by name. */
export const PRIVILEGED_PROFILE_FIELDS = [
  'id',
  'account_id',
  'is_demo',
  'created_at',
  'updated_at',
  'ein',
  'legal_name',
  'address',
  'city',
  'state',
  'zip',
  'website',
  'average_ticket',
] as const;

export function isTenantEditableProfileField(field: string): field is TenantEditableProfileField {
  return EDITABLE_SET.has(field);
}

export interface SettingsUpdatePartition {
  permitted: Record<string, unknown>;
  rejected: string[];
}

/**
 * Split a caller-supplied `updates` object into the allow-listed subset and the
 * list of field names that were refused. Refused names are returned so the API
 * can answer 400 instead of quietly dropping them.
 */
export function partitionSettingsUpdates(updates: unknown): SettingsUpdatePartition {
  const permitted: Record<string, unknown> = {};
  const rejected: string[] = [];

  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
    return { permitted, rejected };
  }

  for (const [key, value] of Object.entries(updates as Record<string, unknown>)) {
    if (isTenantEditableProfileField(key)) {
      permitted[key] = value;
    } else {
      rejected.push(key);
    }
  }

  return { permitted, rejected };
}
