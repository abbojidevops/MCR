import { NextRequest, NextResponse } from 'next/server';
import {
  TwilioService,
  TwilioSmsWebhookParams,
  getCandidateWebhookUrls,
} from '@/lib/telecom/twilio-service';
import { dispatchAlert } from '@/lib/alert-dispatcher';

export async function POST(req: NextRequest) {
  try {
    // 1. Fail-closed: TWILIO_AUTH_TOKEN must be configured
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!authToken || !authToken.trim()) {
      return new NextResponse(
        'Twilio Webhook Service Unavailable: TWILIO_AUTH_TOKEN not configured (fail-closed)',
        { status: 503 }
      );
    }

    // 2. Read raw request bytes directly before parsing
    const rawBody = await req.text();
    const searchParams = new URLSearchParams(rawBody);
    const params: Record<string, string> = {};
    searchParams.forEach((val, key) => {
      params[key] = val;
    });

    const signature = req.headers.get('x-twilio-signature');
    const candidateUrls = getCandidateWebhookUrls(req);

    // 3. Cryptographic Signature Validation
    const isValid = TwilioService.validateSignature(authToken, signature, candidateUrls, params);
    if (!isValid) {
      console.warn('Twilio SMS Webhook: Refused forged/unsigned request (403)');
      dispatchAlert({
        level: 'warning',
        source: 'twilio_sms_webhook',
        title: 'Forged/Unsigned Twilio SMS Request Refused',
        message: `Unauthorized SMS webhook request from IP ${req.headers.get('x-forwarded-for') || 'unknown'}`,
        metadata: { messageSid: params.MessageSid, from: params.From, to: params.To },
      }).catch(() => {});
      return new NextResponse('Forbidden: Invalid Twilio Webhook Signature', { status: 403 });
    }

    const smsParams: TwilioSmsWebhookParams = {
      MessageSid: params.MessageSid || `SM_${Date.now()}`,
      From: params.From || '',
      To: params.To || '',
      Body: params.Body || '',
      NumMedia: params.NumMedia,
      MediaUrl0: params.MediaUrl0,
      MediaContentType0: params.MediaContentType0,
    };

    const result = await TwilioService.handleInboundSms(smsParams);

    // Return TwiML MessagingResponse or empty
    const twiml = result.replyMessage
      ? `<?xml version="1.0" encoding="UTF-8"?><Response><Message>${result.replyMessage}</Message></Response>`
      : `<?xml version="1.0" encoding="UTF-8"?><Response/>`;

    return new NextResponse(twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error: any) {
    console.error('Error in Twilio SMS Webhook:', error);
    dispatchAlert({
      level: 'error',
      source: 'twilio_sms_webhook',
      title: 'Twilio SMS Inbound Processing Error',
      message: error?.message || 'Unknown SMS webhook exception',
      metadata: { error: String(error?.stack || error) },
    }).catch(() => {});
    return new NextResponse('<Response/>', {
      status: 500,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
