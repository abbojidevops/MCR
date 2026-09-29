import { NextRequest, NextResponse } from 'next/server';
import { EmailService, EmailTrigger } from '@/lib/email/email-service';
import { db } from '@/db/repository';
import { generateWeeklyReport } from '@/lib/reports';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const trigger = (searchParams.get('trigger') || 'weekly_report') as EmailTrigger;
    const accountId = searchParams.get('accountId') || 'acc-apex-plumbing';

    const profile = db.getBusinessProfile(accountId);
    const weekly = generateWeeklyReport(accountId);

    const rendered = EmailService.renderTemplate(trigger, {
      businessName: profile?.business_name || 'Apex Plumbing & Rooter',
      ownerName: 'Dave Miller',
      mcrNumber: '+1 (217) 555-0190',
      carrierName: profile?.carrier_name || 'Verizon Wireless',
      dialCode: '*712175550190',
      token: 'sample_verify_token_123',
      brandSid: 'BN_tcr_apex_brand_01',
      planName: 'MCR Pro',
      amountPaidCents: 14900,
      nextBillingDate: 'October 29, 2026',
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
