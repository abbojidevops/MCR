import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/db/repository';
import {
  COMPLIANCE_STATES,
  getNextComplianceStatus,
  canCustomerPerformTransition,
  isCarrierControlledStatus,
} from '@/lib/compliance-machine';
import { requireTenantAuth, AuthenticatedContext } from '@/lib/authz';
import { ComplianceProvenance, ComplianceStatus, ComplianceRegistration } from '@/types';
import { resolveClientIp } from '@/lib/security/client-ip';

const BURNED_CARRIER_SECRET = 'mcr-carrier-webhook-secret-2026';

const REGISTRATION_WHITELIST = new Set([
  'legal_name',
  'ein',
  'business_type',
  'address',
  'website',
  'contact_name',
  'contact_email',
  'contact_phone',
  'sample_messages',
]);

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
    const rawBody = await req.text();
    let body: any;
    try {
      body = JSON.parse(rawBody);
    } catch {
      return NextResponse.json({ error: 'Invalid JSON request body' }, { status: 400 });
    }

    const { action, registrationData, rejectionReason, targetStatus, accountId: webhookAccountId } = body || {};

    const clientIp = resolveClientIp(req);

    // 1. Check for Carrier Webhook Authentication (Twilio / TCR inbound event)
    const isCarrierWebhookAttempt =
      req.headers.has('x-carrier-signature') ||
      req.headers.has('x-carrier-webhook-signature') ||
      req.headers.has('x-carrier-webhook-secret') ||
      req.headers.has('x-webhook-secret') ||
      req.headers.has('x-carrier-timestamp') ||
      req.headers.has('x-carrier-event-id') ||
      req.headers.has('x-carrier-account-id');

    let accountId: string;
    let provenance: ComplianceProvenance;
    let actorId: string;
    let isAdmin = false;
    let eventId: string | undefined;

    if (isCarrierWebhookAttempt) {
      const configuredSecret = process.env.CARRIER_WEBHOOK_SECRET;

      // Acceptance criterion 1: Unset secret fails closed with 503 Service Unavailable
      if (!configuredSecret || !configuredSecret.trim()) {
        return NextResponse.json(
          {
            error: 'Service Unavailable: CARRIER_WEBHOOK_SECRET environment variable is not configured',
            status: 503,
          },
          { status: 503 }
        );
      }

      if (configuredSecret === BURNED_CARRIER_SECRET) {
        return NextResponse.json(
          {
            error: 'Service Unavailable: Configured CARRIER_WEBHOOK_SECRET is revoked and must be rotated',
            status: 503,
          },
          { status: 503 }
        );
      }

      // Acceptance criterion 6: Burned legacy secret permanently rejected
      const rawSecretHeader =
        req.headers.get('x-carrier-webhook-secret') ||
        req.headers.get('x-webhook-secret');
      if (rawSecretHeader === BURNED_CARRIER_SECRET) {
        return NextResponse.json(
          { error: 'Unauthorized: Revoked/burned carrier webhook secret', status: 401 },
          { status: 401 }
        );
      }

      // Acceptance criterion 2: Cryptographic HMAC-SHA256 signature verification over raw body
      const sigHeader =
        req.headers.get('x-carrier-signature') ||
        req.headers.get('x-carrier-webhook-signature');
      const timestampHeader = req.headers.get('x-carrier-timestamp');

      let signatureHex = sigHeader;
      let timestamp: number | null = null;

      if (sigHeader && sigHeader.includes('t=') && sigHeader.includes('v1=')) {
        const parts = sigHeader.split(',');
        for (const part of parts) {
          const [k, v] = part.split('=').map((s) => s.trim());
          if (k === 't') timestamp = Number(v);
          if (k === 'v1') signatureHex = v;
        }
      } else if (timestampHeader) {
        timestamp = Number(timestampHeader);
      }

      if (!signatureHex || !timestamp || isNaN(timestamp)) {
        return NextResponse.json(
          { error: 'Unauthorized: Missing or invalid x-carrier-signature and timestamp', status: 401 },
          { status: 401 }
        );
      }

      // Validate timestamp freshness within 5 minutes
      const now = Date.now();
      if (Math.abs(now - timestamp) > 5 * 60 * 1000) {
        return NextResponse.json(
          { error: 'Unauthorized: Carrier webhook timestamp outside tolerance window', status: 401 },
          { status: 401 }
        );
      }

      // Compute HMAC-SHA256 over `${timestamp}.${rawBody}`
      const expectedSig = crypto
        .createHmac('sha256', configuredSecret)
        .update(`${timestamp}.${rawBody}`)
        .digest('hex');

      const sigBuf = Buffer.from(signatureHex, 'hex');
      const expectedBuf = Buffer.from(expectedSig, 'hex');

      if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return NextResponse.json(
          { error: 'Unauthorized: Invalid carrier webhook cryptographic signature', status: 401 },
          { status: 401 }
        );
      }

      // Acceptance criterion 3: Replay protection with 409 Conflict
      const resolvedEventId =
        req.headers.get('x-carrier-event-id') ||
        req.headers.get('x-delivery-id') ||
        (typeof body?.eventId === 'string' ? body.eventId : '') ||
        (typeof body?.id === 'string' ? body.id : '') ||
        (typeof body?.event_id === 'string' ? body.event_id : '') ||
        `carrier-${crypto.createHash('sha256').update(`${timestamp}.${signatureHex}`).digest('hex').slice(0, 16)}`;

      eventId = resolvedEventId;

      if (db.isWebhookProcessed('carrier', resolvedEventId)) {
        return NextResponse.json(
          {
            error: 'Conflict: Carrier event has already been processed (replay detected)',
            status: 409,
            eventId: resolvedEventId,
          },
          { status: 409 }
        );
      }

      // Acceptance criterion 4: Scope the authority and enforce tenant isolation
      const scopedAccountId =
        req.headers.get('x-carrier-account-id') ||
        req.headers.get('x-carrier-key-id');

      if (scopedAccountId && webhookAccountId && scopedAccountId !== webhookAccountId) {
        return NextResponse.json(
          {
            error: `Forbidden: Carrier webhook signature is scoped to tenant '${scopedAccountId}' and cannot touch tenant '${webhookAccountId}'`,
            status: 403,
          },
          { status: 403 }
        );
      }

      accountId = scopedAccountId || webhookAccountId;
      if (!accountId || typeof accountId !== 'string') {
        return NextResponse.json(
          { error: 'accountId is required for carrier webhook requests', status: 400 },
          { status: 400 }
        );
      }

      const targetAccount = db.getAccount(accountId);
      if (!targetAccount) {
        return NextResponse.json({ error: 'Tenant account not found', status: 404 }, { status: 404 });
      }

      provenance = 'carrier_webhook';
      actorId = 'tcr-carrier-webhook';
      isAdmin = false; // Blanket admin authority is NEVER granted to carrier webhooks

      // Carrier webhooks are ONLY permitted to perform regulatory vetting transitions
      const PERMITTED_CARRIER_ACTIONS = new Set(['advance_status', 'carrier_reject', 'simulate_rejection']);
      if (!PERMITTED_CARRIER_ACTIONS.has(action)) {
        return NextResponse.json(
          {
            error: `Forbidden: Carrier webhook is not permitted to execute action '${action}'. Carrier authority is strictly limited to regulatory vetting transitions (advance_status, carrier_reject).`,
            status: 403,
          },
          { status: 403 }
        );
      }
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

      if (!registrationData || typeof registrationData !== 'object' || Array.isArray(registrationData)) {
        return NextResponse.json(
          { error: 'registrationData object is required' },
          { status: 400 }
        );
      }

      // Acceptance criterion 1: Whitelist enforcement
      const rejected = Object.keys(registrationData).filter(
        (key) => !REGISTRATION_WHITELIST.has(key)
      );

      if (rejected.length > 0) {
        return NextResponse.json(
          {
            error: `These fields are not yours to set: ${rejected.join(', ')}. A carrier decides brand and campaign identifiers and approval status — supply your business identity and we submit it.`,
            rejected,
          },
          { status: 400 }
        );
      }

      // Acceptance criterion 4: Validate submitted payload only (never merged with stored record), naming each missing field
      const missing: string[] = [];
      if (!registrationData.legal_name || typeof registrationData.legal_name !== 'string' || !registrationData.legal_name.trim()) {
        missing.push('legal_name');
      }
      if (!registrationData.ein || typeof registrationData.ein !== 'string' || !registrationData.ein.trim()) {
        missing.push('ein');
      }
      if (!registrationData.business_type || typeof registrationData.business_type !== 'string' || !registrationData.business_type.trim()) {
        missing.push('business_type');
      }

      if (missing.length > 0) {
        return NextResponse.json(
          {
            error: `Missing required registration fields: ${missing.join(', ')}`,
            missing,
          },
          { status: 400 }
        );
      }

      // Acceptance criterion 2 & 3: Delete every synthesized identifier.
      // brand_sid and campaign_sid stay null.
      // Provenance and status assigned strictly by writer, never from caller.
      const cleanUpdates: Partial<ComplianceRegistration> = {
        legal_name: registrationData.legal_name.trim(),
        ein: registrationData.ein.trim(),
        business_type: registrationData.business_type.trim(),
        address: typeof registrationData.address === 'string' ? registrationData.address.trim() : undefined,
        website: typeof registrationData.website === 'string' ? registrationData.website.trim() : undefined,
        contact_name: typeof registrationData.contact_name === 'string' ? registrationData.contact_name.trim() : undefined,
        contact_email: typeof registrationData.contact_email === 'string' ? registrationData.contact_email.trim() : undefined,
        contact_phone: typeof registrationData.contact_phone === 'string' ? registrationData.contact_phone.trim() : undefined,
        sample_messages: Array.isArray(registrationData.sample_messages) ? registrationData.sample_messages : [],
        brand_sid: null,
        campaign_sid: null,
      };

      comp = db.recordComplianceTransition(
        accountId,
        'brand_submitted',
        'customer',
        actorId,
        'Customer submitted business details for 10DLC brand registration',
        cleanUpdates
      );

      // Acceptance criterion 5: The record returned to customer reads brand_submitted, brand_sid: null, last_updated_by: 'customer'
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

      const cleanUpdates: Partial<ComplianceRegistration> = {
        brand_sid: null,
        campaign_sid: null,
        rejection_reason: undefined,
      };

      if (registrationData && typeof registrationData === 'object' && !Array.isArray(registrationData)) {
        // Whitelist enforcement on resubmission
        const rejected = Object.keys(registrationData).filter(
          (key) => !REGISTRATION_WHITELIST.has(key)
        );

        if (rejected.length > 0) {
          return NextResponse.json(
            {
              error: `These fields are not yours to set: ${rejected.join(', ')}. A carrier decides brand and campaign identifiers and approval status — supply your business identity and we submit it.`,
              rejected,
            },
            { status: 400 }
          );
        }

        if (registrationData.legal_name) cleanUpdates.legal_name = String(registrationData.legal_name).trim();
        if (registrationData.ein) cleanUpdates.ein = String(registrationData.ein).trim();
        if (registrationData.business_type) cleanUpdates.business_type = String(registrationData.business_type).trim();
        if (registrationData.address) cleanUpdates.address = String(registrationData.address).trim();
        if (registrationData.website) cleanUpdates.website = String(registrationData.website).trim();
        if (registrationData.contact_name) cleanUpdates.contact_name = String(registrationData.contact_name).trim();
        if (registrationData.contact_email) cleanUpdates.contact_email = String(registrationData.contact_email).trim();
        if (registrationData.contact_phone) cleanUpdates.contact_phone = String(registrationData.contact_phone).trim();
        if (Array.isArray(registrationData.sample_messages)) cleanUpdates.sample_messages = registrationData.sample_messages;
      }

      comp = db.recordComplianceTransition(
        accountId,
        'brand_submitted',
        'customer',
        actorId,
        'Customer corrected details and resubmitted for carrier vetting',
        cleanUpdates
      );

      return NextResponse.json({ success: true, compliance: comp });
    }

    // ------------------------------------------------------------------------
    // GATED ACTIONS: Carrier Approvals & Rejections
    // The customer must NOT be able to certify themselves (Finding F3).
    // Any carrier-controlled transition requires admin role or verified carrier webhook.
    // ------------------------------------------------------------------------
    if (action === 'advance_status') {
      if (!isAdmin && provenance !== 'carrier_webhook') {
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

      // Acceptance criterion 2: Delete every synthesized identifier. No CM_${Date.now()}, brand_sid/campaign_sid stay null
      const extraUpdates: Partial<ComplianceRegistration> = {};

      comp = db.recordComplianceTransition(
        accountId,
        nextStatus,
        provenance,
        actorId,
        `Carrier state advanced to ${nextStatus}`,
        extraUpdates
      );

      if (provenance === 'carrier_webhook' && eventId) {
        db.markWebhookProcessed('carrier', eventId, action);
        db.logAudit(accountId, 'CARRIER_WEBHOOK_STATUS_UPDATE', {
          actor: actorId,
          eventId,
          sourceAddress: clientIp,
          fromStatus: currentStatus,
          toStatus: nextStatus,
          fieldsChanged: ['status', 'last_updated_by', 'status_history', ...Object.keys(extraUpdates)],
          timestamp: new Date().toISOString(),
        });
      }

      return NextResponse.json({ success: true, compliance: comp });
    }

    if (action === 'simulate_rejection' || action === 'carrier_reject') {
      if (!isAdmin && provenance !== 'carrier_webhook') {
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

      if (provenance === 'carrier_webhook' && eventId) {
        db.markWebhookProcessed('carrier', eventId, action);
        db.logAudit(accountId, 'CARRIER_WEBHOOK_STATUS_UPDATE', {
          actor: actorId,
          eventId,
          sourceAddress: clientIp,
          fromStatus: currentStatus,
          toStatus: 'rejected',
          fieldsChanged: ['status', 'last_updated_by', 'status_history', 'rejection_reason'],
          timestamp: new Date().toISOString(),
        });
      }

      return NextResponse.json({ success: true, compliance: comp });
    }

    if (action === 'set_status') {
      // Administrative override is strictly restricted to platform administrators
      if (!isAdmin) {
        return NextResponse.json(
          {
            error: 'Forbidden: Carrier registration status can only be modified by platform administrators.',
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
