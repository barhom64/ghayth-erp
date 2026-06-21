import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2713 (تعميم على القضايا القانونية) — سلة المحذوفات + الاسترجاع، بلا هجرة
 * (legal_cases.deletedAt قائم). اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const LEGAL = readFileSync(join(import.meta.dirname!, "../../src/routes/legal.ts"), "utf8");

const restoreHandler = (() => {
  const m = LEGAL.match(/router\.post\("\/cases\/:id\/restore"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /cases/:id/restore not found");
  return m[0];
})();

const listHandler = (() => {
  const m = LEGAL.match(/router\.get\("\/cases"[\s\S]*?ORDER BY id DESC LIMIT 500/);
  if (!m) throw new Error("GET /cases not found");
  return m[0];
})();

describe("legal cases list — trash view", () => {
  it("GET /cases honours deleted=true: drops the softDeleteColumn filter and shows ONLY deleted rows", () => {
    expect(listHandler).toMatch(/const showDeleted = \(req\.query as Record<string, string \| undefined>\)\.deleted === "true";/);
    expect(listHandler).toMatch(/showDeleted \? \{ disableBranchScope: true \} : \{ disableBranchScope: true, softDeleteColumn: '"deletedAt"' \}/);
    expect(listHandler).toMatch(/if \(showDeleted\) where \+= ` AND "deletedAt" IS NOT NULL`;/);
  });
});

describe("POST /cases/:id/restore", () => {
  it("requires delete permission + resource guard", () => {
    expect(restoreHandler).toMatch(/authorize\(\{ feature: "legal\.cases", action: "delete", resource: \{ table: "legal_cases", idParam: "id" \} \}\)/);
  });
  it("clears deletedAt ONLY for a deleted case of this company", () => {
    expect(restoreHandler).toMatch(/UPDATE legal_cases SET "deletedAt"=NULL WHERE id=\$1 AND "companyId"=\$2 AND "deletedAt" IS NOT NULL/);
  });
  it("404s when nothing to restore + emits audit/event", () => {
    expect(restoreHandler).toMatch(/if \(!affectedRows\) throw new NotFoundError/);
    expect(restoreHandler).toMatch(/action: "restore", entity: "legal_cases"/);
    expect(restoreHandler).toMatch(/action: "legal\.case\.restored"/);
  });
});
