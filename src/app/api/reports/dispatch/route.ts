import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { requireTenantAuth } from '@/lib/authz';
import { generateDailySummary, generateWeeklyReport } from '@/lib/reports';
import { EmailService } from '@/lib/email/email-service';
import { TwilioClient } from '@/lib/telecom/twilio-client';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const body = await req.json().catch(() => ({}));
    const dispatchType = body.type || 'daily_sms'; // 'daily_sms' | 'weekly_email' | 'all'

    const profile = db.getBusinessProfile(accountId);
    if (!profile) {
      return NextResponse.json({ error: 'Business profile not found' }, { status: 404 });
    }

    const credentials = db.getAllUserCredentials().filter((c) => c.account_id === accountId);
    const recipientEmail = credentials[0]?.email || 'contractor@example.com';
    const recipientPhone = profile.notification_phone || profile.emergency_phone;

    const phoneNumbers = db.getPhoneNumbers(accountId);
    const mcrCallerId = phoneNumbers[0]?.phone_number || '+12175550190';

    const results: {
      sms?: { sid: string; to: string; body: string };
      email?: {
        messageId: string;
        to: string;
        subject: string;
        /** True only when a real mail transport accepted the message. */
        delivered: boolean;
        transport: 'smtp' | 'log_only';
        notice: string;
      };
    } = {};

    // 1. Daily SMS Digest Dispatch
    if (dispatchType === 'daily_sms' || dispatchType === 'all') {
      if (!recipientPhone) {
        return NextResponse.json(
          { error: 'No notification phone configured in business profile' },
          { status: 400 }
        );
      }

      const daily = generateDailySummary(accountId);
      const smsResult = await TwilioClient.sendSms({
        to: recipientPhone,
        from: mcrCallerId,
        body: daily.summaryText,
      });

      results.sms = {
        sid: smsResult.sid,
        to: recipientPhone,
        body: daily.summaryText,
      };
    }

    // 2. Weekly Email Digest Dispatch
    if (dispatchType === 'weekly_email' || dispatchType === 'all') {
      const weekly = generateWeeklyReport(accountId);
      const emailResult = await EmailService.sendEmail({
        to: recipientEmail,
        trigger: 'weekly_report',
        data: {
          businessName: profile.business_name,
          ownerName: `${profile.business_name} Owner`,
          mcrNumber: phoneNumbers[0]?.formatted_number || mcrCallerId,
          carrierName: profile.carrier_name || 'Carrier Network',
          missedCallsCount: weekly.missedCallsCount,
          recoveredConversationsCount: weekly.recoveredConversationsCount,
          responseRatePercent: weekly.responseRatePercent,
          qualifiedJobsCount: weekly.qualifiedJobsCount,
          bookedJobsCount: weekly.bookedJobsCount,
          estimatedRecoveredValue: weekly.estimatedRecoveredValue.toLocaleString(),
          actualBookedValue: weekly.actualBookedValue.toLocaleString(),
        },
      });

      results.email = {
        messageId: emailResult.messageId,
        to: recipientEmail,
        subject: `Weekly Report: ${profile.business_name}`,
        // Honest delivery status. `delivered: false` means the message was
        // rendered and logged but never left the server, because no mail
        // transport is configured.
        delivered: emailResult.delivered,
        transport: emailResult.transport,
        notice: emailResult.notice,
      };
    }

    return NextResponse.json({
      success: true,
      accountId,
      dispatchedAt: new Date().toISOString(),
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
