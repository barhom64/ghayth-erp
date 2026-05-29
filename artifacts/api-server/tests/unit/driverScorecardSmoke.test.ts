/**
 * Driver safety scorecard smoke tests (#1354).
 *
 * Locks the severity-weight formula + window math + scope filtering.
 * The actual SQL aggregations are exercised when the route is mounted
 * against the mocked rawdb; what we verify here is that the right
 * parameters reach the query and the response shape is stable.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

vi.mock("../../src/lib/rawdb.js", () => {
  const rawQuery = vi.fn();
  const rawExecute = vi.fn().mockResolvedValue({ insertId: 0, affectedRows: 1 });
  const withTransaction = vi.fn(async <T>(fn: () => Promise<T>) => fn());
  const assertInsert = (id: number) => id;
  return { rawQuery, rawExecute, withTransaction, assertInsert };
});

vi.mock("../../src/lib/rbac/authorize.js", () => ({
  authorize: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    (req as unknown as { scope: unknown }).scope = {
      userId: 100, employeeId: 1, companyId: 1, branchId: 1,
      activeAssignmentId: 1,
      allowedCompanies: [1, 2], allowedBranches: [1], allowedAssignments: [1],
      role: "fleet_manager", isOwner: false,
      jobTitle: null, jobTitleId: null,
      userName: "tester", selectedRoleKey: null,
    };
    next();
  },
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
}
async function mockedRawdb(): Promise<MockedRawdb> {
  return (await import("../../src/lib/rawdb.js")) as unknown as MockedRawdb;
}

async function makeApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  const { default: telematicsRouter } = await import("../../src/routes/fleet-telematics.js");
  app.use("/api/fleet", telematicsRouter);
  return app;
}

describe("Driver scorecard — leaderboard", () => {
  beforeEach(async () => {
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockReset();
    rawQuery.mockResolvedValue([]);
  });

  it("defaults to the trailing 30 days when window is not provided", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    const before = Date.now();

    await request(app)
      .get("/api/fleet/telematics/drivers/scorecard-leaderboard")
      .expect(200);

    const [, params] = rawQuery.mock.calls[0];
    const from = new Date(String(params[1]));
    const to = new Date(String(params[2]));
    const windowDays = (to.getTime() - from.getTime()) / (24 * 3600 * 1000);
    expect(windowDays).toBeGreaterThan(29.5);
    expect(windowDays).toBeLessThan(30.5);
    // `to` should be approximately the current moment.
    expect(Math.abs(to.getTime() - before)).toBeLessThan(5_000);
  });

  it("clamps from to within 365 days max look-back", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    // 10 years ago — must be clamped.
    const ancientFrom = new Date("2016-01-01T00:00:00Z").toISOString();
    await request(app)
      .get("/api/fleet/telematics/drivers/scorecard-leaderboard")
      .query({ from: ancientFrom })
      .expect(200);

    const [, params] = rawQuery.mock.calls[0];
    const from = new Date(String(params[1]));
    const earliestAllowed = Date.now() - 365 * 24 * 3600 * 1000;
    expect(from.getTime()).toBeGreaterThanOrEqual(earliestAllowed - 60_000);
  });

  it("clamps to to now() if a future date is provided", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    const futureTo = new Date(Date.now() + 365 * 24 * 3600 * 1000).toISOString();

    await request(app)
      .get("/api/fleet/telematics/drivers/scorecard-leaderboard")
      .query({ to: futureTo })
      .expect(200);

    const [, params] = rawQuery.mock.calls[0];
    const to = new Date(String(params[2]));
    expect(to.getTime()).toBeLessThanOrEqual(Date.now() + 5_000);
  });

  it("scopes by allowedCompanies", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    await request(app)
      .get("/api/fleet/telematics/drivers/scorecard-leaderboard")
      .expect(200);

    const [, params] = rawQuery.mock.calls[0];
    expect(params[0]).toEqual([1, 2]);
  });

  it("returns the documented severity weights in meta", async () => {
    const app = await makeApp();
    const res = await request(app)
      .get("/api/fleet/telematics/drivers/scorecard-leaderboard")
      .expect(200);

    expect(res.body.meta.weights).toEqual({
      info: 0, low: 1, medium: 3, high: 7, critical: 15,
    });
    expect(res.body.meta.maxScore).toBe(100);
    expect(res.body.meta.window).toHaveProperty("from");
    expect(res.body.meta.window).toHaveProperty("to");
  });
});

describe("Driver scorecard — per-driver detail", () => {
  beforeEach(async () => {
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockReset();
  });

  it("returns 404 when the driver is not in scope", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([]); // driver lookup → empty
    await request(app)
      .get("/api/fleet/telematics/drivers/77/scorecard")
      .expect(404);
  });

  it("composes 3 queries on the happy path: driver + aggregate + topTypes + recent", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery
      .mockResolvedValueOnce([{ id: 77, name: "Driver A", licenseNumber: "L-1" }]) // driver lookup
      .mockResolvedValueOnce([{
        totalAlerts: 5, rawPenalty: 12, safetyScore: 88,
        adasCount: 2, dmsCount: 3, bsdCount: 0,
        infoCount: 0, lowCount: 1, mediumCount: 3, highCount: 1, criticalCount: 0,
      }]) // aggregate
      .mockResolvedValueOnce([
        { alertType: "fcw", category: "adas", count: 2 },
        { alertType: "fatigue", category: "dms", count: 3 },
      ]) // topTypes
      .mockResolvedValueOnce([
        { id: 1, category: "dms", alertType: "fatigue", severity: "high", occurredAt: new Date().toISOString() },
      ]); // recent

    const res = await request(app)
      .get("/api/fleet/telematics/drivers/77/scorecard")
      .expect(200);

    expect(res.body.data.driver.id).toBe(77);
    expect(res.body.data.aggregate.safetyScore).toBe(88);
    expect(res.body.data.topAlertTypes).toHaveLength(2);
    expect(res.body.data.recent).toHaveLength(1);
    expect(res.body.data.window).toHaveProperty("from");
    expect(res.body.data.window).toHaveProperty("to");
  });

  it("returns zero-aggregate when the driver has no alerts in window", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery
      .mockResolvedValueOnce([{ id: 77, name: "Driver A", licenseNumber: "L-1" }])
      .mockResolvedValueOnce([{
        totalAlerts: 0, rawPenalty: 0, safetyScore: 100,
        adasCount: 0, dmsCount: 0, bsdCount: 0,
        infoCount: 0, lowCount: 0, mediumCount: 0, highCount: 0, criticalCount: 0,
      }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    const res = await request(app)
      .get("/api/fleet/telematics/drivers/77/scorecard")
      .expect(200);

    expect(res.body.data.aggregate.totalAlerts).toBe(0);
    expect(res.body.data.aggregate.safetyScore).toBe(100);
  });
});
