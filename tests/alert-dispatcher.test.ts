(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { NextRequest } from 'next/server';
import http from 'http';
import {
  dispatchAlert,
  isAlertDispatcherActive,
  getAlertDispatcherStatus,
  getDispatchedAlerts,
  clearDispatchedAlerts,
} from '@/lib/alert-dispatcher';
import { evaluateLaunchGates } from '@/lib/launch-gate';
import { POST as voiceWebhookPost } from '@/app/api/webhooks/twilio/voice/route';
import { POST as smsWebhookPost } from '@/app/api/webhooks/twilio/sms/route';

test('ALERT-1: Alert Dispatcher Service Liveness and Status Contract', () => {
  assert.equal(isAlertDispatcherActive(), true, 'Alert dispatcher service must be active');
  const status = getAlertDispatcherStatus();
  assert.equal(status.active, true, 'Status contract must report active');
  assert.equal(typeof status.webhookConfigured, 'boolean');
  assert.equal(typeof status.totalAlertsDispatched, 'number');
});

test('ALERT-2: Emergency Critical Alert Dispatches and Logs Audit Record', async () => {
  try {
    const result = await dispatchAlert({
      level: 'critical',
      accountId: 'acc-coolbreeze-hvac',
      source: 'intake_state_machine',
      title: 'Emergency Keyword Detected: Gas Smell',
      message: 'Customer reported smelling natural gas at residence. 911 disclaimer served.',
      metadata: {
        callerPhone: '+12175550199',
        jobId: 'job-emergency-101',
      },
    });

    assert.equal(result.dispatched, true, 'Alert must be recorded as dispatched');
    assert.ok(result.alertId, 'Alert ID must be generated');
    assert.ok(['audit_log', 'webhook'].includes(result.channel), 'Channel must be audit_log or webhook');

    // Verify in dispatched alerts query
    const alerts = getDispatchedAlerts('acc-coolbreeze-hvac');
    const logged = alerts.find((a: any) => a.alertId === result.alertId);
    assert.ok(logged, 'Audit log entry must be recorded');
    assert.equal(logged.level, 'critical');
    assert.equal(logged.title, 'Emergency Keyword Detected: Gas Smell');
    assert.equal(logged.source, 'intake_state_machine');
  } finally {
    clearDispatchedAlerts();
  }
});

test('ALERT-3: Webhook Delivery and Fallback Channel Handling', async () => {
  const originalWebhook = process.env.ALERT_WEBHOOK_URL;
  let receivedPayload: any = null;

  // Spin up temporary mock HTTP server
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      receivedPayload = JSON.parse(body);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: true }));
    });
  });

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  const address = server.address() as any;
  const mockUrl = `http://127.0.0.1:${address.port}/alerts`;

  try {
    process.env.ALERT_WEBHOOK_URL = mockUrl;

    const result = await dispatchAlert({
      level: 'error',
      accountId: 'acc-apex-plumbing',
      source: 'telephony_outbound_dispatch',
      title: 'Carrier Text-Back Dispatch Timeout',
      message: 'Carrier returned 504 Gateway Timeout on textback attempt',
      metadata: { attempt: 3 },
    });

    assert.equal(result.dispatched, true);
    assert.equal(result.channel, 'webhook', 'With valid endpoint, channel must be webhook');
    assert.ok(receivedPayload, 'Mock server must receive webhook POST');
    assert.equal(receivedPayload.title, 'Carrier Text-Back Dispatch Timeout');
    assert.equal(receivedPayload.level, 'error');
  } finally {
    server.close();
    if (originalWebhook) {
      process.env.ALERT_WEBHOOK_URL = originalWebhook;
    } else {
      delete process.env.ALERT_WEBHOOK_URL;
    }
    clearDispatchedAlerts();
  }
});

test('ALERT-4: Telephony Voice and SMS Webhook Security Alert Integration', async () => {
  const originalToken = process.env.TWILIO_AUTH_TOKEN;
  process.env.TWILIO_AUTH_TOKEN = 'test_auth_token_for_alert_testing';

  try {
    // 1. Forged Voice Webhook -> Triggers warning alert
    const voiceReq = new NextRequest(new URL('http://localhost:3001/api/webhooks/twilio/voice'), {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': 'invalid_forged_signature_123',
      }),
      body: 'CallSid=CA_test_forgery&From=%2B12175550199&To=%2B12175550190',
    });

    const voiceRes = await voiceWebhookPost(voiceReq);
    assert.equal(voiceRes.status, 403, 'Forged voice request must be refused 403');

    const voiceAlerts = getDispatchedAlerts();
    const voiceAlert = voiceAlerts.find((a: any) => a.source === 'twilio_voice_webhook');
    assert.ok(voiceAlert, 'Voice webhook forgery must dispatch security alert');
    assert.equal(voiceAlert.level, 'warning');

    // 2. Forged SMS Webhook -> Triggers warning alert
    const smsReq = new NextRequest(new URL('http://localhost:3001/api/webhooks/twilio/sms'), {
      method: 'POST',
      headers: new Headers({
        'content-type': 'application/x-www-form-urlencoded',
        'x-twilio-signature': 'invalid_forged_signature_456',
      }),
      body: 'MessageSid=SM_test_forgery&From=%2B12175550199&To=%2B12175550190&Body=Hello',
    });

    const smsRes = await smsWebhookPost(smsReq);
    assert.equal(smsRes.status, 403, 'Forged SMS request must be refused 403');

    const smsAlerts = getDispatchedAlerts();
    const smsAlert = smsAlerts.find((a: any) => a.source === 'twilio_sms_webhook');
    assert.ok(smsAlert, 'SMS webhook forgery must dispatch security alert');
    assert.equal(smsAlert.level, 'warning');
  } finally {
    process.env.TWILIO_AUTH_TOKEN = originalToken;
    clearDispatchedAlerts();
  }
});

test('ALERT-5: Gate 10 (error_alert_dispatch) Evaluation Dynamics', async () => {
  const originalWebhook = process.env.ALERT_WEBHOOK_URL;
  delete process.env.ALERT_WEBHOOK_URL;
  clearDispatchedAlerts();

  try {
    // 1. Initial state without webhook and without alerts -> Gate fails
    let report = evaluateLaunchGates();
    let gate = report.gates.find((g) => g.id === 'error_alert_dispatch')!;
    assert.ok(gate, 'error_alert_dispatch gate must exist');
    assert.equal(gate.isManual, false, 'Must be an automated gate');
    assert.equal(gate.status, 'failed', 'Without alerts or webhook, gate must report failed');
    assert.match(gate.statusReason, /Production alert escalation channel pending/i);

    // 2. Setting ALERT_WEBHOOK_URL -> Gate passes immediately
    process.env.ALERT_WEBHOOK_URL = 'https://alerts.missedcallrecovery.com/v1/inbound';
    report = evaluateLaunchGates();
    gate = report.gates.find((g) => g.id === 'error_alert_dispatch')!;
    assert.equal(gate.status, 'passed', 'With webhook configured, gate must pass');
    assert.match(gate.evidence?.details || '', /alerts\.missedcallrecovery\.com/);

    // 3. Unset webhook but dispatch live alert -> Gate passes on live telemetry
    delete process.env.ALERT_WEBHOOK_URL;
    const dispatched = await dispatchAlert({
      level: 'critical',
      accountId: 'acc-apex-plumbing',
      source: 'live_test_telemetry',
      title: 'Gas Smell Emergency Triage',
      message: 'Verified alert telemetry in test run',
    });

    report = evaluateLaunchGates();
    gate = report.gates.find((g) => g.id === 'error_alert_dispatch')!;
    assert.equal(gate.status, 'passed', 'With recorded alert in telemetry, gate must pass');
    assert.equal(gate.evidence?.tenantId, 'acc-apex-plumbing');
    assert.equal(gate.evidence?.recordId, dispatched.alertId);

    // 4. Clean up alerts -> Gate returns to failed
    clearDispatchedAlerts();
    report = evaluateLaunchGates();
    gate = report.gates.find((g) => g.id === 'error_alert_dispatch')!;
    assert.equal(gate.status, 'failed', 'After clearing alerts, gate returns to failed');
  } finally {
    if (originalWebhook) {
      process.env.ALERT_WEBHOOK_URL = originalWebhook;
    } else {
      delete process.env.ALERT_WEBHOOK_URL;
    }
    clearDispatchedAlerts();
  }
});
