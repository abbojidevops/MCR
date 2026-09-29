import { NextRequest, NextResponse } from 'next/server';
import { TwilioService, TwilioVoiceWebhookParams } from '@/lib/telecom/twilio-service';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const params: Record<string, string> = {};

    formData.forEach((val, key) => {
      params[key] = val.toString();
    });

    const signature = req.headers.get('x-twilio-signature');
    const url = req.url;
    const authToken = process.env.TWILIO_AUTH_TOKEN || '';

    // Validate Signature
    const isValid = TwilioService.validateSignature(authToken, signature, url, params);
    if (!isValid) {
      console.warn('Twilio Voice Webhook: Invalid Signature');
      return new NextResponse('Invalid Twilio Signature', { status: 403 });
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
    const fallbackTwiml = '<Response><Hangup/></Response>';
    return new NextResponse(fallbackTwiml, {
      status: 500,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
