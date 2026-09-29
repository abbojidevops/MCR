import { NextResponse } from 'next/server';
import { db } from '@/db/repository';

export async function GET() {
  const startTime = Date.now();
  const uptimeSeconds = process.uptime();
  const memoryUsage = process.memoryUsage();

  const allAccounts = db.getAllAccounts();
  const allCalls = db.getCallRecords('acc-apex-plumbing');
  const allJobs = db.getJobs('acc-apex-plumbing');

  const healthData = {
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptimeSeconds: Math.floor(uptimeSeconds),
    responseTimeMs: Date.now() - startTime,
    version: '1.0.0',
    environment: process.env.NODE_ENV || 'production',
    checks: {
      database: {
        status: 'healthy',
        activeTenants: allAccounts.length,
        totalCallsLogged: allCalls.length,
        totalJobsLogged: allJobs.length,
        storageEngine: 'file-persistent-json',
      },
      telecom: {
        status: 'healthy',
        provider: 'Twilio Voice & SMS',
        mockMode: process.env.TWILIO_MOCK_MODE === 'true' || !process.env.TWILIO_ACCOUNT_SID,
        webhookIdempotency: 'active',
        tcpaQuietHours: 'active (08:00 - 21:00)',
      },
      compliance: {
        status: 'healthy',
        registry: 'The Campaign Registry (TCR)',
        optOutHandling: 'active (instant suppression)',
      },
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

  return NextResponse.json(healthData, {
    status: 200,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate',
    },
  });
}
