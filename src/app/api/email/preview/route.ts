import { NextRequest, NextResponse } from 'next/server';
import { EmailService, EmailTrigger } from '@/lib/email/email-service';
import { db } from '@/db/repository';
import { generateWeeklyReport } from '@/lib/reports';
import { requireTenantAuth } from '@/lib/authz';

const emailTriggers: EmailTrigger[] = [
  'welcome',
  'verification',
  'registration_submitted',
  'registration_approved',
  'registration_rejected',
  'sms_live',
  'payment_successful',
  'payment_failed',
  'trial_ending',
  'subscription_canceled',
  'weekly_report',
];

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const { searchParams } = new URL(req.url);
    const requestedTrigger = searchParams.get('trigger') || 'weekly_report';
    if (!emailTriggers.includes(requestedTrigger as EmailTrigger)) {
      return NextResponse.json({ error: 'Unsupported email preview type' }, { status: 400 });
    }
    const trigger = requestedTrigger as EmailTrigger;

    const profile = db.getBusinessProfile(accountId);
    const phoneNumbers = db.getPhoneNumbers(accountId);
    const data: Record<string, unknown> = {
      businessName: profile?.business_name || 'Your Service Business',
      mcrNumber: phoneNumbers[0]?.formatted_number,
      carrierName: profile?.carrier_name,
    };

    // A preview should not invent a verification token, payment, plan, trial
    // date, carrier SID, or owner name. Populate report metrics only when the
    // requested preview is actually the weekly report.
    if (trigger === 'weekly_report') {
      const weekly = generateWeeklyReport(accountId);
      Object.assign(data, {
        missedCallsCount: weekly.missedCallsCount,
        recoveredConversationsCount: weekly.recoveredConversationsCount,
        responseRatePercent: weekly.responseRatePercent,
        qualifiedJobsCount: weekly.qualifiedJobsCount,
        bookedJobsCount: weekly.bookedJobsCount,
        estimatedRecoveredValue: weekly.estimatedRecoveredValue,
        actualBookedValue: weekly.actualBookedValue,
      });
    }

    const rendered = EmailService.renderTemplate(trigger, data);
    return new NextResponse(rendered.html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  return GET(req);
}
