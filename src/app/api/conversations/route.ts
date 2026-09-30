import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { getAuthenticatedAccountId } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // Derive account identity exclusively from authenticated session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId');

    if (conversationId) {
      const messages = db.getMessages(accountId, conversationId);
      return NextResponse.json({ messages });
    }

    const conversations = db.getConversations(accountId);
    // Sort conversations by newest first (Part 3.2)
    const sorted = [...conversations].sort((a, b) => {
      const timeA = new Date(a.last_message_at || a.created_at).getTime();
      const timeB = new Date(b.last_message_at || b.created_at).getTime();
      return timeB - timeA;
    });

    return NextResponse.json({ conversations: sorted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Derive account identity exclusively from authenticated session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const body = await req.json();
    const { conversationId, bodyText } = body;

    if (!conversationId || !bodyText) {
      return NextResponse.json({ error: 'conversationId and bodyText required' }, { status: 400 });
    }

    const conv = db.getConversations(accountId).find((c) => c.id === conversationId);
    if (!conv) {
      return NextResponse.json({ error: 'Conversation not found' }, { status: 404 });
    }

    const phoneNumbers = db.getPhoneNumbers(accountId);
    const mcrNumber = phoneNumbers[0]?.phone_number || '+12175550190';
    const recipientPhone = conv.contact?.phone_number || '+15550000000';

    // Store manual outbound message from owner
    const message = db.addMessage({
      accountId,
      conversationId,
      direction: 'outbound',
      fromNumber: mcrNumber,
      toNumber: recipientPhone,
      body: bodyText,
    });

    return NextResponse.json({ success: true, message });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
