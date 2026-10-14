/**
 * MCR — Safe post-authentication redirect targets
 *
 * Both sign-in screens accept a `?next=` query parameter so a visitor who was
 * bounced to the login page by the middleware lands where they were originally
 * headed. That value arrives from the URL and is therefore attacker-controlled:
 * without validation `?next=https://evil.example/phish` turns our own login
 * screen into an open redirect.
 *
 * Only same-origin, single-slash-prefixed relative paths are accepted.
 */

const ALLOWED_PREFIXES = ['/dashboard', '/admin', '/onboarding', '/login', '/operator-login'];

function isSafeRelativePath(value: string): boolean {
  // Must start with exactly one slash: blocks protocol-relative "//evil.com"
  // and absolute "https://evil.com".
  if (!value.startsWith('/') || value.startsWith('//')) return false;

  // Reject anything that carries a scheme or an authority component.
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  if (value.includes('\\')) return false;

  return true;
}

/**
 * Resolve a caller-supplied redirect target to something safe to navigate to.
 * Falls back to `fallback` when the input is missing, malformed, or points
 * outside this application.
 */
export function safeNextPath(raw: string | null | undefined, fallback: string): string {
  if (typeof raw !== 'string') return fallback;

  const candidate = raw.trim();
  if (!candidate) return fallback;
  if (!isSafeRelativePath(candidate)) return fallback;

  // Never bounce a user straight back into the sign-in flow they just completed.
  if (candidate === '/login' || candidate === '/operator-login' || candidate === '/admin/login') {
    return fallback;
  }

  // Anything outside the known authenticated surfaces is not a meaningful
  // post-login destination, so use the role default instead.
  const isKnownDestination = ALLOWED_PREFIXES.some(
    (prefix) => candidate === prefix || candidate.startsWith(`${prefix}/`)
  );
  if (!isKnownDestination) return fallback;

  return candidate;
}
