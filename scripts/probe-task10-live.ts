import { createSessionToken } from '../src/lib/session';
import { db } from '../src/db/repository';
import { TwilioService } from '../src/lib/telecom/twilio-service';
import { drainQueue } from '../src/lib/billing/entitlement';

async function runLiveVerification() {
  const tokenA = createSessionToken({ accountId: 'acc-apex-plumbing', role: 'owner', isDemo: true });

  // 1. Anonymous /api/billing
  const anonRes = await fetch('http://127.0.0.1:3001/api/billing');
  console.log('LIVE 1 - Anonymous /api/billing status:', anonRes.status);

  // 2. Authenticated /api/billing
  const authRes = await fetch('http://127.0.0.1:3001/api/billing', {
    headers: { cookie: `mcr_session=${tokenA}` }
  });
  const data = await authRes.json();
  console.log('LIVE 2 - Authenticated /api/billing status:', authRes.status);
  console.log('LIVE 3 - Seeded stripe_customer_id:', data.subscription?.stripe_customer_id ?? 'undefined (clean)');
  console.log('LIVE 4 - Entitlement status:', data.entitlement?.status, 'entitled:', data.entitlement?.entitled);

  // 3. Create customer event
  const createCustRes = await fetch('http://127.0.0.1:3001/api/billing', {
    method: 'POST',
    headers: {
      cookie: `mcr_session=${tokenA}`,
      'content-type': 'application/json'
    },
    body: JSON.stringify({ action: 'create_customer', email: 'owner@apexplumbing.com' })
  });
  const custData = await createCustRes.json();
  console.log('LIVE 5 - Customer creation flow result:', custData.success, 'customerId:', custData.customerId.substring(0, 8) + '...');

  // Verify stamped customer ID in billing endpoint
  const authRes2 = await fetch('http://127.0.0.1:3001/api/billing', {
    headers: { cookie: `mcr_session=${tokenA}` }
  });
  const data2 = await authRes2.json();
  console.log('LIVE 6 - Stamped customerId in subscription:', data2.subscription?.stripe_customer_id === custData.customerId);

  // 4. Dunning gate test on inbound call
  db.updateSubscription('acc-apex-plumbing', { status: 'past_due' });
  const callRes = await TwilioService.handleInboundCall({
    CallSid: `CA_LIVE_DUNNING_${Date.now()}`,
    From: '+12175550999',
    To: '+12175550190'
  });
  console.log('LIVE 7 - Inbound call textBackTriggered during dunning:', callRes.textBackTriggered, 'reason:', callRes.reason);

  // 5. Drain queue test on past_due
  const drainRes = await drainQueue('acc-apex-plumbing', [{ id: 'item-1', action: 'sms' }, { id: 'item-2', action: 'sms' }]);
  console.log('LIVE 8 - Drain queue during dunning: blocked count:', drainRes.blocked.length, 'processed count:', drainRes.processed.length);

  // Clean up: reset to active without customer ID
  db.updateSubscription('acc-apex-plumbing', {
    status: 'active',
    stripe_customer_id: undefined,
    cancel_at_period_end: false
  });
}

runLiveVerification().catch(console.error);
