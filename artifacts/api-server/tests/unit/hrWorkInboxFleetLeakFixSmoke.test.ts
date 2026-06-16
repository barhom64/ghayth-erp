/**
 * PR-5a (#2077) — fleet-middleware leak fix smoke.
 *
 * Before PR-5a, seven `router.use(requireModule("fleet"), …, subRouter)`
 * mounts in routes/index.ts lacked a path prefix. Express runs middleware
 * on EVERY incoming request reaching that point — even ones the subRouter
 * won't match — so the fleet+financial guards fired for /my-space,
 * /tasks, /notifications, /work-inbox, etc., and any non-fleet operator
 * got 403 with `requiredModule: ["fleet"]`.
 *
 * PR-5 surfaced it on the live tenant: HR Manager couldn't load the
 * unified inbox. PR-5a fixed it with a path-conditional gate
 * (`gateForFleetPaths`). main independently hit the same bug under
 * #1959 and shipped an equivalent path-conditional gate
 * (`transportPathGate`) — when the wave branch merged into main, both
 * collapsed onto main's symbol names. The semantic guarantee is
 * identical: the fleet-module gate runs ONLY when req.path starts with
 * /transport or /fleet, and EVERY one of the seven previously-leaky
 * routers mounts without a per-mount fleet guard now that the path gate
 * lives upstream. The pins below are rewritten against the surviving
 * names so the regression they were designed to catch stays trapped.
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

describe("PR-5a (#2077) — transportPathGate exists + is path-conditional", () => {
  it("declares the gate as a RequestHandler", () => {
    expect(INDEX_SRC).toMatch(/const transportPathGate: RequestHandler =/);
  });
  it("gate short-circuits when req.path is NOT /transport* or /fleet*", () => {
    // The else-branch (`next()`) is what makes /my-space, /tasks,
    // /notifications, /work-inbox reachable for non-fleet operators.
    expect(INDEX_SRC).toMatch(/if \(req\.path\.startsWith\("\/transport"\) \|\| req\.path\.startsWith\("\/fleet"\)\)/);
    expect(INDEX_SRC).toMatch(/transportPathGate[\s\S]{0,400}next\(\);\s*\}/);
  });
  it("gate composes requireModule(\"fleet\") + requireGuards(\"financial\") in that order", () => {
    expect(INDEX_SRC).toMatch(/const fleetModuleGate = requireModule\("fleet"\)/);
    expect(INDEX_SRC).toMatch(/const transportFinancialGate = requireGuards\("financial"\)/);
    expect(INDEX_SRC).toMatch(/fleetModuleGate\(req, res, \(err\?: unknown\) => \(err \? next\(err as Error\) : transportFinancialGate\(req, res, next\)\)\)/);
  });
});

describe("PR-5a (#2077) — the 7 previously-leaky routers mount without a per-mount fleet guard", () => {
  // After main's #1959 cleanup, the gate is mounted ONCE upstream
  // (`router.use(transportPathGate)`) and each transport/fleet sub-router
  // mounts plainly. The semantic guarantee is the SAME as PR-5a's
  // `router.use(fleetGuards(), subRouter)` pattern; the regression we
  // need to catch is "fleet guards reattached to a path-less mount".
  it("transportPathGate is mounted once, before the seven sub-routers", () => {
    expect(INDEX_SRC).toMatch(/router\.use\(transportPathGate\);[\s\S]{0,80}router\.use\(transportBookingsRouter\)/);
  });
  for (const sym of [
    "transportBookingsRouter",
    "vehicleProfileRouter",
    "transportPricingRouter",
    "transportPlanningRouter",
    "transportIntegrationRouter",
    "transportRoutePatternsRouter",
    "fleetRulesAdminRouter",
  ]) {
    it(`${sym} mounts plain (no per-mount fleet guard)`, () => {
      expect(INDEX_SRC).toMatch(new RegExp(`router\\.use\\(${sym}\\)`));
    });
  }
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
