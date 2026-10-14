import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { PlanTier } from '@/types';
import { SEED_PLANS } from '@/db/seed-data';
import { PLAN_CONFIG } from '@/lib/constants';
import { requireTenantAuth } from '@/lib/authz';
import { checkSubscriptionEntitlement } from '@/lib/billing/entitlement';
import {
  createCheckoutSession,
  createStripeCustomer,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
} from '@/lib/stripe';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    // Strict tenant isolation: returns only caller's subscription
    const info = db.getSubscription(accountId);
    const entitlement = checkSubscriptionEntitlement(accountId);

    const callCap = info.plan?.included_calls || 200;
    const callsUsed = info.usage?.calls_count || 0;
    const usagePercent = callCap > 0 ? (callsUsed / callCap) * 100 : 0;
    const warning80Percent = usagePercent >= 80;

    // Honest billing-mode disclosure: the UI must never imply a live payment
    // gateway is connected when Stripe is switched off for this deployment.
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const isLiveStripe = Boolean(stripeKey && process.env.NEXT_PUBLIC_STRIPE_LIVE === 'true');

    return NextResponse.json({
      subscription: info.subscription,
      entitlement,
      currentPlan: info.plan,
      usage: info.usage,
      availablePlans: SEED_PLANS,
      planConfig: PLAN_CONFIG,
      usageWarning: warning80Percent,
      usagePercent: Number(usagePercent.toFixed(1)),
      overageNotice: warning80Percent
        ? `You have reached ${usagePercent.toFixed(0)}% of your monthly call cap (${callsUsed}/${callCap}). Automated text-backs continue uninterrupted under our soft cap.`
        : null,
      billing: {
        liveGateway: isLiveStripe,
        gateway: 'Stripe',
        mode: isLiveStripe ? 'live' : 'disabled',
        notice: isLiveStripe
          ? null
          : 'Card payments are disabled on this deployment. Plan changes are recorded locally and no charge is processed.',
      },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const body = await req.json();
    const { action, planTier, email } = body;

    const info = db.getSubscription(accountId);
    const stripeKey = process.env.STRIPE_SECRET_KEY;
    const isLiveStripe = Boolean(stripeKey && process.env.NEXT_PUBLIC_STRIPE_LIVE === 'true');

    // 1. Create Checkout Session
    if (action === 'create_checkout_session') {
      const targetTier = (planTier || 'pro') as PlanTier;
      const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3001';
      const checkoutResult = await createCheckoutSession(accountId, targetTier, appUrl);
      return NextResponse.json({ url: checkoutResult.url, customerId: checkoutResult.customerId });
    }

    // 2. Create Stripe Customer (Real creation event)
    if (action === 'create_customer') {
      const profile = db.getBusinessProfile(accountId);
      const cred = db.findCredentialByAccountId(accountId);
      const targetEmail = email || cred?.email || `${accountId}@example.com`;
      const custResult = await createStripeCustomer(accountId, targetEmail, profile?.business_name);
      return NextResponse.json({ success: true, customerId: custResult.customerId });
    }

    // 3. Cancel Subscription at Period End
    if (action === 'cancel_subscription') {
      const updated = cancelSubscriptionAtPeriodEnd(accountId);
      return NextResponse.json({
        success: true,
        cancelAtPeriodEnd: true,
        subscription: updated,
      });
    }

    // 4. Reactivate Subscription
    if (action === 'reactivate_subscription') {
      const updated = reactivateSubscription(accountId);
      return NextResponse.json({
        success: true,
        cancelAtPeriodEnd: false,
        subscription: updated,
      });
    }

    // 5. Billing Portal
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

    // Direct plan upgrade
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
