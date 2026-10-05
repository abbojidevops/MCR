/**
 * CI / Verification Script: Test Hygiene & Gate Stability Invariance Check
 * 
 * Verifies that the full test suite leaves the database exactly as it found it:
 * 1. Multi-Table Invariance: covers accounts, credentials, compliance, jobs, conversations, calls.
 *    Count before execution must strictly equal count after execution.
 * 2. Gate Stability: evaluateLaunchGates() before and after must report identical status for all gates.
 *    A test suite must not be able to move or green a gate through leftover fixtures.
 */
import { execSync } from 'child_process';
import { db } from '../src/db/repository';
import { evaluateLaunchGates } from '../src/lib/launch-gate';

export interface HygieneVerificationResult {
  passed: boolean;
  tableCountsBefore: Record<string, number>;
  tableCountsAfter: Record<string, number>;
  gatesBefore: { id: string; status: string }[];
  gatesAfter: { id: string; status: string }[];
  violations: string[];
}

export function verifyStateInvariance(options: { runTests?: boolean } = {}): HygieneVerificationResult {
  const violations: string[] = [];

  // 1. Pre-execution snapshots
  const beforeCounts = db.getTableCounts();
  const beforeSnapshots = db.getTableSnapshots();
  const beforeGates = evaluateLaunchGates().gates.map((g) => ({ id: g.id, status: g.status }));

  console.log('🧪 [Test Hygiene & Gate Stability Check] Pre-suite baseline:');
  console.log(`   Accounts:      ${beforeCounts.accounts} [${beforeSnapshots.accounts.join(', ')}]`);
  console.log(`   Credentials:   ${beforeCounts.credentials}`);
  console.log(`   Compliance:    ${beforeCounts.compliance}`);
  console.log(`   Jobs:          ${beforeCounts.jobs}`);
  console.log(`   Conversations: ${beforeCounts.conversations}`);
  console.log(`   Calls:         ${beforeCounts.calls}`);
  console.log(`   Launch Gates:  ${beforeGates.filter(g => g.status === 'passed').length} passed, ${beforeGates.filter(g => g.status === 'failed').length} failed`);

  // 2. Optionally run test suite
  if (options.runTests) {
    console.log('\n[Test Hygiene] Executing test suite (concurrency: 1)...');
    try {
      execSync('npm test', { stdio: 'inherit', env: { ...process.env, NODE_ENV: 'test' } });
    } catch (error: any) {
      console.error('❌ [Test Hygiene] Test suite execution failed!');
      throw new Error('Test suite execution failed');
    }
  }

  // 3. Post-execution snapshots
  const afterCounts = db.getTableCounts();
  const afterSnapshots = db.getTableSnapshots();
  const afterGates = evaluateLaunchGates().gates.map((g) => ({ id: g.id, status: g.status }));

  console.log('\n🧪 [Test Hygiene & Gate Stability Check] Post-suite verification:');
  console.log(`   Accounts:      ${afterCounts.accounts} (delta: ${afterCounts.accounts - beforeCounts.accounts})`);
  console.log(`   Credentials:   ${afterCounts.credentials} (delta: ${afterCounts.credentials - beforeCounts.credentials})`);
  console.log(`   Compliance:    ${afterCounts.compliance} (delta: ${afterCounts.compliance - beforeCounts.compliance})`);
  console.log(`   Jobs:          ${afterCounts.jobs} (delta: ${afterCounts.jobs - beforeCounts.jobs})`);
  console.log(`   Conversations: ${afterCounts.conversations} (delta: ${afterCounts.conversations - beforeCounts.conversations})`);
  console.log(`   Calls:         ${afterCounts.calls} (delta: ${afterCounts.calls - beforeCounts.calls})`);

  // 4. Multi-Table Invariance Checks
  const tables = ['accounts', 'credentials', 'compliance', 'jobs', 'conversations', 'calls'] as const;
  for (const table of tables) {
    const beforeC = beforeCounts[table];
    const afterC = afterCounts[table];
    if (beforeC !== afterC) {
      violations.push(`Table count mismatch on "${table}": before=${beforeC}, after=${afterC}`);
    }

    const beforeIds = beforeSnapshots[table];
    const afterIds = afterSnapshots[table];
    const leaked = afterIds.filter((id) => !beforeIds.includes(id));
    const missing = beforeIds.filter((id) => !afterIds.includes(id));

    if (leaked.length > 0) {
      violations.push(`Leaked rows in table "${table}": ${leaked.join(', ')}`);
    }
    if (missing.length > 0) {
      violations.push(`Missing baseline rows in table "${table}": ${missing.join(', ')}`);
    }
  }

  // 5. Gate Stability Invariance Checks
  for (const beforeGate of beforeGates) {
    const afterGate = afterGates.find((g) => g.id === beforeGate.id);
    if (!afterGate) {
      violations.push(`Gate "${beforeGate.id}" disappeared from post-suite evaluation`);
    } else if (afterGate.status !== beforeGate.status) {
      violations.push(
        `Gate stability violation: gate "${beforeGate.id}" status changed from "${beforeGate.status}" to "${afterGate.status}"`
      );
    }
  }

  const passed = violations.length === 0;
  if (!passed) {
    console.error('\n❌ [Test Hygiene & Gate Stability FAILED]:');
    for (const v of violations) {
      console.error(`   - ${v}`);
    }
  } else {
    console.log(`\n✅ [Test Hygiene PASSED] Database left in exact pristine state across all 6 tables.`);
    console.log(`✅ [Gate Stability PASSED] All ${beforeGates.length} launch gates maintained identical status.`);
  }

  return {
    passed,
    tableCountsBefore: beforeCounts,
    tableCountsAfter: afterCounts,
    gatesBefore: beforeGates,
    gatesAfter: afterGates,
    violations,
  };
}

async function main() {
  const result = verifyStateInvariance({ runTests: true });
  if (!result.passed) {
    process.exit(1);
  }
}

if (process.argv[1] && process.argv[1].endsWith('verify-test-hygiene.ts')) {
  main().catch((err) => {
    console.error('Unhandled hygiene check error:', err);
    process.exit(1);
  });
}
