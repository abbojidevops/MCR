import { db } from '@/db/repository';
import { isCarrierVerifiedRegistration } from '@/lib/compliance-machine';

/**
 * Server-only helper to check whether any non-demo tenant has an authentic, carrier-verified sms_live registration.
 */
export function getSystemCarrierLiveStatus(): boolean {
  try {
    const allAccounts = db.getAllAccounts();
    const nonDemoAccounts = allAccounts.filter((a) => !a.is_demo);
    const liveNonDemo = nonDemoAccounts.filter((a) => {
      const comp = db.getCompliance(a.id);
      return Boolean(comp && comp.status === 'sms_live' && isCarrierVerifiedRegistration(comp, a));
    });
    return liveNonDemo.length > 0;
  } catch {
    return false;
  }
}
