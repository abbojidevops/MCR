import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { requireTenantAuth } from '@/lib/authz';
import { notFoundResponse } from '@/lib/api-errors';
import { TwilioClient } from '@/lib/telecom/twilio-client';
import { dispatchAlert } from '@/lib/alert-dispatcher';
import { checkQuietHours, inferTimezoneFromPhone } from '@/lib/quiet-hours';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const { searchParams } = new URL(req.url);
    const conversationId = searchParams.get('conversationId');

    if (conversationId) {
      const messages = db.getMessages(accountId, conversationId);
      if (messages === null) {
        return notFoundResponse();
      }
      const conv = db.getConversation(accountId, conversationId);
      const recipientPhone = conv?.contact?.phone_number || '';
      const isSuppressed = recipientPhone ? db.isNumberSuppressed(accountId, recipientPhone) : false;
      const recipientTz = recipientPhone ? inferTimezoneFromPhone(recipientPhone) : 'America/New_York';
      const quietHours = recipientPhone ? checkQuietHours(recipientTz) : null;

      return NextResponse.json({
        messages,
        conversation: conv,
        isSuppressed,
        quietHours,
      });
    }

    const conversations = db.getConversations(accountId);
    // Enrich with TCPA opt-out suppression status
    const enriched = conversations.map((conv) => {
      const phone = conv.contact?.phone_number || '';
      return {
        ...conv,
        isSuppressed: phone ? db.isNumberSuppressed(accountId, phone) : false,
      };
    });

    // Sort conversations by newest first (Part 3.2)
    const sorted = [...enriched].sort((a, b) => {
      const timeA = new Date(a.last_message_at || a.created_at).getTime();
      const timeB = new Date(b.last_message_at || b.created_at).getTime();
      return timeB - timeA;
    });

    return NextResponse.json({ conversations: sorted });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const body = await req.json();
    const { conversationId, bodyText, emergencyOverride, referenceDate } = body;

    if (!conversationId || typeof bodyText !== 'string' || !bodyText.trim()) {
      return NextResponse.json({ error: 'conversationId and bodyText required' }, { status: 400 });
    }

    const conv = db.getConversation(accountId, conversationId);
    if (!conv) {
      return notFoundResponse();
    }

    const phoneNumbers = db.getPhoneNumbers(accountId);
    const mcrNumber = phoneNumbers[0]?.phone_number || '+12175550190';
    const recipientPhone = conv.contact?.phone_number || '+15550000000';

    // 1. TCPA Opt-Out Suppression Enforcement (STOP received)
    if (db.isNumberSuppressed(accountId, recipientPhone)) {
      return NextResponse.json(
        {
          error: 'Cannot send SMS: Recipient has opted out (STOP suppression active)',
          isSuppressed: true,
          code: 'TCPA_SUPPRESSED',
        },
        { status: 403 }
      );
    }

    // 2. TCPA Quiet Hours Compliance Check (08:00 - 21:00 recipient local time)
    const recipientTz = inferTimezoneFromPhone(recipientPhone);
    const refDate = referenceDate ? new Date(referenceDate) : new Date();
    const quietHoursCheck = checkQuietHours(recipientTz, 8, 21, refDate);

    if (!quietHoursCheck.isWithinHours && !emergencyOverride) {
      return NextResponse.json(
        {
          error: `Cannot send SMS during quiet hours (Local time: ${quietHoursCheck.recipientLocalHour}:00 in ${quietHoursCheck.recipientTimezone}). Requires emergency override.`,
          code: 'QUIET_HOURS_VIOLATION',
          quietHours: quietHoursCheck,
        },
        { status: 422 }
      );
    }

    // 3. Dispatch SMS via Twilio REST API (or high-fidelity mock)
    const sendRes = await TwilioClient.sendSms({
      to: recipientPhone,
      from: mcrNumber,
      body: bodyText.trim(),
    });

    if (sendRes.status === 'failed') {
      // Dispatch alert on outbound carrier failure
      await dispatchAlert({
        level: 'critical',
        source: 'telephony-outbound-sms',
        title: 'Manual SMS Dispatch Failure',
        accountId,
        message: `Manual SMS dispatch failed to ${recipientPhone}: ${sendRes.error || 'Unknown carrier error'}`,
        metadata: {
          conversationId,
          recipientPhone,
          fromNumber: mcrNumber,
          error: sendRes.error,
        },
      });

      return NextResponse.json(
        {
          error: `Carrier dispatch failed: ${sendRes.error || 'Failed to send SMS'}`,
          status: 'failed',
          code: 'CARRIER_DISPATCH_FAILED',
        },
        { status: 502 }
      );
    }

    // 4. Store manual outbound message from owner
    const message = db.addMessage({
      accountId,
      conversationId,
      direction: 'outbound',
      fromNumber: mcrNumber,
      toNumber: recipientPhone,
      body: bodyText.trim(),
      twilioMessageSid: sendRes.sid,
    });

    // Update conversation metadata
    db.updateConversation(accountId, conversationId, {
      last_message_at: new Date().toISOString(),
    });

    return NextResponse.json({
      success: true,
      message,
      sid: sendRes.sid,
      status: sendRes.status,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
