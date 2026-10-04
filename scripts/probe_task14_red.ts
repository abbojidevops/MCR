import fs from 'fs';
import path from 'path';

async function main() {
  console.log('--- TASK 14 RED PHASE PROBE ---');

  // Probe 1: src/lib/launch-gate.ts exists
  const hasLaunchGateLib = fs.existsSync(path.join(process.cwd(), 'src', 'lib', 'launch-gate.ts'));
  console.log(`PROBE 1 - src/lib/launch-gate.ts exists: ${hasLaunchGateLib}`);

  // Probe 2: tests/launch-gate.test.ts exists
  const hasLaunchGateTest = fs.existsSync(path.join(process.cwd(), 'tests', 'launch-gate.test.ts'));
  console.log(`PROBE 2 - tests/launch-gate.test.ts exists: ${hasLaunchGateTest}`);

  // Probe 3: Check if page.tsx contains file/route existence check for Gate 5
  const pagePath = path.join(process.cwd(), 'src', 'app', 'admin', 'launch-gate', 'page.tsx');
  const pageContent = fs.readFileSync(pagePath, 'utf-8');
  const hasFileExistenceGate = pageContent.includes('Routes /privacy, /terms, and /compliance deployed and active');
  console.log(`PROBE 3 - Gate 5 passes on file/route existence: ${hasFileExistenceGate}`);

  // Probe 4: Check if manual gates are excluded from pass count
  // In existing page.tsx: const passedCount = gates.filter((g) => g.status === 'passed').length;
  // const pct = Math.round((passedCount / gates.length) * 100); -> includes manual in denominator
  const dividesByAllGates = pageContent.includes('passedCount / gates.length');
  console.log(`PROBE 4 - Manual gates incorrectly counted in denominator: ${dividesByAllGates}`);

  // Probe 5: Check if customer authentication gate exists in page.tsx
  const hasCustomerAuthGate = pageContent.includes('Customer can sign in') || pageContent.includes('customer_authentication_live');
  console.log(`PROBE 5 - Customer credential sign-in gate exists: ${hasCustomerAuthGate}`);
}

main().catch(console.error);
