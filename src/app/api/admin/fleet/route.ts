import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { requireAdminAuth } from '@/lib/authz';
import { SimulationEngine } from '@/lib/simulator';
import { notFoundResponse } from '@/lib/api-errors';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (auth instanceof NextResponse) return auth;

    try {
      await db.hydrateAllBusinessProfilesFromPostgres();
    } catch (err: any) {
      console.error('[Operator fleet profile load failed]', err?.message || err);
      return NextResponse.json(
        { error: 'Tenant profile data is temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    const accounts = db.getAllAccounts();
    const tenants = accounts.map((account) => {
      const profile = db.getBusinessProfile(account.id);
      const compliance = db.getCompliance(account.id);
      const phoneNumbers = db.getPhoneNumbers(account.id);
      const jobs = db.getJobs(account.id);
      const calls = db.getCallRecords(account.id);

      const realCalls = calls.filter((c) => !c.is_simulated);
      const realJobs = jobs.filter((j) => !j.is_simulated);
      const bookedJobs = realJobs.filter((j) => j.status === 'BOOKED' || j.status === 'COMPLETED');
      const recoveredRevenue = bookedJobs.reduce(
        (sum, j) => sum + (j.actual_value || j.estimated_value || 0),
        0
      );

      return {
        id: account.id,
        name: account.name,
        slug: account.slug,
        status: account.status,
        planTier: account.plan_tier,
        isDemo: Boolean(account.is_demo),
        createdAt: account.created_at,
        businessName: profile?.business_name || account.name,
        trade: profile?.trade || 'general',
        notificationPhone: profile?.notification_phone || null,
        forwardingConfigured: Boolean(profile?.forwarding_configured),
        crmWebhookConfigured: Boolean(profile?.crm_webhook_url),
        complianceStatus: compliance?.status || 'signed_up',
        mcrNumber: phoneNumbers[0]?.formatted_number || phoneNumbers[0]?.phone_number || null,
        metrics: {
          totalCalls: realCalls.length,
          textBacksSent: realCalls.filter((c) => c.text_back_status === 'sent').length,
          totalJobs: realJobs.length,
          bookedJobs: bookedJobs.length,
          recoveredRevenue,
        },
      };
    });

    const payingTenants = accounts.filter((a) => !a.is_demo && a.status === 'active');
    const totalRecoveredRevenue = tenants.reduce((sum, t) => sum + t.metrics.recoveredRevenue, 0);
    const totalCalls = tenants.reduce((sum, t) => sum + t.metrics.totalCalls, 0);
    const totalBookedJobs = tenants.reduce((sum, t) => sum + t.metrics.bookedJobs, 0);

    const platformStats = {
      totalAccounts: accounts.length,
      payingTenantsCount: payingTenants.length,
      estimatedMrr: payingTenants.length * 149,
      totalRecoveredRevenue,
      totalCalls,
      totalBookedJobs,
    };

    const auditLogs = db.getAuditLogs().slice(0, 30);

    return NextResponse.json({
      success: true,
      platformStats,
      tenants,
      auditLogs,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdminAuth(req);
    if (auth instanceof NextResponse) return auth;

    const body = await req.json();
    const { action, accountId } = body;

    if (!accountId) {
      return NextResponse.json({ error: 'accountId is required' }, { status: 400 });
    }

    const account = db.getAccount(accountId);
    if (!account) {
      return notFoundResponse();
    }

    try {
      await db.hydrateBusinessProfileFromPostgres(accountId);
    } catch (err: any) {
      console.error('[Operator tenant profile load failed]', err?.message || err);
      return NextResponse.json(
        { error: 'This tenant profile is temporarily unavailable. Please try again.' },
        { status: 503 }
      );
    }

    if (action === 'simulate_call') {
      const { callerNumber, callerName } = body;
      const simResult = await SimulationEngine.simulateMissedCall(
        accountId,
        callerNumber || '+12175558833',
        callerName || 'Concierge Pilot Caller'
      );

      db.logAudit(accountId, 'ADMIN_CONCIERGE_SIMULATE_CALL', {
        callerNumber: callerNumber || '+12175558833',
        callRecordId: simResult.callRecordId,
      });

      return NextResponse.json({
        success: true,
        message: 'Simulated missed call successfully executed for tenant',
        simResult,
      });
    }

    if (action === 'verify_forwarding') {
      const { forwardingConfigured } = body;
      const updated = await db.updateBusinessProfilePersistent(accountId, {
        forwarding_configured: Boolean(forwardingConfigured),
      });

      db.logAudit(accountId, 'ADMIN_CONCIERGE_FORWARDING_TOGGLE', {
        forwardingConfigured: Boolean(forwardingConfigured),
      });

      return NextResponse.json({
        success: true,
        message: `Forwarding configured set to ${Boolean(forwardingConfigured)}`,
        profile: updated,
      });
    }

    if (action === 'trigger_digest') {
      const { digestType } = body; // 'daily_summary' | 'weekly_report'
      db.logAudit(accountId, 'ADMIN_CONCIERGE_TRIGGER_DIGEST', {
        digestType: digestType || 'daily_summary',
        triggeredBy: 'admin',
      });

      return NextResponse.json({
        success: true,
        message: `Digest report (${digestType || 'daily_summary'}) queued for dispatch`,
      });
    }

    if (action === 'update_status') {
      const { status } = body;
      if (!status) {
        return NextResponse.json({ error: 'status is required' }, { status: 400 });
      }
      const updated = db.updateAccount(accountId, { status });

      db.logAudit(accountId, 'ADMIN_CONCIERGE_STATUS_UPDATE', {
        newStatus: status,
      });

      return NextResponse.json({
        success: true,
        message: `Account status updated to ${status}`,
        account: updated,
      });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
