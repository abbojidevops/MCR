import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { requireTenantAuth } from '@/lib/authz';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const profile = db.getBusinessProfile(accountId);
    const compliance = db.getCompliance(accountId);
    const phoneNumbers = db.getPhoneNumbers(accountId);
    const callRecords = db.getCallRecords(accountId);

    const forwardingConfigured = profile?.forwarding_configured ?? false;
    const complianceStatus = compliance?.status || 'signed_up';
    const textBackLive = complianceStatus === 'sms_live';

    // Milestone calculations
    const milestones = [
      {
        id: 'profile',
        label: 'Business Profile & Trade',
        description: 'Trade category and emergency notification phone configured.',
        isComplete: Boolean(profile?.business_name && profile?.trade && profile?.notification_phone),
        href: '/dashboard/settings',
      },
      {
        id: 'phone_number',
        label: 'Recovery Phone Line',
        description: 'Dedicated MCR Twilio number provisioned for incoming call rollover.',
        isComplete: Boolean(phoneNumbers.length > 0 || profile?.notification_phone),
        href: '/dashboard/settings',
      },
      {
        id: 'forwarding',
        label: 'Carrier Call Forwarding',
        description: 'Carrier star code dialed on phone keypad to forward unanswered calls.',
        isComplete: Boolean(forwardingConfigured),
        href: '/dashboard/forwarding',
      },
      {
        id: 'test_call',
        label: 'Test Call Verification',
        description: 'Simulate an incoming missed call and receive the automated SMS text-back.',
        isComplete: Boolean(callRecords.length > 0),
        href: '/dashboard/test-mode',
      },
      {
        id: 'compliance',
        label: 'A2P 10DLC Registration',
        description: 'Submit contractor brand & campaign to The Campaign Registry (TCR).',
        isComplete: Boolean(compliance && compliance.status !== 'signed_up'),
        href: '/dashboard/compliance',
      },
    ];

    const completedCount = milestones.filter((m) => m.isComplete).length;
    const totalCount = milestones.length;
    const progressPercent = Math.round((completedCount / totalCount) * 100);
    const nextMilestone = milestones.find((m) => !m.isComplete) || null;

    return NextResponse.json({
      accountId,
      businessName: profile?.business_name || 'Business',
      forwardingConfigured,
      complianceStatus,
      textBackLive,
      onboardingComplete: completedCount === totalCount,
      completedSteps: completedCount,
      totalSteps: totalCount,
      progressPercent,
      nextMilestone,
      milestones,
      compliance,
      profile,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
