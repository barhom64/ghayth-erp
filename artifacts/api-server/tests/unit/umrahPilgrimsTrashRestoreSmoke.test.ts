import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2713 (تعميم على المعتمرين) — سلة المحذوفات + الاسترجاع، بلا هجرة
 * (umrah_pilgrims.deletedAt قائم). اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const UMRAH = readFileSync(join(import.meta.dirname!, "../../src/routes/umrah.ts"), "utf8");

const restoreHandler = (() => {
  const m = UMRAH.match(/router\.post\("\/pilgrims\/:id\/restore"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /pilgrims/:id/restore not found");
  return m[0];
})();

const listHandler = (() => {
  const m = UMRAH.match(/router\.get\("\/pilgrims"[\s\S]*?ORDER BY/);
  if (!m) throw new Error("GET /pilgrims not found");
  return m[0];
})();

describe("umrah pilgrims list — trash view", () => {
  it("GET /pilgrims honours deleted=true and shows ONLY soft-deleted rows", () => {
    expect(listHandler).toMatch(/const showDeleted = \(req\.query as Record<string, string \| undefined>\)\.deleted === "true";/);
    expect(listHandler).toMatch(/showDeleted\s*\?\s*`p\."companyId"=\$1 AND p\."deletedAt" IS NOT NULL`\s*:\s*`p\."companyId"=\$1 AND p\."deletedAt" IS NULL`/);
  });
});

describe("POST /pilgrims/:id/restore", () => {
  it("requires update permission", () => {
    expect(restoreHandler).toMatch(/authorize\(\{ feature: "umrah", action: "update" \}\)/);
  });
  it("clears deletedAt ONLY for a deleted pilgrim of this company", () => {
    expect(restoreHandler).toMatch(/UPDATE umrah_pilgrims SET "deletedAt"=NULL, "updatedAt"=NOW\(\) WHERE id=\$1 AND "companyId"=\$2 AND "deletedAt" IS NOT NULL/);
  });
  it("404s when nothing to restore + emits audit/event", () => {
    expect(restoreHandler).toMatch(/if \(!affectedRows\) throw new NotFoundError/);
    expect(restoreHandler).toMatch(/action: "restore", entity: "umrah_pilgrims"/);
    expect(restoreHandler).toMatch(/action: "umrah\.pilgrim\.restored"/);
  });
});
