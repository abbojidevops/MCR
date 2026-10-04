import { db } from '@/db/repository';

export interface EntitlementResult {
  entitled: boolean;
  status: string;
  reason?: string;
  planId?: string;
  cancelAtPeriodEnd?: boolean;
  periodEnd?: string;
}

export interface GatedOperation<T = any> {
  id: string;
  type: string;
  payload?: T;
}

export interface DrainBlockedItem<T = any> {
  item: T;
  reason: string;
  blockedAt: string;
}

export interface DrainResult<T = any> {
  accountId: string;
  entitled: boolean;
  processed: T[];
  blocked: DrainBlockedItem<T>[];
  timestamp: string;
}

/**
 * Check if an account is entitled to perform business operations (text-backs, voice recovery, dispatch).
 * Evaluates:
 * 1. Subscription existence
 * 2. Subscription status ('active' | 'trialing' vs 'past_due' | 'canceled' | 'unpaid')
 * 3. Cancellation at period end: works until current_period_end, stops after.
 */
export function checkSubscriptionEntitlement(
  accountId: string,
  now: Date = new Date()
): EntitlementResult {
  const subInfo = db.getSubscription(accountId);
  const subscription = subInfo?.subscription;

  if (!subscription) {
    return {
      entitled: false,
      status: 'no_subscription',
      reason: 'No subscription record found for account',
    };
  }

  const { status, plan_id, cancel_at_period_end, current_period_end } = subscription;

  // 1. Definite inactive statuses
  if (status === 'canceled') {
    return {
      entitled: false,
      status: 'canceled',
      reason: 'Subscription is canceled',
      planId: plan_id,
    };
  }

  if (status === 'unpaid') {
    return {
      entitled: false,
      status: 'unpaid',
      reason: 'Subscription is unpaid',
      planId: plan_id,
    };
  }

  if (status === 'past_due') {
    return {
      entitled: false,
      status: 'past_due',
      reason: 'Subscription payment failed (past_due dunning status)',
      planId: plan_id,
    };
  }

  if (status === 'paused') {
    return {
      entitled: false,
      status: 'paused',
      reason: 'Subscription is paused',
      planId: plan_id,
    };
  }

  // 2. Active or trialing
  if (status === 'active' || status === 'trialing') {
    // If cancellation was scheduled at period end, check if period has elapsed
    if (cancel_at_period_end) {
      if (current_period_end) {
        const periodEndDate = new Date(current_period_end);
        if (now.getTime() > periodEndDate.getTime()) {
          return {
            entitled: false,
            status: 'period_ended',
            reason: `Subscription cancellation took effect on period end (${current_period_end})`,
            planId: plan_id,
            cancelAtPeriodEnd: true,
            periodEnd: current_period_end,
          };
        }
      }

      // Within active cancellation grace period: still entitled
      return {
        entitled: true,
        status,
        planId: plan_id,
        cancelAtPeriodEnd: true,
        periodEnd: current_period_end,
      };
    }

    return {
      entitled: true,
      status,
      planId: plan_id,
      cancelAtPeriodEnd: false,
      periodEnd: current_period_end,
    };
  }

  return {
    entitled: false,
    status: status || 'unknown',
    reason: `Unknown subscription status: ${status}`,
    planId: plan_id,
  };
}

/**
 * Boolean shortcut helper
 */
export function isAccountEntitled(accountId: string, now: Date = new Date()): boolean {
  return checkSubscriptionEntitlement(accountId, now).entitled;
}

/**
 * Process a queue or batch of operations against subscription entitlement.
 * When subscription is NOT active, operations are NOT silently continued or dropped;
 * they are reported in blocked[] with the honest dunning / termination reason.
 */
export async function drainQueue<T>(
  accountId: string,
  items: T[],
  processFn?: (item: T) => Promise<any> | any,
  now: Date = new Date()
): Promise<DrainResult<T>> {
  const entitlement = checkSubscriptionEntitlement(accountId, now);
  const timestamp = now.toISOString();

  if (!entitlement.entitled) {
    const reason = entitlement.reason || 'Subscription inactive';
    const blocked: DrainBlockedItem<T>[] = items.map((item) => ({
      item,
      reason,
      blockedAt: timestamp,
    }));

    return {
      accountId,
      entitled: false,
      processed: [],
      blocked,
      timestamp,
    };
  }

  // Entitled: process all items
  const processed: T[] = [];
  for (const item of items) {
    if (processFn) {
      await processFn(item);
    }
    processed.push(item);
  }

  return {
    accountId,
    entitled: true,
    processed,
    blocked: [],
    timestamp,
  };
}
