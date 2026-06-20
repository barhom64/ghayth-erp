/**
 * RBAC-REV-WILDCARD — permissionMatches must expand a module-level wildcard
 * grant (`module.*`, as projected from the manager seed `finance.*` /`hr.*`)
 * so it satisfies FINE asks (`module.feature:action`). Without this, a finance
 * manager holding `finance.*` failed `finance.journals:list` and lost
 * fine-gated buttons/pages. The expansion is strictly additive (only widens
 * for module.* holders) — existing matches must keep working.
 */
import { describe, it, expect } from "vitest";
import { permissionMatches } from "@/lib/permission-match";

describe("permissionMatches — module.* wildcard expansion", () => {
  it("module.* grant satisfies a fine ask of the same action", () => {
    expect(permissionMatches(["finance.*:list"], "finance.journals:list")).toBe(true);
    expect(permissionMatches(["finance.*:create"], "finance.invoices:create")).toBe(true);
    expect(permissionMatches(["hr.*:approve"], "hr.leaves:approve")).toBe(true);
  });

  it("module.*:* (all actions) satisfies any fine ask in the module", () => {
    expect(permissionMatches(["finance.*:*"], "finance.fixed-assets:delete")).toBe(true);
  });

  it("does NOT leak across modules or actions", () => {
    expect(permissionMatches(["finance.*:list"], "hr.payroll:list")).toBe(false);
    expect(permissionMatches(["finance.*:list"], "finance.journals:create")).toBe(false);
  });

  it("a SPECIFIC fine grant still does not satisfy a sibling feature (no over-match)", () => {
    // procurement officer: finance.purchase only — must NOT see journals.
    expect(permissionMatches(["finance.purchase:list"], "finance.purchase:list")).toBe(true);
    expect(permissionMatches(["finance.purchase:list"], "finance.journals:list")).toBe(false);
  });

  it("regression — pre-existing match rules still hold", () => {
    expect(permissionMatches(["*"], "anything:view")).toBe(true);
    expect(permissionMatches(["finance:*"], "finance.journals:list")).toBe(true);
    expect(permissionMatches(["finance.journals:*"], "finance.journals:list")).toBe(true);
    expect(permissionMatches(["finance:list"], "finance:list")).toBe(true);
    // coarse ask satisfied by a fine grant in the module
    expect(permissionMatches(["finance.invoices:create"], "finance:create")).toBe(true);
    expect(permissionMatches([], "finance:list")).toBe(false);
  });
});
