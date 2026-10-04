export interface ComplianceClaim {
  isLive: boolean;
  topBannerText: string;
  heroBadgeTitle: string;
  heroBadgeSubtitle: string;
  compliancePageBadge: string;
  compliancePageStatusText: string;
}

export const FORBIDDEN_UNREGISTERED_WORDS = ['registered', 'compliant', 'certified'] as const;

export const STANDARD_UNREGISTERED_COPY =
  '10DLC registration support — brand and campaign submitted through The Campaign Registry as part of onboarding; texting activates when your campaign is approved. Voice alerts work immediately.';

/**
 * Strictly derives the marketing compliance claim.
 * Until a non-demo registration is carrier_api/operator_recorded and sms_live,
 * the words "registered", "compliant" and "certified" NEVER appear in the claim text.
 */
export function getDerivedComplianceClaim(isLive: boolean = false): ComplianceClaim {
  if (isLive) {
    return {
      isLive: true,
      topBannerText: 'A2P 10DLC registered with full TCPA quiet hours protection',
      heroBadgeTitle: 'TCPA & 10DLC Compliant',
      heroBadgeSubtitle: 'Carrier Verified & Approved',
      compliancePageBadge: 'Carrier Verified Telecom Architecture',
      compliancePageStatusText: 'A2P 10DLC registered with carrier network priority and full TCPA quiet hours protection.',
    };
  }

  return {
    isLive: false,
    topBannerText: STANDARD_UNREGISTERED_COPY,
    heroBadgeTitle: '10DLC Registration Support',
    heroBadgeSubtitle: 'Brand and campaign submitted through TCR during onboarding; texting activates upon approval. Voice alerts immediate.',
    compliancePageBadge: '10DLC Registration Support in Onboarding',
    compliancePageStatusText: STANDARD_UNREGISTERED_COPY,
  };
}

/**
 * Source-level and runtime validator that enforces Acceptance Criterion 1:
 * Until live registration exists, "registered", "compliant", and "certified" MUST NOT appear.
 */
export function validateClaimHonesty(
  text: string,
  isLive: boolean
): { valid: boolean; violation?: string } {
  if (isLive) return { valid: true };

  const lower = text.toLowerCase();
  for (const forbidden of FORBIDDEN_UNREGISTERED_WORDS) {
    // Word boundary check to avoid partial false positives
    const regex = new RegExp(`\\b${forbidden}\\b`, 'i');
    if (regex.test(lower)) {
      return {
        valid: false,
        violation: `Forbidden word "${forbidden}" found in un-registered claim text: "${text}"`,
      };
    }
  }

  return { valid: true };
}
