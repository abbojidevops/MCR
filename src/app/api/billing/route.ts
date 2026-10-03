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
    const { action, planTier } = body;

    const info = db.getSubscription(accountId);
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const isLiveStripe = Boolean(stripeKey && process.env.NEXT_PUBLIC_STRIPE_LIVE === 'true');

    if (action === 'create_checkout_session') {
      const targetTier = (planTier || 'pro') as PlanTier;
      const planPrice = targetTier === 'starter' ? 7900 : targetTier === 'business' ? 29900 : 14900;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';

      if (isLiveStripe) {
        try {
          const params = new URLSearchParams();
          params.append('mode', 'subscription');
          params.append('payment_method_types[]', 'card');
          params.append('line_items[0][price_data][currency]', 'usd');
          params.append('line_items[0][price_data][product_data][name]', `MCR ${targetTier.toUpperCase()} Plan`);
          params.append('line_items[0][price_data][unit_amount]', planPrice.toString());
          params.append('line_items[0][price_data][recurring][interval]', 'month');
          params.append('line_items[0][quantity]', '1');
          params.append('success_url', `${appUrl}/dashboard/billing?session_id={CHECKOUT_SESSION_ID}&plan=${targetTier}`);
          params.append('cancel_url', `${appUrl}/dashboard/billing`);

          const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${stripeKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          });
          const sessionData = await stripeRes.json();
          if (sessionData.url) {
            return NextResponse.json({ url: sessionData.url });
          }
        } catch (e: any) {
          console.warn('[Stripe API Error, falling back to instant upgrade]:', e.message);
        }
      }

      // Fallback / instant test activation
      if (info.subscription) {
        info.subscription.plan_id = targetTier;
        info.subscription.status = 'active';
        db.logAudit(accountId, 'UPGRADE_SUBSCRIPTION_PLAN', { planTier: targetTier, mode: 'test_checkout' });
      }
      return NextResponse.json({ url: `/dashboard/billing?upgraded=true&plan=${targetTier}` });
    }

    if (action === 'create_portal_session') {
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
      const customerId = info.subscription?.stripe_customer_id;

      if (isLiveStripe && customerId) {
        try {
          const params = new URLSearchParams();
          params.append('customer', customerId);
          params.append('return_url', `${appUrl}/dashboard/billing`);

          const portalRes = await fetch('https://api.stripe.com/v1/billing_portal/sessions', {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${stripeKey}`,
              'Content-Type': 'application/x-www-form-urlencoded',
            },
            body: params.toString(),
          });
          const portalData = await portalRes.json();
          if (portalData.url) {
            return NextResponse.json({ url: portalData.url });
          }
        } catch (e: any) {
          console.warn('[Stripe Portal API Error]:', e.message);
        }
      }

      return NextResponse.json({ url: `/dashboard/billing?portal_test=true` });
    }

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
