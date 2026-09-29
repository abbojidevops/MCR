import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { COMPLIANCE_STATES, getNextComplianceStatus } from '@/lib/compliance-machine';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const accountId = searchParams.get('accountId') || 'acc-apex-plumbing';
    const compliance = db.getCompliance(accountId);

    return NextResponse.json({
      compliance,
      allStates: COMPLIANCE_STATES,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { accountId, action, registrationData } = body;

    const targetAccount = accountId || 'acc-apex-plumbing';
    let comp = db.getCompliance(targetAccount);

    if (action === 'submit_registration' && registrationData) {
      comp = db.updateCompliance(targetAccount, {
        ...registrationData,
        status: 'brand_submitted',
        brand_sid: `BN_${Date.now().toString(36)}`,
      });
      db.logAudit(targetAccount, 'SUBMIT_10DLC_BRAND', registrationData);
      return NextResponse.json({ success: true, compliance: comp });
    }

    if (action === 'advance_status') {
      const nextStatus = getNextComplianceStatus(comp?.status || 'signed_up');
      if (nextStatus) {
        comp = db.updateCompliance(targetAccount, {
          status: nextStatus,
          campaign_sid: nextStatus === 'campaign_submitted' ? `CM_${Date.now().toString(36)}` : comp?.campaign_sid,
        });
        db.logAudit(targetAccount, 'ADVANCE_COMPLIANCE_STATUS', { newStatus: nextStatus });
      }
      return NextResponse.json({ success: true, compliance: comp });
    }

    return NextResponse.json({ error: 'Invalid compliance action' }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
