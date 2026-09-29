import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/db/repository';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { webhookUrl, accountId } = body;

    if (!webhookUrl) {
      return NextResponse.json({ error: 'webhookUrl is required' }, { status: 400 });
    }

    const targetAccount = accountId || 'acc-apex-plumbing';
    const profile = db.getBusinessProfile(targetAccount);
    const jobs = db.getJobs(targetAccount);
    const sampleJob = jobs[0] || {
      id: 'job-test-sample',
      account_id: targetAccount,
      contact_id: 'cnt-test',
      title: 'Water Pipe Burst Lead',
      trade: 'plumbing' as const,
      status: 'BOOKED' as const,
      is_emergency: true,
      problem: 'Burst water pipe under kitchen sink with shutoff assistance needed',
      address: '742 Evergreen Terrace, Austin TX',
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
        id: targetAccount,
        businessName: profile?.business_name || 'Apex Plumbing & Rooter',
        trade: profile?.trade || 'plumbing'
      },
      job: sampleJob
    };

    // If real external URL, attempt fetch with 3-second timeout
    let responseStatus = 200;
    let responseBody = 'Simulated mock delivery successful';

    if (webhookUrl.startsWith('http://') || webhookUrl.startsWith('https://')) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'User-Agent': 'MCR-Webhook-Engine/1.0' },
          body: JSON.stringify(payload),
          signal: controller.signal
        });
        clearTimeout(timeout);
        responseStatus = res.status;
        responseBody = await res.text();
      } catch (e: any) {
        responseStatus = 502;
        responseBody = `Webhook dispatch failed: ${e.message}`;
      }
    }

    return NextResponse.json({
      success: responseStatus >= 200 && responseStatus < 300,
      statusCode: responseStatus,
      dispatchedPayload: payload,
      response: responseBody
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
