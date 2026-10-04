async function main() {
  console.log('1. Authenticating as admin operator at http://localhost:3001/api/admin/login...');
  const loginRes = await fetch('http://localhost:3001/api/admin/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'OperatorMasterPass2026!Secure' }),
  });
  console.log('   Login HTTP status:', loginRes.status);
  const cookieHeader = loginRes.headers.get('set-cookie');
  console.log('   Set-Cookie received:', Boolean(cookieHeader));

  console.log('\n2. Fetching live launch gate evaluation at http://localhost:3001/api/admin/launch-gate...');
  const res = await fetch('http://localhost:3001/api/admin/launch-gate', {
    headers: {
      Cookie: cookieHeader || '',
    },
  });
  console.log('   Launch Gate HTTP status:', res.status);
  const data = await res.json();
  console.log('   Evaluated at:', data.evaluatedAt);
  console.log('   Total Gates:', data.totalGates);
  console.log('   Total Automated Gates:', data.totalAutomatedGates);
  console.log('   Passed Automated Gates:', data.passedAutomatedGates);
  console.log('   Manual Gates (Excluded from pass count):', data.manualGates);
  console.log('   Automated Readiness:', data.automatedReadinessPercent + '%');
  console.log('   Launch Ready Flag:', data.isLaunchReady);

  console.log('\n3. Evaluated Gates Breakdown with Live Evidence:');
  for (const g of data.gates) {
    const typeLabel = g.isManual ? 'MANUAL' : g.status.toUpperCase();
    console.log(`\n  [${typeLabel}] ${g.label} (${g.category})`);
    console.log(`    Status Reason: ${g.statusReason}`);
    if (g.evidence) {
      if (g.evidence.tenantId) console.log(`    Tenant ID: ${g.evidence.tenantId}`);
      if (g.evidence.recordId) console.log(`    Record ID: ${g.evidence.recordId}`);
      if (g.evidence.timestamp) console.log(`    Timestamp: ${g.evidence.timestamp}`);
      console.log(`    Details: ${g.evidence.details}`);
    }
  }
}

main().catch(console.error);
