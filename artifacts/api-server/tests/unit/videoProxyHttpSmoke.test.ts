/**
 * HTTP-level integration tests for the Phase 2 video stream proxy.
 *
 * Pure unit tests cover the M3U8 rewriter and the token primitives;
 * this file covers what those tests can't: the actual Express route
 * wiring, the gate's 5-layer ordering (404 → 401 → 401 → 409 → 403),
 * and the routing-table behaviour that the rewriter assumes.
 *
 * Rationale: the URL-doubling bug in the webhook (caught by the
 * cmsv6WebhookHttpSmoke suite) would not have been caught by pure
 * unit tests. Apply the same defence here for the video proxy
 * endpoints which are the most user-visible part of the security
 * model.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import express, { type Express } from "express";
import request from "supertest";

// Hide the database behind a vi mock — we want to test routing +
// gate logic + access-log writes, not the actual session storage.
vi.mock("../../src/lib/rawdb.js", () => {
  const rawQuery = vi.fn();
  const rawExecute = vi.fn().mockResolvedValue({ insertId: 0, affectedRows: 1 });
  const withTransaction = vi.fn(async <T>(fn: () => Promise<T>) => fn());
  const assertInsert = (id: number) => id;
  return { rawQuery, rawExecute, withTransaction, assertInsert };
});

// Bypass authorize() — we want to test the 4 layers BELOW the RBAC gate.
vi.mock("../../src/lib/rbac/authorize.js", () => ({
  authorize: () => (req: express.Request, _res: express.Response, next: express.NextFunction) => {
    // Synthesize a minimal scope so handler code that reads req.scope
    // doesn't throw. The session lookup mock controls company filtering.
    (req as unknown as { scope: unknown }).scope = {
      userId: 100,
      employeeId: 1,
      companyId: 1,
      branchId: 1,
      activeAssignmentId: 1,
      allowedCompanies: [1],
      allowedBranches: [1],
      allowedAssignments: [1],
      role: "fleet_manager",
      isOwner: false,
      jobTitle: null,
      jobTitleId: null,
      userName: "tester",
      selectedRoleKey: null,
    };
    next();
  },
  maskFields: <T>(x: T) => x,
}));

// Bypass auditMutation + emitEvent — those write to other tables we
// don't need exercised for these gate tests.
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

// fetch is the real Node 22+ implementation; we mock it per-test
// to simulate CMSV6 responses without going over the network.
const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

interface MockedRawdb {
  rawQuery: ReturnType<typeof vi.fn>;
  rawExecute: ReturnType<typeof vi.fn>;
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

const VALID_TOKEN = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_AbCd";
const STREAM_URL = "https://gps.example.com/live/dev-001/playlist.m3u8";

function mockSessionRow(overrides: Partial<{
  id: number;
  companyId: number;
  status: string;
  streamUrl: string | null;
  streamType: string;
  streamProxyToken: string | null;
  streamProxyExpiresAt: Date | null;
  requestedBy: number;
}> = {}) {
  return {
    id: 42,
    companyId: 1,
    status: "active",
    streamUrl: STREAM_URL,
    streamType: "hls",
    streamProxyToken: VALID_TOKEN,
    streamProxyExpiresAt: new Date(Date.now() + 60_000),
    requestedBy: 100,
    ...overrides,
  };
}

describe("Phase 2 video proxy — JSON endpoint gate", () => {
  beforeEach(async () => {
    const { rawQuery, rawExecute } = await mockedRawdb();
    rawQuery.mockReset();
    rawExecute.mockReset().mockResolvedValue({ insertId: 0, affectedRows: 1 });
    fetchMock.mockReset();
  });

  it("404 when session does not exist", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([]);

    const res = await request(app)
      .get("/api/fleet/telematics/video/proxy/999")
      .query({ token: VALID_TOKEN });

    expect(res.status).toBe(404);
  });

  it("401 on token mismatch (audited as denied_token)", async () => {
    const app = await makeApp();
    const { rawQuery, rawExecute } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([mockSessionRow()]);

    const res = await request(app)
      .get("/api/fleet/telematics/video/proxy/42")
      .query({ token: "wrong-token-of-different-length" });

    expect(res.status).toBe(401);
    // The handler should have written exactly one access log row.
    expect(rawExecute).toHaveBeenCalled();
    const accessLogCall = rawExecute.mock.calls.find((c) =>
      String(c[0]).includes("fleet_video_access_logs"),
    );
    expect(accessLogCall).toBeDefined();
    expect(accessLogCall![1]).toContain("denied_token");
  });

  it("401 on expired token (audited as denied_expired)", async () => {
    const app = await makeApp();
    const { rawQuery, rawExecute } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([
      mockSessionRow({ streamProxyExpiresAt: new Date(Date.now() - 1000) }),
    ]);

    const res = await request(app)
      .get("/api/fleet/telematics/video/proxy/42")
      .query({ token: VALID_TOKEN });

    expect(res.status).toBe(401);
    const accessLogCall = rawExecute.mock.calls.find((c) =>
      String(c[0]).includes("fleet_video_access_logs"),
    );
    expect(accessLogCall).toBeDefined();
    expect(accessLogCall![1]).toContain("denied_expired");
  });

  it("409 when session is not active (audited as denied_session)", async () => {
    const app = await makeApp();
    const { rawQuery, rawExecute } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([mockSessionRow({ status: "stopped" })]);

    const res = await request(app)
      .get("/api/fleet/telematics/video/proxy/42")
      .query({ token: VALID_TOKEN });

    expect(res.status).toBe(409);
    const accessLogCall = rawExecute.mock.calls.find((c) =>
      String(c[0]).includes("fleet_video_access_logs"),
    );
    expect(accessLogCall![1]).toContain("denied_session");
  });

  it("403 when caller is not the user who opened the session", async () => {
    const app = await makeApp();
    const { rawQuery, rawExecute } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([mockSessionRow({ requestedBy: 999 })]);

    const res = await request(app)
      .get("/api/fleet/telematics/video/proxy/42")
      .query({ token: VALID_TOKEN });

    expect(res.status).toBe(403);
    const accessLogCall = rawExecute.mock.calls.find((c) =>
      String(c[0]).includes("fleet_video_access_logs"),
    );
    expect(accessLogCall![1]).toContain("denied_user");
  });

  it("200 with playlistUrl + proxyMode=phase2-stream for HLS", async () => {
    const app = await makeApp();
    const { rawQuery, rawExecute } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([mockSessionRow()]);

    const res = await request(app)
      .get("/api/fleet/telematics/video/proxy/42")
      .query({ token: VALID_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.data.proxyMode).toBe("phase2-stream");
    expect(res.body.data.playlistUrl).toMatch(/\/playlist\.m3u8\?token=/);
    expect(res.body.data.streamUrl).toBeUndefined();
    const accessLogCall = rawExecute.mock.calls.find((c) =>
      String(c[0]).includes("fleet_video_access_logs"),
    );
    expect(accessLogCall![1]).toContain("granted");
  });

  it("200 with streamUrl + proxyMode=phase1-json for RTSP", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([
      mockSessionRow({ streamType: "rtsp", streamUrl: "rtsp://gps.example.com/cam/1" }),
    ]);

    const res = await request(app)
      .get("/api/fleet/telematics/video/proxy/42")
      .query({ token: VALID_TOKEN });

    expect(res.status).toBe(200);
    expect(res.body.data.proxyMode).toBe("phase1-json");
    expect(res.body.data.streamUrl).toBe("rtsp://gps.example.com/cam/1");
    expect(res.body.data.playlistUrl).toBeUndefined();
  });
});

describe("Phase 2 video proxy — playlist endpoint", () => {
  beforeEach(async () => {
    const { rawQuery, rawExecute } = await mockedRawdb();
    rawQuery.mockReset();
    rawExecute.mockReset().mockResolvedValue({ insertId: 0, affectedRows: 1 });
    fetchMock.mockReset();
  });

  it("server-side fetches CMSV6 + rewrites segment URLs in the response", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([mockSessionRow()]);

    const cmsv6Playlist = [
      "#EXTM3U",
      "#EXT-X-VERSION:3",
      "#EXTINF:5.0,",
      "seg-1.ts",
      "#EXTINF:5.0,",
      "seg-2.ts",
      "#EXT-X-ENDLIST",
    ].join("\n");

    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      text: async () => cmsv6Playlist,
      headers: new Map([["content-type", "application/vnd.apple.mpegurl"]]),
    });

    const res = await request(app)
      .get("/api/fleet/telematics/video/proxy/42/playlist.m3u8")
      .query({ token: VALID_TOKEN });

    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toMatch(/application\/vnd\.apple\.mpegurl/);
    expect(res.text).toContain("#EXTM3U");
    expect(res.text).toContain("/api/fleet/telematics/video/proxy/42/segment/");
    // The CMSV6 host MUST NOT appear in the rewritten playlist.
    expect(res.text).not.toContain("gps.example.com");
  });

  it("400 when variant param resolves off-origin (SSRF rejection)", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([mockSessionRow()]);

    const res = await request(app)
      .get("/api/fleet/telematics/video/proxy/42/playlist.m3u8")
      .query({
        token: VALID_TOKEN,
        variant: "https://evil.example.net/exfil/anything.m3u8",
      });

    expect(res.status).toBe(400);
    // fetch must NOT have been called — we rejected before any upstream.
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 on path traversal in variant param", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([mockSessionRow()]);

    const res = await request(app)
      .get("/api/fleet/telematics/video/proxy/42/playlist.m3u8")
      .query({ token: VALID_TOKEN, variant: "../../../etc/passwd" });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("502 when CMSV6 returns non-2xx", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([mockSessionRow()]);

    fetchMock.mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => "Service Unavailable",
      headers: new Map(),
    });

    const res = await request(app)
      .get("/api/fleet/telematics/video/proxy/42/playlist.m3u8")
      .query({ token: VALID_TOKEN });

    expect(res.status).toBe(502);
  });
});

describe("Phase 2 video proxy — segment endpoint", () => {
  beforeEach(async () => {
    const { rawQuery, rawExecute } = await mockedRawdb();
    rawQuery.mockReset();
    rawExecute.mockReset().mockResolvedValue({ insertId: 0, affectedRows: 1 });
    fetchMock.mockReset();
  });

  it("400 on off-origin segment path", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([mockSessionRow()]);

    const offOrigin = encodeURIComponent("https://evil.example.net/something.ts");
    const res = await request(app)
      .get(`/api/fleet/telematics/video/proxy/42/segment/${offOrigin}`)
      .query({ token: VALID_TOKEN });

    expect(res.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("400 on segment path with .. traversal", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([mockSessionRow()]);

    const traversal = encodeURIComponent("../../etc/passwd");
    const res = await request(app)
      .get(`/api/fleet/telematics/video/proxy/42/segment/${traversal}`)
      .query({ token: VALID_TOKEN });

    expect(res.status).toBe(400);
  });
});
