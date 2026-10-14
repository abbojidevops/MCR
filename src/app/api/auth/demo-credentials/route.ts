import { NextRequest, NextResponse } from 'next/server';
import { shouldExposeDemoCredentials } from '@/lib/demo-mode';

export const dynamic = 'force-dynamic';

/**
 * Public (unauthenticated) endpoint that reports whether demonstration
 * credentials may be shown, and if so which ones.
 *
 * This endpoint exists so the login screen never has to hardcode working
 * credentials into the client bundle. In a production deployment that has not
 * explicitly opted into demo mode it returns `exposed: false` with no
 * credential material at all.
 */
export async function GET(_req: NextRequest) {
  if (!shouldExposeDemoCredentials()) {
    return NextResponse.json(
      {
        exposed: false,
        reason: 'Demonstration credentials are only published on explicitly configured demo/staging deployments.',
      },
      { status: 200, headers: { 'Cache-Control': 'no-store' } }
    );
  }

  return NextResponse.json(
    {
      exposed: true,
      credentials: {
        email: 'demo@apexplumbing.com',
        password: 'ApexDemo2026!Secure',
        label: 'Demo Account Access',
      },
    },
    { status: 200, headers: { 'Cache-Control': 'no-store' } }
  );
}
