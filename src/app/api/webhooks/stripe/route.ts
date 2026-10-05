import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { verifyStripeSignature, processStripeWebhookEvent } from '@/lib/stripe';
import { dispatchAlert } from '@/lib/alert-dispatcher';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature');

    // In production with STRIPE_WEBHOOK_SECRET, verify stripe signature.
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    if (webhookSecret && process.env.NODE_ENV === 'production' && process.env.STRIPE_LIVE === 'true') {
      if (!signature) {
        dispatchAlert({
          level: 'warning',
          source: 'stripe_webhook',
          title: 'Missing Stripe Webhook Signature',
          message: 'Stripe webhook received without stripe-signature header',
        }).catch(() => {});
        return NextResponse.json({ error: 'Missing stripe-signature header' }, { status: 400 });
      }
      const isValid = verifyStripeSignature(rawBody, signature, webhookSecret);
      if (!isValid) {
        dispatchAlert({
          level: 'warning',
          source: 'stripe_webhook',
          title: 'Invalid Stripe Webhook Signature',
          message: 'Stripe webhook signature validation failed (possible forgery)',
        }).catch(() => {});
        return NextResponse.json({ error: 'Invalid stripe-signature' }, { status: 400 });
      }
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
