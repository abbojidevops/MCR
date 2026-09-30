import { NextRequest, NextResponse } from 'next/server';
import { SimulationEngine } from '@/lib/simulator';
import { db } from '@/db/repository';
import { getAuthenticatedAccountId } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    // Derive account identity exclusively from session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const body = await req.json();
    const { action, callerNumber, callerName, replyText, mediaUrl } = body;

    if (action === 'simulate_call') {
      const result = await SimulationEngine.simulateMissedCall(
        accountId,
        callerNumber || '+12175558833',
        callerName || 'Sarah Jenkins'
      );
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'simulate_reply') {
      if (!replyText) {
        return NextResponse.json({ error: 'replyText is required' }, { status: 400 });
      }
      const result = await SimulationEngine.simulateCustomerReply(
        accountId,
        callerNumber || '+12175558833',
        replyText,
        mediaUrl
      );
      return NextResponse.json({ success: true, ...result });
    }

    if (action === 'get_status') {
      const calls = db.getCallRecords(accountId);
      const jobs = db.getJobs(accountId);
      const convs = db.getConversations(accountId);
      const notifs = db.getNotifications(accountId);
      return NextResponse.json({ calls, jobs, conversations: convs, notifications: notifs });
    }

    return NextResponse.json({ error: 'Invalid simulator action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
