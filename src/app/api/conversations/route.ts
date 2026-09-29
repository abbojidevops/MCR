import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || 'acc-apex-plumbing';
    const conversationId = searchParams.get('conversationId');

    if (conversationId) {
      const messages = db.getMessages(accountId, conversationId);
      return NextResponse.json({ messages });
    }

    const conversations = db.getConversations(accountId);
    return NextResponse.json({ conversations });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, conversationId, bodyText } = body;

    if (!conversationId || !bodyText) {
      return NextResponse.json({ error: 'conversationId and bodyText required' }, { status: 400 });
    }

    const targetAccount = accountId || 'acc-apex-plumbing';
    const conv = db.getConversations(targetAccount).find((c) => c.id === conversationId);
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const phoneNumbers = db.getPhoneNumbers(targetAccount);
    const mcrNumber = phoneNumbers[0]?.phone_number || '+12175550190';
    const recipientPhone = conv.contact?.phone_number || '+15550000000';

    // Store manual outbound message from owner
    const message = db.addMessage({
      accountId: targetAccount,
      conversationId,
      direction: 'outbound',
      fromNumber: mcrNumber,
      toNumber: recipientPhone,
      body: bodyText,
      twilioMessageSid: `msg_owner_${Date.now()}`,
    });

    db.logAudit(targetAccount, 'SEND_OWNER_SMS', { conversationId, recipientPhone });

    return NextResponse.json({ success: true, message });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
