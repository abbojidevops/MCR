import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { COMPLIANCE_STATES, getNextComplianceStatus } from '@/lib/compliance-machine';
import { getAuthenticatedAccountId } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    // Derive account identity exclusively from session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
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
    // Derive account identity exclusively from session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const body = await req.json();
    const { action, registrationData, rejectionReason } = body;

    let comp = db.getCompliance(accountId);

    if (action === 'submit_registration' && registrationData) {
      comp = db.updateCompliance(accountId, {
        ...registrationData,
        status: 'brand_submitted',
        brand_sid: `BN_${Date.now().toString(36)}`,
      });
      db.logAudit(accountId, 'SUBMIT_10DLC_BRAND', registrationData);
      return NextResponse.json({ success: true, compliance: comp });
    }

    if (action === 'advance_status') {
      const nextStatus = getNextComplianceStatus(comp?.status || 'signed_up');
      if (nextStatus) {
        comp = db.updateCompliance(accountId, { status: nextStatus });
        db.logAudit(accountId, 'ADVANCE_10DLC_STATUS', { newStatus: nextStatus });
      }
      return NextResponse.json({ success: true, compliance: comp });
    }

    if (action === 'resubmit') {
      comp = db.updateCompliance(accountId, {
        status: 'brand_submitted',
        rejection_reason: undefined,
      });
      db.logAudit(accountId, 'RESUBMIT_10DLC_BRAND', {});
      return NextResponse.json({ success: true, compliance: comp });
    }

    if (action === 'simulate_rejection') {
      comp = db.updateCompliance(accountId, {
        status: 'rejected',
        rejection_reason: rejectionReason || 'Legal business name does not exactly match IRS EIN registration document (CP-575). Please verify and resubmit.',
      });
      return NextResponse.json({ success: true, compliance: comp });
    }

    return NextResponse.json({ compliance: comp });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
