/**
 * IGOC-002 — Print/Export tenant isolation gates.
 *
 * An IGOC audit (see docs/IGOC_IDENTITY_GOVERNANCE_TASK.md §1 item 13)
 * found that export/print/scheduled-reports endpoints had `authorize()`
 * + companyId filtering in 95% of cases — but 3 endpoints accepted
 * arbitrary entityType + entityId without proving the requesting tenant
 * owns the resource. The risk: enumerate sequential entity ids to
 * inspect / re-print / list-archive competitor documents.
 *
 * This file pins the 3 fixes applied to routes/print.ts:
 *
 *   1. GET /queue/:id — must hit print_jobs first, 404 cross-tenant ids
 *   2. POST /reprint-requests — must prove "we printed this", else 404
 *   3. GET /archive/:entityType/:entityId — same proof, but empty list
 *      rather than 404 (archive lookups are speculative)
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const PRINT_SRC = readFileSync(join(REPO_ROOT, "artifacts/api-server/src/routes/print.ts"), "utf8");

describe("IGOC-002 — GET /queue/:id tenant isolation", () => {
  it("looks up print_jobs by companyId BEFORE calling the queue backend", () => {
    const handler = extractHandler(PRINT_SRC, '"/queue/:id"');
    expect(handler).toMatch(/scopeFromReq\(req\)/);
    expect(handler).toMatch(/FROM print_jobs[\s\S]*?"jobId"::text = \$1 AND "companyId" = \$2/);
  });

  it("returns 404 (not 200/500) for ids the company doesn't own", () => {
    const handler = extractHandler(PRINT_SRC, '"/queue/:id"');
    expect(handler).toMatch(/if \(!ownership\) return res\.status\(404\)/);
  });

  it("ownership check sits BEFORE the queue backend import", () => {
    const handler = extractHandler(PRINT_SRC, '"/queue/:id"');
    const ownershipIdx = handler.indexOf("FROM print_jobs");
    const backendIdx = handler.indexOf("getBackend");
    expect(ownershipIdx).toBeGreaterThan(0);
    expect(backendIdx).toBeGreaterThan(ownershipIdx);
  });
});

describe("IGOC-002 — POST /reprint-requests tenant isolation", () => {
  it("verifies a prior print_jobs row exists in the caller's company before INSERT", () => {
    const handler = extractHandler(PRINT_SRC, '"/reprint-requests"');
    expect(handler).toMatch(/FROM print_jobs[\s\S]*?"companyId" = \$1 AND "entityType" = \$2 AND "entityId" = \$3/);
  });

  it("throws NotFoundError when no prior print exists (Arabic message)", () => {
    const handler = extractHandler(PRINT_SRC, '"/reprint-requests"');
    expect(handler).toMatch(/throw new NotFoundError/);
    expect(handler).toMatch(/لا يوجد سجل طباعة سابق لهذا المستند في شركتك/);
  });

  it("proof check happens BEFORE the INSERT into print_reprint_requests", () => {
    const handler = extractHandler(PRINT_SRC, '"/reprint-requests"');
    const proofIdx = handler.indexOf("FROM print_jobs");
    const insertIdx = handler.indexOf("INSERT INTO print_reprint_requests");
    expect(proofIdx).toBeGreaterThan(0);
    expect(insertIdx).toBeGreaterThan(proofIdx);
  });
});

describe("IGOC-002 — GET /archive/:entityType/:entityId tenant isolation", () => {
  it("verifies a prior print_jobs row exists before calling listEntityPrints", () => {
    const handler = extractHandler(PRINT_SRC, '"/archive/:entityType/:entityId"');
    expect(handler).toMatch(/FROM print_jobs[\s\S]*?"companyId" = \$1 AND "entityType" = \$2 AND "entityId" = \$3/);
  });

  it("returns empty items[] (not 404) when no proof — archive lookups are speculative", () => {
    const handler = extractHandler(PRINT_SRC, '"/archive/:entityType/:entityId"');
    expect(handler).toMatch(/if \(!proof\) \{[\s\S]*?return res\.json\(\{ items: \[\] \}\)/);
  });

  it("proof check sits BEFORE the dynamic import of archive.js", () => {
    const handler = extractHandler(PRINT_SRC, '"/archive/:entityType/:entityId"');
    const proofIdx = handler.indexOf("FROM print_jobs");
    const importIdx = handler.indexOf('import("../lib/print/archive.js")');
    expect(proofIdx).toBeGreaterThan(0);
    expect(importIdx).toBeGreaterThan(proofIdx);
  });
});

describe("IGOC-002 — All 3 gates use companyId from the request scope", () => {
  it("each gate reads scope.companyId, not from req.body or req.query", () => {
    // 3 occurrences expected (one per gate).
    const matches = PRINT_SRC.match(/scope\.companyId\b/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("each gate uses scopeFromReq() helper (never raw req.scope)", () => {
    // 3 gates × 1 each, but other handlers also use this — assert ≥ 3.
    const matches = PRINT_SRC.match(/scopeFromReq\(req\)/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── helpers ───────────────────────────────────────────────────────────────
function extractHandler(src: string, routePattern: string): string {
  const re = new RegExp(`router\\.(get|post|delete|patch|put)\\(\\s*${routePattern}`);
  const match = src.match(re);
  if (!match || match.index === undefined) {
    throw new Error(`route ${routePattern} not found in print.ts`);
  }
  // Take the next ~50 lines from the match — enough to capture the handler
  // body without slurping the next route's body.
  const start = match.index;
  const end = src.indexOf("\nrouter.", start + 10);
  return end > start ? src.slice(start, end) : src.slice(start, start + 3000);
}
