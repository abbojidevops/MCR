import { validateAdminPassword } from './secret-strength';

export interface AdminPasswordEnvironment {
  NODE_ENV?: string;
  ADMIN_PASSWORD?: string;
}

/**
 * Return a safe operator-facing error if the admin login password is missing or
 * fails the existing production strength policy. Never include the value itself.
 */
export function getAdminPasswordConfigurationError(
  env: AdminPasswordEnvironment = process.env
): string | null {
  const password = env.ADMIN_PASSWORD;

  if (!password || password.trim().length === 0) {
    return 'ADMIN_PASSWORD environment variable is not configured';
  }

  if (env.NODE_ENV === 'production') {
    const validation = validateAdminPassword(password);
    if (!validation.ok) {
      return validation.errors.join('; ') || 'ADMIN_PASSWORD does not meet the security policy';
    }
  }

  return null;
}
