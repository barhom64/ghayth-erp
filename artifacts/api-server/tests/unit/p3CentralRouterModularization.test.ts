import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

// ─── P3 — central router modularisation contract ──────────────────────────
//
// The senior architectural review's finding #4: routes/index.ts was a
// 529-line monolith with 120 router.use(...) calls. Any wrong mount
// order broke paths, and adding a new domain required touching the
// orchestrator file. P3 split it into three files:
//
//   - routes/index.ts        — thin orchestrator (~180 lines)
//   - routes/_limiters.ts    — per-user limiter declarations
//   - routes/_domain-mounts.ts — single function mountDomainRouters()
//
// This file locks the contract so a regression PR can't quietly fold
// the mount calls back into routes/index.ts.

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const read = (p: string) => readFileSync(join(REPO_ROOT, p), "utf8");

const INDEX = read("artifacts/api-server/src/routes/index.ts");
const LIMITERS = read("artifacts/api-server/src/routes/_limiters.ts");
const DOMAIN_MOUNTS = read("artifacts/api-server/src/routes/_domain-mounts.ts");

describe("P3 — routes/index.ts is now a thin orchestrator", () => {
  it("is significantly shorter than the pre-P3 monolith (target < 250 lines)", () => {
    const lines = INDEX.split("\n").length;
    expect(lines).toBeLessThan(250);
  });

  it("imports mountDomainRouters from _domain-mounts.ts", () => {
    expect(INDEX).toContain('from "./_domain-mounts.js"');
    expect(INDEX).toContain("mountDomainRouters");
  });

  it("calls mountDomainRouters(router) exactly once (semicolon-terminated)", () => {
    // The trailing `;` rules out occurrences inside JSDoc/comments
    // (those don't carry the terminator).
    const calls = INDEX.match(/^mountDomainRouters\s*\(\s*router\s*\)\s*;/gm) ?? [];
    expect(calls.length).toBe(1);
  });

  it("imports per-user limiters from _limiters.ts (no inline createPerUserLimiter calls in index.ts)", () => {
    // The orchestrator may still create the global limiter, but the six
    // module limiters (umrah / finance / properties / fleet / warehouse /
    // hr) must live in _limiters.ts.
    expect(INDEX).not.toMatch(/createPerUserLimiter\(\s*\{[^}]*prefix:\s*"(umrah|finance|properties|fleet|warehouse|hr)"/);
  });

  it("mountDomainRouters call sits AFTER the auth + csrf + subscriptionGate chain", () => {
    const authIdx = INDEX.indexOf("router.use(authMiddleware)");
    const csrfIdx = INDEX.indexOf("router.use(csrfMiddleware)");
    const subIdx = INDEX.indexOf("router.use(subscriptionGate)");
    // Use the semicolon-terminated form so we hit the actual call,
    // not the inline mention in the import comment.
    const mountIdx = INDEX.search(/^mountDomainRouters\s*\(\s*router\s*\)\s*;/m);
    expect(authIdx).toBeGreaterThan(-1);
    expect(csrfIdx).toBeGreaterThan(-1);
    expect(subIdx).toBeGreaterThan(-1);
    expect(mountIdx).toBeGreaterThan(authIdx);
    expect(mountIdx).toBeGreaterThan(csrfIdx);
    expect(mountIdx).toBeGreaterThan(subIdx);
  });
});

describe("P3 — _limiters.ts owns the per-user limiter declarations", () => {
  it("exports all six module-scoped limiters", () => {
    for (const name of [
      "umrahUserLimiter",
      "financeUserLimiter",
      "propertiesUserLimiter",
      "fleetUserLimiter",
      "warehouseUserLimiter",
      "hrUserLimiter",
    ]) {
      expect(LIMITERS).toMatch(new RegExp(`export const ${name}`));
    }
  });

  it("each limiter declares the standard shape (60s window, 300 cap)", () => {
    expect(LIMITERS).toMatch(/windowMs:\s*60\s*\*\s*1000/);
    expect(LIMITERS).toMatch(/max:\s*300/);
  });
});

describe("P3 — _domain-mounts.ts exports a single mountDomainRouters function", () => {
  it("exports mountDomainRouters with IRouter signature", () => {
    expect(DOMAIN_MOUNTS).toMatch(/export\s+function\s+mountDomainRouters\s*\(\s*router:\s*IRouter\s*\)/);
  });

  it("contains all the high-traffic domain mounts", () => {
    const domains = [
      '/dashboard',
      '/employees',
      '/clients',
      '/hr',
      '/finance',
      '/fleet',
      '/cargo',
      '/warehouse',
      '/properties',
      '/legal',
      '/projects',
      '/support',
      '/crm',
      '/umrah',
      '/admin',
      '/print',
      '/calendar',
      '/obligations',
    ];
    for (const path of domains) {
      expect(DOMAIN_MOUNTS).toContain(`"${path}"`);
    }
  });

  it("preserves the wiring-stubs ordering: every stub router mounts before wiringScopeErrorHandler", () => {
    const stubsIdx = DOMAIN_MOUNTS.indexOf("warehouseStubsRouter");
    const errIdx = DOMAIN_MOUNTS.indexOf("wiringScopeErrorHandler");
    expect(stubsIdx).toBeGreaterThan(-1);
    expect(errIdx).toBeGreaterThan(stubsIdx);
  });

  it("preserves the finance subRouter ordering (invoices → journal → glHelpers → … → costCenters)", () => {
    // Slice to the body of mountDomainRouters() — imports list the
    // routers too and indexOf would match those instead of the mount
    // calls. Boundary: from the function signature to its closing brace.
    const fnStart = DOMAIN_MOUNTS.indexOf("export function mountDomainRouters");
    expect(fnStart).toBeGreaterThan(-1);
    const body = DOMAIN_MOUNTS.slice(fnStart);

    const order = [
      "invoicesRouter",
      "journalRouter",
      "glHelpersRouter",
      "purchaseRouter",
      "reportsRouter",
      "custodiesRouter",
      "zatcaRouter",
      "accountingEngineRouter",
      "financeAlgorithmsRouter",
      "collectionRouter",
      "budgetRouter",
      "accountsRouter",
      "vendorsRouter",
      "vendorContractsRouter",
      "financeHardeningRouter",
      "recurringRouter",
      "costCentersRouter",
    ];
    let lastIdx = -1;
    for (const router of order) {
      const idx = body.indexOf(router);
      expect(idx, `finance subRouter ${router} should be present and in order`).toBeGreaterThan(lastIdx);
      lastIdx = idx;
    }
  });

  it("each finance subRouter mount carries requireGuards('financial')", () => {
    // The systemGovernor financial guard MUST stay applied after the
    // modularisation. Scan line-by-line because regex on multi-paren
    // SQL/JS strings won't balance.
    //
    // financeStubsRouter is an INTENTIONAL exception: it carries
    // requireMinLevel(20) instead of requireGuards("financial") because
    // it returns canned envelopes for routes not yet implemented. Skip
    // the stubs line explicitly.
    const financeMounts = DOMAIN_MOUNTS.split("\n").filter((line) =>
      /^\s*router\.use\("\/finance"/.test(line),
    );
    expect(financeMounts.length).toBeGreaterThan(10);
    for (const mount of financeMounts) {
      if (mount.includes("financeUserLimiter")) continue; // limiter is bare
      if (mount.includes("financeStubsRouter")) continue; // GAP_MATRIX #17 stubs exception
      expect(mount).toContain('requireModule("finance")');
      expect(mount).toContain('requireGuards("financial")');
    }
  });
});
