import { ComplianceStatus } from '@/types';

export const COMPLIANCE_STATES: { status: ComplianceStatus; label: string; description: string; stepNumber: number }[] = [
  {
    status: 'signed_up',
    label: 'Registration Started',
    description: 'Account created. Carrier registration profile details pending submission.',
    stepNumber: 1,
  },
  {
    status: 'brand_submitted',
    label: 'Brand Submitted to TCR',
    description: 'Business legal identity submitted to The Campaign Registry (TCR). EIN and address under verification.',
    stepNumber: 2,
  },
  {
    status: 'brand_approved',
    label: 'Brand Verified',
    description: 'Business identity verified by major US wireless carriers (AT&T, Verizon, T-Mobile).',
    stepNumber: 3,
  },
  {
    status: 'campaign_submitted',
    label: 'Campaign Submitted',
    description: 'Customer Care & Missed-Call Recovery campaign submitted with sample messages and opt-in disclosure.',
    stepNumber: 4,
  },
  {
    status: 'campaign_approved',
    label: 'Campaign Approved',
    description: 'Carrier campaign vetting approved. 10DLC throughput allocation granted.',
    stepNumber: 5,
  },
  {
    status: 'number_linked',
    label: 'Number Linked to Campaign',
    description: 'Dedicated phone number linked to the approved messaging campaign.',
    stepNumber: 6,
  },
  {
    status: 'sms_live',
    label: 'A2P SMS Live & Active',
    description: 'High-deliverability 10DLC messaging live with carrier network priority.',
    stepNumber: 7,
  },
  {
    status: 'rejected',
    label: 'Action Required',
    description: 'Carrier requested corrections on business name or address. Resubmission ready.',
    stepNumber: 0,
  },
];

export const STOP_KEYWORDS = new Set([
  'STOP',
  'STOPALL',
  'QUIT',
  'END',
  'REVOKE',
  'OPT OUT',
  'OPTOUT',
  'CANCEL',
  'UNSUBSCRIBE',
]);

export const START_KEYWORDS = new Set([
  'START',
  'UNSTOP',
  'YES',
]);

export const HELP_KEYWORDS = new Set([
  'HELP',
  'INFO',
  'SUPPORT',
]);

export function isStopKeyword(text: string): boolean {
  const clean = text.trim().toUpperCase();
  return STOP_KEYWORDS.has(clean);
}

export function isStartKeyword(text: string): boolean {
  const clean = text.trim().toUpperCase();
  return START_KEYWORDS.has(clean);
}

export function isHelpKeyword(text: string): boolean {
  const clean = text.trim().toUpperCase();
  return HELP_KEYWORDS.has(clean);
}

export function getNextComplianceStatus(current: ComplianceStatus): ComplianceStatus | null {
  switch (current) {
    case 'signed_up':
      return 'brand_submitted';
    case 'brand_submitted':
      return 'brand_approved';
    case 'brand_approved':
      return 'campaign_submitted';
    case 'campaign_submitted':
      return 'campaign_approved';
    case 'campaign_approved':
      return 'number_linked';
    case 'number_linked':
      return 'sms_live';
    case 'rejected':
      return 'brand_submitted';
    default:
      return null;
  }
}

export const CARRIER_CONTROLLED_STATUSES = new Set<ComplianceStatus>([
  'brand_approved',
  'campaign_submitted',
  'campaign_approved',
  'number_linked',
  'sms_live',
  'rejected',
]);

export function isCarrierControlledStatus(status: ComplianceStatus): boolean {
  return CARRIER_CONTROLLED_STATUSES.has(status);
}

/**
 * Validates whether a customer actor is permitted to execute a specific transition.
 * Customers are strictly restricted to submitting initial registration (signed_up -> brand_submitted)
 * or resubmitting after a rejection (rejected -> brand_submitted).
 * All carrier approval/vetting transitions require carrier_webhook or admin provenance.
 */
export function canCustomerPerformTransition(
  currentStatus: ComplianceStatus,
  targetStatus: ComplianceStatus,
  action?: string
): boolean {
  if (action === 'submit_registration' || (currentStatus === 'signed_up' && targetStatus === 'brand_submitted')) {
    return true;
  }
  if (action === 'resubmit' || (currentStatus === 'rejected' && targetStatus === 'brand_submitted')) {
    return true;
  }
  return false;
}

/**
 * Validates whether the requested transition is valid in the 10DLC state machine
 */
export function isValidTransition(from: ComplianceStatus, to: ComplianceStatus): boolean {
  if (from === to) return true;
  switch (from) {
    case 'signed_up':
      return to === 'brand_submitted';
    case 'brand_submitted':
      return to === 'brand_approved' || to === 'rejected';
    case 'brand_approved':
      return to === 'campaign_submitted' || to === 'rejected';
    case 'campaign_submitted':
      return to === 'campaign_approved' || to === 'rejected';
    case 'campaign_approved':
      return to === 'number_linked' || to === 'rejected';
    case 'number_linked':
      return to === 'sms_live' || to === 'rejected';
    case 'rejected':
      return to === 'brand_submitted';
    case 'sms_live':
      return to === 'rejected'; // carrier revocation
    default:
      return false;
  }
}

