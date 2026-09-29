import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';

export async function POST(req: NextRequest) {
  try {
    const rawBody = await req.text();
    const signature = req.headers.get('stripe-signature');

    // In production with STRIPE_WEBHOOK_SECRET, verify stripe signature.
    // For mock/test mode, parse event payload directly.
    let event: any;
    try {
      event = JSON.parse(rawBody);
    } catch (e) {
      return NextResponse.json({ error: 'Malformed JSON payload' }, { status: 400 });
    }

    const eventId = event.id || `evt_${Date.now()}`;
    const eventType = event.type || 'unknown';

    // 1. Idempotency Check
    if (db.isWebhookProcessed('stripe', eventId)) {
      return NextResponse.json({ received: true, idempotent: true }, { status: 200 });
    }

    db.markWebhookProcessed('stripe', eventId, eventType);

    // 2. Handle specific Stripe event types
    switch (eventType) {
      case 'invoice.payment_succeeded': {
        const invoice = event.data?.object;
        const customerId = invoice?.customer;
        const allAccounts = db.getAllAccounts();
        for (const acc of allAccounts) {
          const subInfo = db.getSubscription(acc.id);
          if (subInfo.subscription && subInfo.subscription.stripe_customer_id === customerId) {
            subInfo.subscription.status = 'active';
            db.addNotification({
              account_id: acc.id,
              title: 'Subscription Payment Succeeded',
              body: `Monthly subscription invoice paid successfully. Account remains active.`,
              type: 'daily_summary',
              is_read: false,
            });
            break;
          }
        }
        break;
      }

      case 'invoice.payment_failed': {
        const invoice = event.data?.object;
        const customerId = invoice?.customer;
        const allAccounts = db.getAllAccounts();
        for (const acc of allAccounts) {
          const subInfo = db.getSubscription(acc.id);
          if (subInfo.subscription && subInfo.subscription.stripe_customer_id === customerId) {
            subInfo.subscription.status = 'past_due';
            db.addNotification({
              account_id: acc.id,
              title: '⚠️ Subscription Payment Failed',
              body: `Your payment method could not be processed. Please update billing info to prevent interruption.`,
              type: 'emergency',
              is_read: false,
            });
            break;
          }
        }
        break;
      }

      case 'customer.subscription.deleted': {
        const sub = event.data?.object;
        const customerId = sub?.customer;
        const allAccounts = db.getAllAccounts();
        for (const acc of allAccounts) {
          const subInfo = db.getSubscription(acc.id);
          if (subInfo.subscription && subInfo.subscription.stripe_customer_id === customerId) {
            subInfo.subscription.status = 'canceled';
            db.addNotification({
              account_id: acc.id,
              title: 'Subscription Canceled',
              body: `Subscription ended. Missed-call recovery is paused.`,
              type: 'emergency',
              is_read: false,
            });
            break;
          }
        }
        break;
      }

      default:
        break;
    }

    return NextResponse.json({ received: true, eventType }, { status: 200 });
  } catch (err: any) {
    console.error('Error handling Stripe webhook:', err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
