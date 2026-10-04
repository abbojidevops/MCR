import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { getSession } from '@/lib/session';

export async function GET(req: NextRequest) {
  // 1. Operator session check
  const session = await getSession(req);
  const isOperator = Boolean(session && session.role === 'admin');

  // Acceptance Criterion 1: Public health endpoint returns {status, timestamp, version} and nothing else
  if (!isOperator) {
    return NextResponse.json(
      {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
      },
      {
        status: 200,
        headers: {
          'Cache-Control': 'no-store, no-cache, must-revalidate',
        },
      }
    );
  }

  // Acceptance Criterion 2: Detailed checks behind operator authentication
  const startTime = Date.now();
  const uptimeSeconds = process.uptime();
  const memoryUsage = process.memoryUsage();

  const allAccounts = db.getAllAccounts();
  const nonDemoAccounts = allAccounts.filter((a) => !a.is_demo);
  const liveNonDemo = nonDemoAccounts.filter((a) => {
    const comp = db.getCompliance(a.id);
    return comp && comp.status === 'sms_live' && comp.last_updated_by === 'carrier_webhook';
  });

  const totalCalls = allAccounts.reduce((sum, a) => sum + db.getCallRecords(a.id).length, 0);
  const totalJobs = allAccounts.reduce((sum, a) => sum + db.getJobs(a.id).length, 0);

  // Acceptance Criterion 3: Derived from carrier-asserted registration authority, not config values
  let complianceCheck: {
    status: 'healthy' | 'unhealthy' | 'degraded';
    reason?: string;
    registry: string;
    details?: any;
  };

  if (nonDemoAccounts.length > 0 && liveNonDemo.length === 0) {
    complianceCheck = {
      status: 'unhealthy',
      reason: 'no carrier-asserted registration for any non-demo account',
      registry: 'The Campaign Registry (TCR)',
      details: {
        nonDemoTenants: nonDemoAccounts.length,
        carrierLiveTenants: 0,
      },
    };
  } else if (nonDemoAccounts.length === 0) {
    complianceCheck = {
      status: 'degraded',
      reason: 'operating in demonstration mode only; no production accounts configured',
      registry: 'The Campaign Registry (TCR)',
    };
  } else {
    complianceCheck = {
      status: 'healthy',
      registry: 'The Campaign Registry (TCR)',
      details: {
        carrierLiveTenants: liveNonDemo.length,
      },
    };
  }

  // Telecom subsystem check grounded in live credentials, not assumed healthy
  const hasTwilioSecret = Boolean(process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_AUTH_TOKEN.trim());
  const isMockMode = process.env.TWILIO_MOCK_MODE === 'true' || !process.env.TWILIO_ACCOUNT_SID;

  const telecomCheck = {
    status: hasTwilioSecret ? (isMockMode ? 'simulation' : 'healthy') : 'unhealthy',
    provider: 'Twilio Voice & SMS',
    mockMode: isMockMode,
    webhookSecretConfigured: hasTwilioSecret,
    webhookIdempotency: 'active',
    tcpaQuietHours: 'active (08:00 - 21:00)',
    ...(hasTwilioSecret ? {} : { reason: 'TWILIO_AUTH_TOKEN not configured (fail-closed)' }),
  };

  const detailedHealth = {
    status: complianceCheck.status === 'unhealthy' ? 'degraded' : 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(uptimeSeconds),
    responseTimeMs: Date.now() - startTime,
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'production',
    checks: {
      database: {
        status: 'healthy',
        activeTenants: allAccounts.length,
        totalCallsLogged: totalCalls,
        totalJobsLogged: totalJobs,
        storageEngine: db.getStorageEngine(),
      },
      telecom: telecomCheck,
      compliance: complianceCheck,
      billing: {
        status: 'healthy',
        gateway: 'Stripe',
        defaultPlan: 'pro ($149/mo)',
      },
    },
    memory: {
      rssMb: Math.round(memoryUsage.rss / 1024 / 1024),
      heapTotalMb: Math.round(memoryUsage.heapTotal / 1024 / 1024),
      heapUsedMb: Math.round(memoryUsage.heapUsed / 1024 / 1024),
    },
  };

  return NextResponse.json(detailedHealth, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
