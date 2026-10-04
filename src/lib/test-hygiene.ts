import { db } from '@/db/repository';
import { TradeKey, Account, BusinessProfile, PhoneNumber } from '@/types';

/**
 * TestFixtureTracker
 * 
 * Manages test fixture tenants to ensure that every test suite leaves the database
 * exactly as it found it.
 * 
 * Rules enforced:
 * 1. Exact ID recording: Every created account ID is captured at point of creation.
 * 2. Exact ID deletion: Deletions only target explicitly tracked IDs, never patterns or broad matchers.
 * 3. Cascade cleanup: Automatically removes child profiles, credentials, phone numbers, and logs.
 * 4. Signup route integration: Captures and tracks account IDs returned from onboarding/signup endpoints.
 */
export class TestFixtureTracker {
  private trackedAccountIds: Set<string> = new Set();

  /**
   * Records an explicit account ID to be cleaned up at suite completion.
   */
  public trackAccountId(id: string): string {
    if (!id || typeof id !== 'string') {
      throw new Error('[TestFixtureTracker] Cannot track invalid or empty account ID');
    }
    if (id.includes('%') || id.includes('*') || id.includes('?')) {
      throw new Error(`[TestFixtureTracker] Cannot track pattern or wildcard ID: "${id}"`);
    }
    const cleanId = id.trim();
    this.trackedAccountIds.add(cleanId);
    return cleanId;
  }

  /**
   * Helper that creates an account via db.createAccount and automatically records its ID.
   */
  public createAccount(
    name: string,
    trade: TradeKey,
    phone: string,
    ownerName: string = 'Test Owner',
    carrierName: string = 'Verizon Wireless'
  ): { account: Account; profile: BusinessProfile; phoneNumber: PhoneNumber } {
    const created = db.createAccount(name, trade, phone, ownerName, carrierName);
    this.trackAccountId(created.account.id);
    return created;
  }

  /**
   * Captures and records the account ID from an onboarding / signup route response payload.
   */
  public recordSignupResponse(responseBody: any): string {
    const accountId = responseBody?.account?.id || responseBody?.accountId || responseBody?.id;
    if (!accountId || typeof accountId !== 'string') {
      throw new Error(
        `[TestFixtureTracker] Failed to extract account ID from signup response: ${JSON.stringify(responseBody)}`
      );
    }
    return this.trackAccountId(accountId);
  }

  /**
   * Returns list of currently tracked fixture account IDs.
   */
  public getTrackedAccountIds(): string[] {
    return Array.from(this.trackedAccountIds);
  }

  /**
   * Deletes exactly the tracked IDs from the database, leaving all customer rows intact.
   * Returns the count of accounts deleted.
   */
  public cleanup(): number {
    let deletedCount = 0;
    for (const accountId of this.trackedAccountIds) {
      const deleted = db.deleteAccount(accountId);
      if (deleted) {
        deletedCount++;
      }
    }
    this.trackedAccountIds.clear();
    return deletedCount;
  }
}

/**
 * Creates a new TestFixtureTracker instance.
 */
export function createFixtureTracker(): TestFixtureTracker {
  return new TestFixtureTracker();
}

/**
 * Asserts database account count matches an expected value.
 */
export function assertAccountCount(expected: number, message?: string): void {
  const current = db.getAccountCount();
  if (current !== expected) {
    throw new Error(
      message || `[Test Hygiene Violation] Expected ${expected} accounts in DB, found ${current}`
    );
  }
}
