/**
 * Smoke tests for the AI media evidence search endpoint (#1354).
 *
 * Locks the filter-parameter handling — the part most likely to break
 * when someone adds a new filter or changes the WHERE construction.
 * The DB round-trip is exercised by the same hermetic mock pattern as
 * the other HTTP smoke tests; we assert on the SQL that the route
 * builds rather than on response rows.
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
  const mod = await import("../../src/lib/rawdb.js");
  return mod as unknown as MockedRawdb;
}

async function makeApp(): Promise<Express> {
  const app = express();
  app.use(express.json());
  const { default: telematicsRouter } = await import("../../src/routes/fleet-telematics.js");
  app.use("/api/fleet", telematicsRouter);
  return app;
}

describe("Media evidence search — filter handling", () => {
  beforeEach(async () => {
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockReset();
    rawQuery.mockResolvedValue([]);
  });

  it("scopes to allowedCompanies even when no filter is sent", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();

    await request(app).get("/api/fleet/telematics/media-evidence").expect(200);

    expect(rawQuery).toHaveBeenCalledOnce();
    const [sql, params] = rawQuery.mock.calls[0];
    expect(String(sql)).toMatch(/companyId.*ANY/);
    expect(params[0]).toEqual([1, 2]);
  });

  it("adds vehicleId filter when provided", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();

    await request(app)
      .get("/api/fleet/telematics/media-evidence")
      .query({ vehicleId: "42" })
      .expect(200);

    const [sql, params] = rawQuery.mock.calls[0];
    expect(String(sql)).toMatch(/m\."vehicleId" = /);
    expect(params).toContain(42);
  });

  it("ignores unknown mediaType values (whitelist enforcement)", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();

    await request(app)
      .get("/api/fleet/telematics/media-evidence")
      .query({ mediaType: "malicious'); DROP TABLE x; --" })
      .expect(200);

    const [sql, params] = rawQuery.mock.calls[0];
    // The whitelist ["image", "video", "audio"] rejects anything else.
    // The SELECT clause names `m."mediaType"` so we check the WHERE
    // shape: only the companyId condition should be present.
    expect(String(sql)).not.toMatch(/m\."mediaType" =/);
    expect(params).not.toContain("malicious'); DROP TABLE x; --");
  });

  it("ignores unknown category values (whitelist enforcement)", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();

    await request(app)
      .get("/api/fleet/telematics/media-evidence")
      .query({ category: "../../etc/passwd" })
      .expect(200);

    const [sql, params] = rawQuery.mock.calls[0];
    expect(String(sql)).not.toMatch(/a\.category =/);
    expect(params).not.toContain("../../etc/passwd");
  });

  it("applies all filters when valid", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();

    await request(app)
      .get("/api/fleet/telematics/media-evidence")
      .query({
        vehicleId: "7",
        mediaType: "video",
        category: "adas",
        from: "2026-05-01T00:00:00Z",
        to: "2026-05-28T23:59:59Z",
      })
      .expect(200);

    const [sql, params] = rawQuery.mock.calls[0];
    expect(String(sql)).toMatch(/m\."vehicleId" = /);
    expect(String(sql)).toMatch(/m\."mediaType" = /);
    expect(String(sql)).toMatch(/a\.category = /);
    expect(String(sql)).toMatch(/m\."uploadedAt" >= /);
    expect(String(sql)).toMatch(/m\."uploadedAt" <= /);
    expect(params).toContain(7);
    expect(params).toContain("video");
    expect(params).toContain("adas");
    expect(params).toContain("2026-05-01T00:00:00Z");
    expect(params).toContain("2026-05-28T23:59:59Z");
  });

  it("LIMIT 200 cap is always present", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();

    await request(app).get("/api/fleet/telematics/media-evidence").expect(200);

    const [sql] = rawQuery.mock.calls[0];
    expect(String(sql)).toMatch(/LIMIT 200/);
  });

  it("orders by uploadedAt DESC for newest-first archive view", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();

    await request(app).get("/api/fleet/telematics/media-evidence").expect(200);

    const [sql] = rawQuery.mock.calls[0];
    expect(String(sql)).toMatch(/ORDER BY m\."uploadedAt" DESC/);
  });
});

describe("Media evidence detail — single-row by id", () => {
  beforeEach(async () => {
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockReset();
  });

  it("scopes by allowedCompanies (no cross-tenant probe)", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValue([
      { id: 5, mediaType: "image", mediaUrl: "https://example.com/a.jpg" },
    ]);

    await request(app).get("/api/fleet/telematics/media-evidence/5").expect(200);

    const [sql, params] = rawQuery.mock.calls[0];
    expect(String(sql)).toMatch(/m\."companyId" = ANY/);
    expect(params).toContain(5);
    expect(params[1]).toEqual([1, 2]);
  });

  it("returns 404 when row is not in scope", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValue([]);

    await request(app).get("/api/fleet/telematics/media-evidence/999").expect(404);
  });
});
