import { validateSessionSecret } from './secret-strength';

export interface SessionSecretEnvironment {
  NODE_ENV?: string;
  SESSION_SECRET?: string;
}

/**
 * Return a safe, operator-facing explanation when session signing cannot run.
 * The strong-secret policy is enforced in production; no environment gets a
 * built-in signing-key fallback.
 */
export function getSessionSecretConfigurationError(
  env: SessionSecretEnvironment = process.env
): string | null {
  const secret = env.SESSION_SECRET;

  if (!secret || secret.trim().length === 0) {
    return 'SESSION_SECRET must be configured in environment';
  }

  if (env.NODE_ENV === 'production') {
    const validation = validateSessionSecret(secret);
    if (!validation.ok) {
      return validation.error || 'SESSION_SECRET does not meet the security policy';
    }
  }

  return null;
}

/**
 * Resolve the configured signing key at request time. This is deliberately not
 * evaluated at module import, so a Next.js production build does not need the
 * runtime secret. Missing or weak production values never receive a fallback.
 */
export function getSessionSecret(): string {
  const error = getSessionSecretConfigurationError();
  if (error) throw new Error(error);

  return process.env.SESSION_SECRET as string;
}
