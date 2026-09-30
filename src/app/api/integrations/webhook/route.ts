import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';
import { getAuthenticatedAccountId } from '@/lib/session';

export async function POST(req: NextRequest) {
  try {
    // Derive account identity exclusively from session (Part 1.2)
    const accountId = await getAuthenticatedAccountId(req);
    const body = await req.json();
    const { webhookUrl } = body;

    if (!webhookUrl) {
      return NextResponse.json({ error: 'webhookUrl is required' }, { status: 400 });
    }

    const profile = db.getBusinessProfile(accountId);
    const jobs = db.getJobs(accountId);
    const sampleJob = jobs[0] || {
      id: 'job-test-sample',
      account_id: accountId,
      contact_id: 'cnt-test',
      title: 'Water Pipe Burst Lead',
      trade: 'plumbing' as const,
      status: 'BOOKED' as const,
      is_emergency: true,
      problem: 'Burst water pipe under kitchen sink with shutoff assistance needed',
      address: '742 Highland Avenue, Springfield IL',
      photo_urls: [],
      estimated_value: 650,
      actual_value: 650,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    };

    const payload = {
      event: 'job.recovered',
      timestamp: new Date().toISOString(),
      account: {
        id: accountId,
        businessName: profile?.business_name || 'Apex Plumbing & Rooter',
        trade: profile?.trade || 'plumbing'
      },
      job: sampleJob
    };

    let responseStatus = 200;
    let responseBody = 'Webhook delivered successfully';

    if (webhookUrl.startsWith('http://') || webhookUrl.startsWith('https://')) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-MCR-Event': 'job.recovered',
            'User-Agent': 'MCR-Webhook-Delivery/1.0'
          },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeout);
        responseStatus = res.status;
        responseBody = await res.text();
      } catch (postErr: any) {
        responseStatus = 502;
        responseBody = `Webhook dispatch error: ${postErr.message}`;
      }
    }

    db.logAudit(accountId, 'TEST_WEBHOOK_DELIVERY', {
      webhookUrl,
      status: responseStatus
    });

    return NextResponse.json({
      success: responseStatus >= 200 && responseStatus < 300,
      status: responseStatus,
      response: responseBody,
      sentPayload: payload
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
