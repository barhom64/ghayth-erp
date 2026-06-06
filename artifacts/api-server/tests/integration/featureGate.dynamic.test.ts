// P4 — live-DB integration tests for the per-feature subscription gate.
//
// The unit suite (p4FeatureGate) reads the source as text and asserts the
// SQL/contract is shaped right. These tests run the featureGate
// middleware's REAL query against a REAL Postgres and assert the gate
// actually opens / closes per the company's entitlement row:
//
//   - active        → next()
//   - trial         → next()
//   - cancelled     → 402 FEATURE_NOT_SUBSCRIBED
//   - expired (status) → 402
//   - expiresAt in the past → 402 (computed on the fly)
//   - row missing   → 402 (fail closed)
//   - owner bypass on an inactive feature → next()
//   - cross-tenant admin (companyId === 0) → next()
//   - the cache invalidation hook actually re-reads after a status flip
//
// Activation + skip behaviour identical to the other *.dynamic.test.ts.

import { describe, it, expect, beforeAll, beforeEach } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

// Minimal Express req/res/next doubles. featureGate only touches
// req.scope + res.status().json() + next().
function makeCtx(scope: Record<string, unknown>) {
  let statusCode: number | null = null;
  let body: any = null;
  let nextCalled = false;
  const res = {
    status(code: number) { statusCode = code; return this; },
    json(obj: any) { body = obj; return this; },
  };
  const next = () => { nextCalled = true; };
  return {
    req: { scope } as any,
    res: res as any,
    next,
    outcome: () => ({ statusCode, body, nextCalled }),
  };
}

d("featureGate — dynamic (real Postgres)", () => {
  let rawExecute: any;
  let rawQuery: any;
  let featureGate: any;
  let invalidateFeatureGateCache: any;
  let companyId: number;

  const KEY = "fleet.access";

  beforeAll(async () => {
    const db = await import("../../src/lib/rawdb.js");
    rawExecute = db.rawExecute;
    rawQuery = db.rawQuery;
    const mod = await import("../../src/middlewares/featureGate.js");
    featureGate = mod.featureGate;
    invalidateFeatureGateCache = mod.invalidateFeatureGateCache;

    // One company to attach entitlements to.
    const [c] = await rawQuery(
      `INSERT INTO companies (name, status) VALUES ('FeatureGate Co', 'active') RETURNING id`,
    );
    companyId = c.id;
  });

  beforeEach(async () => {
    // Reset this company's entitlement for KEY + drop the cache so each
    // scenario starts clean.
    await rawExecute(`DELETE FROM company_subscription_features WHERE "companyId" = $1`, [companyId]);
    invalidateFeatureGateCache();
  });

  async function setEntitlement(status: string, expiresAt: string | null = null) {
    await rawExecute(
      `INSERT INTO company_subscription_features ("companyId", "featureKey", status, "expiresAt")
       VALUES ($1, $2, $3, $4)
       ON CONFLICT ("companyId","featureKey") DO UPDATE
         SET status = EXCLUDED.status, "expiresAt" = EXCLUDED."expiresAt"`,
      [companyId, KEY, status, expiresAt],
    );
    invalidateFeatureGateCache(companyId, KEY);
  }

  it("active → passes", async () => {
    await setEntitlement("active");
    const ctx = makeCtx({ companyId });
    await featureGate(KEY)(ctx.req, ctx.res, ctx.next);
    expect(ctx.outcome().nextCalled).toBe(true);
    expect(ctx.outcome().statusCode).toBeNull();
  });

  it("trial → passes", async () => {
    await setEntitlement("trial");
    const ctx = makeCtx({ companyId });
    await featureGate(KEY)(ctx.req, ctx.res, ctx.next);
    expect(ctx.outcome().nextCalled).toBe(true);
  });

  it("cancelled → 402 FEATURE_NOT_SUBSCRIBED", async () => {
    await setEntitlement("cancelled");
    const ctx = makeCtx({ companyId });
    await featureGate(KEY)(ctx.req, ctx.res, ctx.next);
    expect(ctx.outcome().nextCalled).toBe(false);
    expect(ctx.outcome().statusCode).toBe(402);
    expect(ctx.outcome().body.code).toBe("FEATURE_NOT_SUBSCRIBED");
  });

  it("expired status → 402", async () => {
    await setEntitlement("expired");
    const ctx = makeCtx({ companyId });
    await featureGate(KEY)(ctx.req, ctx.res, ctx.next);
    expect(ctx.outcome().statusCode).toBe(402);
  });

  it("active but expiresAt in the past → 402 (computed on the fly)", async () => {
    await setEntitlement("active", new Date(Date.now() - 86_400_000).toISOString());
    const ctx = makeCtx({ companyId });
    await featureGate(KEY)(ctx.req, ctx.res, ctx.next);
    expect(ctx.outcome().statusCode).toBe(402);
  });

  it("active with expiresAt in the future → passes", async () => {
    await setEntitlement("active", new Date(Date.now() + 86_400_000).toISOString());
    const ctx = makeCtx({ companyId });
    await featureGate(KEY)(ctx.req, ctx.res, ctx.next);
    expect(ctx.outcome().nextCalled).toBe(true);
  });

  it("no entitlement row → 402 (fail closed)", async () => {
    // beforeEach already deleted the row.
    const ctx = makeCtx({ companyId });
    await featureGate(KEY)(ctx.req, ctx.res, ctx.next);
    expect(ctx.outcome().statusCode).toBe(402);
  });

  it("owner bypasses an inactive feature (so they can reach billing)", async () => {
    await setEntitlement("cancelled");
    const ctx = makeCtx({ companyId, isOwner: true });
    await featureGate(KEY)(ctx.req, ctx.res, ctx.next);
    expect(ctx.outcome().nextCalled).toBe(true);
  });

  it("cross-tenant admin (companyId === 0) bypasses entirely", async () => {
    // No row for company 0, but the gate short-circuits before the query.
    const ctx = makeCtx({ companyId: 0 });
    await featureGate(KEY)(ctx.req, ctx.res, ctx.next);
    expect(ctx.outcome().nextCalled).toBe(true);
  });

  it("cache invalidation lets a status flip take effect immediately", async () => {
    await setEntitlement("active");
    let ctx = makeCtx({ companyId });
    await featureGate(KEY)(ctx.req, ctx.res, ctx.next);
    expect(ctx.outcome().nextCalled).toBe(true); // cached active

    // Flip to cancelled and invalidate (mirrors the admin endpoint).
    await rawExecute(
      `UPDATE company_subscription_features SET status='cancelled' WHERE "companyId"=$1 AND "featureKey"=$2`,
      [companyId, KEY],
    );
    invalidateFeatureGateCache(companyId, KEY);

    ctx = makeCtx({ companyId });
    await featureGate(KEY)(ctx.req, ctx.res, ctx.next);
    expect(ctx.outcome().statusCode).toBe(402); // re-read sees cancelled
  });

  it("a non-owner with a different feature active is still gated on the missing one", async () => {
    await setEntitlement("active"); // fleet.access active
    const ctx = makeCtx({ companyId });
    // Gate on a DIFFERENT key the company has no row for.
    await featureGate("umrah.access")(ctx.req, ctx.res, ctx.next);
    expect(ctx.outcome().statusCode).toBe(402);
  });
});
