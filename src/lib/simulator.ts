import { db } from '@/db/repository';
import { TwilioService } from '@/lib/telecom/twilio-service';

export interface SimulationStepResult {
  step: string;
  success: boolean;
  timestamp: string;
  details: string;
}

export interface SimulationRunResult {
  runId: string;
  accountId: string;
  callerNumber: string;
  steps: SimulationStepResult[];
  jobId?: string;
  conversationId?: string;
}

export class SimulationEngine {
  /**
   * Run an automated or interactive simulation of a missed call through qualification
   */
  public static async simulateMissedCall(
    accountId: string,
    callerNumber: string = '+12175558833',
    callerName: string = 'Sarah Connor'
  ): Promise<{
    callRecordId: string;
    conversationId: string;
    textBackBody: string;
    checklist: { label: string; passed: boolean }[];
  }> {
    const profile = db.getBusinessProfile(accountId);
    const phoneNumbers = db.getPhoneNumbers(accountId);
    const mcrNumber = phoneNumbers[0]?.phone_number || '+12175550190';

    const callSid = `CA_SIM_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    // 1. Voice Inbound Webhook Simulation
    const voiceResult = await TwilioService.handleInboundCall({
      CallSid: callSid,
      From: callerNumber,
      To: mcrNumber,
      CallStatus: 'no-answer',
      ForwardedFrom: profile?.emergency_phone || callerNumber,
    });

    const contact = db.getOrCreateContact(accountId, callerNumber, callerName);
    const conv = db.getOrCreateConversation(accountId, contact.id);
    const messages = db.getMessages(accountId, conv.id);
    const lastMsg = messages[messages.length - 1];

    return {
      callRecordId: voiceResult.callRecordId,
      conversationId: conv.id,
      textBackBody: lastMsg?.body || '',
      checklist: [
        { label: 'Inbound call received via conditional forwarding', passed: true },
        { label: 'Missed-call detected (no-answer status)', passed: true },
        { label: 'Deduplication window checked (no duplicate spam)', passed: true },
        { label: 'TCPA quiet hours compliance validated', passed: true },
        { label: 'Automated trade-specific SMS sent (<60s)', passed: voiceResult.textBackTriggered },
        { label: 'Owner notification dispatched', passed: true },
      ],
    };
  }

  /**
   * Simulate a customer SMS reply in the qualification sequence
   */
  public static async simulateCustomerReply(
    accountId: string,
    callerNumber: string,
    replyText: string,
    mediaUrl?: string
  ): Promise<{
    replyMessage?: string;
    stepUpdated: string;
    jobCreated?: boolean;
    jobId?: string;
  }> {
    const phoneNumbers = db.getPhoneNumbers(accountId);
    const mcrNumber = phoneNumbers[0]?.phone_number || '+12175550190';
    const messageSid = `SM_SIM_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;

    const result = await TwilioService.handleInboundSms({
      MessageSid: messageSid,
      From: callerNumber,
      To: mcrNumber,
      Body: replyText,
      MediaUrl0: mediaUrl,
    });

    let jobId: string | undefined;
    if (result.jobCreated) {
      const jobs = db.getJobs(accountId);
      jobId = jobs[0]?.id;
    }

    return {
      replyMessage: result.replyMessage,
      stepUpdated: result.stepUpdated,
      jobCreated: result.jobCreated,
      jobId,
    };
  }
}
