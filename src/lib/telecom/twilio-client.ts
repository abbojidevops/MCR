import crypto from 'crypto';

export interface SendSmsParams {
  to: string;
  from: string;
  body: string;
  mediaUrls?: string[];
}

export interface SendSmsResult {
  sid: string;
  status: 'sent' | 'queued' | 'mocked' | 'failed';
  error?: string;
}

export interface BrandRegistrationParams {
  legalName: string;
  ein: string;
  address: string;
  city: string;
  state: string;
  zip: string;
  contactEmail: string;
  contactPhone: string;
}

export interface CampaignRegistrationParams {
  brandSid: string;
  description: string;
  sampleMessages: string[];
}

export interface CarrierSubmissionResult {
  ok: boolean;
  status: number;
  brandSid?: string;
  campaignSid?: string;
  is_simulated?: boolean;
  error?: string;
}

export class TwilioClient {
  public static getApiBase(): string {
    return process.env.TWILIO_API_BASE || 'https://api.twilio.com';
  }

  public static isLive(): boolean {
    return (
      process.env.TWILIO_MOCK_MODE !== 'true' &&
      Boolean(process.env.TWILIO_ACCOUNT_SID) &&
      Boolean(process.env.TWILIO_AUTH_TOKEN)
    );
  }

  /**
   * Verify Twilio HMAC-SHA1 Webhook Signature
   */
  public static verifySignature(
    signature: string | null,
    url: string,
    params: Record<string, string>
  ): boolean {
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    if (!this.isLive() || !authToken) {
      return true; // Bypass in mock/test mode
    }
    if (!signature) return false;

    const data = Object.keys(params)
      .sort()
      .reduce((acc, key) => acc + key + params[key], url);

    const expectedSignature = crypto
      .createHmac('sha1', authToken)
      .update(Buffer.from(data, 'utf-8'))
      .digest('base64');

    return signature === expectedSignature;
  }

  /**
   * Send SMS via Twilio REST API (or high-fidelity mock)
   */
  public static async sendSms(params: SendSmsParams): Promise<SendSmsResult> {
    const { to, from, body, mediaUrls } = params;

    if (!this.isLive()) {
      const mockSid = `SM_MOCK_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
      console.log(`[Twilio Mock Dispatch] To: ${to} | From: ${from} | Body: "${body.slice(0, 50)}..."`);
      return {
        sid: mockSid,
        status: 'mocked',
      };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const endpoint = `${this.getApiBase()}/2010-04-01/Accounts/${accountSid}/Messages.json`;

    const formData = new URLSearchParams();
    formData.append('To', to);
    formData.append('From', from);
    formData.append('Body', body);
    if (mediaUrls && mediaUrls.length > 0) {
      for (const mUrl of mediaUrls) {
        formData.append('MediaUrl', mUrl);
      }
    }

    try {
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: formData.toString(),
      });

      const data = await response.json();
      if (!response.ok) {
        console.error('[Twilio API Error]:', data);
        return {
          sid: '',
          status: 'failed',
          error: data.message || `Twilio HTTP error ${response.status}`,
        };
      }

      return {
        sid: data.sid,
        status: data.status === 'queued' ? 'queued' : 'sent',
      };
    } catch (err: any) {
      console.error('[Twilio Network Exception]:', err.message);
      return {
        sid: '',
        status: 'failed',
        error: err.message,
      };
    }
  }

  /**
   * Submit A2P 10DLC Brand Registration to Twilio / The Campaign Registry.
   * In live mode, contacts the carrier API directly.
   * If the carrier is unreachable or fails, returns { ok: false, status: 0, error: 'carrier unreachable' }.
   * Never synthesizes an identifier in live mode.
   */
  public static async submitBrand(params: BrandRegistrationParams): Promise<CarrierSubmissionResult> {
    if (!this.isLive()) {
      return {
        ok: true,
        status: 200,
        brandSid: `BN_MOCK_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
        is_simulated: true,
      };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const endpoint = `${this.getApiBase()}/v1/Messaging/BrandRegistrations`;

    try {
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: data?.message || `Carrier returned HTTP ${response.status}`,
        };
      }

      const sid = data?.sid || data?.brandSid || data?.brand_sid;
      if (!sid) {
        return {
          ok: false,
          status: response.status,
          error: 'Carrier returned 200 but no identifier was provided',
        };
      }

      return {
        ok: true,
        status: response.status,
        brandSid: sid,
      };
    } catch {
      return {
        ok: false,
        status: 0,
        error: 'carrier unreachable',
      };
    }
  }

  /**
   * Submit A2P 10DLC Campaign Registration to Twilio / The Campaign Registry.
   * In live mode, contacts the carrier API directly.
   * If the carrier is unreachable or fails, returns { ok: false, status: 0, error: 'carrier unreachable' }.
   * Never synthesizes an identifier in live mode.
   */
  public static async submitCampaign(params: CampaignRegistrationParams): Promise<CarrierSubmissionResult> {
    if (!this.isLive()) {
      return {
        ok: true,
        status: 200,
        campaignSid: `CM_MOCK_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`,
        is_simulated: true,
      };
    }

    const accountSid = process.env.TWILIO_ACCOUNT_SID!;
    const authToken = process.env.TWILIO_AUTH_TOKEN!;
    const endpoint = `${this.getApiBase()}/v1/Messaging/Campaigns`;

    try {
      const authHeader = 'Basic ' + Buffer.from(`${accountSid}:${authToken}`).toString('base64');
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          Authorization: authHeader,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(params),
      });

      let data: any = null;
      try {
        data = await response.json();
      } catch {
        data = null;
      }

      if (!response.ok) {
        return {
          ok: false,
          status: response.status,
          error: data?.message || `Carrier returned HTTP ${response.status}`,
        };
      }

      const sid = data?.sid || data?.campaignSid || data?.campaign_sid;
      if (!sid) {
        return {
          ok: false,
          status: response.status,
          error: 'Carrier returned 200 but no identifier was provided',
        };
      }

      return {
        ok: true,
        status: response.status,
        campaignSid: sid,
      };
    } catch {
      return {
        ok: false,
        status: 0,
        error: 'carrier unreachable',
      };
    }
  }
}
