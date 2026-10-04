import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { requireTenantAuth } from '@/lib/authz';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const calls = db.getCallRecords(accountId);
    return NextResponse.json({ calls });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
