import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── P2.3 — admin outbox monitor backend contract ──────────────────────────
//
// Backs the SPA monitor at /admin/outbox. Three endpoints land under
// /admin/observability (which already gates at module=admin + minLevel=90
// via routes/_domain-mounts.ts):
//
//   GET  /outbox            — paginated list, filterable by status + eventName
//   POST /outbox/:id/retry  — resets failed_retry/dead → pending, audit-logged
//   POST /outbox/:id/cancel — moves pending/failed_retry → dead, audit-logged
//   GET  /outbox/stats      — count-by-status snapshot for the stat cards
//
// Pair with the worker.ts /outbox-stats endpoint (P2.1) which provides
// the same stats without going through the API auth chain.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const OBSERVABILITY = read("artifacts/api-server/src/routes/admin-observability.ts");

describe("P2.3 — observability router exposes the four outbox endpoints", () => {
  it("GET /outbox is registered", () => {
    expect(OBSERVABILITY).toMatch(/router\.get\("\/outbox"/);
  });

  it("POST /outbox/:id/retry is registered with action: 'update'", () => {
    expect(OBSERVABILITY).toMatch(/router\.post\("\/outbox\/:id\/retry"[\s\S]{0,150}action:\s*"update"/);
  });

  it("POST /outbox/:id/cancel is registered with action: 'update'", () => {
    expect(OBSERVABILITY).toMatch(/router\.post\("\/outbox\/:id\/cancel"[\s\S]{0,150}action:\s*"update"/);
  });

  it("GET /outbox/stats is registered with action: 'list'", () => {
    expect(OBSERVABILITY).toMatch(/router\.get\("\/outbox\/stats"[\s\S]{0,150}action:\s*"list"/);
  });
});

describe("P2.3 — list endpoint filters + paginates + validates status whitelist", () => {
  it("declares the valid-status whitelist", () => {
    expect(OBSERVABILITY).toContain("OUTBOX_VALID_STATUSES");
    expect(OBSERVABILITY).toContain('"pending"');
    expect(OBSERVABILITY).toContain('"failed_retry"');
    expect(OBSERVABILITY).toContain('"processed"');
    expect(OBSERVABILITY).toContain('"dead"');
  });

  it("scopes query by companyId (or NULL for system-wide events)", () => {
    const idx = OBSERVABILITY.indexOf('router.get("/outbox"');
    const body = OBSERVABILITY.slice(idx, idx + 4000);
    expect(body).toMatch(/"companyId" IS NULL OR "companyId" = \$/);
  });

  it("returns paginated rows ordered by createdAt DESC", () => {
    const idx = OBSERVABILITY.indexOf('router.get("/outbox"');
    const body = OBSERVABILITY.slice(idx, idx + 4000);
    expect(body).toContain('ORDER BY "createdAt" DESC');
    expect(body).toContain("LIMIT $");
    expect(body).toContain("OFFSET $");
  });
});

describe("P2.3 — retry action resets the row and audit-logs", () => {
  it("UPDATE sets status='pending' and attempts=0 (zeroed so max-attempts guard re-fires)", () => {
    const idx = OBSERVABILITY.indexOf('/outbox/:id/retry');
    const body = OBSERVABILITY.slice(idx, idx + 4000);
    expect(body).toContain("status = 'pending'");
    expect(body).toContain("attempts = 0");
    expect(body).toMatch(/"lastError" = NULL/);
  });

  it("only resets rows currently in failed_retry or dead", () => {
    const idx = OBSERVABILITY.indexOf('/outbox/:id/retry');
    const body = OBSERVABILITY.slice(idx, idx + 4000);
    expect(body).toContain("status IN ('failed_retry', 'dead')");
  });

  it("returns 404 when no row matched (wrong id or wrong status)", () => {
    const idx = OBSERVABILITY.indexOf('/outbox/:id/retry');
    const body = OBSERVABILITY.slice(idx, idx + 4000);
    expect(body).toContain("res.status(404)");
  });

  it("audit-logs the retry action", () => {
    const idx = OBSERVABILITY.indexOf('/outbox/:id/retry');
    const body = OBSERVABILITY.slice(idx, idx + 4000);
    expect(body).toContain("createAuditLog");
    expect(body).toContain('action: "retry"');
    expect(body).toContain('entity: "event_outbox"');
  });
});

describe("P2.3 — cancel action moves the row to dead + audit-logs", () => {
  it("UPDATE sets status='dead' and appends the operator note to lastError", () => {
    const idx = OBSERVABILITY.indexOf('/outbox/:id/cancel');
    const body = OBSERVABILITY.slice(idx, idx + 4000);
    expect(body).toContain("status = 'dead'");
    expect(body).toContain("Cancelled by admin");
  });

  it("only cancels rows currently in pending or failed_retry", () => {
    const idx = OBSERVABILITY.indexOf('/outbox/:id/cancel');
    const body = OBSERVABILITY.slice(idx, idx + 4000);
    expect(body).toContain("status IN ('pending', 'failed_retry')");
  });

  it("audit-logs the cancel action", () => {
    const idx = OBSERVABILITY.indexOf('/outbox/:id/cancel');
    const body = OBSERVABILITY.slice(idx, idx + 4000);
    expect(body).toContain('action: "cancel"');
    expect(body).toContain('entity: "event_outbox"');
  });
});

describe("P2.3 — stats endpoint emits the five-tile shape", () => {
  it("returns pending / failedRetry / processed / dead / oldestPendingSec", () => {
    const idx = OBSERVABILITY.indexOf('/outbox/stats');
    const body = OBSERVABILITY.slice(idx, idx + 3000);
    expect(body).toContain("pending:");
    expect(body).toContain("failedRetry:");
    expect(body).toContain("processed:");
    expect(body).toContain("dead:");
    expect(body).toContain("oldestPendingSec:");
  });
});

describe("P2.3 — defence-in-depth", () => {
  it("retry + cancel both require the id to be numeric (bigint string)", () => {
    const idx1 = OBSERVABILITY.indexOf('/outbox/:id/retry');
    const body1 = OBSERVABILITY.slice(idx1, idx1 + 4000);
    expect(body1).toMatch(/!\/\^\\d\+\$\/\.test/);
    const idx2 = OBSERVABILITY.indexOf('/outbox/:id/cancel');
    const body2 = OBSERVABILITY.slice(idx2, idx2 + 4000);
    expect(body2).toMatch(/!\/\^\\d\+\$\/\.test/);
  });
});
