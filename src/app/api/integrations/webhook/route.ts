import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';
import { db } from '@/db/repository';
import { requireTenantAuth } from '@/lib/authz';

export async function GET(req: NextRequest) {
  try {
    const auth = await requireTenantAuth(req);
    if (auth instanceof NextResponse) return auth;
    const { accountId } = auth;

    const profile = db.getBusinessProfile(accountId);

    return NextResponse.json({
      success: true,
      accountId,
      crmWebhookUrl: profile?.crm_webhook_url || null,
      crmWebhookSecret: profile?.crm_webhook_secret || null,
      crmWebhookEvents: profile?.crm_webhook_events || ['job.created', 'job.booked', 'job.updated'],
      status: 'ready',
    });
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
    const { webhookUrl, secret, saveConfig } = body;

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
      updated_at: new Date().toISOString(),
    };

    const payload = {
      event: 'job.recovered',
      timestamp: new Date().toISOString(),
      account: {
        id: accountId,
        businessName: profile?.business_name || 'Apex Plumbing & Rooter',
        trade: profile?.trade || 'plumbing',
      },
      job: sampleJob,
    };

    const stringPayload = JSON.stringify(payload);
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-MCR-Event': 'job.recovered',
      'User-Agent': 'MCR-Webhook-Delivery/1.0',
    };

    const effectiveSecret = secret || profile?.crm_webhook_secret;
    let signature: string | undefined;
    if (effectiveSecret) {
      const hmac = crypto.createHmac('sha256', effectiveSecret);
      hmac.update(stringPayload, 'utf8');
      signature = `sha256=${hmac.digest('hex')}`;
      headers['X-MCR-Signature'] = signature;
    }

    let responseStatus = 200;
    let responseBody = 'Webhook delivered successfully';

    if (webhookUrl.startsWith('http://') || webhookUrl.startsWith('https://')) {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 3000);
        const res = await fetch(webhookUrl, {
          method: 'POST',
          headers,
          body: stringPayload,
          signal: controller.signal,
        });
        clearTimeout(timeout);
        responseStatus = res.status;
        responseBody = await res.text();
      } catch (postErr: any) {
        responseStatus = 502;
        responseBody = `Webhook dispatch error: ${postErr.message}`;
      }
    }

    // Save config if requested
    if (saveConfig) {
      db.updateBusinessProfile(accountId, {
        crm_webhook_url: webhookUrl,
        crm_webhook_secret: secret,
      });
    }

    db.logAudit(accountId, 'TEST_WEBHOOK_DELIVERY', {
      webhookUrl,
      status: responseStatus,
    });

    return NextResponse.json({
      success: responseStatus >= 200 && responseStatus < 300,
      status: responseStatus,
      statusCode: responseStatus,
      response: responseBody,
      sentPayload: payload,
      signature,
    });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
