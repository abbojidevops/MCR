import { NextRequest, NextResponse } from 'next/server';
import { TwilioService, TwilioSmsWebhookParams } from '@/lib/telecom/twilio-service';

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
      console.warn('Twilio SMS Webhook: Invalid Signature');
      return new NextResponse('Invalid Twilio Signature', { status: 403 });
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
    return new NextResponse('<Response/>', {
      status: 500,
      headers: { 'Content-Type': 'text/xml' },
    });
  }
}
