/**
 * MCR - Database Reset & Reseeding Utility
 */

import { db } from '../src/db/repository';

console.log('🔄 Resetting MCR database to clean seed state...');
db.resetDatabase();
console.log('✅ Database reset successfully! Initial tenants, plans, and jobs restored.');
