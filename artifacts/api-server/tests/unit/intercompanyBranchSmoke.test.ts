import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-hardening.ts"),
  "utf8"
);

// ─── POST /intercompany — branch isolation (audit #15) ──────────────────────
// The to-side JE used to use scope.branchId (the SOURCE company's
// branch). Branch ids are NOT shared across companies; this leaked
// the user's home-company branch into the destination company,
// where it might not exist as a valid branch row at all.

describe("createIntercompanySchema accepts toBranchId", () => {
  it("declares toBranchId as optional", () => {
    expect(ROUTE).toMatch(/toBranchId:\s*z\.coerce\.number\(\)\.optional\(\)/);
  });
  it("destructures toBranchId from the parsed body", () => {
    expect(ROUTE).toMatch(/const \{ toCompanyId, toBranchId,/);
  });
});

describe("validates toBranchId belongs to toCompanyId", () => {
  const idx = ROUTE.indexOf('"/intercompany"', ROUTE.indexOf("financeHardeningRouter.post"));
  // Look at the handler body before postJournalEntry.
  const upToPost = ROUTE.slice(idx, ROUTE.indexOf("financialEngine.postJournalEntry", idx));

  it("queries branches WHERE id + companyId match when toBranchId is given", () => {
    expect(upToPost).toMatch(/if \(toBranchId != null\)/);
    expect(upToPost).toMatch(/SELECT id FROM branches\s+WHERE id = \$1 AND "companyId" = \$2/);
  });

  it("rejects when the branch doesn't belong to the destination company", () => {
    expect(upToPost).toContain("لا ينتمي إلى الشركة المستلمة");
  });
});

describe("to-side post uses toBranchId, not scope.branchId", () => {
  const fromPostIdx = ROUTE.indexOf("financialEngine.postJournalEntry");
  const toPostIdx = ROUTE.indexOf("toResult = await financialEngine.postJournalEntry");
  expect(fromPostIdx).toBeGreaterThan(-1);
  expect(toPostIdx).toBeGreaterThan(-1);

  const fromPost = ROUTE.slice(fromPostIdx, toPostIdx);
  const toPost = ROUTE.slice(toPostIdx, toPostIdx + 1500);

  it("from-side still uses scope.branchId (the source company's user branch)", () => {
    expect(fromPost).toMatch(/branchId:\s*scope\.branchId/);
  });
  it("to-side uses toBranchId ?? 0 — not scope.branchId", () => {
    expect(toPost).toMatch(/branchId:\s*toBranchId \?\? 0/);
    expect(toPost).not.toMatch(/branchId:\s*scope\.branchId/);
  });
});
