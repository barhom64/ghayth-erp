/**
 * PR-5a (#2077) — fleet-middleware leak fix smoke.
 *
 * Before PR-5a, seven `router.use(requireModule("fleet"), …, subRouter)`
 * mounts in routes/index.ts (lines around 397/400/403/410/415/417/418)
 * lacked a path prefix. Express runs middleware on EVERY incoming
 * request reaching that point — even ones the subRouter won't match —
 * so the fleet+financial guards fired for /my-space, /tasks,
 * /notifications, /work-inbox, etc., and any non-fleet operator got
 * 403 with `requiredModule: ["fleet"]`.
 *
 * PR-5 surfaced it on the live tenant: HR Manager couldn't load the
 * unified inbox. PR-5a fixes it by wrapping each mount in a
 * path-conditional gate (`gateForFleetPaths`) that forwards to the
 * fleet guards ONLY when req.path starts with /transport/ or /fleet/.
 *
 * Source-only test — the live verify (re-run of verify-hr-work-inbox-
 * journey.sh with `RUN_AS_HR=1`) is the behavioral proof.
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const INDEX_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/index.ts"),
  "utf8",
);

describe("PR-5a (#2077) — gateForFleetPaths helper exists + is path-aware", () => {
  it("declares the helper", () => {
    expect(INDEX_SRC).toMatch(/function gateForFleetPaths\([\s\S]{0,200}RequestHandler\b/);
  });
  it("the helper short-circuits when req.path is NOT /transport/* or /fleet/*", () => {
    // The early-return is what makes /my-space + /tasks + /notifications
    // reachable for non-fleet operators. Pin it.
    expect(INDEX_SRC).toMatch(/if \(!req\.path\.startsWith\("\/transport\/"\)\s*&&\s*!req\.path\.startsWith\("\/fleet\/"\)\)\s*\{[\s\S]{0,80}return next\(\);[\s\S]{0,40}\}/);
  });
  it("the helper chains the passed middlewares (cooperates with Express next)", () => {
    expect(INDEX_SRC).toMatch(/runNext: import\("express"\)\.NextFunction = \(err\) => \{[\s\S]{0,300}mw\(req, res, runNext\)/);
  });
});

describe("PR-5a (#2077) — the 7 previously-leaky mounts now use the gate", () => {
  // Each subRouter mount is rewritten to `router.use(fleetGuards(), subRouter)`.
  // The fleetGuards() factory returns a fresh gateForFleetPaths instance
  // per mount (so each one carries its own require* closure state).
  it("transportBookingsRouter mount uses fleetGuards()", () => {
    expect(INDEX_SRC).toMatch(/router\.use\(fleetGuards\(\),\s*transportBookingsRouter\)/);
  });
  it("vehicleProfileRouter mount uses fleetGuards()", () => {
    expect(INDEX_SRC).toMatch(/router\.use\(fleetGuards\(\),\s*vehicleProfileRouter\)/);
  });
  it("transportPricingRouter mount uses fleetGuards()", () => {
    expect(INDEX_SRC).toMatch(/router\.use\(fleetGuards\(\),\s*transportPricingRouter\)/);
  });
  it("transportPlanningRouter mount uses fleetGuards()", () => {
    expect(INDEX_SRC).toMatch(/router\.use\(fleetGuards\(\),\s*transportPlanningRouter\)/);
  });
  it("transportIntegrationRouter mount uses fleetGuards()", () => {
    expect(INDEX_SRC).toMatch(/router\.use\(fleetGuards\(\),\s*transportIntegrationRouter\)/);
  });
  it("transportRoutePatternsRouter mount uses fleetGuards()", () => {
    expect(INDEX_SRC).toMatch(/router\.use\(fleetGuards\(\),\s*transportRoutePatternsRouter\)/);
  });
  it("fleetRulesAdminRouter mount uses fleetGuards()", () => {
    expect(INDEX_SRC).toMatch(/router\.use\(fleetGuards\(\),\s*fleetRulesAdminRouter\)/);
  });
});

describe("PR-5a (#2077) — regression pin: the unbound pattern is GONE", () => {
  // A regex that catches the old shape directly: `router.use(requireModule("fleet"), …, <subRouter>)`
  // without a path string. If a future PR re-introduces this shape, the test fails.
  it("no bare `router.use(requireModule(\"fleet\"), ..., subRouter)` left in code (comments ignored)", () => {
    // Strip line-comments before checking so the explanatory comment
    // block doesn't trip the pin. The bug pattern was a code-level
    // `router.use(requireModule("fleet"), ..., subRouter)` without a
    // path string — only matters when it's actual code, not docs.
    const codeOnly = INDEX_SRC.replace(/\/\/[^\n]*/g, "");
    expect(codeOnly).not.toMatch(/router\.use\(requireModule\("fleet"\)/);
  });
});

describe("PR-5a (#2077) — non-fleet mounts that previously leaked are now reachable", () => {
  // These three mounts MUST still be registered after the gate change
  // (they're what the leak was blocking — so the test confirms they
  // exist and are routed without the fleet middleware in the way).
  it("/my-space mount is intact", () => {
    expect(INDEX_SRC).toMatch(/router\.use\("\/my-space",\s*mySpaceRouter\)/);
  });
  it("/notifications mount is intact", () => {
    expect(INDEX_SRC).toMatch(/router\.use\("\/notifications",[^)]*notificationsRouter\)/);
  });
  it("/tasks mount is intact (gated on `operations` module, not fleet)", () => {
    // /tasks is module-gated to `operations` (its real module), NOT
    // fleet. Before PR-5a the fleet middleware leak overrode that
    // gate for non-fleet operators. Pin the mount shape.
    expect(INDEX_SRC).toMatch(/router\.use\("\/tasks",\s*requireModule\("operations"\),\s*tasksRouter\)/);
  });
});
