import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { requireTenantAuth } from '@/lib/authz';
import { notFoundResponse } from '@/lib/api-errors';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId');

    if (conversationId) {
      const messages = db.getMessages(accountId, conversationId);
      if (messages === null) {
        return notFoundResponse();
      }
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
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const body = await req.json();
    const { conversationId, bodyText } = body;

    if (!conversationId || !bodyText) {
      return NextResponse.json({ error: 'conversationId and bodyText required' }, { status: 400 });
    }

    const conv = db.getConversation(accountId, conversationId);
    if (!conv) {
      return notFoundResponse();
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
