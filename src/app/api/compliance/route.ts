import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import {
  COMPLIANCE_STATES,
  getNextComplianceStatus,
  canCustomerPerformTransition,
  isCarrierControlledStatus,
} from '@/lib/compliance-machine';
import { requireTenantAuth, AuthenticatedContext } from '@/lib/authz';
import { ComplianceProvenance, ComplianceStatus } from '@/types';

const CARRIER_WEBHOOK_SECRET = process.env.CARRIER_WEBHOOK_SECRET || 'mcr-carrier-webhook-secret-2026';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

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
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const { action, registrationData, rejectionReason, targetStatus, accountId: webhookAccountId } = body || {};

    // 1. Check for Carrier Webhook Authentication (Twilio / TCR inbound event)
    const headerWebhookSecret =
      req.headers.get('x-carrier-webhook-secret') ||
      req.headers.get('x-webhook-secret');
    const isCarrierWebhook = Boolean(
      headerWebhookSecret && headerWebhookSecret === CARRIER_WEBHOOK_SECRET
    );

    let accountId: string;
    let provenance: ComplianceProvenance;
    let actorId: string;
    let isAdmin = false;

    if (isCarrierWebhook) {
      if (!webhookAccountId || typeof webhookAccountId !== 'string') {
        return NextResponse.json(
          { error: 'accountId is required for carrier webhook requests' },
          { status: 400 }
        );
      }
      accountId = webhookAccountId;
      provenance = 'carrier_webhook';
      actorId = 'tcr-carrier-webhook';
      isAdmin = true; // Webhook operates with carrier authority
    } else {
      // 2. Tenant Session Authentication
      const auth = await requireTenantAuth(req);
      if (auth instanceof NextResponse) return auth;

      accountId = auth.accountId;
      isAdmin = auth.role === 'admin';
      provenance = isAdmin ? 'admin' : 'customer';
      actorId = auth.userId;
    }

    let comp = db.getCompliance(accountId);
    const currentStatus: ComplianceStatus = comp?.status || 'signed_up';

    // ------------------------------------------------------------------------
    // Action 1: Customer Submits Initial 10DLC Brand Registration
    // ------------------------------------------------------------------------
    if (action === 'submit_registration') {
      if (currentStatus !== 'signed_up') {
        return NextResponse.json(
          { error: `Cannot submit initial registration from status '${currentStatus}'. Current status is already in carrier review.` },
          { status: 400 }
        );
      }

      const extraUpdates: any = {
        ...(registrationData || {}),
        brand_sid: `BN_${Date.now().toString(36)}`,
      };

      comp = db.recordComplianceTransition(
        accountId,
        'brand_submitted',
        'customer',
        actorId,
        'Customer submitted business details for 10DLC brand registration',
        extraUpdates
      );

      return NextResponse.json({ success: true, compliance: comp });
    }

    // ------------------------------------------------------------------------
    // Action 2: Customer Resubmits After Rejection
    // ------------------------------------------------------------------------
    if (action === 'resubmit') {
      if (currentStatus !== 'rejected') {
        return NextResponse.json(
          { error: `Cannot resubmit from status '${currentStatus}'. Only rejected registrations can be resubmitted.` },
          { status: 400 }
        );
      }

      comp = db.recordComplianceTransition(
        accountId,
        'brand_submitted',
        'customer',
        actorId,
        'Customer corrected details and resubmitted for carrier vetting'
      );

      return NextResponse.json({ success: true, compliance: comp });
    }

    // ------------------------------------------------------------------------
    // GATED ACTIONS: Carrier Approvals & Rejections
    // The customer must NOT be able to certify themselves (Finding F3).
    // Any carrier-controlled transition requires admin role or carrier webhook.
    // ------------------------------------------------------------------------
    if (action === 'advance_status') {
      if (!isAdmin) {
        return NextResponse.json(
          {
            error: 'Forbidden: Customer cannot self-certify carrier registration status. 10DLC vetting status can only be advanced by carrier webhooks or platform administrators.',
            status: 403,
          },
          { status: 403 }
        );
      }

      const nextStatus = getNextComplianceStatus(currentStatus);
      if (!nextStatus) {
        return NextResponse.json(
          { error: `No subsequent state from '${currentStatus}' in compliance state machine` },
          { status: 400 }
        );
      }

      const extraUpdates: any = {};
      if (nextStatus === 'campaign_submitted' && !comp?.campaign_sid) {
        extraUpdates.campaign_sid = `CM_${Date.now().toString(36)}`;
      }

      comp = db.recordComplianceTransition(
        accountId,
        nextStatus,
        provenance,
        actorId,
        `Carrier state advanced to ${nextStatus}`,
        extraUpdates
      );

      return NextResponse.json({ success: true, compliance: comp });
    }

    if (action === 'simulate_rejection' || action === 'carrier_reject') {
      if (!isAdmin) {
        return NextResponse.json(
          {
            error: 'Forbidden: Carrier rejection status can only be updated by carrier webhooks or platform administrators.',
            status: 403,
          },
          { status: 403 }
        );
      }

      const reason =
        rejectionReason ||
        'Legal business name does not exactly match IRS EIN registration document (CP-575). Please verify and resubmit.';

      comp = db.recordComplianceTransition(
        accountId,
        'rejected',
        provenance,
        actorId,
        reason
      );

      return NextResponse.json({ success: true, compliance: comp });
    }

    if (action === 'set_status') {
      if (!isAdmin) {
        return NextResponse.json(
          {
            error: 'Forbidden: Carrier registration status can only be modified by carrier webhooks or platform administrators.',
            status: 403,
          },
          { status: 403 }
        );
      }

      if (!targetStatus) {
        return NextResponse.json({ error: 'targetStatus is required' }, { status: 400 });
      }

      comp = db.recordComplianceTransition(
        accountId,
        targetStatus,
        provenance,
        actorId,
        `Administrative update to ${targetStatus}`
      );

      return NextResponse.json({ success: true, compliance: comp });
    }

    return NextResponse.json(
      { error: `Unknown action: '${action}'. Permitted actions: submit_registration, resubmit, advance_status, simulate_rejection, set_status.` },
      { status: 400 }
    );
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal server error' }, { status: 500 });
  }
}
