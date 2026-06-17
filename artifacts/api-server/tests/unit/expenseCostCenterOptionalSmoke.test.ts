import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2230 — «بيانات مأخوذة آليًا». A scenario-linked expense attributes its cost
 * through the allocation dimensions (vehicle / property / project / …), so the
 * operator should NOT also be forced to pick a department cost-center. It is
 * required only for a free (unlinked) expense.
 */
const FORM = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/create/finance/expenses-create.tsx"),
  "utf8",
);

describe("expenses-create — cost center optional when a scenario attributes the cost", () => {
  it("requires cost center only when no scenario is linked", () => {
    expect(FORM).toMatch(/\(form\.costCenter \|\| allocTarget\.target !== "none"\) \? null :/);
  });
  it("marks the cost-center field required only without a scenario", () => {
    expect(FORM).toMatch(/required=\{allocTarget\.target === "none"\}/);
  });
});
