import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { JobCard } from '@/types';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || 'acc-apex-plumbing';

    const profile = db.getBusinessProfile(accountId);
    const businessName = profile?.business_name || 'Your Business';
    const calls = db.getCallRecords(accountId);
    const jobs = db.getJobs(accountId);
    const conversations = db.getConversations(accountId);
    const subInfo = db.getSubscription(accountId);
    const plan = subInfo?.plan || (subInfo?.subscription ? db.getPlans().find((p) => p.id === subInfo.subscription?.plan_id) : null);
    const subscriptionMonthlyCents = plan ? plan.monthly_price_cents : 14900;
    const subscriptionMonthlyDollars = subscriptionMonthlyCents / 100;

    // Filter for current month
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const callsThisMonth = calls.filter((c) => c.created_at >= startOfMonth);
    const jobsThisMonth = jobs.filter((j) => j.created_at >= startOfMonth);
    const convsThisMonth = conversations.filter((cv) => cv.created_at >= startOfMonth);

    // Funnel counts (Use monthly or lifetime if month is new)
    const missedCallsCount = callsThisMonth.length > 0 ? callsThisMonth.length : calls.length;
    const textsDeliveredCount = (callsThisMonth.length > 0 ? callsThisMonth : calls).filter(
      (c) => c.text_back_status === 'sent'
    ).length;
    const customersRespondedCount = (convsThisMonth.length > 0 ? convsThisMonth : conversations).length;
    const qualifiedLeadsCount = (jobsThisMonth.length > 0 ? jobsThisMonth : jobs).length;
    
    const activeJobs = jobsThisMonth.length > 0 ? jobsThisMonth : jobs;
    const bookedJobs = activeJobs.filter((j) => j.status === 'BOOKED');
    const bookedJobsCount = bookedJobs.length;

    // Revenue tracking: strictly separated
    // 1. Actual Confirmed Revenue: sum of confirmed actual_value on booked jobs
    const confirmedActualRevenue = bookedJobs.reduce((sum, j) => sum + (j.actual_value || 0), 0);

    // 2. Reported / Estimated Job Value of Booked Jobs:
    const bookedEstimatedOrActual = bookedJobs.reduce((sum, j) => sum + (j.actual_value || j.estimated_value || 0), 0);

    // 3. Pipeline Value: in-flight qualified leads not yet booked or dead
    const pipelineEstimatedValue = activeJobs
      .filter((j) => j.status === 'NEW' || j.status === 'CONTACTED')
      .reduce((sum, j) => sum + (j.estimated_value || 0), 0);

    // 4. Potential Revenue: all missed calls * average trade ticket size (from profile or $650 fallback)
    const avgTicket = 650;
    const potentialMissedCallValue = missedCallsCount * avgTicket;

    // Recovery Rate: Booked jobs / eligible missed calls
    const recoveryRatePercent = missedCallsCount > 0 ? Number(((bookedJobsCount / missedCallsCount) * 100).toFixed(1)) : 0;

    // ROI Multiple: Reported Recovered Value / subscription cost
    const reportedRecoveredRevenue = bookedEstimatedOrActual;
    const roiMultiple = subscriptionMonthlyDollars > 0 && reportedRecoveredRevenue > 0
      ? Number((reportedRecoveredRevenue / subscriptionMonthlyDollars).toFixed(1))
      : null;

    // "Needs Your Attention":
    // 1. All Emergency leads not marked DEAD
    // 2. NEW status leads awaiting initial response/call
    const needsAttention = jobs
      .filter((j) => (j.is_emergency || j.status === 'NEW') && j.status !== 'DEAD')
      .sort((a, b) => {
        // Emergencies first, then newest
        if (a.is_emergency && !b.is_emergency) return -1;
        if (!a.is_emergency && b.is_emergency) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      })
      .slice(0, 5);

    // Recent Recovered Leads (latest 5)
    const recentLeads = [...jobs]
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 6);

    return NextResponse.json({
      businessName,
      trade: profile?.trade || 'plumbing',
      subscriptionMonthlyDollars,
      summary: {
        missedCallsCount,
        textsDeliveredCount,
        customersRespondedCount,
        qualifiedLeadsCount,
        bookedJobsCount,
        recoveryRatePercent,
        reportedRecoveredRevenue,
        confirmedActualRevenue,
        pipelineEstimatedValue,
        potentialMissedCallValue,
        roiMultiple,
      },
      needsAttention,
      recentLeads,
      forwardingStatus: {
        configured: profile?.forwarding_configured ?? false,
        carrierName: profile?.carrier_name || 'Verizon Wireless',
        emergencyPhone: profile?.emergency_phone || '+12175550199',
        notificationPhone: profile?.notification_phone || '+12175550144',
      }
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
