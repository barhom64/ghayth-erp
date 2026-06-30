import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2713 (تعميم على المورّدين) — سلة المحذوفات + الاسترجاع، بلا هجرة
 * (suppliers.deletedAt قائم). اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const VENDORS = readFileSync(join(import.meta.dirname!, "../../src/routes/finance-vendors.ts"), "utf8");

const restoreHandler = (() => {
  const m = VENDORS.match(/vendorsRouter\.post\("\/vendors\/:id\/restore"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /vendors/:id/restore not found");
  return m[0];
})();

describe("vendors list — trash view", () => {
  it("GET /vendors honours deleted=true and shows ONLY soft-deleted rows", () => {
    expect(VENDORS).toMatch(/const showDeleted = \(req\.query as Record<string, string \| undefined>\)\.deleted === "true";/);
    expect(VENDORS).toMatch(/showDeleted\s*\?\s*buildScopedWhere\(scope, filters, \{ disableBranchScope: true \}\)\s*:\s*buildScopedWhere\(scope, filters, \{ disableBranchScope: true, softDeleteColumn: '"deletedAt"' \}\)/);
    expect(VENDORS).toMatch(/finalWhere = showDeleted \? `\$\{where\} AND "deletedAt" IS NOT NULL` : where/);
  });
});

describe("POST /vendors/:id/restore", () => {
  it("requires update permission", () => {
    expect(restoreHandler).toMatch(/authorize\(\{ feature: "finance\.vendors", action: "update" \}\)/);
  });
  it("clears deletedAt ONLY for a deleted vendor of this company", () => {
    expect(restoreHandler).toMatch(/UPDATE suppliers SET "deletedAt" = NULL WHERE id = \$1 AND "companyId" = \$2 AND "deletedAt" IS NOT NULL/);
  });
  it("404s when nothing to restore + emits audit/event", () => {
    expect(restoreHandler).toMatch(/if \(!affectedRows\) throw new NotFoundError/);
    expect(restoreHandler).toMatch(/action: "restore", entity: "suppliers"/);
    expect(restoreHandler).toMatch(/action: "vendor\.restored"/);
  });
});
