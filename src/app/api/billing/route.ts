import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { PlanTier } from '@/types';
import { SEED_PLANS } from '@/db/seed-data';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || 'acc-apex-plumbing';

    const info = db.getSubscription(accountId);
    return NextResponse.json({
      subscription: info.subscription,
      currentPlan: info.plan,
      usage: info.usage,
      availablePlans: SEED_PLANS,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, planTier } = body;

    const targetAccount = accountId || 'acc-apex-plumbing';
    const info = db.getSubscription(targetAccount);

    if (info.subscription && planTier) {
      info.subscription.plan_id = planTier as PlanTier;
      info.subscription.status = 'active';
      db.logAudit(targetAccount, 'UPGRADE_SUBSCRIPTION_PLAN', { planTier });
    }

    return NextResponse.json({ success: true, subscription: info.subscription });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
