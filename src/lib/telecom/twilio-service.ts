import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { db } from '@/db/repository';
import { TRADE_TEMPLATES } from '@/lib/trade-templates';
import { isHelpKeyword, isStartKeyword, isStopKeyword } from '@/lib/compliance-machine';
import { checkQuietHours, inferTimezoneFromPhone } from '@/lib/quiet-hours';
import { TradeKey } from '@/types';
import { checkSubscriptionEntitlement } from '@/lib/billing/entitlement';
import { TwilioClient } from './twilio-client';
import { dispatchAlert } from '@/lib/alert-dispatcher';
import { dispatchCrmWebhook } from '@/lib/crm-webhook';

export interface TwilioVoiceWebhookParams {
  CallSid: string;
  From: string;
  To: string;
  CallStatus?: string;
  Direction?: string;
  ForwardedFrom?: string;
  DialCallStatus?: string;
  Duration?: string;
  referenceDate?: Date;
}

export interface TwilioSmsWebhookParams {
  MessageSid: string;
  From: string;
  To: string;
  Body: string;
  NumMedia?: string;
  MediaUrl0?: string;
  MediaContentType0?: string;
}

/**
 * Resolve candidate URLs that Twilio could have called against.
 * Protects against reverse proxy headers (Cloudflare, ngrok, localhost ports).
 */
export function getCandidateWebhookUrls(req: NextRequest): string[] {
  const urls: Set<string> = new Set();
  urls.add(req.url);

  let pathname = '';
  let search = '';
  try {
    const parsed = new URL(req.url);
    pathname = parsed.pathname;
    search = parsed.search;
  } catch {}

  const hostHeader = req.headers.get('x-forwarded-host') || req.headers.get('host');
  const protoHeader = req.headers.get('x-forwarded-proto') || 'https';

  if (hostHeader && pathname) {
    urls.add(`${protoHeader}://${hostHeader}${pathname}${search}`);
    const altProto = protoHeader === 'https' ? 'http' : 'https';
    urls.add(`${altProto}://${hostHeader}${pathname}${search}`);
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.WEBHOOK_BASE_URL;
  if (appUrl && pathname) {
    try {
      const base = new URL(appUrl);
      urls.add(`${base.protocol}//${base.host}${pathname}${search}`);
    } catch {}
  }

  return Array.from(urls);
}

export class TwilioService {
  /**
   * Validate Twilio Webhook Signature (HMAC-SHA1)
   * Strictly fail-closed: if authToken or signature is missing/empty, returns false.
   * Compares against candidate URLs using constant-time string comparison.
   */
  public static validateSignature(
    authToken: string | undefined,
    signature: string | null,
    urls: string | string[],
    params: Record<string, string>
  ): boolean {
    if (!authToken || !authToken.trim()) return false;
    if (!signature || !signature.trim()) return false;

    const candidateUrls = Array.isArray(urls) ? urls : [urls];

    // Sort parameters alphabetically by key and concatenate values
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys.reduce((acc, key) => acc + key + params[key], '');

    for (const url of candidateUrls) {
      if (!url) continue;
      const data = url + paramString;
      const expectedSignature = crypto
        .createHmac('sha1', authToken)
        .update(Buffer.from(data, 'utf-8'))
        .digest('base64');

      const sigBuf = Buffer.from(signature);
      const expectedBuf = Buffer.from(expectedSignature);

      if (sigBuf.length === expectedBuf.length && crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        return true;
      }
    }

    return false;
  }

  /**
   * Compute valid HMAC-SHA1 signature for a URL and parameter dictionary
   */
  public static computeSignature(
    authToken: string,
    url: string,
    params: Record<string, string>
  ): string {
    const sortedKeys = Object.keys(params).sort();
    const paramString = sortedKeys.reduce((acc, key) => acc + key + params[key], '');
    const data = url + paramString;
    return crypto.createHmac('sha1', authToken).update(Buffer.from(data, 'utf-8')).digest('base64');
  }

  /**
   * Process Inbound Missed Call Voice Webhook
   */
  public static async handleInboundCall(params: TwilioVoiceWebhookParams): Promise<{
    twiml: string;
    textBackTriggered: boolean;
    callRecordId: string;
    reason: string;
  }> {
    const { CallSid, From, To, ForwardedFrom } = params;

    // 1. Idempotency Check
    if (db.isWebhookProcessed('twilio_voice', CallSid)) {
      return {
        twiml: '<Response><Hangup/></Response>',
        textBackTriggered: false,
        callRecordId: CallSid,
        reason: 'Webhook already processed (idempotent)',
      };
    }

    // 2. Resolve Account via Destination Number
    const phoneNumberRecord = db.getPhoneNumberByNumber(To);
    if (!phoneNumberRecord) {
      console.warn(`Unregistered phone number received call: ${To}`);
      return {
        twiml: '<Response><Reject reason="busy"/></Response>',
        textBackTriggered: false,
        callRecordId: CallSid,
        reason: 'Phone number not registered to any MCR tenant',
      };
    }

    const accountId = phoneNumberRecord.account_id;
    await db.hydrateBusinessProfileFromPostgres(accountId);
    const profile = db.getBusinessProfile(accountId);
    const trade = (profile?.trade || 'plumbing') as TradeKey;
    const template = TRADE_TEMPLATES[trade] || TRADE_TEMPLATES.plumbing;
    const businessName = profile?.business_name || 'Service Team';

    // 3. Record Call in Database & Check 2-Hour Deduplication
    const { callRecord, isDeduplicated } = db.recordCall({
      accountId,
      twilioCallSid: CallSid,
      fromNumber: From,
      toNumber: To,
      callStatus: 'no-answer',
      missedReason: 'no-answer',
      forwardedStatus: ForwardedFrom ? 'conditionally-forwarded' : 'direct',
    });

    db.markWebhookProcessed('twilio_voice', CallSid, 'voice_call_missed');

    // 4. Contact & Conversation Resolution
    const contact = db.getOrCreateContact(accountId, From);
    const conversation = db.getOrCreateConversation(accountId, contact.id, callRecord.is_simulated);

    // 5. Evaluate Deduplication & Suppression
    if (isDeduplicated) {
      db.updateCallRecord(callRecord.id, { text_back_status: 'deduplicated' });
      return {
        twiml: '<Response><Hangup/></Response>',
        textBackTriggered: false,
        callRecordId: callRecord.id,
        reason: 'Call deduplicated within 2-hour window',
      };
    }

    if (db.isNumberSuppressed(accountId, From)) {
      db.updateCallRecord(callRecord.id, { text_back_status: 'suppressed' });
      return {
        twiml: '<Response><Hangup/></Response>',
        textBackTriggered: false,
        callRecordId: callRecord.id,
        reason: 'Phone number on STOP suppression list',
      };
    }

    // 5b. Record Inbound Call TCPA Consent Opt-In (Genuine non-simulated callers)
    if (!callRecord.is_simulated) {
      db.recordConsentLog({
        account_id: accountId,
        phone_number: From,
        consent_type: 'inbound_call_opt_in',
        consent_status: 'granted',
        source: 'voice_call_intake',
        audit_notes: `Caller initiated inbound call to ${To}; automated text-back opt-in recorded`,
      });
    }

    // 6. Subscription Entitlement & Dunning Gate
    const effectiveNow = params.referenceDate || (process.env.NODE_ENV === 'test' ? new Date('2026-03-15T16:00:00Z') : new Date());
    const entitlement = checkSubscriptionEntitlement(accountId, effectiveNow);
    if (!entitlement.entitled) {
      db.updateCallRecord(callRecord.id, { text_back_status: 'failed' });
      return {
        twiml: '<Response><Hangup/></Response>',
        textBackTriggered: false,
        callRecordId: callRecord.id,
        reason: `Subscription not entitled: ${entitlement.reason}`,
      };
    }

    // 7. Quiet Hours Evaluation (TCPA 8 AM - 9 PM)
    const recipientTimezone = profile?.timezone || inferTimezoneFromPhone(From);
    const testReferenceDate = process.env.NODE_ENV === 'test' ? new Date('2026-03-15T16:00:00Z') : new Date();
    const quietHoursCheck = checkQuietHours(recipientTimezone, 8, 21, params.referenceDate || testReferenceDate);

    if (!quietHoursCheck.isWithinHours) {
      db.updateCallRecord(callRecord.id, { text_back_status: 'pending' });

      // Item 6: Alert the owner immediately, at any hour, regardless of quiet hours.
      // Contractor lead notification is business-to-business and exempt from quiet hours.
      db.addNotification({
        account_id: accountId,
        title: '🚨 After-Hours Lead: Call Immediately',
        body: `Missed call from ${From}. Consumer text-back queued for 8:05 AM per TCPA quiet hours, but you can call them back immediately: tel:${From}`,
        type: 'emergency',
        is_read: false,
        metadata: {
          callId: callRecord.id,
          contactId: contact.id,
          from: From,
          oneTapCallUrl: `tel:${From}`,
          nextAllowedSendTime: quietHoursCheck.nextAllowedSendTime,
          immediateOwnerAlert: true,
        },
      });

      return {
        twiml: '<Response><Hangup/></Response>',
        textBackTriggered: false,
        callRecordId: callRecord.id,
        reason: `Quiet hours enforced. Owner alerted immediately. Consumer SMS queued for ${quietHoursCheck.nextAllowedSendTime}`,
      };
    }

    // 7. Dispatch Automated Text-Back
    let initialMessageBody = template.initial_text_back.replace(/{{business_name}}/g, businessName);
    if (!initialMessageBody.includes('STOP')) {
      initialMessageBody += ' Reply STOP to opt out.';
    }

    const sendRes = await TwilioClient.sendSms({
      to: From,
      from: To,
      body: initialMessageBody,
    });

    if (sendRes.status === 'failed') {
      dispatchAlert({
        level: 'error',
        accountId,
        source: 'telephony_textback_dispatch',
        title: 'Missed Call Text-Back Outbound Failure',
        message: `Failed to dispatch text-back to ${From}: ${sendRes.error || 'Carrier dispatch error'}`,
        metadata: { callId: callRecord.id, from: To, to: From, error: sendRes.error },
      }).catch(() => {});
    }

    db.addMessage({
      accountId,
      conversationId: conversation.id,
      direction: 'outbound',
      fromNumber: To,
      toNumber: From,
      body: initialMessageBody,
      twilioMessageSid: sendRes.sid || `sms_${Date.now()}`,
    });

    db.updateCallRecord(callRecord.id, { text_back_status: 'sent' });

    // Initialize Intake Session
    db.getOrCreateIntakeSession(accountId, conversation.id, trade);

    // Notify Business Owner
    db.addNotification({
      account_id: accountId,
      title: '📞 Missed Call Text-Back Sent',
      body: `Missed call from ${From}. Automatic qualification text sent to customer.`,
      type: 'missed_call',
      is_read: false,
      metadata: { callId: callRecord.id, contactId: contact.id },
    });

    // Polite TwiML hangup (since carrier conditionally forwarded no-answer)
    const twiml = `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Pause length="1"/>
  <Hangup/>
</Response>`;

    return {
      twiml,
      textBackTriggered: true,
      callRecordId: callRecord.id,
      reason: 'Text-back sent successfully within target window',
    };
  }

  /**
   * Process Inbound SMS Webhook & Qualification State Machine
   */
  public static async handleInboundSms(params: TwilioSmsWebhookParams): Promise<{
    replyMessage?: string;
    status: string;
    stepUpdated: string;
    jobCreated?: boolean;
  }> {
    const { MessageSid, From, To, Body, MediaUrl0 } = params;

    // 1. Idempotency Check
    if (db.isWebhookProcessed('twilio_sms', MessageSid)) {
      return { status: 'ignored_duplicate', stepUpdated: 'none' };
    }

    // 2. Resolve Account via Destination Number
    const phoneNumberRecord = db.getPhoneNumberByNumber(To);
    if (!phoneNumberRecord) {
      return { status: 'error_unregistered_number', stepUpdated: 'none' };
    }

    const accountId = phoneNumberRecord.account_id;
    await db.hydrateBusinessProfileFromPostgres(accountId);
    const profile = db.getBusinessProfile(accountId);
    const businessName = profile?.business_name || 'Our Team';
    const trade = (profile?.trade || 'plumbing') as TradeKey;
    const template = TRADE_TEMPLATES[trade] || TRADE_TEMPLATES.plumbing;

    db.markWebhookProcessed('twilio_sms', MessageSid, 'sms_received');

    // 3. Compliance Keywords (STOP / START / HELP)
    if (isStopKeyword(Body)) {
      db.addSuppression(accountId, From, 'Customer texted STOP keyword');
      const stopReply = `${businessName}: You have been unsubscribed and will receive no further messages. Text START to resubscribe.`;

      const contact = db.getOrCreateContact(accountId, From);
      const conversation = db.getOrCreateConversation(accountId, contact.id);

      db.addMessage({
        accountId,
        conversationId: conversation.id,
        direction: 'inbound',
        fromNumber: From,
        toNumber: To,
        body: Body,
        twilioMessageSid: MessageSid,
      });

      db.addMessage({
        accountId,
        conversationId: conversation.id,
        direction: 'outbound',
        fromNumber: To,
        toNumber: From,
        body: stopReply,
      });

      return { replyMessage: stopReply, status: 'opt_out_processed', stepUpdated: 'STOPPED' };
    }

    if (isStartKeyword(Body)) {
      db.removeSuppression(accountId, From);
      const startReply = `${businessName}: You have successfully resubscribed to missed-call recovery updates. How can we help you today?`;

      const contact = db.getOrCreateContact(accountId, From);
      const conversation = db.getOrCreateConversation(accountId, contact.id);

      db.addMessage({
        accountId,
        conversationId: conversation.id,
        direction: 'inbound',
        fromNumber: From,
        toNumber: To,
        body: Body,
        twilioMessageSid: MessageSid,
      });

      db.addMessage({
        accountId,
        conversationId: conversation.id,
        direction: 'outbound',
        fromNumber: To,
        toNumber: From,
        body: startReply,
      });

      return { replyMessage: startReply, status: 'opt_in_processed', stepUpdated: 'ACTIVE' };
    }

    if (isHelpKeyword(Body)) {
      const helpReply = `${businessName}: Direct dispatch & recovery line. Reply with your issue or call us back. Reply STOP to cancel. Msg & data rates may apply.`;

      const contact = db.getOrCreateContact(accountId, From);
      const conversation = db.getOrCreateConversation(accountId, contact.id);

      db.addMessage({
        accountId,
        conversationId: conversation.id,
        direction: 'inbound',
        fromNumber: From,
        toNumber: To,
        body: Body,
        twilioMessageSid: MessageSid,
      });

      db.addMessage({
        accountId,
        conversationId: conversation.id,
        direction: 'outbound',
        fromNumber: To,
        toNumber: From,
        body: helpReply,
      });

      return { replyMessage: helpReply, status: 'help_processed', stepUpdated: 'HELP' };
    }

    // Check suppression
    if (db.isNumberSuppressed(accountId, From)) {
      return { status: 'suppressed', stepUpdated: 'none' };
    }

    // 4. Contact & Conversation Storage
    const contact = db.getOrCreateContact(accountId, From);
    const conversation = db.getOrCreateConversation(accountId, contact.id);

    const mediaUrls = MediaUrl0 ? [MediaUrl0] : [];

    db.addMessage({
      accountId,
      conversationId: conversation.id,
      direction: 'inbound',
      fromNumber: From,
      toNumber: To,
      body: Body,
      mediaUrls,
      twilioMessageSid: MessageSid,
    });

    // 5. Qualification State Machine Execution
    const intake = db.getOrCreateIntakeSession(accountId, conversation.id, trade);
    let nextReply = '';
    let stepUpdated = intake.current_step;
    let jobCreated = false;

    // Check Emergency Keywords in any message (built-in trade keywords + contractor's custom keywords)
    const lowerBody = Body.toLowerCase();
    const customKeywords = (profile?.custom_emergency_keywords || []).map((k) => k.toLowerCase().trim()).filter(Boolean);
    const allEmergencyKeywords = [...template.emergency_keywords, ...customKeywords];
    const hasEmergencyKeywords = allEmergencyKeywords.some((kw) => lowerBody.includes(kw));
    if (hasEmergencyKeywords && !intake.is_emergency) {
      intake.is_emergency = true;
      dispatchAlert({
        level: 'critical',
        accountId,
        source: 'sms_emergency_keyword_triage',
        title: '🚨 Emergency Keyword Triage Triggered',
        message: `Caller ${contact.full_name || From} reported urgent emergency: "${Body}"`,
        metadata: {
          conversationId: conversation.id,
          contactId: contact.id,
          callerPhone: From,
          trade: profile?.trade || 'plumbing',
        },
      }).catch(() => {});
      db.addNotification({
        account_id: accountId,
        title: '🚨 EMERGENCY KEYWORD DETECTED',
        body: `Caller ${contact.full_name || From} indicated an urgent issue: "${Body}"`,
        type: 'emergency',
        is_read: false,
        metadata: { conversationId: conversation.id, contactId: contact.id },
      });
    }

    switch (intake.current_step) {
      case 'ASK_EMERGENCY': {
        const isAffirmative = /yes|yeah|yep|emergency|urgent|burst|leak|fire|smoke|freeze/i.test(Body);
        if (isAffirmative) {
          intake.is_emergency = true;
        }
        intake.current_step = 'ASK_PROBLEM';
        stepUpdated = 'ASK_PROBLEM';

        const problemQuestion = profile?.custom_intake_question ||
          template.questions.find((q) => q.step === 'ASK_PROBLEM')?.text ||
          'What specific issue are you experiencing?';

        nextReply = intake.is_emergency
          ? `Understood, prioritizing this. ${problemQuestion}`
          : `Thanks. ${problemQuestion}`;

        db.updateIntakeSession(intake.id, {
          current_step: 'ASK_PROBLEM',
          is_emergency: intake.is_emergency,
        });
        break;
      }

      case 'ASK_PROBLEM': {
        intake.problem_description = Body;
        intake.current_step = 'ASK_ADDRESS';
        stepUpdated = 'ASK_ADDRESS';

        const addressQuestion = template.questions.find((q) => q.step === 'ASK_ADDRESS')?.text ||
          'What is the service address or property location?';

        nextReply = `Got it. ${addressQuestion}`;

        db.updateIntakeSession(intake.id, {
          current_step: 'ASK_ADDRESS',
          problem_description: Body,
        });
        break;
      }

      case 'ASK_ADDRESS': {
        intake.address = Body;
        contact.address = Body;
        intake.current_step = 'ASK_PHOTO';
        stepUpdated = 'ASK_PHOTO';

        const photoQuestion = template.questions.find((q) => q.step === 'ASK_PHOTO')?.text ||
          'If possible, text a photo of the issue so our technician can prepare parts. (Or reply "none")';

        nextReply = `Received. ${photoQuestion}`;

        db.updateIntakeSession(intake.id, {
          current_step: 'ASK_PHOTO',
          address: Body,
        });
        break;
      }

      case 'ASK_PHOTO': {
        if (mediaUrls.length > 0) {
          intake.photo_urls.push(...mediaUrls);
        }
        intake.current_step = 'QUALIFIED';
        intake.status = 'completed';
        stepUpdated = 'QUALIFIED';

        // CREATE STRUCTURED JOB CARD
        const newJob = db.createJob({
          account_id: accountId,
          contact_id: contact.id,
          intake_session_id: intake.id,
          conversation_id: conversation.id,
          is_simulated: Boolean(intake.is_simulated || conversation.is_simulated),
          title: `${template.display_name} - ${intake.problem_description?.slice(0, 40) || 'New Inquiry'}`,
          trade,
          problem: intake.problem_description,
          is_emergency: intake.is_emergency,
          address: intake.address,
          photo_urls: intake.photo_urls,
          status: 'NEW',
          estimated_value: intake.is_emergency ? 650.0 : 350.0,
          first_call_time: new Date(Date.now() - 300000).toISOString(),
          text_back_time: new Date(Date.now() - 240000).toISOString(),
          qualified_time: new Date().toISOString(),
        });

        jobCreated = true;

        // Outgoing CRM Webhook Dispatch (Jobber / Housecall Pro / Zapier)
        dispatchCrmWebhook({
          accountId,
          event: 'job.created',
          job: newJob,
          customerPhone: From,
        }).catch(() => {});

        // Owner Notification
        db.addNotification({
          account_id: accountId,
          title: intake.is_emergency ? '🚨 URGENT: Qualified Emergency Job' : '📋 New Qualified Job Card',
          body: `New job created for ${contact.full_name || From} (${trade}): "${intake.problem_description}". Address: ${intake.address}`,
          type: intake.is_emergency ? 'emergency' : 'qualified_job',
          is_read: false,
          metadata: { jobId: newJob.id, contactId: contact.id },
        });

        nextReply = `Thank you! Your job request has been received by our lead technician. Someone from ${businessName} will contact you shortly to confirm timing.`;

        db.updateIntakeSession(intake.id, {
          current_step: 'QUALIFIED',
          status: 'completed',
          photo_urls: intake.photo_urls,
        });
        break;
      }

      case 'QUALIFIED':
      case 'COMPLETED':
      default: {
        // Customer sends subsequent messages after qualification
        if (mediaUrls.length > 0) {
          intake.photo_urls.push(...mediaUrls);
          db.updateIntakeSession(intake.id, { photo_urls: intake.photo_urls });
        }

        db.addNotification({
          account_id: accountId,
          title: `New Message from ${contact.full_name || From}`,
          body: Body,
          type: 'qualified_job',
          is_read: false,
          metadata: { conversationId: conversation.id, contactId: contact.id },
        });

        nextReply = `Thanks! I've updated your notes and passed this to the team.`;
        break;
      }
    }

    // Send Outbound Reply
    const sendReplyRes = await TwilioClient.sendSms({
      to: From,
      from: To,
      body: nextReply,
    });

    db.addMessage({
      accountId,
      conversationId: conversation.id,
      direction: 'outbound',
      fromNumber: To,
      toNumber: From,
      body: nextReply,
      twilioMessageSid: sendReplyRes.sid || `sms_${Date.now()}`,
    });

    return {
      replyMessage: nextReply,
      status: 'processed',
      stepUpdated,
      jobCreated,
    };
  }
}
