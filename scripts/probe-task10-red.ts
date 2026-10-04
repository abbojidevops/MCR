import { db } from '../src/db/repository';
import { TwilioService } from '../src/lib/telecom/twilio-service';

// RED 1: Seed data stamps fake cus_ ID
const subApex = db.getSubscription('acc-apex-plumbing').subscription;
console.log('RED 1 - Seeded stripe_customer_id:', subApex?.stripe_customer_id);

// RED 2: Past due account text-back
// Put sub into past_due
async function runProbe() {
  if (subApex) subApex.status = 'past_due';
  const res = await TwilioService.handleInboundCall({
    CallSid: 'CA_TEST_DUNNING_' + Date.now(),
    From: '+12175559988',
    To: '+12175550190'
  });
  console.log('RED 2 - Past due textBackTriggered:', res.textBackTriggered, 'reason:', res.reason);

  // Restore sub status for now
  if (subApex) subApex.status = 'active';
}
runProbe();
