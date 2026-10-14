// ============================================================================
// MCR Transactional Email System
// ============================================================================

import nodemailer, { type Transporter } from 'nodemailer';
import { z } from 'zod';

export type EmailTrigger =
  | 'welcome'
  | 'verification'
  | 'registration_submitted'
  | 'registration_approved'
  | 'registration_rejected'
  | 'sms_live'
  | 'payment_successful'
  | 'payment_failed'
  | 'trial_ending'
  | 'subscription_canceled'
  | 'weekly_report';

export interface EmailPayload {
  to: string;
  trigger: EmailTrigger;
  data: Record<string, unknown>;
}

export interface RenderedEmail {
  subject: string;
  html: string;
  text: string;
}

/**
 * An SMTP server accepting a message does not prove it reached an inbox.
 * `accepted` means the configured SMTP server accepted the recipient for
 * processing; final delivery, spam filtering, and bounces are outside MCR's
 * visibility unless the operator configures separate provider webhooks.
 */
export interface EmailDispatchResult {
  accepted: boolean;
  messageId: string | null;
  transport: 'smtp' | 'log_only' | 'disabled';
  notice: string;
}

export type SmtpTransport = Pick<Transporter, 'sendMail' | 'close'>;
export type SmtpTransportFactory = (smtpUrl: string) => SmtpTransport;

const emailAddressSchema = z.string().trim().email();
const dashboardPath = '/dashboard';

function stringValue(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'boolean') return String(value);
  return fallback;
}

/** Strip control characters and normalize untrusted values before rendering. */
function plainText(value: unknown, fallback = ''): string {
  return stringValue(value, fallback)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 2_000);
}

function escapeHtml(value: unknown, fallback = ''): string {
  return plainText(value, fallback).replace(/[&<>"']/g, (character) => {
    switch (character) {
      case '&': return '&amp;';
      case '<': return '&lt;';
      case '>': return '&gt;';
      case '"': return '&quot;';
      default: return '&#39;';
    }
  });
}

function safeHeader(value: unknown, fallback = ''): string {
  return plainText(value, fallback).replace(/[\r\n]/g, ' ').slice(0, 180);
}

function hasValue(value: unknown): boolean {
  return value !== null && value !== undefined && !(typeof value === 'string' && value.trim() === '');
}

function numericValue(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || value.trim() === '') return null;
  const parsed = Number(value.replace(/[$,]/g, '').trim());
  return Number.isFinite(parsed) ? parsed : null;
}

function formatCount(value: unknown): string | null {
  const count = numericValue(value);
  if (count === null || count < 0) return null;
  return Math.trunc(count).toLocaleString('en-US');
}

function formatDollars(value: unknown): string | null {
  const amount = numericValue(value);
  if (amount === null) return null;
  return amount.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function formatCents(value: unknown): string | null {
  const cents = numericValue(value);
  if (cents === null) return null;
  return (cents / 100).toLocaleString('en-US', {
    style: 'currency',
    currency: 'USD',
  });
}

function resolveAppBaseUrl(): string | null {
  const configuredUrl = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (!configuredUrl) return null;

  try {
    const parsed = new URL(configuredUrl);
    const isLocalHttp = parsed.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname);
    if (parsed.protocol !== 'https:' && !isLocalHttp) return null;
    return parsed.origin;
  } catch {
    return null;
  }
}

function isSmtpUrl(value: string): boolean {
  try {
    const parsed = new URL(value);
    return (parsed.protocol === 'smtp:' || parsed.protocol === 'smtps:') && Boolean(parsed.hostname);
  } catch {
    return false;
  }
}

const nodemailerTransportFactory: SmtpTransportFactory = (smtpUrl) => {
  const parsed = new URL(smtpUrl);
  return nodemailer.createTransport({
    url: smtpUrl,
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
    // In production, an smtp:// connection must upgrade to TLS. smtps:// uses
    // TLS from the start. Local development mail-catchers can remain plaintext.
    requireTLS: process.env.NODE_ENV === 'production' && parsed.protocol === 'smtp:',
    tls: { minVersion: 'TLSv1.2' },
  });
};

export class EmailService {
  /** Render an email using only supplied business, account, and report data. */
  public static renderTemplate(trigger: EmailTrigger, data: Record<string, unknown>): RenderedEmail {
    const businessNameText = plainText(data.businessName, 'Your Business') || 'Your Business';
    const ownerNameText = plainText(data.ownerName);
    const businessName = escapeHtml(businessNameText);
    const ownerName = escapeHtml(ownerNameText);
    const subjectBusinessName = safeHeader(businessNameText, 'Your Business');
    const appBaseUrl = resolveAppBaseUrl();
    const urlFor = (path: string, query = '') => appBaseUrl ? `${appBaseUrl}${path}${query}` : null;
    const button = (url: string | null, label: string) => url
      ? `<a href="${escapeHtml(url)}" class="btn">${escapeHtml(label)}</a>`
      : `<p>Sign in to MCR to ${escapeHtml(label.toLowerCase())}.</p>`;
    const detailLine = (label: string, value: unknown) => hasValue(value)
      ? `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}<br>`
      : '';
    const textDetail = (label: string, value: unknown) => hasValue(value)
      ? `${label}: ${plainText(value)}`
      : '';

    const baseLayout = (content: string) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f8fafc; color: #1e293b; margin: 0; padding: 24px; }
    .container { max-width: 580px; margin: 0 auto; background: #ffffff; border-radius: 16px; border: 1px solid #e2e8f0; overflow: hidden; }
    .header { background: #2563eb; padding: 24px; text-align: center; color: #ffffff; }
    .header h1 { margin: 0; font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
    .body { padding: 32px 24px; font-size: 14px; line-height: 1.6; }
    .btn { display: inline-block; background: #2563eb; color: #ffffff !important; padding: 12px 24px; text-decoration: none; border-radius: 10px; font-weight: 700; margin-top: 16px; font-size: 13px; }
    .highlight { background: #f1f5f9; border-left: 4px solid #2563eb; padding: 12px 16px; margin: 16px 0; border-radius: 4px; font-size: 13px; }
    .footer { background: #f8fafc; padding: 16px 24px; font-size: 11px; text-align: center; color: #64748b; border-top: 1px solid #e2e8f0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>MCR — Missed Call Recovery</h1>
    </div>
    <div class="body">
      ${content}
    </div>
    <div class="footer">
      © ${new Date().getFullYear()} MCR. You received this message regarding your account with ${businessName}.
    </div>
  </div>
</body>
</html>
    `;

    switch (trigger) {
      case 'welcome': {
        const details = [
          textDetail('Assigned MCR line', data.mcrNumber),
          textDetail('Carrier', data.carrierName),
          textDetail('Activation instructions', data.dialCode),
        ].filter(Boolean);
        const detailHtml = [
          detailLine('Assigned MCR line', data.mcrNumber),
          detailLine('Carrier', data.carrierName),
          detailLine('Activation instructions', data.dialCode),
        ].filter(Boolean).join('');
        const dashboardUrl = urlFor(dashboardPath);
        return {
          subject: 'Welcome to MCR',
          html: baseLayout(`
            <h2>Welcome${ownerName ? `, ${ownerName}` : ''}.</h2>
            <p>Thank you for choosing MCR for <strong>${businessName}</strong>. Review your account setup and current service status in your dashboard.</p>
            ${detailHtml ? `<div class="highlight">${detailHtml}</div>` : ''}
            ${button(dashboardUrl, 'Open Your Dashboard')}
          `),
          text: [
            `Welcome to MCR${ownerNameText ? `, ${ownerNameText}` : ''}.`,
            `Review your account setup for ${businessNameText}.`,
            ...details,
            dashboardUrl || 'Open your MCR dashboard to review your account.',
          ].join('\n'),
        };
      }

      case 'verification':
        return {
          subject: 'Email verification is not available',
          html: baseLayout(`
            <h2>Email Verification Is Not Available</h2>
            <p>This application build does not include a working email-verification flow, so no confirmation link is provided.</p>
          `),
          text: 'This application build does not include a working email-verification flow, so no confirmation link is provided.',
        };

      case 'registration_submitted': {
        const brandSid = hasValue(data.brandSid) ? plainText(data.brandSid) : '';
        const statusDetail = brandSid ? detailLine('Brand SID', brandSid) : '';
        return {
          subject: `Carrier registration submitted for ${subjectBusinessName}`,
          html: baseLayout(`
            <h2>Carrier Registration Submitted</h2>
            <p>The carrier registration for <strong>${businessName}</strong> was submitted for review.</p>
            ${statusDetail ? `<div class="highlight">${statusDetail}</div>` : ''}
            <p>Review the compliance dashboard for the current status. Review times can vary.</p>
            ${button(urlFor('/dashboard/compliance'), 'View Carrier Status')}
          `),
          text: [
            `Carrier registration for ${businessNameText} was submitted for review.`,
            brandSid ? `Brand SID: ${brandSid}` : '',
            'Review the compliance dashboard for the current status. Review times can vary.',
          ].filter(Boolean).join('\n'),
        };
      }

      case 'registration_approved':
        return {
          subject: `Carrier registration approved for ${subjectBusinessName}`,
          html: baseLayout(`
            <h2>Carrier Registration Approved</h2>
            <p>The carrier registration for <strong>${businessName}</strong> was approved.</p>
            <p>Check your compliance dashboard for the current SMS activation status. Registration approval alone does not confirm that message routing is active.</p>
            ${button(urlFor('/dashboard/compliance'), 'View Compliance Status')}
          `),
          text: `Carrier registration for ${businessNameText} was approved. Check your compliance dashboard for the current SMS activation status; approval alone does not confirm message routing is active.`,
        };

      case 'registration_rejected': {
        const rejectionReason = hasValue(data.rejectionReason)
          ? plainText(data.rejectionReason)
          : '';
        return {
          subject: `Action needed: carrier registration for ${subjectBusinessName}`,
          html: baseLayout(`
            <h2>Carrier Registration Needs Attention</h2>
            <p>The carrier registration for <strong>${businessName}</strong> was not approved.</p>
            ${rejectionReason ? `<div class="highlight"><strong>Reason provided:</strong> ${escapeHtml(rejectionReason)}</div>` : ''}
            <p>Open the compliance dashboard to review the carrier feedback and available next steps.</p>
            ${button(urlFor('/dashboard/compliance'), 'Review Carrier Feedback')}
          `),
          text: [
            `Carrier registration for ${businessNameText} was not approved.`,
            rejectionReason ? `Reason provided: ${rejectionReason}` : '',
            'Open the compliance dashboard to review the carrier feedback and available next steps.',
          ].filter(Boolean).join('\n'),
        };
      }

      case 'sms_live':
        return {
          subject: `SMS routing status updated for ${subjectBusinessName}`,
          html: baseLayout(`
            <h2>SMS Routing Status Updated</h2>
            <p>MCR has marked SMS routing as active for <strong>${businessName}</strong>.</p>
            <p>Review your dashboard for current service status and setup details. Message delivery may still depend on recipient carrier networks and device settings.</p>
            ${button(urlFor(dashboardPath), 'Open Your Dashboard')}
          `),
          text: `MCR has marked SMS routing as active for ${businessNameText}. Review your dashboard for current status and setup details. Message delivery can still depend on recipient carrier networks and device settings.`,
        };

      case 'payment_successful': {
        const amount = formatCents(data.amountPaidCents);
        const lines = [
          detailLine('Plan', data.planName),
          amount ? detailLine('Amount paid', amount) : '',
          detailLine('Next billing date', data.nextBillingDate),
        ].filter(Boolean).join('');
        const textLines = [
          textDetail('Plan', data.planName),
          amount ? `Amount paid: ${amount}` : '',
          textDetail('Next billing date', data.nextBillingDate),
        ].filter(Boolean);
        const billingUrl = urlFor('/dashboard/billing');
        return {
          subject: `Payment confirmation for ${subjectBusinessName}`,
          html: baseLayout(`
            <h2>Payment Successful</h2>
            <p>A payment was recorded for the MCR account for <strong>${businessName}</strong>.</p>
            ${lines ? `<div class="highlight">${lines}</div>` : ''}
            ${button(billingUrl, 'View Billing Details')}
          `),
          text: [
            `A payment was recorded for the MCR account for ${businessNameText}.`,
            ...textLines,
            billingUrl || 'Open your MCR dashboard to view billing details.',
          ].join('\n'),
        };
      }

      case 'payment_failed': {
        const billingUrl = urlFor('/dashboard/billing');
        return {
          subject: `Payment needs attention for ${subjectBusinessName}`,
          html: baseLayout(`
            <h2>Payment Processing Failed</h2>
            <p>The latest payment attempt for the MCR account for <strong>${businessName}</strong> was reported as unsuccessful.</p>
            <p>Review your billing details to see the current account status and any available next steps.</p>
            ${button(billingUrl, 'Review Billing Details')}
          `),
          text: `The latest payment attempt for the MCR account for ${businessNameText} was reported as unsuccessful. Review billing details for current account status and next steps.`,
        };
      }

      case 'trial_ending': {
        const daysRemaining = formatCount(data.daysRemaining);
        const endDate = hasValue(data.trialEndDate) ? plainText(data.trialEndDate) : '';
        const jobsCount = formatCount(data.jobsCount);
        const recoveredValue = formatDollars(data.recoveredValue);
        const details = [
          jobsCount ? detailLine('Qualified opportunities', jobsCount) : '',
          recoveredValue ? detailLine('Estimated opportunity value', `$${recoveredValue}`) : '',
        ].filter(Boolean).join('');
        const textDetails = [
          jobsCount ? `Qualified opportunities: ${jobsCount}` : '',
          recoveredValue ? `Estimated opportunity value: $${recoveredValue}` : '',
        ].filter(Boolean);
        const trialTiming = daysRemaining
          ? `Your MCR trial ends in ${daysRemaining} ${daysRemaining === '1' ? 'day' : 'days'}.`
          : endDate
            ? `Your MCR trial is scheduled to end on ${endDate}.`
            : 'Your MCR trial is approaching its end. Check your account for the exact date.';
        const billingUrl = urlFor('/dashboard/billing');
        return {
          subject: daysRemaining
            ? `Your MCR trial ends in ${daysRemaining} ${daysRemaining === '1' ? 'day' : 'days'}`
            : 'Reminder: your MCR trial is nearing its end',
          html: baseLayout(`
            <h2>Your Trial Is Nearing Its End</h2>
            <p>${escapeHtml(trialTiming)}</p>
            ${details ? `<div class="highlight">${details}</div>` : ''}
            <p>Review your account for the exact trial status and available plan options.</p>
            ${button(billingUrl, 'Review Plan Options')}
          `),
          text: [trialTiming, ...textDetails, 'Review your account for current status and available plan options.'].join('\n'),
        };
      }

      case 'subscription_canceled': {
        const cancelCode = hasValue(data.cancelCode) ? plainText(data.cancelCode) : '';
        const billingUrl = urlFor('/dashboard/billing');
        const forwardingInstructions = cancelCode
          ? `The supplied carrier call-forwarding deactivation code is ${cancelCode}. Confirm it with your carrier before use.`
          : 'Call-forwarding deactivation instructions vary by carrier. Check your phone or contact your carrier if you enabled forwarding.';
        return {
          subject: `Subscription canceled for ${subjectBusinessName}`,
          html: baseLayout(`
            <h2>Subscription Canceled</h2>
            <p>The MCR subscription for <strong>${businessName}</strong> was canceled.</p>
            <p>${escapeHtml(forwardingInstructions)}</p>
            ${button(billingUrl, 'View Billing Details')}
          `),
          text: [
            `The MCR subscription for ${businessNameText} was canceled.`,
            forwardingInstructions,
            billingUrl || 'Open your MCR dashboard to view billing details.',
          ].join('\n'),
        };
      }

      case 'weekly_report': {
        const missedCalls = formatCount(data.missedCallsCount) ?? 'Not available';
        const responded = formatCount(data.recoveredConversationsCount) ?? 'Not available';
        const responseRate = numericValue(data.responseRatePercent);
        const responseRateText = responseRate === null
          ? 'Not available'
          : `${responseRate.toLocaleString('en-US', { maximumFractionDigits: 2 })}%`;
        const qualified = formatCount(data.qualifiedJobsCount) ?? 'Not available';
        const booked = formatCount(data.bookedJobsCount) ?? 'Not available';
        const estimated = formatDollars(data.estimatedRecoveredValue);
        const bookedValue = formatDollars(data.actualBookedValue);
        const estimatedText = estimated ? `$${estimated}` : 'Not available';
        const bookedValueText = bookedValue ? `$${bookedValue}` : 'Not available';
        const rows = [
          ['Missed calls received', missedCalls],
          ['Customers who responded to SMS', `${responded} (${responseRateText})`],
          ['Qualified opportunities', qualified],
          ['Marked booked', booked],
          ['Estimated opportunity value', estimatedText],
          ['Confirmed booked value', bookedValueText],
        ];
        const reportUrl = urlFor('/dashboard/reports');
        const estimatedSubject = estimated ? ` — $${estimated} estimated opportunity value` : '';
        return {
          subject: `Weekly report: ${subjectBusinessName}${estimatedSubject}`,
          html: baseLayout(`
            <h2>Your Weekly Recovery Report</h2>
            <p>Report for <strong>${businessName}</strong> covering the past 7 days:</p>
            <div class="highlight" style="font-size:14px;">
              ${rows.map(([label, value]) => `<strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}<br>`).join('')}
            </div>
            <p>Estimated opportunity value is an estimate, not confirmed revenue. Review individual records in the dashboard.</p>
            ${button(reportUrl, 'Open Full Report')}
          `),
          text: [
            `Weekly report for ${businessNameText} covering the past 7 days:`,
            ...rows.map(([label, value]) => `${label}: ${value}`),
            'Estimated opportunity value is an estimate, not confirmed revenue. Review individual records in the dashboard.',
          ].join('\n'),
        };
      }

      default:
        return {
          subject: 'Notification from MCR',
          html: baseLayout('<p>You have a new update regarding your business account.</p>'),
          text: 'You have a new update regarding your business account.',
        };
    }
  }

  /** True only when both SMTP and an explicit sender are configured. */
  public static hasTransport(): boolean {
    const smtpUrl = process.env.SMTP_URL?.trim() || '';
    const emailFrom = process.env.EMAIL_FROM?.trim() || '';
    return isSmtpUrl(smtpUrl) && emailFrom.length > 0 && !/[\r\n]/.test(emailFrom);
  }

  /**
   * Send through provider-neutral SMTP. A successful result means the SMTP
   * server accepted the message; it is not proof of inbox delivery.
   *
   * The optional factory is a narrow test seam. Production uses Nodemailer;
   * tests inject a fake and never contact an external mail server.
   */
  public static async sendEmail(
    payload: EmailPayload,
    transportFactory: SmtpTransportFactory = nodemailerTransportFactory
  ): Promise<EmailDispatchResult> {
    const recipient = emailAddressSchema.safeParse(payload.to);
    if (!recipient.success) {
      return {
        accepted: false,
        messageId: null,
        transport: 'disabled',
        notice: 'Email was not sent because the recipient address is invalid.',
      };
    }

    if (payload.trigger === 'verification') {
      return {
        accepted: false,
        messageId: null,
        transport: 'disabled',
        notice: 'Email was not sent because a working email-verification flow is not implemented.',
      };
    }

    const smtpUrl = process.env.SMTP_URL?.trim() || '';
    const emailFrom = process.env.EMAIL_FROM?.trim() || '';
    if (!smtpUrl || !emailFrom) {
      console.info(`[EMAIL NOT SENT] reason=smtp_not_configured trigger=${payload.trigger}`);
      return {
        accepted: false,
        messageId: null,
        transport: 'log_only',
        notice: 'Email was not sent. Configure SMTP_URL and EMAIL_FROM to enable outbound email.',
      };
    }

    if (!isSmtpUrl(smtpUrl) || /[\r\n]/.test(emailFrom)) {
      console.warn(`[EMAIL NOT SENT] reason=invalid_smtp_configuration trigger=${payload.trigger}`);
      return {
        accepted: false,
        messageId: null,
        transport: 'log_only',
        notice: 'Email was not sent because the SMTP configuration is invalid. Check SMTP_URL and EMAIL_FROM.',
      };
    }

    const rendered = this.renderTemplate(payload.trigger, payload.data);
    let transporter: SmtpTransport | null = null;
    try {
      transporter = transportFactory(smtpUrl);
      const info = await transporter.sendMail({
        from: emailFrom,
        to: recipient.data,
        subject: rendered.subject,
        text: rendered.text,
        html: rendered.html,
      });

      if (!Array.isArray(info.accepted) || info.accepted.length === 0) {
        console.warn(`[EMAIL SMTP NOT ACCEPTED] trigger=${payload.trigger}`);
        return {
          accepted: false,
          messageId: info.messageId || null,
          transport: 'smtp',
          notice: 'The SMTP server did not accept the recipient. The email was not confirmed as sent.',
        };
      }

      console.info(`[EMAIL SMTP ACCEPTED] trigger=${payload.trigger}`);
      return {
        accepted: true,
        messageId: info.messageId || null,
        transport: 'smtp',
        notice: 'The SMTP server accepted the email for processing; final inbox delivery is not confirmed.',
      };
    } catch (error) {
      const code = error && typeof error === 'object' && 'code' in error && typeof error.code === 'string'
        ? error.code.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) || 'UNKNOWN'
        : 'UNKNOWN';
      console.warn(`[EMAIL SMTP FAILED] trigger=${payload.trigger} code=${code}`);
      return {
        accepted: false,
        messageId: null,
        transport: 'smtp',
        notice: 'The SMTP server could not accept the email. Check SMTP settings and server health; inbox delivery is not confirmed.',
      };
    } finally {
      transporter?.close();
    }
  }
}
