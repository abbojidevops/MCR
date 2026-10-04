import fs from 'fs';
import { db } from '../src/db/repository';

// Measure current system status
const allAccounts = db.getAllAccounts();
const nonDemoAccounts = allAccounts.filter((a) => !a.is_demo);
const liveNonDemo = nonDemoAccounts.filter((a) => {
  const comp = db.getCompliance(a.id);
  return comp && comp.status === 'sms_live' && comp.last_updated_by === 'carrier_webhook';
});

console.log('System state: live carrier registrations =', liveNonDemo.length);

// Check landing page source
const landingSource = fs.readFileSync('src/app/page.tsx', 'utf-8');
const hasRegistered = landingSource.includes('10DLC registered');
const hasCompliant = landingSource.includes('10DLC Compliant');

console.log('RED 1 - Typed "10DLC registered" present without live registration:', hasRegistered);
console.log('RED 2 - Typed "10DLC Compliant" present without live registration:', hasCompliant);
