/**
 * PR-4 (#2163) — Orphan Cleanup.
 *
 * PR-0 audit found 5 orphan routes in §6 (routes missing nav or
 * nav missing route). PR-4 resolves the 4 tractable items:
 *
 *   1. /umrah/commission-plans/new — deep-link-only (opened via button
 *      on /umrah/commission-plans). Must NOT appear as a standalone nav
 *      item. The parent list page must contain the "new" link.
 *
 *   2. /my/work-queue — back-compat legacy alias. PR-4 converts it to a
 *      wouter redirect shell (→ /work-inbox). Route entry stays in
 *      miscRoutes for back-compat; PageShell is removed.
 *
 *   3. /umrah/transport-requests — nav-add. Route existed but had no
 *      nav entry. PR-4 adds it under العمرة → النقل with perm "umrah:list".
 *
 *   4/5. /admin/attendance-categories + /admin/scoring-weights — already
 *      resolved by PR-3 (#2163). Confirmed here as regression pins.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const FE = join(REPO_ROOT, "artifacts/ghayth-erp/src");

const NAV      = readFileSync(join(FE, "components/layout/navigation.registry.ts"), "utf8");
const MISC     = readFileSync(join(FE, "routes/miscRoutes.tsx"), "utf8");
const UMRAH    = readFileSync(join(FE, "routes/umrahRoutes.tsx"), "utf8");
const ADMIN    = readFileSync(join(FE, "routes/adminRoutes.tsx"), "utf8");
const WQ_PAGE  = readFileSync(join(FE, "pages/my/work-queue.tsx"), "utf8");
const COMM_PG  = readFileSync(join(FE, "pages/umrah/commission-plans.tsx"), "utf8");

describe("PR-4 (#2163) — commission-plans/new is deep-link-only", () => {
  it("nav registry has NO standalone entry for /umrah/commission-plans/new", () => {
    expect(NAV).not.toMatch(/\/umrah\/commission-plans\/new/);
  });

  it("the commission-plans list page contains the 'new' deep link", () => {
    expect(COMM_PG).toMatch(/\/umrah\/commission-plans\/new/);
  });
});

describe("PR-4 (#2163) — /my/work-queue is a back-compat redirect shell", () => {
  it("work-queue.tsx has no PageShell (it is a redirect, not a live page)", () => {
    expect(WQ_PAGE).not.toMatch(/PageShell/);
  });

  it("work-queue.tsx redirects to /work-inbox via wouter setLocation", () => {
    expect(WQ_PAGE).toMatch(/setLocation\("\/work-inbox"\)/);
  });

  it("miscRoutes still binds /my/work-queue (back-compat — route must not be deleted)", () => {
    expect(MISC).toMatch(/path:\s*"\/my\/work-queue"/);
  });
});

describe("PR-4 (#2163) — /umrah/transport-requests has a nav entry", () => {
  it("nav registry contains transport-requests item with perm umrah:list", () => {
    expect(NAV).toMatch(/path:\s*"\/umrah\/transport-requests"/);
    expect(NAV).toMatch(/perm:\s*"umrah:list"/);
  });

  it("transport-requests nav item is in the العمرة section (near transport)", () => {
    const transportIdx = NAV.indexOf('"/umrah/transport"');
    const requestsIdx  = NAV.indexOf('"/umrah/transport-requests"');
    expect(transportIdx).toBeGreaterThan(-1);
    expect(requestsIdx).toBeGreaterThan(-1);
    // must appear close together (within 200 chars)
    expect(Math.abs(requestsIdx - transportIdx)).toBeLessThan(200);
  });

  it("umrahRoutes binds /umrah/transport-requests to a component", () => {
    expect(UMRAH).toMatch(/path:\s*"\/umrah\/transport-requests"/);
  });
});

describe("PR-4 (#2163) — PR-3 redirects confirmed (regression pins)", () => {
  it("/admin/attendance-categories is a redirect shell, NOT a live page (PR-3 pin)", () => {
    expect(ADMIN).toMatch(/RedirectToHrAttendanceCategories/);
    expect(ADMIN).not.toMatch(/AdminAttendanceCategories\s*=\s*lazy/);
  });

  it("/admin/scoring-weights is a redirect shell, NOT a live page (PR-3 pin)", () => {
    expect(ADMIN).toMatch(/RedirectToHrScoringWeights/);
    expect(ADMIN).not.toMatch(/AdminScoringWeights\s*=\s*lazy/);
  });
});
