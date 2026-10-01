import { NextRequest, NextResponse } from 'next/server';
import { EmailService, EmailTrigger } from '@/lib/email/email-service';
import { db } from '@/db/repository';
import { generateWeeklyReport } from '@/lib/reports';
import { getSession } from '@/lib/session';

export async function GET(req: NextRequest) {
  try {
    const session = await getSession(req);
    const accountId = session.accountId;

    const { searchParams } = new URL(req.url);
    const trigger = (searchParams.get('trigger') || 'weekly_report') as EmailTrigger;

    const profile = db.getBusinessProfile(accountId);
    const phoneNumbers = db.getPhoneNumbers(accountId);
    const mcrLine = phoneNumbers[0]?.formatted_number || 'Assigned MCR Forwarding Line';
    const weekly = generateWeeklyReport(accountId);

    const rendered = EmailService.renderTemplate(trigger, {
      businessName: profile?.business_name || 'Your Service Business',
      ownerName: profile?.business_name ? `${profile.business_name} Owner` : 'Service Contractor',
      mcrNumber: mcrLine,
      carrierName: profile?.carrier_name || 'Carrier Network',
      dialCode: `*71${phoneNumbers[0]?.phone_number.replace(/\D/g, '') || ''}`,
      token: 'sample_verify_token_123',
      brandSid: 'Pending Carrier Submission',
      planName: 'MCR Pro',
      amountPaidCents: 14900,
      nextBillingDate: 'Next Billing Cycle',
      jobsCount: weekly.qualifiedJobsCount,
      recoveredValue: weekly.estimatedRecoveredValue.toLocaleString(),
      missedCallsCount: weekly.missedCallsCount,
      recoveredConversationsCount: weekly.recoveredConversationsCount,
      responseRatePercent: weekly.responseRatePercent,
      qualifiedJobsCount: weekly.qualifiedJobsCount,
      bookedJobsCount: weekly.bookedJobsCount,
      estimatedRecoveredValue: weekly.estimatedRecoveredValue.toLocaleString(),
      actualBookedValue: weekly.actualBookedValue.toLocaleString(),
    });

    return new NextResponse(rendered.html, {
      headers: { 'Content-Type': 'text/html' },
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
