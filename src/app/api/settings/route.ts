import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { getCarrierGuide } from '@/lib/carrier-guides';
import { getAuthenticatedAccountId } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // Derive account identity exclusively from session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);

    const account = db.getAccount(accountId);
    const profile = db.getBusinessProfile(accountId);
    const phoneNumbers = db.getPhoneNumbers(accountId);
    const mcrNumber = phoneNumbers[0]?.formatted_number || profile?.notification_phone || '[Pending Carrier Provisioning]';
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
    // Derive account identity exclusively from session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const body = await req.json();
    const { updates } = body;

    const updatedProfile = db.updateBusinessProfile(accountId, updates);

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
