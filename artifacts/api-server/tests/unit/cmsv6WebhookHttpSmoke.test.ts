/**
 * HTTP-level integration test for the anonymous CMSV6 webhook.
 *
 * This catches the kind of bug that pure unit tests miss — specifically:
 * earlier hardening commit had a doubled URL (`/webhooks/cmsv6/cmsv6/:id`)
 * because the router file and the mount point both contained "cmsv6".
 * Pure HMAC unit tests did not exercise the Express routing layer at all,
 * so the broken URL went unnoticed until manual review.
 *
 * Mocks: rawdb is mocked so the test stays hermetic (no DB), and secrets
 * is mocked so the encrypted-secret indirection is bypassed for the
 * test fixture.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHmac } from "node:crypto";
import express from "express";
import request from "supertest";

vi.mock("../../src/lib/rawdb.js", () => {
  const rawQuery = vi.fn();
  const rawExecute = vi.fn().mockResolvedValue({ insertId: 0, affectedRows: 1 });
  const withTransaction = vi.fn(async <T>(fn: () => Promise<T>) => fn());
  const assertInsert = (id: number) => id;
  return { rawQuery, rawExecute, withTransaction, assertInsert };
});

vi.mock("../../src/lib/secrets.js", () => ({
  encryptSecret: (s: string) => `enc:v1::::${s}`,
  decryptSecret: (s: string | null) => {
    if (!s) return null;
    return s.startsWith("enc:v1::::") ? s.slice("enc:v1::::".length) : s;
  },
  isEncrypted: (s: string) => typeof s === "string" && s.startsWith("enc:v1:"),
}));

// Mock the rate limit store so the test doesn't need Redis.
vi.mock("../../src/lib/rateLimitStore.js", () => ({
  makeRateLimitStore: () => undefined, // signals "use MemoryStore default"
}));

const WEBHOOK_SECRET = "test-secret-min-16-chars";

function sign(body: string, timestamp: string, secret: string): string {
  const payload = `${timestamp}.${body}`;
  return `sha256=${createHmac("sha256", secret).update(payload).digest("hex")}`;
}

async function makeApp() {
  const app = express();
  // Mirror the production rawBody capture for /api/webhooks/cmsv6 so the
  // HMAC matches the exact bytes the test signs.
  const captureRawBody = express.json({
    limit: "2mb",
    verify: (req, _res, buf) => {
      (req as unknown as { rawBody?: Buffer }).rawBody = Buffer.from(buf);
    },
  });
  app.use("/api/webhooks/cmsv6", captureRawBody);
  const { default: webhookRouter } = await import("../../src/routes/fleet-telematics-webhook.js");
  app.use("/api/webhooks/cmsv6", webhookRouter);
  return app;
}

interface MockedRawdb {
  rawQuery: ReturnType<typeof vi.fn>;
  rawExecute: ReturnType<typeof vi.fn>;
}

async function mockedRawdb(): Promise<MockedRawdb> {
  const mod = await import("../../src/lib/rawdb.js");
  return mod as unknown as MockedRawdb;
}

describe("CMSV6 webhook — HTTP-level integration", () => {
  beforeEach(async () => {
    const { rawQuery, rawExecute } = await mockedRawdb();
    rawQuery.mockReset();
    rawExecute.mockReset().mockResolvedValue({ insertId: 0, affectedRows: 1 });
  });

  it("URL is /api/webhooks/cmsv6/:integrationId (not doubled)", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    // Integration not found. Anti-enumeration hardening (commit X) makes
    // missing integrations return the same opaque 401 as a bad-signature
    // request — so a probing attacker can't distinguish "ID exists with
    // wrong secret" from "ID does not exist". Our specific 401 body
    // proves the handler ran (Express's own router-miss 404 wouldn't
    // carry this Arabic message).
    rawQuery.mockResolvedValueOnce([]);

    const body = JSON.stringify({ positions: [] });
    const ts = String(Date.now());
    const sig = sign(body, ts, WEBHOOK_SECRET);

    const res = await request(app)
      .post("/api/webhooks/cmsv6/42")
      .set("Content-Type", "application/json")
      .set("x-cmsv6-signature", sig)
      .set("x-cmsv6-timestamp", ts)
      .send(body);

    expect(res.status).toBe(401);
    expect(String(res.body.error)).toMatch(/توقيع غير صالح/);
  });

  it("the doubled URL (/cmsv6/cmsv6/:id) returns 404 from Express, not the router", async () => {
    const app = await makeApp();
    const res = await request(app).post("/api/webhooks/cmsv6/cmsv6/42");
    // The router uses POST "/:integrationId" so /cmsv6/cmsv6/42 has no
    // matching route. Express's own 404 has an empty body — distinct
    // from our 401 with an Arabic error message above, proving the URL
    // is routed correctly.
    expect(res.status).toBe(404);
  });

  it("anti-enumeration: missing integration AND bad signature both return identical 401 body", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();

    // Case 1: missing integration row
    rawQuery.mockResolvedValueOnce([]);
    const body = JSON.stringify({});
    const ts = String(Date.now());
    const sig = sign(body, ts, WEBHOOK_SECRET);
    const res1 = await request(app)
      .post("/api/webhooks/cmsv6/9999")
      .set("Content-Type", "application/json")
      .set("x-cmsv6-signature", sig)
      .set("x-cmsv6-timestamp", ts)
      .send(body);

    // Case 2: existing integration, wrong signature
    rawQuery.mockResolvedValueOnce([
      {
        id: 42, companyId: 1, branchId: null, status: "active",
        webhookSecret: `enc:v1::::${WEBHOOK_SECRET}`,
      },
    ]);
    const res2 = await request(app)
      .post("/api/webhooks/cmsv6/42")
      .set("Content-Type", "application/json")
      .set("x-cmsv6-signature", "sha256=deadbeef".padEnd(sig.length, "0"))
      .set("x-cmsv6-timestamp", ts)
      .send(body);

    expect(res1.status).toBe(res2.status);
    expect(res1.body).toEqual(res2.body);
  });

  it("rejects requests without a signature with 401", async () => {
    const app = await makeApp();
    const res = await request(app)
      .post("/api/webhooks/cmsv6/42")
      .set("Content-Type", "application/json")
      .set("x-cmsv6-timestamp", String(Date.now()))
      .send({});
    expect(res.status).toBe(401);
  });

  it("rejects requests with a stale timestamp (replay window)", async () => {
    const app = await makeApp();
    const body = JSON.stringify({ positions: [] });
    const oldTs = String(Date.now() - 6 * 60 * 1000); // 6 minutes ago
    const sig = sign(body, oldTs, WEBHOOK_SECRET);
    const res = await request(app)
      .post("/api/webhooks/cmsv6/42")
      .set("Content-Type", "application/json")
      .set("x-cmsv6-signature", sig)
      .set("x-cmsv6-timestamp", oldTs)
      .send(body);
    expect(res.status).toBe(401);
  });

  it("rejects requests where the body was tampered with after signing", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([
      {
        id: 42,
        companyId: 1,
        branchId: null,
        status: "active",
        webhookSecret: `enc:v1::::${WEBHOOK_SECRET}`,
      },
    ]);
    const original = JSON.stringify({ positions: [{ lat: 24, lng: 46 }] });
    const ts = String(Date.now());
    const sig = sign(original, ts, WEBHOOK_SECRET);

    const tampered = JSON.stringify({ positions: [{ lat: 99, lng: 99 }] });
    const res = await request(app)
      .post("/api/webhooks/cmsv6/42")
      .set("Content-Type", "application/json")
      .set("x-cmsv6-signature", sig)
      .set("x-cmsv6-timestamp", ts)
      .send(tampered);
    expect(res.status).toBe(401);
  });

  it("returns 401 when integration has no webhook secret configured (same body as bad sig)", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([
      {
        id: 42,
        companyId: 1,
        branchId: null,
        status: "active",
        webhookSecret: null,
      },
    ]);
    const body = JSON.stringify({});
    const ts = String(Date.now());
    const sig = sign(body, ts, "irrelevant");
    const res = await request(app)
      .post("/api/webhooks/cmsv6/42")
      .set("Content-Type", "application/json")
      .set("x-cmsv6-signature", sig)
      .set("x-cmsv6-timestamp", ts)
      .send(body);
    expect(res.status).toBe(401);
    expect(String(res.body.error)).toMatch(/توقيع غير صالح/);
  });

  it("returns 200 (ignored) when integration is inactive", async () => {
    const app = await makeApp();
    const { rawQuery } = await mockedRawdb();
    rawQuery.mockResolvedValueOnce([
      {
        id: 42,
        companyId: 1,
        branchId: null,
        status: "inactive",
        webhookSecret: `enc:v1::::${WEBHOOK_SECRET}`,
      },
    ]);
    const body = JSON.stringify({});
    const ts = String(Date.now());
    const sig = sign(body, ts, WEBHOOK_SECRET);
    const res = await request(app)
      .post("/api/webhooks/cmsv6/42")
      .set("Content-Type", "application/json")
      .set("x-cmsv6-signature", sig)
      .set("x-cmsv6-timestamp", ts)
      .send(body);
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe("integration_not_active");
  });
});
