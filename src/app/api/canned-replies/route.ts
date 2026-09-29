import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || 'acc-apex-plumbing';
    const cannedReplies = db.getCannedReplies(accountId);
    return NextResponse.json({ cannedReplies });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, title, shortcut, bodyText } = body;

    if (!title || !bodyText) {
      return NextResponse.json({ error: 'title and bodyText required' }, { status: 400 });
    }

    const targetAccount = accountId || 'acc-apex-plumbing';
    const newReply = db.addCannedReply({
      account_id: targetAccount,
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
