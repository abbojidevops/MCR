import { NextRequest, NextResponse } from 'next/server';
import {
  TwilioService,
  TwilioVoiceWebhookParams,
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
      console.warn('Twilio Voice Webhook: Refused forged/unsigned request (403)');
      dispatchAlert({
        level: 'warning',
        source: 'twilio_voice_webhook',
        title: 'Forged/Unsigned Twilio Voice Request Refused',
        message: `Unauthorized voice webhook request from IP ${req.headers.get('x-forwarded-for') || 'unknown'}`,
        metadata: { callSid: params.CallSid, from: params.From, to: params.To },
      }).catch(() => {});
      return new NextResponse('Forbidden: Invalid Twilio Webhook Signature', { status: 403 });
    }

    const voiceParams: TwilioVoiceWebhookParams = {
      CallSid: params.CallSid || `CA_${Date.now()}`,
      From: params.From || '+15550000000',
      To: params.To || '+12175550190',
      CallStatus: params.CallStatus || 'no-answer',
      Direction: params.Direction || 'inbound',
      ForwardedFrom: params.ForwardedFrom,
      DialCallStatus: params.DialCallStatus,
      Duration: params.Duration,
    };

    const result = await TwilioService.handleInboundCall(voiceParams);

    return new NextResponse(result.twiml, {
      status: 200,
      headers: {
        'Content-Type': 'text/xml',
      },
    });
  } catch (error: any) {
    console.error('Error in Twilio Voice Webhook:', error);
    dispatchAlert({
      level: 'error',
      source: 'twilio_voice_webhook',
      title: 'Twilio Voice Inbound Processing Error',
      message: error?.message || 'Unknown voice webhook exception',
      metadata: { error: String(error?.stack || error) },
    }).catch(() => {});
    const fallbackTwiml = '<Response><Hangup/></Response>';
    return new NextResponse(fallbackTwiml, {
      status: 500,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
