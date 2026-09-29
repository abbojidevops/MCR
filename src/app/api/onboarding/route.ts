import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { TradeKey } from '@/types';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      businessName,
      trade,
      ownerName,
      phone,
      carrierName,
      timezone,
      emergencyPhone,
    } = body;

    if (!businessName || !trade || !phone) {
      return NextResponse.json({ error: 'businessName, trade, and phone are required' }, { status: 400 });
    }

    const { account, profile, phoneNumber } = db.createAccount(
      businessName,
      trade as TradeKey,
      phone,
      ownerName || 'Business Owner',
      carrierName || 'Verizon Wireless'
    );

    if (timezone) profile.timezone = timezone;
    if (emergencyPhone) profile.emergency_phone = emergencyPhone;

    db.logAudit(account.id, 'SIGNUP_COMPLETED', { businessName, trade, phone });

    return NextResponse.json({
      success: true,
      account,
      profile,
      phoneNumber,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
