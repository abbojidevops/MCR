import { redirect } from 'next/navigation';
import { cookies } from 'next/headers';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/session';
import OnboardingWizard from './onboarding-wizard';

// Signup is a per-request screen: it renders the tenant's assigned recovery
// number, which is only known once a session exists.
export const dynamic = 'force-dynamic';

export default async function OnboardingPage() {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = token ? verifySessionToken(token) : null;

  // An already-signed-in tenant must not be able to start a second account
  // from the signup wizard. Send them to their own dashboard instead.
  if (session && session.accountId) {
    redirect(session.role === 'admin' ? '/admin' : '/dashboard');
  }

  return <OnboardingWizard />;
}
