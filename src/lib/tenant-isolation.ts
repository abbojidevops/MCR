/**
 * Tenant Isolation Enforcer & Verification Helpers
 * Enforces strict fail-closed isolation across all MCR tenant domains.
 */

export class TenantIsolationViolation extends Error {
  constructor(message = 'Cross-tenant resource access disallowed') {
    super(message);
    this.name = 'TenantIsolationViolation';
  }
}

/**
 * Strict fail-closed tenant ownership assertion.
 * If either sessionAccountId or resourceAccountId is missing, or they do not match,
 * it returns false (or throws).
 */
export function isOwnedByTenant(sessionAccountId: string | null | undefined, resourceAccountId: string | null | undefined): boolean {
  if (!sessionAccountId || !resourceAccountId) {
    return false;
  }
  return sessionAccountId === resourceAccountId;
}



/**
 * Assert ownership fail-closed
 */
export function assertTenantOwnership(sessionAccountId: string | null | undefined, resourceAccountId: string | null | undefined): void {
  if (!isOwnedByTenant(sessionAccountId, resourceAccountId)) {
    throw new TenantIsolationViolation(`Tenant ${sessionAccountId} cannot access resource owned by ${resourceAccountId}`);
  }
}
