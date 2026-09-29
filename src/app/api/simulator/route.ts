import { NextRequest, NextResponse } from 'next/server';
import { SimulationEngine } from '@/lib/simulator';
import { db } from '@/db/repository';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { action, accountId, callerNumber, callerName, replyText, mediaUrl } = body;

    const targetAccount = accountId || 'acc-apex-plumbing';

    if (action === 'simulate_call') {
      const result = await SimulationEngine.simulateMissedCall(
        targetAccount,
        callerNumber || '+12175558833',
        callerName || 'Sarah Connor'
      );
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'simulate_reply') {
      if (!replyText) {
        return NextResponse.json({ error: 'replyText is required' }, { status: 400 });
      }
      const result = await SimulationEngine.simulateCustomerReply(
        targetAccount,
        callerNumber || '+12175558833',
        replyText,
        mediaUrl
      );
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'get_status') {
      const calls = db.getCallRecords(targetAccount);
      const jobs = db.getJobs(targetAccount);
      const convs = db.getConversations(targetAccount);
      const notifs = db.getNotifications(targetAccount);
      return NextResponse.json({ calls, jobs, conversations: convs, notifications: notifs });
    }

    return NextResponse.json({ error: `Unknown action: ${action}` }, { status: 400 });
  } catch (error: any) {
    console.error('Simulation error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
