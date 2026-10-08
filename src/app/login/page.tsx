import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';
import { describeDemoModeDisclosure, shouldExposeDemoCredentials } from '@/lib/demo-mode';
import { safeNextPath } from '@/lib/safe-redirect';
import LoginForm, { DemoCredentials } from './login-form';

// Credentials are read per request so a redeploy can flip demo mode without a rebuild.
export const dynamic = 'force-dynamic';

/**
 * Demonstration account credentials.
 *
 * These are ONLY rendered into the page when the deployment explicitly declares
 * itself a demo/staging environment (see src/lib/demo-mode.ts). In a plain
 * production deployment this screen renders no credential material at all.
 */
const DEMO_CREDENTIALS: DemoCredentials = {
  email: 'demo@apexplumbing.com',
  password: 'ApexDemo2026!Secure',
  label: 'Demo Account Access',
};

export default async function LoginPage({
  searchParams,
}: {
  searchParams?: Promise<{ next?: string }>;
}) {
  const params = (searchParams ? await searchParams : {}) as { next?: string };

  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? verifySessionToken(token) : null;

  const fallback = session?.role === 'admin' ? '/admin' : '/dashboard';

  // Already-authenticated visitors should never see the sign-in form — and if
  // the middleware bounced them here from a specific page, honour ?next= so
  // they land where they were originally headed.
  if (session && session.accountId) {
    redirect(safeNextPath(params.next, fallback));
  }

  const exposed = shouldExposeDemoCredentials();

  return (
    <LoginForm
      demoCredentials={exposed ? DEMO_CREDENTIALS : null}
      demoDisclosureReason={
        exposed
          ? `Demo mode active: ${describeDemoModeDisclosure()}`
          : 'Production deployment — demonstration credentials are not published.'
      }
    />
  );
}
