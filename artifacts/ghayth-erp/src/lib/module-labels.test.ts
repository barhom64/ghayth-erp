/**
 * module-labels — moduleLabel / moduleFromPath tests. Batch 19 (tail sweep) of
 * the FE behavioral-coverage effort (ghayth-review documented gap).
 *
 * moduleLabel resolves the canonical Arabic name for a module key (the module
 * exists because `property` drifted between "الأملاك"/"العقارات" and `fleet`
 * between "الأسطول"/"النقليات" — the dominant label is pinned here).
 *
 * moduleFromPath carries the real logic: it maps a route path to a module key
 * with several NON-obvious rules — /employees → hr, /projects AND /tasks →
 * operations (not "projects"), /clients → crm, unknown → null. Those are the
 * easy-to-break bits, so each is pinned. Test-only — zero production code.
 */
import { describe, it, expect } from "vitest";
import { moduleLabel, moduleFromPath } from "./module-labels";

describe("moduleLabel", () => {
  it("resolves the dominant Arabic label for ambiguous modules", () => {
    expect(moduleLabel("property")).toBe("الأملاك"); // not "العقارات"
    expect(moduleLabel("fleet")).toBe("الأسطول"); // not "النقليات"
    expect(moduleLabel("hr")).toBe("الموارد البشرية");
  });

  it("returns '' for nullish and the raw key for an uncatalogued module", () => {
    expect(moduleLabel(null)).toBe("");
    expect(moduleLabel("")).toBe("");
    expect(moduleLabel("nope")).toBe("nope");
  });
});

describe("moduleFromPath", () => {
  it("maps the obvious prefixes to their module key", () => {
    expect(moduleFromPath("/hr/employees/42")).toBe("hr");
    expect(moduleFromPath("/finance/invoices")).toBe("finance");
    expect(moduleFromPath("/fleet/vehicles")).toBe("fleet");
    expect(moduleFromPath("/settings/branches")).toBe("settings");
  });

  it("applies the non-obvious aliases", () => {
    expect(moduleFromPath("/employees/42")).toBe("hr"); // employees → hr
    expect(moduleFromPath("/projects/7")).toBe("operations"); // projects → operations
    expect(moduleFromPath("/tasks")).toBe("operations"); // tasks → operations
    expect(moduleFromPath("/clients/9")).toBe("crm"); // clients → crm
    expect(moduleFromPath("/properties/3")).toBe("property"); // properties → property
  });

  it("returns null for an unrecognised path", () => {
    expect(moduleFromPath("/something-else")).toBeNull();
    expect(moduleFromPath("/")).toBeNull();
  });
});
