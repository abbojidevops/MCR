import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { getCarrierGuide } from '@/lib/carrier-guides';
import { requireTenantAuth } from '@/lib/authz';
import { notFoundResponse } from '@/lib/api-errors';
import {
  TENANT_EDITABLE_PROFILE_FIELDS,
  partitionSettingsUpdates,
} from '@/lib/settings-fields';

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
      editableFields: TENANT_EDITABLE_PROFILE_FIELDS,
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

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const { permitted, rejected } = partitionSettingsUpdates(body?.updates);

    // Fail closed and loudly: a caller attempting to write a privileged or
    // unknown column gets a 400 and no state is mutated at all.
    if (rejected.length > 0) {
      return NextResponse.json(
        {
          error:
            'Forbidden: one or more submitted fields are not tenant-editable. ' +
            'Tenant identity, demo flags, and registered legal details are managed by the platform operator.',
          rejectedFields: rejected,
          editableFields: TENANT_EDITABLE_PROFILE_FIELDS,
        },
        { status: 400 }
      );
    }

    if (Object.keys(permitted).length === 0) {
      return NextResponse.json(
        { error: 'No updatable fields supplied', editableFields: TENANT_EDITABLE_PROFILE_FIELDS },
        { status: 400 }
      );
    }

    const updatedProfile = db.updateBusinessProfile(accountId, permitted as any);
    if (!updatedProfile) {
      return notFoundResponse();
    }

    db.logAudit(accountId, 'UPDATE_SETTINGS', { fields: Object.keys(permitted) });

    return NextResponse.json({
      success: true,
      profile: updatedProfile,
      updatedFields: Object.keys(permitted),
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
