(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'fs';
import * as path from 'path';
import { NextRequest } from 'next/server';

// Domain and Auth modules
import { db } from '@/db/repository';
import { createSessionToken, SESSION_COOKIE_NAME } from '@/lib/session';
import { checkSubscriptionEntitlement, drainQueue } from '@/lib/billing/entitlement';
import {
  createStripeCustomer,
  createCheckoutSession,
  cancelSubscriptionAtPeriodEnd,
  reactivateSubscription,
  processStripeWebhookEvent,
} from '@/lib/stripe';
import { TwilioService } from '@/lib/telecom/twilio-service';

// Route handler
import { GET as billingGet, POST as billingPost } from '@/app/api/billing/route';

const TENANT_A = 'acc-apex-plumbing';
const TENANT_B = 'acc-coolbreeze-hvac';

function createMockRequest(
  url: string,
  options: { method?: string; body?: any; token?: string; headers?: Record<string, string> } = {}
) {
  const reqHeaders = new Headers(options.headers || {});
  if (options.token) {
    reqHeaders.set('cookie', `${SESSION_COOKIE_NAME}=${options.token}`);
  }
  if (options.body) {
    reqHeaders.set('content-type', 'application/json');
  }

  return new NextRequest(new URL(url, 'http://localhost:3001'), {
    method: options.method || 'GET',
    headers: reqHeaders,
    body: options.body ? JSON.stringify(options.body) : undefined,
  });
}

test('B1: Billing Endpoints are Session-Scoped (Reject Anonymous & Isolate Tenants)', async () => {
  // 1. Anonymous caller receives 401
  const anonReq = createMockRequest('http://localhost:3001/api/billing');
  const anonRes = await billingGet(anonReq);
  assert.equal(anonRes.status, 401, 'Anonymous caller to /api/billing must receive 401');

  // 2. Authenticated Tenant A caller receives Tenant A subscription only
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: true });
  const authReqA = createMockRequest('http://localhost:3001/api/billing', { token: tokenA });
  const authResA = await billingGet(authReqA);
  assert.equal(authResA.status, 200);
  const dataA = await authResA.json();
  assert.equal(dataA.subscription.account_id, TENANT_A);
  assert.ok(dataA.entitlement);
  assert.equal(dataA.entitlement.entitled, true);
});

test('B2: Honest Seed — No Fake cus_ Stamped in Seed Data', () => {
  // Fresh seed records must NOT contain fake cus_ or sub_ placeholders
  const sub = db.getSubscription(TENANT_A).subscription;
  assert.ok(sub, 'Subscription record must exist');
  assert.equal(
    sub.stripe_customer_id,
    undefined,
    'Seed data must not stamp a fake cus_apex_demo_123 customer ID'
  );
  assert.equal(
    sub.stripe_subscription_id,
    undefined,
    'Seed data must not stamp a fake sub_apex_demo_123 subscription ID'
  );
});

test('B3: Dunning Entitlement Gate — Inactive/Past-Due Subscription Blocks Automated Operations', async () => {
  // Temporarily transition to past_due
  db.updateSubscription(TENANT_A, { status: 'past_due' });

  const entitlement = checkSubscriptionEntitlement(TENANT_A);
  assert.equal(entitlement.entitled, false, 'past_due subscription must not be entitled');
  assert.equal(entitlement.status, 'past_due');
  assert.ok(entitlement.reason?.includes('past_due'));

  // Attempting inbound call recovery while past_due must refuse text-back
  const callResult = await TwilioService.handleInboundCall({
    CallSid: `CA_DUNNING_BLOCK_${Date.now()}`,
    From: '+12175558811',
    To: '+12175550190',
  });

  assert.equal(callResult.textBackTriggered, false, 'Automated text-back must be blocked during dunning');
  assert.ok(callResult.reason.includes('Subscription not entitled'));

  // Restore active status
  db.updateSubscription(TENANT_A, { status: 'active' });
  assert.equal(checkSubscriptionEntitlement(TENANT_A).entitled, true);
});

test('B4: Honest Drain Reporting — Inactive Subscription Reports blocked[] Rather Than Silently Continuing', async () => {
  // Put subscription into past_due
  db.updateSubscription(TENANT_A, { status: 'past_due' });

  const pendingItems = [
    { id: 'item-1', action: 'send_qualification_sms', recipient: '+12175550101' },
    { id: 'item-2', action: 'send_daily_flash', recipient: '+12175550102' },
  ];

  let processExecuted = false;
  const result = await drainQueue(TENANT_A, pendingItems, async () => {
    processExecuted = true;
  });

  assert.equal(processExecuted, false, 'No items should be processed on inactive subscription');
  assert.equal(result.entitled, false);
  assert.equal(result.processed.length, 0);
  assert.equal(result.blocked.length, 2, 'All items must be reported in blocked[]');
  assert.equal(result.blocked[0].item.id, 'item-1');
  assert.ok(result.blocked[0].reason.includes('past_due'));

  // Restore active status and drain again
  db.updateSubscription(TENANT_A, { status: 'active' });
  const successResult = await drainQueue(TENANT_A, pendingItems, async (item) => {
    // Process ok
  });
  assert.equal(successResult.entitled, true);
  assert.equal(successResult.processed.length, 2);
  assert.equal(successResult.blocked.length, 0);
});

test('B5: Cancellation at Period End — Account Works Until Period Ends', () => {
  const futurePeriodEnd = new Date(Date.now() + 5 * 86400000).toISOString(); // 5 days from now
  db.updateSubscription(TENANT_A, {
    status: 'active',
    cancel_at_period_end: true,
    current_period_end: futurePeriodEnd,
  });

  const nowDuringPeriod = new Date(Date.now() + 2 * 86400000); // 2 days from now
  const entitlement = checkSubscriptionEntitlement(TENANT_A, nowDuringPeriod);

  assert.equal(entitlement.entitled, true, 'Account must still work until period ends');
  assert.equal(entitlement.cancelAtPeriodEnd, true);
});

test('B6: Cancellation at Period End — Account Stops Working After Period Ends', () => {
  const pastPeriodEnd = new Date(Date.now() - 2 * 86400000).toISOString(); // 2 days ago
  db.updateSubscription(TENANT_A, {
    status: 'active',
    cancel_at_period_end: true,
    current_period_end: pastPeriodEnd,
  });

  const nowAfterPeriod = new Date();
  const entitlement = checkSubscriptionEntitlement(TENANT_A, nowAfterPeriod);

  assert.equal(entitlement.entitled, false, 'Account must stop working after cancellation period ends');
  assert.equal(entitlement.status, 'period_ended');
  assert.ok(entitlement.reason?.includes('period end'));

  // Restore clean active state
  db.updateSubscription(TENANT_A, {
    status: 'active',
    cancel_at_period_end: false,
    current_period_end: new Date(Date.now() + 15 * 86400000).toISOString(),
  });
});

test('B7: Stripe Webhook Lifecycle — Mutates Subscription and Dunning Honest State', () => {
  // First ensure customer ID is assigned
  const testCustomerId = 'cus_webhook_test_99';
  db.updateSubscription(TENANT_A, { stripe_customer_id: testCustomerId, status: 'active' });

  // 1. Payment Failed event -> moves to past_due
  const failedEvent = {
    id: `evt_fail_${Date.now()}`,
    type: 'invoice.payment_failed',
    data: { object: { customer: testCustomerId } },
  };
  const res1 = processStripeWebhookEvent(failedEvent);
  assert.equal(res1.handled, true);
  assert.equal(res1.action, 'payment_failed_dunning');
  assert.equal(db.getSubscription(TENANT_A).subscription?.status, 'past_due');

  // 2. Subscription Updated event -> updates cancel_at_period_end
  const updatedEvent = {
    id: `evt_update_${Date.now()}`,
    type: 'customer.subscription.updated',
    data: {
      object: {
        customer: testCustomerId,
        cancel_at_period_end: true,
        current_period_end: Math.floor(Date.now() / 1000) + 86400 * 7,
      },
    },
  };
  const res2 = processStripeWebhookEvent(updatedEvent);
  assert.equal(res2.handled, true);
  assert.equal(db.getSubscription(TENANT_A).subscription?.cancel_at_period_end, true);

  // 3. Payment Succeeded event -> restores to active
  const successEvent = {
    id: `evt_succ_${Date.now()}`,
    type: 'invoice.payment_succeeded',
    data: { object: { customer: testCustomerId } },
  };
  const res3 = processStripeWebhookEvent(successEvent);
  assert.equal(res3.handled, true);
  assert.equal(res3.action, 'payment_succeeded');
  assert.equal(db.getSubscription(TENANT_A).subscription?.status, 'active');

  // Reset clean state
  db.updateSubscription(TENANT_A, {
    stripe_customer_id: undefined,
    cancel_at_period_end: false,
  });
});

test('B8: Customer Creation Flow — Stamps Customer ID upon Real Creation / Checkout Event', async () => {
  const tokenA = createSessionToken({ accountId: TENANT_A, role: 'owner', isDemo: true });

  const createReq = createMockRequest('http://localhost:3001/api/billing', {
    method: 'POST',
    token: tokenA,
    body: { action: 'create_customer', email: 'owner@apexplumbing.com' },
  });

  const res = await billingPost(createReq);
  assert.equal(res.status, 200);
  const data = await res.json();
  assert.equal(data.success, true);
  assert.ok(data.customerId.startsWith('cus_'));

  // Verify it is recorded in the database
  const currentSub = db.getSubscription(TENANT_A).subscription;
  assert.equal(currentSub?.stripe_customer_id, data.customerId);

  // Reset clean state
  db.updateSubscription(TENANT_A, { stripe_customer_id: undefined });
});

// ---------------------------------------------------------------------------
// STRIPE-1..STRIPE-5 — Webhook Authentication Boundary
//
// Staging runs with no live Stripe credentials, exactly as deployed. The route
// previously skipped signature verification unless an undocumented STRIPE_LIVE
// variable was set AND NODE_ENV was 'production', so any anonymous caller could
// POST forged events that mutated subscription state.
// ---------------------------------------------------------------------------

import crypto from 'crypto';
import { POST as stripeWebhookPost } from '@/app/api/webhooks/stripe/route';

function stripeRequest(body: any, headers: Record<string, string> = {}, rawBody?: string) {
  return new NextRequest(new URL('http://localhost:3001/api/webhooks/stripe'), {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: rawBody !== undefined ? rawBody : JSON.stringify(body),
  });
}

function stripeSignature(payload: string, secret: string, timestampSeconds = Math.floor(Date.now() / 1000)) {
  const sig = crypto.createHmac('sha256', secret).update(`${timestampSeconds}.${payload}`).digest('hex');
  return `t=${timestampSeconds},v1=${sig}`;
}

function withEnv(vars: Record<string, string | undefined>, fn: () => Promise<void>) {
  const previous = Object.fromEntries(Object.keys(vars).map((k) => [k, process.env[k]]));
  for (const [k, v] of Object.entries(vars)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  return fn().finally(() => {
    for (const [k, v] of Object.entries(previous)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  });
}

test('STRIPE-1: Staging (no live Stripe config) refuses anonymous webhooks without mutating billing state', async () => {
  await withEnv(
    { STRIPE_SECRET_KEY: undefined, STRIPE_WEBHOOK_SECRET: undefined, NEXT_PUBLIC_STRIPE_LIVE: undefined },
    async () => {
      const before = db.getSubscription(TENANT_A).subscription;
      const beforeTier = before?.plan_id;
      const beforeStatus = before?.status;

      const res = await stripeWebhookPost(
        stripeRequest({
          id: 'evt_forged_staging_1',
          type: 'customer.subscription.updated',
          data: { object: { metadata: { accountId: TENANT_A }, plan: { id: 'price_business' } } },
        })
      );

      assert.equal(res.status, 503, 'Anonymous webhooks must be refused fail-closed while Stripe is not live');
      const body = await res.json();
      assert.match(body.error, /disabled|fail-closed/i);

      const after = db.getSubscription(TENANT_A).subscription;
      assert.equal(after?.plan_id, beforeTier, 'A forged webhook must not mutate subscription state');
      assert.equal(after?.status, beforeStatus, 'A forged webhook must not mutate subscription status');
      assert.equal(
        db.isWebhookProcessed('stripe', 'evt_forged_staging_1'),
        false,
        'Refused webhooks must not be recorded as processed'
      );
    }
  );
});

test('STRIPE-2: Live Stripe without STRIPE_WEBHOOK_SECRET fails closed with 503', async () => {
  await withEnv(
    { STRIPE_SECRET_KEY: 'sk_live_test_key', STRIPE_WEBHOOK_SECRET: undefined, NEXT_PUBLIC_STRIPE_LIVE: 'true' },
    async () => {
      const res = await stripeWebhookPost(
        stripeRequest({ id: 'evt_live_no_secret', type: 'invoice.paid', data: { object: {} } })
      );
      assert.equal(res.status, 503, 'Live Stripe without a webhook secret must refuse all webhooks');
      const body = await res.json();
      assert.match(body.error, /STRIPE_WEBHOOK_SECRET/);
    }
  );
});

test('STRIPE-3: Live Stripe rejects unsigned, forged, and replayed webhooks', async () => {
  const secret = 'whsec_staging_verification_secret';
  await withEnv(
    { STRIPE_SECRET_KEY: 'sk_live_test_key', STRIPE_WEBHOOK_SECRET: secret, NEXT_PUBLIC_STRIPE_LIVE: 'true' },
    async () => {
      const payload = JSON.stringify({
        id: 'evt_live_forged',
        type: 'customer.subscription.updated',
        data: { object: { metadata: { accountId: TENANT_A } } },
      });

      // 1. No signature header
      const unsigned = await stripeWebhookPost(stripeRequest(null, {}, payload));
      assert.equal(unsigned.status, 400, 'Missing signature must be refused with 400');

      // 2. Well-formed but forged signature
      const forged = await stripeWebhookPost(
        stripeRequest(null, { 'stripe-signature': 't=1700000000,v1=' + 'a'.repeat(64) }, payload)
      );
      assert.equal(forged.status, 403, 'Forged signature must be refused with 403');

      // 3. Signature computed over a different body (tampered payload)
      const tampered = await stripeWebhookPost(
        stripeRequest(null, { 'stripe-signature': stripeSignature('{"different":true}', secret) }, payload)
      );
      assert.equal(tampered.status, 403, 'Signature mismatch must be refused');

      // 4. Valid signature but stale timestamp (replay of an old event)
      const staleSignature = stripeSignature(payload, secret, Math.floor(Date.now() / 1000) - 3600);
      const replayed = await stripeWebhookPost(stripeRequest(null, { 'stripe-signature': staleSignature }, payload));
      assert.equal(replayed.status, 403, 'A signature outside the replay tolerance window must be refused');
    }
  );
});

test('STRIPE-4: Live Stripe accepts a correctly signed webhook and processes it once (idempotent)', async () => {
  const secret = 'whsec_staging_verification_secret';
  await withEnv(
    { STRIPE_SECRET_KEY: 'sk_live_test_key', STRIPE_WEBHOOK_SECRET: secret, NEXT_PUBLIC_STRIPE_LIVE: 'true' },
    async () => {
      const payload = JSON.stringify({
        id: 'evt_live_signed_ok',
        type: 'invoice.payment_failed',
        data: { object: { customer: 'cus_test_staging', metadata: { accountId: TENANT_B } } },
      });
      const headers = { 'stripe-signature': stripeSignature(payload, secret) };

      const first = await stripeWebhookPost(stripeRequest(null, headers, payload));
      assert.equal(first.status, 200, `Correctly signed webhook must be processed (got ${first.status})`);
      const firstBody = await first.json();
      assert.equal(firstBody.received, true);

      const second = await stripeWebhookPost(stripeRequest(null, headers, payload));
      assert.equal(second.status, 200);
      const secondBody = await second.json();
      assert.equal(secondBody.idempotent, true, 'A replayed webhook id must be reported as idempotent');

      db.clearProcessedWebhooks();
    }
  );
});

test('STRIPE-5: Route Uses the Documented NEXT_PUBLIC_STRIPE_LIVE Switch', () => {
  const routePath = path.join(process.cwd(), 'src', 'app', 'api', 'webhooks', 'stripe', 'route.ts');
  const source = fs.readFileSync(routePath, 'utf-8');

  assert.ok(
    source.includes('NEXT_PUBLIC_STRIPE_LIVE'),
    'Stripe webhook route must read NEXT_PUBLIC_STRIPE_LIVE, the variable documented in .env.example and used by the billing library'
  );
  assert.equal(
    /process\.env\.STRIPE_LIVE(?!_)/.test(source),
    false,
    'Stripe webhook route must not gate verification on the undocumented STRIPE_LIVE variable'
  );
});
