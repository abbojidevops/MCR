/**
 * Global Business & Economic Constants for MCR
 */

// Default gross profit margin for trades/home services (configurable assumption)
export const DEFAULT_GROSS_MARGIN = 0.40; // 40%

// Default average trade ticket assumption ($650 industry baseline)
export const DEFAULT_AVERAGE_TICKET = 650;

// Subscription Plan Pricing & Caps
export const PLAN_CONFIG = {
  starter: {
    id: 'starter',
    name: 'Starter',
    monthlyPrice: 79, // Repriced from $49 to $79 per Part 3.7
    annualPrice: 790,
    monthlyCallCap: 40, // Cut cap to 40 per Part 3.7
    overageRate: 0.35, // $0.35/call overage per Part 3.5
    overageWarningThreshold: 0.80, // 80% usage warning
    features: [
      'Up to 40 missed calls/mo included',
      '$0.35/call soft overage (never drops a lead)',
      'Instant SMS text-back (<30s)',
      'Automated qualification intake',
      'Instant cell phone notifications',
      'Standard email support',
    ],
  },
  pro: {
    id: 'pro',
    name: 'Pro',
    monthlyPrice: 149,
    annualPrice: 1490,
    monthlyCallCap: 200,
    overageRate: 0.25, // $0.25/call overage per Part 3.5
    overageWarningThreshold: 0.80, // 80% usage warning
    features: [
      'Up to 200 missed calls/mo included',
      '$0.25/call soft overage (never drops a lead)',
      'Compliant messaging on our registered carrier campaign',
      'Instant SMS text-back (<30s)',
      'Emergency job priority escalation',
      'Daily 6:00 PM flash reports',
      'Photo upload intake (MMS)',
      'Priority contractor support',
    ],
  },
  business: {
    id: 'business',
    name: 'Business',
    monthlyPrice: 299,
    annualPrice: 2990,
    monthlyCallCap: 600,
    overageRate: 0.15, // $0.15/call overage per Part 3.5
    overageWarningThreshold: 0.80, // 80% usage warning
    features: [
      'Up to 600 missed calls/mo included',
      '$0.15/call soft overage (never drops a lead)',
      'Multi-technician dispatch routing',
      'Custom qualification questionnaires',
      'Dedicated compliance manager',
      'CRM & webhook exports',
      '1-on-1 onboarding & carrier setup assistance',
    ],
  },
} as const;

// Company Trust & Contact Information (Round 2 Truthfulness)
export const COMPANY_INFO = {
  name: 'MCR Technologies, Inc.',
  email: 'support@getmcr.com',
  supportHours: 'Mon–Fri 8:00 AM – 8:00 PM EST',
} as const;

