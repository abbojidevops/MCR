import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { verifyStripeSignature, processStripeWebhookEvent } from '@/lib/stripe';
import { dispatchAlert } from '@/lib/alert-dispatcher';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature');

    const stripeApiKey = process.env.STRIPE_SECRET_KEY;
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    // NOTE: the documented switch is NEXT_PUBLIC_STRIPE_LIVE (see .env.example,
    // RUNBOOK and src/lib/stripe.ts). This route previously gated signature
    // verification behind an undocumented `STRIPE_LIVE` variable AND
    // NODE_ENV === 'production', so in every documented configuration the check
    // was skipped entirely and forged events were processed as real billing
    // changes.
    const isLiveStripe = Boolean(stripeApiKey && process.env.NEXT_PUBLIC_STRIPE_LIVE === 'true');

    // 1. Live Stripe without a webhook secret cannot verify anything — fail closed.
    if (isLiveStripe && !webhookSecret) {
      dispatchAlert({
        level: 'error',
        source: 'stripe_webhook',
        title: 'Stripe Webhook Secret Missing',
        message: 'Live Stripe is enabled but STRIPE_WEBHOOK_SECRET is not configured; refusing to process webhooks',
      }).catch(() => {});
      return NextResponse.json(
        { error: 'Service Unavailable: STRIPE_WEBHOOK_SECRET not configured (fail-closed)' },
        { status: 503 }
      );
    }

    // 2. Cryptographic signature validation whenever Stripe is live or a secret is configured.
    if (isLiveStripe || webhookSecret) {
      if (!signature) {
        dispatchAlert({
          level: 'warning',
          source: 'stripe_webhook',
          title: 'Missing Stripe Webhook Signature',
          message: 'Stripe webhook received without stripe-signature header',
        }).catch(() => {});
        return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
      }
      if (!verifyStripeSignature(rawBody, signature, webhookSecret)) {
        dispatchAlert({
          level: 'warning',
          source: 'stripe_webhook',
          title: 'Invalid Stripe Webhook Signature',
          message: 'Stripe webhook signature validation failed (possible forgery or replay)',
        }).catch(() => {});
        return NextResponse.json({ error: 'Forbidden: Invalid stripe-signature' }, { status: 403 });
      }
    } else {
      // 3. No live Stripe credentials at all (staging/simulation): refuse to process.
      // Unauthenticated callers must never be able to mutate subscription state, and
      // the platform must not act on real billing events until it is configured.
      return NextResponse.json(
        {
          error:
            'Service Unavailable: Stripe webhook processing is disabled (no live Stripe configuration). Enable by setting STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET and NEXT_PUBLIC_STRIPE_LIVE=true.',
        },
        { status: 503 }
      );
    }

    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const eventId = event.id || `evt_${Date.now()}`;
    const eventType = event.type || 'unknown';

    // 1. Idempotency Check
    if (db.isWebhookProcessed('stripe', eventId)) {
      return NextResponse.json({ received: true, idempotent: true }, { status: 200 });
    }

    db.markWebhookProcessed('stripe', eventId, eventType);

    // 2. Delegate to honest Stripe event processor
    const result = processStripeWebhookEvent(event);

    return NextResponse.json({
      received: true,
      eventType,
      handled: result.handled,
      action: result.action,
      accountId: result.accountId,
    }, { status: 200 });
  } catch (err: any) {
    console.error('Error handling Stripe webhook:', err);
    dispatchAlert({
      level: 'error',
      source: 'stripe_webhook',
      title: 'Stripe Webhook Processing Exception',
      message: err?.message || 'Unknown stripe webhook exception',
      metadata: { error: String(err?.stack || err) },
    }).catch(() => {});
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
