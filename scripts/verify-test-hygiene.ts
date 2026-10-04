/**
 * CI / Verification Script: Test Hygiene Account Count Invariance Check
 * 
 * Verifies that the full test suite leaves the database exactly as it found it.
 * Rule: Count before execution must strictly equal count after execution.
 * Any leaked or missing accounts fails the build immediately.
 */
import { execSync } from 'child_process';
import { db } from '../src/db/repository';

async function main() {
  console.log('🧪 [Test Hygiene Check] Verifying test suite database hygiene...');

  // 1. Snapshot pre-run accounts
  const beforeAccounts = db.getAllAccounts();
  const beforeCount = beforeAccounts.length;
  const beforeIds = beforeAccounts.map((a) => a.id).sort();
  console.log(`[Test Hygiene] Pre-suite account count: ${beforeCount} [${beforeIds.join(', ')}]`);

  // 2. Execute test suite with concurrency = 1
  console.log('[Test Hygiene] Executing test suite (concurrency: 1)...');
  try {
    execSync('npm test', { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
  } catch (error: any) {
    console.error('❌ [Test Hygiene] Test suite execution failed!');
    process.exit(1);
  }

  // 3. Snapshot post-run accounts
  const afterAccounts = db.getAllAccounts();
  const afterCount = afterAccounts.length;
  const afterIds = afterAccounts.map((a) => a.id).sort();
  console.log(`[Test Hygiene] Post-suite account count: ${afterCount} [${afterIds.join(', ')}]`);

  // 4. Invariance Assertion
  const leakedIds = afterIds.filter((id) => !beforeIds.includes(id));
  const missingIds = beforeIds.filter((id) => !afterIds.includes(id));

  if (leakedIds.length > 0) {
    console.error(`❌ [Test Hygiene VIOLATION] Leaked fixture accounts detected: ${leakedIds.join(', ')}`);
    process.exit(1);
  }

  if (missingIds.length > 0) {
    console.error(`❌ [Test Hygiene VIOLATION] Baseline accounts deleted: ${missingIds.join(', ')}`);
    process.exit(1);
  }

  if (beforeCount !== afterCount) {
    console.error(`❌ [Test Hygiene VIOLATION] Account count mismatch: before=${beforeCount}, after=${afterCount}`);
    process.exit(1);
  }

  console.log(`✅ [Test Hygiene PASSED] Database left in exact pristine state (Account count: ${beforeCount} -> ${afterCount}).`);
}

main().catch((err) => {
  console.error('Unhandled hygiene check error:', err);
  process.exit(1);
});
