import { describe, it, expect } from "vitest";
import { projectGrantsToFlat, projectGrantsToFine, projectGrantsToCoarse } from "../../src/lib/rbac/flatProjection.js";

// ══════════════════════════════════════════════════════════════════════════
// Parity gate — RBAC v2 → flat projection (Ghaith Operating Foundation #1413)
//
// The frontend can() reads a flat module:action set; the backend enforces with
// RBAC v2 feature.action. projectGrantsToFlat is the bridge. These tests are
// the runnable contract that the projected set covers what the backend allows,
// so UI visibility never falls short of enforcement (الخطة الجذرية §3 م1/م6).
// ══════════════════════════════════════════════════════════════════════════

describe("projectGrantsToFlat — RBAC v2 → flat parity", () => {
  it("emits BOTH coarse module:action and fine feature.action for every grant", () => {
    const out = projectGrantsToFlat([{ feature_key: "finance.invoices", actions: ["create", "approve"] }]);
    expect(out).toContain("finance:create");          // coarse
    expect(out).toContain("finance:approve");         // coarse
    expect(out).toContain("finance.invoices:create"); // fine
    expect(out).toContain("finance.invoices:approve");// fine
    expect(out).toHaveLength(4);
  });

  it("de-duplicates the coarse keys across features of the same module", () => {
    const out = projectGrantsToFlat([
      { feature_key: "finance.invoices", actions: ["approve"] },
      { feature_key: "finance.payments", actions: ["approve"] },
    ]);
    // one coarse finance:approve, two distinct fine keys
    expect(out.filter((k) => k === "finance:approve")).toHaveLength(1);
    expect(out).toContain("finance.invoices:approve");
    expect(out).toContain("finance.payments:approve");
  });

  it("covers every enforced action — projected coarse ⊇ each grant's actions", () => {
    const grants = [{ feature_key: "hr.leaves", actions: ["view", "list", "create", "update", "approve", "reject"] }];
    const out = projectGrantsToFlat(grants);
    for (const a of grants[0].actions) {
      expect(out).toContain(`hr:${a}`);        // coarse parity
      expect(out).toContain(`hr.leaves:${a}`); // fine parity
    }
  });

  it("skips malformed rows without throwing (load-bearing endpoint safety)", () => {
    const out = projectGrantsToFlat([
      { feature_key: "", actions: ["create"] },
      { feature_key: "fleet.trips", actions: null },
      { feature_key: "fleet.trips", actions: ["create", "", "  "] },
      // @ts-expect-error — defensive: undefined row tolerated
      undefined,
    ]);
    expect(out).toEqual(["fleet:create", "fleet.trips:create"]);
  });

  it("returns an empty array for no grants", () => {
    expect(projectGrantsToFlat([])).toEqual([]);
    expect(projectGrantsToFine([])).toEqual([]);
    expect(projectGrantsToCoarse([])).toEqual([]);
  });
});

describe("projectGrantsToFine — bridge form (precise, no coarse leak)", () => {
  it("emits ONLY fine feature.action keys", () => {
    const out = projectGrantsToFine([{ feature_key: "finance.invoices", actions: ["create", "approve"] }]);
    expect(out).toEqual(["finance.invoices:create", "finance.invoices:approve"]);
    expect(out.some((k) => k === "finance:approve")).toBe(false); // no coarse key
  });
  it("keeps two features of the same module distinct (so the matcher stays precise)", () => {
    const out = projectGrantsToFine([
      { feature_key: "finance.invoices", actions: ["approve"] },
      { feature_key: "finance.payments", actions: ["view"] },
    ]);
    expect(out).toContain("finance.invoices:approve");
    expect(out).toContain("finance.payments:view");
    expect(out).not.toContain("finance.payments:approve"); // payments has no approve ⇒ precise
  });
});

describe("projectGrantsToCoarse — legacy-cache form", () => {
  it("emits ONLY coarse module:action keys, de-duplicated", () => {
    const out = projectGrantsToCoarse([
      { feature_key: "finance.invoices", actions: ["approve"] },
      { feature_key: "finance.payments", actions: ["approve"] },
    ]);
    expect(out).toEqual(["finance:approve"]);
  });
});
