import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { requireTenantAuth } from '@/lib/authz';
import { generateDailySummary, generateWeeklyReport } from '@/lib/reports';
import { EmailService } from '@/lib/email/email-service';
import { TwilioClient, type SendSmsResult } from '@/lib/telecom/twilio-client';

export async function POST(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId, isDemo } = auth;

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      return NextResponse.json({ error: 'Request body must be a JSON object' }, { status: 400 });
    }
    if (body.type !== undefined && typeof body.type !== 'string') {
      return NextResponse.json({ error: 'Dispatch type must be a string' }, { status: 400 });
    }
    const dispatchType = body.type || 'daily_sms';
    if (!['daily_sms', 'weekly_email', 'all'].includes(dispatchType)) {
      return NextResponse.json(
        { error: 'Dispatch type must be daily_sms, weekly_email, or all' },
        { status: 400 }
      );
    }

    const profile = db.getBusinessProfile(accountId);
    if (!profile) {
      return NextResponse.json({ error: 'Business profile not found' }, { status: 404 });
    }

    const credentials = db.getAllUserCredentials().filter((credential) => credential.account_id === accountId);
    const recipientEmail = credentials[0]?.email?.trim() || '';
    const recipientPhone = profile.notification_phone || profile.emergency_phone;
    const phoneNumbers = db.getPhoneNumbers(accountId);
    const mcrCallerId = phoneNumbers[0]?.phone_number || process.env.TWILIO_PHONE_NUMBER || '';
    const includesSms = dispatchType === 'daily_sms' || dispatchType === 'all';
    const includesEmail = dispatchType === 'weekly_email' || dispatchType === 'all';

    if (isDemo && (includesSms || includesEmail)) {
      return NextResponse.json(
        { error: 'Report dispatch is disabled for demo sessions' },
        { status: 403 }
      );
    }

    // Validate every requested channel before dispatching any of them so an
    // "all" request cannot send only half its requested messages by accident.
    if (includesSms && !recipientPhone) {
      return NextResponse.json(
        { error: 'No notification phone is configured in the business profile' },
        { status: 400 }
      );
    }
    if (includesSms && !mcrCallerId) {
      return NextResponse.json(
        { error: 'No MCR caller ID is configured for SMS dispatch' },
        { status: 400 }
      );
    }
    if (includesEmail && !recipientEmail) {
      return NextResponse.json(
        { error: 'No account email address is configured for weekly reports' },
        { status: 400 }
      );
    }

    const results: {
      sms?: { sid: string; to: string; body: string; status: SendSmsResult['status']; error?: string };
      email?: {
        messageId: string | null;
        to: string;
        subject: string;
        accepted: boolean;
        transport: 'smtp' | 'log_only' | 'disabled';
        notice: string;
      };
    } = {};

    if (includesSms) {
      const daily = generateDailySummary(accountId);
      const smsResult = await TwilioClient.sendSms({
        to: recipientPhone!,
        from: mcrCallerId!,
        body: daily.summaryText,
      });

      results.sms = {
        sid: smsResult.sid,
        to: recipientPhone!,
        body: daily.summaryText,
        status: smsResult.status,
        ...(smsResult.error ? { error: smsResult.error } : {}),
      };
    }

    if (includesEmail) {
      const weekly = generateWeeklyReport(accountId);
      const emailData = {
        businessName: profile.business_name || 'Your service business',
        missedCallsCount: weekly.missedCallsCount,
        recoveredConversationsCount: weekly.recoveredConversationsCount,
        responseRatePercent: weekly.responseRatePercent,
        qualifiedJobsCount: weekly.qualifiedJobsCount,
        bookedJobsCount: weekly.bookedJobsCount,
        estimatedRecoveredValue: weekly.estimatedRecoveredValue,
        actualBookedValue: weekly.actualBookedValue,
      };
      const rendered = EmailService.renderTemplate('weekly_report', emailData);
      const emailResult = await EmailService.sendEmail({
        to: recipientEmail,
        trigger: 'weekly_report',
        data: emailData,
      });

      results.email = {
        messageId: emailResult.messageId,
        to: recipientEmail,
        subject: rendered.subject,
        accepted: emailResult.accepted,
        transport: emailResult.transport,
        notice: emailResult.notice,
      };
    }

    const success =
      (!results.sms || results.sms.status === 'sent' || results.sms.status === 'queued') &&
      (!results.email || results.email.accepted);

    return NextResponse.json({
      success,
      accountId,
      dispatchedAt: new Date().toISOString(),
      results,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 });
  }
}
