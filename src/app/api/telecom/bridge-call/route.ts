import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { requireTenantAuth } from '@/lib/authz';
import { TwilioClient } from '@/lib/telecom/twilio-client';
import { dispatchAlert } from '@/lib/alert-dispatcher';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const body = await req.json();
    const { customerPhone, contractorPhone: customContractorPhone, jobId, conversationId } = body;

    if (!customerPhone || typeof customerPhone !== 'string' || !customerPhone.trim()) {
      return NextResponse.json({ error: 'customerPhone is required' }, { status: 400 });
    }

    const cleanCustomerPhone = customerPhone.trim();

    // 1. TCPA Opt-Out Suppression Check (Customer texted STOP)
    if (db.isNumberSuppressed(accountId, cleanCustomerPhone)) {
      return NextResponse.json(
        {
          error: 'Cannot initiate call: Recipient has opted out of communications (STOP suppression active)',
          isSuppressed: true,
          code: 'TCPA_SUPPRESSED',
        },
        { status: 403 }
      );
    }

    // 2. Resolve MCR Tracking Number for Outbound Caller ID
    const phoneNumbers = db.getPhoneNumbers(accountId);
    const mcrNumber = phoneNumbers[0]?.phone_number || '+12175550190';

    // 3. Resolve Contractor Cell Phone Number
    const profile = db.getBusinessProfile(accountId);
    const contractorPhone =
      customContractorPhone ||
      profile?.notification_phone ||
      profile?.emergency_phone ||
      '+12175550199';

    // 4. Initiate 2-Leg Voice Bridge via Twilio REST API
    const bridgeRes = await TwilioClient.createBridgeCall({
      contractorPhone,
      customerPhone: cleanCustomerPhone,
      mcrNumber,
    });

    if (bridgeRes.status === 'failed') {
      await dispatchAlert({
        level: 'critical',
        source: 'telephony-bridge-call',
        title: 'Click-to-Call Voice Bridge Failed',
        accountId,
        message: `Voice bridging failed between contractor ${contractorPhone} and customer ${cleanCustomerPhone}: ${bridgeRes.error || 'Carrier error'}`,
        metadata: {
          contractorPhone,
          customerPhone: cleanCustomerPhone,
          mcrNumber,
          jobId,
          conversationId,
          error: bridgeRes.error,
        },
      });

      return NextResponse.json(
        {
          error: `Carrier voice bridging failed: ${bridgeRes.error || 'Failed to initiate bridge call'}`,
          status: 'failed',
          code: 'CARRIER_CALL_FAILED',
        },
        { status: 502 }
      );
    }

    // 5. Record Outbound Bridge Call Record in DB
    const callRecord = db.createOutboundBridgeCall({
      accountId,
      twilioCallSid: bridgeRes.sid,
      fromNumber: mcrNumber,
      toNumber: cleanCustomerPhone,
      contractorPhone,
    });

    // 6. Automatically update Job Card status to CONTACTED if currently NEW
    let jobUpdated = false;
    if (jobId) {
      const job = db.getJob(accountId, jobId);
      if (job && job.status === 'NEW') {
        db.updateJob(accountId, jobId, {
          status: 'CONTACTED',
          contacted_time: new Date().toISOString(),
        });
        jobUpdated = true;
      }
    }

    return NextResponse.json({
      success: true,
      callSid: bridgeRes.sid,
      status: bridgeRes.status,
      callRecordId: callRecord.id,
      mcrNumber,
      contractorPhone,
      customerPhone: cleanCustomerPhone,
      jobUpdated,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
