# Test Hygiene & Database Invariance Guide

> **Core Invariant**: A test suite must never move a gate simply by running. The full suite must leave the database exactly as it found it.

---

## 1. Why This Exists (The Hard Lesson)

In this project, two test suites previously leaked fixture state into shared storage:
- **False Pass**: One suite left fixture state behind that caused a downstream launch gate to report `PASS` unconditionally for every subsequent test.
- **False Alarm**: 39 leftover fixture tenants accumulated in the database, causing another gate to falsely report that real customers were blocked from logging in.

When test fixtures leak into shared storage or when test files run concurrently against a shared database, every subsequent measurement is corrupted.

---

## 2. The Five Rules of Test Hygiene

### Rule 1: Exact ID Deletion at End of File
Every suite that creates a tenant must delete **exactly the IDs it created**, at the end of the file (via `test.after(...)`).
- Deletions must cascade to all child entities: profiles, phone numbers, credentials, subscriptions, usage, jobs, conversations, messages, and audit logs.
- Never rely on another test to clean up for you.

### Rule 2: Never Use Patterns or Broad WHERE Clauses
- **FORBIDDEN**: `DELETE FROM accounts WHERE name LIKE 'test%'` or `WHERE is_demo = false`.
- **MANDATORY**: Explicit, exact IDs only (`db.deleteAccount('acc-specific-id')`). Broad queries risk matching and corrupting real customer data.

### Rule 3: Record Fixture IDs with the Creation Helper
All fixture creation must be tracked through `TestFixtureTracker` (`src/lib/test-hygiene.ts`):
- When creating directly: `tracker.createAccount(...)` captures the ID automatically.
- When creating through routes (such as `POST /api/onboarding`): the route response payload must be captured with `tracker.recordSignupResponse(responseBody)`.

```typescript
import { createFixtureTracker } from '@/lib/test-hygiene';
import test from 'node:test';

const tracker = createFixtureTracker();

test('My Test: Tenant Creation via Signup', async () => {
  const res = await onboardingHandler(req);
  const body = await res.clone().json();
  
  // Capture fixture account ID
  const accountId = tracker.recordSignupResponse(body);
  // ... run assertions ...
});

// Suite Teardown: Clean up exactly the tracked IDs
test.after(() => {
  tracker.cleanup();
});
```

### Rule 4: Verify Multi-Table & Gate Stability Invariance in CI
CI runs `npm run test:hygiene`, which enforces two strict invariants:
1. **Multi-Table Row Count Invariance**:
   Snapshots row counts and IDs across all seven tables written by the suite:
   - `accounts`
   - `credentials`
   - `compliance`
   - `jobs`
   - `conversations`
   - `calls`
   - `consentLogs`
   Asserts `countAfter === countBefore` for every table and proves that zero baseline rows were lost and zero fixture rows leaked.
2. **Gate Stability Invariance**:
   Captures `evaluateLaunchGates()` before and after running the suite.
   Asserts that no gate's status changed (e.g. `failed -> passed` or `passed -> failed`) as a result of running tests. Leftover fixtures that green a gate are caught and fail CI immediately.

If any table count changes or any gate moves status, the build fails immediately.

### Rule 5: Concurrency = 1 for Shared Database Suites
When test suites share a database (whether in-memory state or PostgreSQL):
- Tests **must run with concurrency = 1** (`--test-concurrency=1`).
- In parallel execution, one test file's temporary fixtures land inside another test file's measurement window, corrupting isolated metrics, revenue rollups, and isolation assertions.

---

## 3. Quick Reference Commands

| Command | Description |
| :--- | :--- |
| `npm test` | Runs all 13 test suites with `--test-concurrency=1`. |
| `npm run test:hygiene` | Runs the full suite wrapped in the CI account-count invariance check. |
| `npm run db:reset` | Restores local repository state to clean seed data (`acc-apex-plumbing`, `acc-coolbreeze-hvac`). |
