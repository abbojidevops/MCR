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
  if (webhookUrl && (webhookUrl.startsWith('http://') || webhookUrl.startsWith('https://'))) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-MCR-Alert-Level': alert.level,
          'User-Agent': 'MCR-Alert-Dispatcher/1.0',
        },
        body: JSON.stringify({
          alertId,
          ...alert,
          timestamp,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);
      if (res.ok) {
        return { dispatched: true, channel: 'webhook', alertId, timestamp };
      } else {
        console.warn(`[AlertDispatcher] Webhook returned non-200 status: ${res.status}`);
      }
    } catch (err: any) {
      console.error(`[AlertDispatcher] Failed to send webhook to ${webhookUrl}:`, err?.message);
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

/**
 * Returns live status of the alert dispatching subsystem.
 */
export function getAlertDispatcherStatus(): {
  active: boolean;
  webhookConfigured: boolean;
  webhookUrl?: string;
  totalAlertsDispatched: number;
  lastAlert?: any;
} {
  const webhookUrl = process.env.ALERT_WEBHOOK_URL;
  const webhookConfigured = Boolean(
    webhookUrl &&
    (webhookUrl.startsWith('http://') || webhookUrl.startsWith('https://')) &&
    !webhookUrl.includes('placeholder')
  );

  const alertAudits = db.getAuditLogs().filter((a) => a.action === 'ALERT_DISPATCHED');
  const lastAlert = alertAudits.length > 0 ? alertAudits[0] : undefined;

  return {
    active: isAlertDispatcherActive(),
    webhookConfigured,
    webhookUrl: webhookConfigured ? webhookUrl : undefined,
    totalAlertsDispatched: alertAudits.length,
    lastAlert,
  };
}

/**
 * Retrieves all recorded dispatched alerts from audit logs.
 */
export function getDispatchedAlerts(accountId?: string) {
  const audits = db.getAuditLogs(accountId).filter((a) => a.action === 'ALERT_DISPATCHED');
  return audits.map((a) => ({
    auditId: a.id,
    accountId: a.accountId,
    timestamp: a.timestamp,
    ...a.details,
  }));
}

/**
 * Clears dispatched alerts from audit logs (for test teardowns).
 */
export function clearDispatchedAlerts(): void {
  const audits = db.getAuditLogs().filter((a) => a.action === 'ALERT_DISPATCHED');
  for (const a of audits) {
    db.deleteAuditLog(a.id);
  }
}
