/**
 * Single source of truth for all tenant-scoped API routes in MCR.
 * Every route in this list MUST enforce requireTenantAuth and return 401
 * to any caller lacking a valid, authenticated session cookie.
 */
export const TENANT_SCOPED_API_ROUTES = [
  '/api/settings',
  '/api/billing',
  '/api/jobs',
  '/api/jobs/export',
  '/api/conversations',
  '/api/compliance',
  '/api/reports',
  '/api/dashboard',
  '/api/dashboard/stats',
  '/api/calls',
  '/api/setup-status',
  '/api/canned-replies',
  '/api/email/preview',
  '/api/simulator',
  '/api/integrations/webhook',
] as const;

export type TenantScopedApiRoute = typeof TENANT_SCOPED_API_ROUTES[number];
