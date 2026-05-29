/**
 * persistAlert driver-derivation smoke tests (#1354).
 *
 * Locks the contract that AI alerts inserted during an in-progress trip
 * pick up the driver id from `fleet_trips`. The query is a hot-path
 * lookup (every alert insert) so the test asserts:
 *   • the SELECT shape matches the index added in migration 232
 *     (vehicleId + status='in_progress' + startTime DESC LIMIT 1)
 *   • lookup failure is non-fatal (driverId stays NULL, insert still runs)
 *   • missing vehicleId on the device skips the lookup entirely
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../../src/lib/rawdb.js", () => {
  const rawQuery = vi.fn();
  const rawExecute = vi.fn().mockResolvedValue({ insertId: 1, affectedRows: 1 });
  const withTransaction = vi.fn(async <T>(fn: () => Promise<T>) => fn());
  const assertInsert = (id: number) => id;
  return { rawQuery, rawExecute, withTransaction, assertInsert };
});

vi.mock("../../src/lib/rbac/authorize.js", () => ({
  authorize: () => (_req: unknown, _res: unknown, next: () => void) => next(),
  maskFields: <T>(x: T) => x,
}));

vi.mock("../../src/lib/businessHelpers.js", () => ({
  auditMutation: vi.fn(),
  emitEvent: vi.fn().mockResolvedValue(undefined),
  createAuditLog: vi.fn(),
  todayISO: () => "2026-05-28",
  currentYear: () => 2026,
  toDateISO: (d: Date | string) => String(d),
  roundTo2: (n: number) => Math.round(n * 100) / 100,
  createNotification: vi.fn(),
}));

vi.mock("../../src/lib/secrets.js", () => ({
  encryptSecret: (s: string) => s,
  decryptSecret: (s: string | null) => s,
  isEncrypted: () => false,
}));

vi.mock("../../src/lib/scopedQuery.js", () => ({
  buildScopedWhere: () => ({ where: "WHERE 1=1", params: [], nextParamIndex: 1 }),
  parseScopeFilters: () => ({}),
}));

interface MockedRawdb {
  rawQuery: ReturnType<typeof vi.fn>;
  rawExecute: ReturnType<typeof vi.fn>;
}

async function mockedRawdb(): Promise<MockedRawdb> {
  return (await import("../../src/lib/rawdb.js")) as unknown as MockedRawdb;
}

async function callPersistAlert(args: {
  vehicleId: number | null;
  driverIdFromTrip: number | null | "throws";
}) {
  const { rawQuery, rawExecute } = await mockedRawdb();
  rawQuery.mockReset();
  rawExecute.mockReset().mockResolvedValue({ insertId: 99, affectedRows: 1 });

  // First query is the driver-derivation lookup.
  if (args.driverIdFromTrip === "throws") {
    rawQuery.mockRejectedValueOnce(new Error("trips table locked"));
  } else if (args.driverIdFromTrip !== null) {
    rawQuery.mockResolvedValueOnce([{ driverId: args.driverIdFromTrip }]);
  } else if (args.vehicleId !== null) {
    rawQuery.mockResolvedValueOnce([]); // no active trip
  }

  const { persistAlert } = await import("../../src/routes/fleet-telematics.js");
  const device = {
    id: 1, companyId: 1, branchId: null, integrationId: 1,
    vehicleId: args.vehicleId,
    cmsv6DeviceNo: "DEV-A", deviceLabel: null, deviceModel: null,
    status: "online", channelCount: 4, plateNumber: null,
    lastOnlineAt: null, lastOfflineAt: null, lastPositionAt: null,
  };
  const alert = {
    cmsv6DeviceNo: "DEV-A",
    externalAlertId: "alarm-1",
    category: "adas" as const,
    alertType: "fcw",
    severity: "high" as const,
    occurredAt: new Date("2026-05-28T10:00:00Z"),
    rawPayload: {},
  };
  await persistAlert(1, null, device, alert);
  return { rawQuery, rawExecute };
}

describe("persistAlert driver derivation", () => {
  beforeEach(async () => {
    const { rawQuery, rawExecute } = await mockedRawdb();
    rawQuery.mockReset();
    rawExecute.mockReset();
  });

  it("looks up the active trip driver and writes it into the alert", async () => {
    const { rawQuery, rawExecute } = await callPersistAlert({
      vehicleId: 42,
      driverIdFromTrip: 7,
    });

    // Lookup SELECT shape — must match the migration 232 partial index.
    const lookupCall = rawQuery.mock.calls[0];
    expect(String(lookupCall[0])).toMatch(/fleet_trips/);
    expect(String(lookupCall[0])).toMatch(/"vehicleId" = \$2/);
    expect(String(lookupCall[0])).toMatch(/status = 'in_progress'/);
    expect(String(lookupCall[0])).toMatch(/ORDER BY "startTime" DESC/);
    expect(String(lookupCall[0])).toMatch(/LIMIT 1/);
    expect(lookupCall[1]).toEqual([1, 42, new Date("2026-05-28T10:00:00Z")]);

    // The INSERT carries the derived driverId.
    const insertCall = rawExecute.mock.calls.find((c) =>
      String(c[0]).includes("fleet_ai_alerts"),
    );
    expect(insertCall).toBeDefined();
    // Position of driverId in the params array (5th column → index 4).
    expect(insertCall![1][4]).toBe(7);
  });

  it("inserts driverId=NULL when no active trip", async () => {
    const { rawExecute } = await callPersistAlert({
      vehicleId: 42,
      driverIdFromTrip: null,
    });

    const insertCall = rawExecute.mock.calls.find((c) =>
      String(c[0]).includes("fleet_ai_alerts"),
    );
    expect(insertCall![1][4]).toBeNull();
  });

  it("skips the lookup entirely when device has no vehicleId", async () => {
    const { rawQuery, rawExecute } = await callPersistAlert({
      vehicleId: null,
      driverIdFromTrip: null,
    });

    // No SELECT against fleet_trips should have been made.
    const tripCalls = rawQuery.mock.calls.filter((c) =>
      String(c[0]).includes("fleet_trips"),
    );
    expect(tripCalls).toHaveLength(0);

    // INSERT still runs with driverId=NULL.
    const insertCall = rawExecute.mock.calls.find((c) =>
      String(c[0]).includes("fleet_ai_alerts"),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1][4]).toBeNull();
  });

  it("tolerates a lookup failure (insert still runs with NULL)", async () => {
    const { rawExecute } = await callPersistAlert({
      vehicleId: 42,
      driverIdFromTrip: "throws",
    });

    // The insert MUST have happened despite the lookup failure.
    const insertCall = rawExecute.mock.calls.find((c) =>
      String(c[0]).includes("fleet_ai_alerts"),
    );
    expect(insertCall).toBeDefined();
    expect(insertCall![1][4]).toBeNull();
  });

  it("scopes the lookup by companyId (no cross-tenant trip leak)", async () => {
    const { rawQuery } = await callPersistAlert({
      vehicleId: 42,
      driverIdFromTrip: 7,
    });
    const lookupCall = rawQuery.mock.calls[0];
    expect(String(lookupCall[0])).toMatch(/"companyId" = \$1/);
    expect(lookupCall[1][0]).toBe(1);
  });
});
