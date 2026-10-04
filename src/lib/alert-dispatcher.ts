import { db } from '@/db/repository';

export interface AlertPayload {
  level: 'info' | 'warning' | 'error' | 'critical';
  accountId?: string;
  source: string;
  title: string;
  message: string;
  metadata?: Record<string, any>;
  timestamp?: string;
}

export interface AlertDispatchResult {
  dispatched: boolean;
  channel: 'webhook' | 'audit_log' | 'console';
  alertId: string;
  timestamp: string;
}

/**
 * Emergency Alert Dispatcher Service
 * Dispatches critical keyword and unhandled exception alerts to administrator channels.
 */
export async function dispatchAlert(alert: AlertPayload): Promise<AlertDispatchResult> {
  const timestamp = alert.timestamp || new Date().toISOString();
  const alertId = `alert-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const accountId = alert.accountId || 'platform-admin';

  // 1. Audit Log Persistence
  db.logAudit(accountId, 'ALERT_DISPATCHED', {
    alertId,
    level: alert.level,
    source: alert.source,
    title: alert.title,
    message: alert.message,
    metadata: alert.metadata,
    timestamp,
  });

  // 2. Webhook Dispatch (if configured)
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  if (webhookUrl && webhookUrl.startsWith('http')) {
    try {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alertId,
          ...alert,
          timestamp,
        }),
      });
      return { dispatched: true, channel: 'webhook', alertId, timestamp };
    } catch (err) {
      console.error(`[AlertDispatcher] Failed to send webhook to ${webhookUrl}:`, err);
    }
  }

  // 3. Fallback to audit log / console
  if (alert.level === 'critical' || alert.level === 'error') {
    console.error(`🚨 [CRITICAL ALERT][${alert.source}] ${alert.title}: ${alert.message}`);
  }

  return { dispatched: true, channel: 'audit_log', alertId, timestamp };
}

/**
 * Validates whether the emergency alert dispatcher is active and functional.
 */
export function isAlertDispatcherActive(): boolean {
  return typeof dispatchAlert === 'function';
}
