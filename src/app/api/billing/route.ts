import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { PlanTier } from '@/types';
import { SEED_PLANS } from '@/db/seed-data';
import { getAuthenticatedAccountId } from '@/lib/session';
import { PLAN_CONFIG } from '@/lib/constants';

export async function GET(req: NextRequest) {
  try {
    // Derive account identity exclusively from session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const info = db.getSubscription(accountId);

    const callCap = info.plan?.included_calls || 200;
    const callsUsed = info.usage?.calls_count || 0;
    const usagePercent = callCap > 0 ? (callsUsed / callCap) * 100 : 0;
    const warning80Percent = usagePercent >= 80;

    return NextResponse.json({
      subscription: info.subscription,
      currentPlan: info.plan,
      usage: info.usage,
      availablePlans: SEED_PLANS,
      planConfig: PLAN_CONFIG,
      usageWarning: warning80Percent,
      usagePercent: Number(usagePercent.toFixed(1)),
      overageNotice: warning80Percent
        ? `You have reached ${usagePercent.toFixed(0)}% of your monthly call cap (${callsUsed}/${callCap}). Automated text-backs continue uninterrupted under our soft cap.`
        : null,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Derive account identity exclusively from session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const body = await req.json();
    const { planTier } = body;

    const info = db.getSubscription(accountId);

    if (info.subscription && planTier) {
      info.subscription.plan_id = planTier as PlanTier;
      info.subscription.status = 'active';
      db.logAudit(accountId, 'UPGRADE_SUBSCRIPTION_PLAN', { planTier });
    }

    return NextResponse.json({ success: true, subscription: info.subscription });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
