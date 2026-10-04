import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { getCarrierGuide } from '@/lib/carrier-guides';
import { requireTenantAuth } from '@/lib/authz';
import { notFoundResponse } from '@/lib/api-errors';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

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
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const body = await req.json();
    const { updates } = body;

    const updatedProfile = db.updateBusinessProfile(accountId, updates);
    if (!updatedProfile) {
      return notFoundResponse();
    }

    return NextResponse.json({ success: true, profile: updatedProfile });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
