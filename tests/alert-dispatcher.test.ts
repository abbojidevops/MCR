(process.env as any).NODE_ENV = 'test';

import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchAlert, isAlertDispatcherActive } from '@/lib/alert-dispatcher';
import { db } from '@/db/repository';

test('ALERT-1: Alert Dispatcher Service Liveness', () => {
  assert.equal(isAlertDispatcherActive(), true, 'Alert dispatcher must be active');
});

test('ALERT-2: Emergency Critical Alert Dispatches and Logs Audit Record', async () => {
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

  // Verify in audit logs
  const audits = (db as any).state.auditLogs;
  const logged = audits.find((a: any) => a.action === 'ALERT_DISPATCHED' && a.details?.alertId === result.alertId);
  assert.ok(logged, 'Audit log entry must be recorded');
  assert.equal(logged.details.level, 'critical');
  assert.equal(logged.details.title, 'Emergency Keyword Detected: Gas Smell');
});

test('ALERT-3: System Exception Alert Handling', async () => {
  const result = await dispatchAlert({
    level: 'error',
    source: 'twilio_webhook_engine',
    title: 'Twilio Downstream Timeout Exception',
    message: 'ETIMEDOUT on Twilio REST API dispatch call',
    metadata: { attempt: 3, latencyMs: 5012 },
  });

  assert.equal(result.dispatched, true);
  assert.ok(result.alertId);
});
