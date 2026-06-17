import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2230 — progressive disclosure. VAT is rare on a typical expense, so the tax
 * code + inclusive-amount fields are collapsed behind a toggle. The amount
 * stays visible; the tax block opens on demand (or auto when a tax code is set).
 */
const FORM = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/create/finance/expenses-create.tsx"),
  "utf8",
);

describe("expenses-create — VAT fields collapse by default", () => {
  it("has a tax collapse toggle (taxOpen)", () => {
    expect(FORM).toMatch(/const \[taxOpen, setTaxOpen\] = useState\(false\)/);
  });
  it("renders the tax fields only when opened or a tax code is already set", () => {
    expect(FORM).toMatch(/\(taxOpen \|\| form\.taxCodeId\) && \(/);
  });
});
