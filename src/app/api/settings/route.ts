import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { getCarrierGuide } from '@/lib/carrier-guides';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || 'acc-apex-plumbing';

    const account = db.getAccount(accountId);
    const profile = db.getBusinessProfile(accountId);
    const phoneNumbers = db.getPhoneNumbers(accountId);
    const mcrNumber = phoneNumbers[0]?.formatted_number || '+1 (217) 555-0190';
    const carrierGuide = profile?.carrier_name
      ? getCarrierGuide(profile.carrier_name.toLowerCase().includes('verizon') ? 'verizon' : 'att', mcrNumber)
      : undefined;

    return NextResponse.json({
      account,
      profile,
      phoneNumbers,
      carrierGuide,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, updates } = body;

    const targetAccount = accountId || 'acc-apex-plumbing';
    const updatedProfile = db.updateBusinessProfile(targetAccount, updates);

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
