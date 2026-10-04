import { createSessionToken } from '../src/lib/session';

async function testLive() {
  const tokenA = createSessionToken({ accountId: 'acc-apex-plumbing', role: 'owner', isDemo: true });
  const tokenEmpty = createSessionToken({ accountId: 'acc-empty-tenant-testing', role: 'owner', isDemo: false });

  // 1. Quiet window on Apex Plumbing
  const res1 = await fetch('http://127.0.0.1:3001/api/reports?startDate=2021-01-01T00:00:00.000Z&endDate=2021-01-02T23:59:59.999Z', {
    headers: { cookie: `mcr_session=${tokenA}` }
  });
  const data1 = await res1.json();
  console.log('LIVE 1 - Quiet window calls:', data1.metrics.missedCallsCount);
  console.log('LIVE 2 - Quiet window periodLabel:', data1.metrics.periodLabel);
  console.log('LIVE 3 - Quiet window potential value: $' + data1.metrics.potentialMissedCallValue);
  console.log('LIVE 4 - Quiet window gap analysis:', JSON.stringify(data1.metrics.textBackGapAnalysis));

  // 2. Empty tenant weekly report
  const res2 = await fetch('http://127.0.0.1:3001/api/reports', {
    headers: { cookie: `mcr_session=${tokenEmpty}` }
  });
  const data2 = await res2.json();
  console.log('LIVE 5 - Empty tenant weekly calls:', data2.weekly.missedCallsCount);
  console.log('LIVE 6 - Empty tenant weekly summaryText snippet:', data2.weekly.summaryText.split('\n')[0]);
  console.log('LIVE 7 - Basis average ticket assumption: $' + data1.metrics.averageTicketAssumption);
}

testLive().catch(console.error);
