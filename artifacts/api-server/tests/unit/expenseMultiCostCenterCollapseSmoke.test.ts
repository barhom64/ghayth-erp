import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2230 — progressive disclosure. The «توزيع على عدة مراكز تكلفة» block was
 * always rendered (empty by default) and rarely used. It is now collapsed
 * behind a toggle, opening only on demand (or when a restored draft already
 * carries distribution rows).
 */
const FORM = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/create/finance/expenses-create.tsx"),
  "utf8",
);

describe("expenses-create — multi cost-center distribution collapses by default", () => {
  it("has a collapse toggle (ccOpen)", () => {
    expect(FORM).toMatch(/const \[ccOpen, setCcOpen\] = useState\(false\)/);
    expect(FORM).toMatch(/setCcOpen\(\(v\) => !v\)/);
  });
  it("renders the distribution body only when opened or already populated", () => {
    expect(FORM).toMatch(/\(ccOpen \|\| ccRows\.length > 0\) && \(<>/);
  });
});
