import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2230 — journal-manual-create had no branch field, so multi-branch users
 * hit BRANCH_REQUIRED server-side (journal-create already handles it). Mirror
 * the exemplar: a BranchSelect + branchId in the payload.
 */

const FORM = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/create/finance/journal-manual-create.tsx"),
  "utf8",
);

describe("journal-manual-create — branch field", () => {
  it("imports + renders a BranchSelect", () => {
    expect(FORM).toMatch(/import \{[^}]*BranchSelect[^}]*\} from "@\/components\/shared\/entity-selects"/);
    expect(FORM).toMatch(/<BranchSelect/);
  });

  it("sends branchId (number | undefined) in the create payload", () => {
    expect(FORM).toMatch(/branchId: form\.branchId \? Number\(form\.branchId\) : undefined/);
  });
});
