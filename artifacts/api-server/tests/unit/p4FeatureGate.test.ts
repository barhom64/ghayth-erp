import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── P4 — per-feature subscription gate ─────────────────────────────────
//
// Closes finding #5 of the senior review. Three layers:
//
//   1. Migration 253 ships three new tables (products / features /
//      per-company entitlement) plus a backwards-compatible seed that
//      grandfathers every existing company on every feature.
//
//   2. lib/featureGate.ts middleware reads scope.companyId × featureKey
//      and returns 402 FEATURE_NOT_SUBSCRIBED when the entitlement is
//      missing or expired. Cached with the same 60s TTL pattern as
//      subscriptionGate.
//
//   3. _domain-mounts.ts uses prefix-mount pattern (router.use("/hr",
//      featureGate("hr.access"))) so every sub-router under that prefix
//      inherits the gate without each mount having to declare it.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const MIGRATION = read("artifacts/api-server/src/migrations/253_subscription_features.sql");
const FEATURE_GATE = read("artifacts/api-server/src/middlewares/featureGate.ts");
const ADMIN_ROUTER = read("artifacts/api-server/src/routes/admin-subscription-features.ts");
const MOUNTS = read("artifacts/api-server/src/routes/_domain-mounts.ts");

describe("P4.1 — migration 253 ships the three subscription tables", () => {
  it("@rollback annotation present so DBA can revert", () => {
    expect(MIGRATION).toContain("@rollback");
  });

  it("CREATE TABLE subscription_products IF NOT EXISTS", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS public\.subscription_products/);
    expect(MIGRATION).toContain('"productKey"');
    expect(MIGRATION).toContain('UNIQUE');
  });

  it("CREATE TABLE subscription_features IF NOT EXISTS with FK to products", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS public\.subscription_features/);
    expect(MIGRATION).toContain('"featureKey"');
    expect(MIGRATION).toContain('"productId"');
    expect(MIGRATION).toMatch(/REFERENCES public\.subscription_products\(id\)/);
  });

  it("CREATE TABLE company_subscription_features IF NOT EXISTS with composite unique", () => {
    expect(MIGRATION).toMatch(/CREATE TABLE IF NOT EXISTS public\.company_subscription_features/);
    expect(MIGRATION).toMatch(/UNIQUE\s*\(\s*"companyId",\s*"featureKey"\s*\)/);
  });

  it("indexes for the per-company entitlement lookup pattern", () => {
    expect(MIGRATION).toContain("idx_csf_company");
    expect(MIGRATION).toContain("idx_csf_status");
  });
});

describe("P4.1 — seed grandfathers every existing tenant on every feature", () => {
  it("cross joins companies × subscription_features for backwards compatibility", () => {
    expect(MIGRATION).toMatch(/CROSS JOIN public\.subscription_features/);
    expect(MIGRATION).toContain(`'active'`);
    expect(MIGRATION).toContain('ON CONFLICT ("companyId", "featureKey") DO NOTHING');
  });

  it("seeds at least the seven flagship products", () => {
    for (const productKey of ["core", "finance", "hr", "fleet", "crm", "umrah", "logistics", "insights"]) {
      expect(MIGRATION).toContain(`'${productKey}'`);
    }
  });

  it("seeds the headline feature keys the mounts reference", () => {
    for (const featureKey of ["hr.access", "fleet.access", "umrah.access"]) {
      expect(MIGRATION).toContain(`'${featureKey}'`);
    }
  });
});

describe("P4.3 — featureGate middleware shape", () => {
  it("exports a factory that takes a featureKey", () => {
    expect(FEATURE_GATE).toMatch(/export function featureGate\(featureKey: string\)/);
  });

  it("rejects empty / invalid featureKey at construction time", () => {
    expect(FEATURE_GATE).toMatch(/throw new Error\(`featureGate: invalid featureKey/);
  });

  it("queries company_subscription_features by companyId + featureKey", () => {
    expect(FEATURE_GATE).toContain('FROM company_subscription_features');
    expect(FEATURE_GATE).toContain('"companyId" = $1');
    expect(FEATURE_GATE).toContain('"featureKey" = $2');
  });

  it("cross-tenant admin (companyId === 0) bypasses the gate", () => {
    expect(FEATURE_GATE).toMatch(/scope\.companyId === 0/);
  });

  it("returns 402 FEATURE_NOT_SUBSCRIBED when no row exists", () => {
    expect(FEATURE_GATE).toContain("FEATURE_NOT_SUBSCRIBED");
    expect(FEATURE_GATE).toMatch(/res\.status\(402\)/);
  });

  it("computes effective status from expiresAt on the fly", () => {
    expect(FEATURE_GATE).toMatch(/row\.expiresAt[\s\S]{0,200}Date\.now\(\)/);
  });

  it("owner soft-bypasses an inactive feature (so they can reach billing)", () => {
    expect(FEATURE_GATE).toMatch(/scope\.isOwner \|\| scope\.role === "owner"/);
    expect(FEATURE_GATE).toContain("owner bypass on inactive feature");
  });

  it("60s in-memory cache so the gate is cheap per request", () => {
    expect(FEATURE_GATE).toContain("TTL_MS = 60_000");
  });

  it("invalidateFeatureGateCache(companyId, featureKey?) is exported", () => {
    expect(FEATURE_GATE).toMatch(/export function invalidateFeatureGateCache\(companyId\?: number, featureKey\?: string\)/);
  });
});

describe("P4.3 — featureGate is mounted on /hr, /fleet, /umrah", () => {
  it("imports featureGate in _domain-mounts.ts", () => {
    expect(MOUNTS).toMatch(/from\s+"\.\.\/middlewares\/featureGate\.js"/);
  });

  it("/hr is gated by hr.access", () => {
    expect(MOUNTS).toMatch(/router\.use\("\/hr",\s*featureGate\("hr\.access"\)\)/);
  });

  it("/fleet is gated by fleet.access", () => {
    expect(MOUNTS).toMatch(/router\.use\("\/fleet",\s*featureGate\("fleet\.access"\)\)/);
  });

  it("/umrah is gated by umrah.access", () => {
    expect(MOUNTS).toMatch(/router\.use\("\/umrah",\s*featureGate\("umrah\.access"\)\)/);
  });

  it("subscriptionGate (whole-company) is still wired — the two layers coexist", () => {
    // The whole-company safety net stays. featureGate adds finer
    // granularity but does NOT replace the company-wide expired /
    // cancelled check.
    const ROUTES = read("artifacts/api-server/src/routes/index.ts");
    expect(ROUTES).toMatch(/router\.use\(subscriptionGate\)/);
  });
});

describe("P4.5 — admin endpoints for the per-company feature matrix", () => {
  it("GET /products returns the catalog", () => {
    expect(ADMIN_ROUTER).toMatch(/router\.get\("\/products"[\s\S]{0,150}action:\s*"list"/);
  });

  it("GET /features returns the feature catalog joined to product", () => {
    expect(ADMIN_ROUTER).toMatch(/router\.get\("\/features"[\s\S]{0,150}action:\s*"list"/);
    expect(ADMIN_ROUTER).toContain('JOIN subscription_products');
  });

  it("GET /companies/:id/features returns the entitlement matrix", () => {
    expect(ADMIN_ROUTER).toMatch(/router\.get\("\/companies\/:id\/features"/);
    expect(ADMIN_ROUTER).toContain('LEFT JOIN company_subscription_features');
  });

  it("POST upsert validates featureKey against the catalog (fail-closed)", () => {
    expect(ADMIN_ROUTER).toMatch(/router\.post\("\/companies\/:id\/features\/:key"/);
    expect(ADMIN_ROUTER).toContain('SELECT "featureKey" FROM subscription_features');
    expect(ADMIN_ROUTER).toMatch(/غير موجود في الكاتالوج/);
  });

  it("POST upsert uses ON CONFLICT DO UPDATE so it's idempotent", () => {
    expect(ADMIN_ROUTER).toContain('ON CONFLICT ("companyId", "featureKey") DO UPDATE');
  });

  it("POST upsert invalidates the gate cache for the affected (company,feature)", () => {
    const idx = ADMIN_ROUTER.indexOf('router.post("/companies/:id/features/:key"');
    const body = ADMIN_ROUTER.slice(idx, idx + 4000);
    expect(body).toMatch(/invalidateFeatureGateCache\(companyId,\s*featureKey\)/);
  });

  it("POST upsert audit-logs the change", () => {
    const idx = ADMIN_ROUTER.indexOf('router.post("/companies/:id/features/:key"');
    const body = ADMIN_ROUTER.slice(idx, idx + 4000);
    expect(body).toContain('createAuditLog');
    expect(body).toContain('entity: "company_subscription_features"');
  });

  it("DELETE marks the row cancelled and audit-logs (does not destroy history)", () => {
    expect(ADMIN_ROUTER).toMatch(/router\.delete\("\/companies\/:id\/features\/:key"/);
    expect(ADMIN_ROUTER).toMatch(/status\s*=\s*'cancelled'/);
    expect(ADMIN_ROUTER).toContain('createAuditLog');
  });

  it("DELETE invalidates the gate cache", () => {
    const idx = ADMIN_ROUTER.indexOf('router.delete("/companies/:id/features/:key"');
    const body = ADMIN_ROUTER.slice(idx, idx + 4000);
    expect(body).toMatch(/invalidateFeatureGateCache\(companyId,\s*featureKey\)/);
  });

  it("featureKey passed via URL is validated against an allowlist regex (no SQL/path injection)", () => {
    expect(ADMIN_ROUTER).toMatch(/\/\^\[a-z0-9_\.-\]\+\$\/i\.test\(featureKey\)/);
  });

  it("router is mounted under /admin/subscription-features with the same gate as /admin", () => {
    expect(MOUNTS).toMatch(/router\.use\("\/admin\/subscription-features",\s*requireModule\("admin"\),\s*requireMinLevel\(90\)/);
  });
});

describe("P4.6 — admin SPA wired (subscription-features page)", () => {
  const SPA = read("artifacts/ghayth-erp/src/pages/admin/subscription-features.tsx");
  const ADMIN_ROUTES = read("artifacts/ghayth-erp/src/routes/adminRoutes.tsx");
  const SIDEBAR = read("artifacts/ghayth-erp/src/components/layout/sidebar-layout.tsx");

  it("the page calls GET /admin/subscription-features/companies/.../features", () => {
    expect(SPA).toContain("/admin/subscription-features/companies/");
  });

  it("the page calls POST/DELETE for the upsert and cancel flows", () => {
    expect(SPA).toMatch(/method:\s*"POST"/);
    expect(SPA).toMatch(/method:\s*"DELETE"/);
  });

  it("/admin/subscription-features route is registered", () => {
    expect(ADMIN_ROUTES).toContain('path: "/admin/subscription-features"');
    expect(ADMIN_ROUTES).toContain("AdminSubscriptionFeatures");
  });

  it("sidebar surfaces the page under monitoring children", () => {
    expect(SIDEBAR).toContain('"/admin/subscription-features"');
    expect(SIDEBAR).toContain("إدارة الاشتراكات");
  });

  it("page invalidates the matrix query after every write", () => {
    expect(SPA).toMatch(/invalidateQueries[\s\S]{0,200}admin-subscription-features/);
  });
});

describe("P4 — defence-in-depth", () => {
  it("status field is validated against a closed whitelist (no free-text)", () => {
    expect(ADMIN_ROUTER).toMatch(/z\.enum\(\[("active"|"trial"|"expired"|"cancelled")[\s\S]+\]\)/);
  });

  it("featureGate failure response carries the featureKey in meta (UI can route to billing)", () => {
    expect(FEATURE_GATE).toMatch(/meta:\s*\{\s*featureKey/);
  });

  it("migration is wrapped in a single transaction (atomic on apply)", () => {
    expect(MIGRATION).toContain("BEGIN;");
    expect(MIGRATION).toContain("COMMIT;");
  });
});
