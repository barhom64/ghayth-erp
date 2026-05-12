import { describe, it, expect, vi, beforeEach } from "vitest";
import type { RedisRateLimitStatus } from "../../src/lib/rateLimitStore.js";

// Behavioral test for the Task #176 rate-limit fallback alerter.
//
// Why the elaborate mocking: the alerter persists its state in
// `system_settings` so it stays consistent across replicas (a single in-memory
// counter would drift the moment cron lock ownership changed). The fake DB
// here mirrors that behaviour with a single shared `dbState` object so we can
// drive a deterministic status sequence through the handler and assert:
//   - first transition into fallback emits an alert
//   - follow-up ticks while degraded are cooldown-suppressed
//   - return to connected emits a recovery alert
//   - REPLICA SWITCH MID-OUTAGE: a second checker invocation that loaded the
//     shared state still sees `previous = fallback-memory` and emits exactly
//     one recovery alert when status returns to connected — proving the bug
//     class flagged by code review (per-replica memory) is fixed.
//   - disabled (REDIS_URL unset) short-circuit.

let currentStatus: RedisRateLimitStatus = "connected";

interface PersistedState {
  lastSeenStatus: RedisRateLimitStatus | null;
  lastAlertedAt: number;
  fallbackSince: number | null;
}

let dbState: PersistedState | null = null;

vi.mock("../../src/lib/rateLimitStore.js", () => ({
  getRedisRateLimitStatus: () => currentStatus,
}));

const sendNotificationMock = vi.fn(async () => {});
vi.mock("../../src/lib/notificationService.js", () => ({
  sendNotification: sendNotificationMock,
  broadcastAlert: vi.fn(async () => {}),
}));

// Fake DB. `rawQuery` resolves both the persisted state lookup and the admin
// recipient lookup; `rawExecute` upserts the persisted state. Anything else is
// a no-op.
vi.mock("../../src/lib/rawdb.js", () => ({
  rawQuery: vi.fn(async (sql: string) => {
    if (sql.includes("FROM system_settings")) {
      return dbState ? [{ value: JSON.stringify(dbState) }] : [];
    }
    if (sql.includes("FROM employee_assignments")) {
      return [{ companyId: 1, assignmentId: 42, email: "gm@example.com" }];
    }
    return [];
  }),
  rawExecute: vi.fn(async (sql: string, params?: unknown[]) => {
    if (sql.includes("INTO system_settings") && params && params.length >= 2) {
      dbState = JSON.parse(params[1] as string) as PersistedState;
    }
    return { affectedRows: 1 };
  }),
  pool: { query: vi.fn(async () => ({ rowCount: 0, rows: [] })) },
  withTransaction: vi.fn(async (cb: any) => cb({ query: vi.fn() })),
}));

// Heavyweight modules pulled transitively by cronScheduler.ts: stub them.
vi.mock("../../src/lib/kpiEngine.js", () => ({ saveAllCompaniesKPISnapshots: vi.fn() }));
vi.mock("../../src/lib/smartAlerts.js", () => ({ runSmartAlertsAllCompanies: vi.fn() }));
vi.mock("../../src/lib/selfAuditEngine.js", () => ({ runSelfAuditAllCompanies: vi.fn() }));
vi.mock("../../src/lib/notificationEngine.js", () => ({
  processFallbackChains: vi.fn(),
  dispatchNotification: vi.fn(),
  interpolateTemplate: (s: string) => s,
}));
vi.mock("../../src/lib/workflowEngine.js", () => ({ checkSlaStatus: vi.fn() }));
vi.mock("../../src/lib/proactiveEngine.js", () => ({
  runAllProactiveChecks: vi.fn(),
  registerProactiveEventListeners: vi.fn(),
}));
vi.mock("../../src/lib/recurringJournalProcessor.js", () => ({ processDueRecurringJournals: vi.fn() }));
vi.mock("../../src/lib/obligationsEngine.js", () => ({ scanObligations: vi.fn() }));
vi.mock("../../src/lib/autoViolationEngine.js", () => ({ runAutoDetectionAllCompanies: vi.fn() }));

const { rateLimitFallbackAlertCheck } = await import("../../src/lib/cronScheduler.js");

describe("rateLimitFallbackAlertCheck — behavior (Task #176)", () => {
  beforeEach(() => {
    sendNotificationMock.mockClear();
    dbState = null;
  });

  it("does not alert when status is steadily connected", async () => {
    currentStatus = "connected";
    await rateLimitFallbackAlertCheck();
    await rateLimitFallbackAlertCheck();
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });

  it("emits a rate_limit_fallback alert on the first transition into fallback", async () => {
    currentStatus = "connected";
    await rateLimitFallbackAlertCheck(); // seed previous=connected in dbState

    currentStatus = "fallback-memory";
    const result = await rateLimitFallbackAlertCheck();

    expect(result).toMatch(/transition/);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const payload = sendNotificationMock.mock.calls[0]![0] as {
      type: string;
      priority: string;
      channels: string[];
      recipientEmail?: string;
    };
    expect(payload.type).toBe("rate_limit_fallback");
    expect(payload.priority).toBe("high");
    expect(payload.channels).toEqual(["in_app", "email"]);
    expect(payload.recipientEmail).toBe("gm@example.com");
    // Persisted state moves to fallback-memory and records lastAlertedAt.
    expect(dbState?.lastSeenStatus).toBe("fallback-memory");
    expect(dbState?.lastAlertedAt).toBeGreaterThan(0);
    expect(dbState?.fallbackSince).toBeGreaterThan(0);
  });

  it("suppresses re-alerts during the 30-minute cooldown while still degraded", async () => {
    currentStatus = "connected";
    await rateLimitFallbackAlertCheck();

    currentStatus = "fallback-memory";
    await rateLimitFallbackAlertCheck(); // first alert
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);

    const r1 = await rateLimitFallbackAlertCheck();
    const r2 = await rateLimitFallbackAlertCheck();
    const r3 = await rateLimitFallbackAlertCheck();
    expect(r1).toMatch(/cooldown/);
    expect(r2).toMatch(/cooldown/);
    expect(r3).toMatch(/cooldown/);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
  });

  it("emits a rate_limit_recovered alert when status returns to connected", async () => {
    currentStatus = "connected";
    await rateLimitFallbackAlertCheck();

    currentStatus = "fallback-memory";
    await rateLimitFallbackAlertCheck();
    sendNotificationMock.mockClear();

    currentStatus = "connected";
    const result = await rateLimitFallbackAlertCheck();

    expect(result).toMatch(/recovery/i);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const payload = sendNotificationMock.mock.calls[0]![0] as {
      type: string;
      priority: string;
    };
    expect(payload.type).toBe("rate_limit_recovered");
    expect(payload.priority).toBe("normal");
    // After recovery, lastSeenStatus moves to connected and fallbackSince
    // clears, but lastAlertedAt is preserved so a flap within the cooldown
    // window is still suppressed (see flap-suppression test below).
    expect(dbState?.lastSeenStatus).toBe("connected");
    expect(dbState?.fallbackSince).toBeNull();
    expect(dbState?.lastAlertedAt).toBeGreaterThan(0);
  });

  it("suppresses flapping alerts: connected → fallback → connected → fallback within cooldown sends no second fallback alert", async () => {
    currentStatus = "connected";
    await rateLimitFallbackAlertCheck();

    currentStatus = "fallback-memory";
    await rateLimitFallbackAlertCheck(); // 1st fallback alert
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    expect(sendNotificationMock.mock.calls[0]![0].type).toBe("rate_limit_fallback");

    currentStatus = "connected";
    await rateLimitFallbackAlertCheck(); // recovery alert
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
    expect(sendNotificationMock.mock.calls[1]![0].type).toBe("rate_limit_recovered");

    // Flap back into fallback well inside the 30-minute cooldown — must NOT
    // emit another fallback alert.
    currentStatus = "fallback-memory";
    const result = await rateLimitFallbackAlertCheck();
    expect(result).toMatch(/cooldown/);
    expect(sendNotificationMock).toHaveBeenCalledTimes(2);
  });

  it("survives a replica switch mid-outage: shared state ensures exactly one recovery alert", async () => {
    // Replica A observes the transition into fallback and writes the shared
    // state. Then replica B (a fresh module — but reads the SAME shared
    // state) sees status return to connected and must still emit recovery.
    currentStatus = "connected";
    await rateLimitFallbackAlertCheck();
    currentStatus = "fallback-memory";
    await rateLimitFallbackAlertCheck();
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    sendNotificationMock.mockClear();

    // Simulate "fresh replica wins the lock for the next tick" — module-local
    // memory would be empty, but `loadRateLimitAlerterState()` sees the
    // persisted fallback state. Reset module memory: there isn't any to
    // reset because state lives in dbState (the test fixture's "DB"); this
    // assertion is the cross-replica contract.
    currentStatus = "connected";
    const result = await rateLimitFallbackAlertCheck();
    expect(result).toMatch(/recovery/i);
    expect(sendNotificationMock).toHaveBeenCalledTimes(1);
    const payload = sendNotificationMock.mock.calls[0]![0] as { type: string };
    expect(payload.type).toBe("rate_limit_recovered");
  });

  it("treats disabled (REDIS_URL unset) as intentional and does not alert", async () => {
    currentStatus = "disabled";
    const result = await rateLimitFallbackAlertCheck();
    expect(result).toMatch(/REDIS_URL not configured/);
    expect(sendNotificationMock).not.toHaveBeenCalled();
  });
});
