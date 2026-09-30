import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { getAuthenticatedAccountId } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // Derive account identity exclusively from session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const cannedReplies = db.getCannedReplies(accountId);
    return NextResponse.json({ cannedReplies });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    // Derive account identity exclusively from session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const body = await req.json();
    const { title, shortcut, bodyText } = body;

    if (!title || !bodyText) {
      return NextResponse.json({ error: 'title and bodyText required' }, { status: 400 });
    }

    const newReply = db.addCannedReply({
      account_id: accountId,
      title,
      shortcut: shortcut || '/quick',
      body: bodyText,
      is_default: false,
    });

    return NextResponse.json({ success: true, cannedReply: newReply });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
