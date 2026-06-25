import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2713 (تعميم على المشاريع) — سلة المحذوفات + الاسترجاع، بلا هجرة
 * (projects.deletedAt قائم). اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const PROJECTS = readFileSync(join(import.meta.dirname!, "../../src/routes/projects.ts"), "utf8");

const restoreHandler = (() => {
  const m = PROJECTS.match(/router\.post\("\/:id\/restore"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /:id/restore not found");
  return m[0];
})();

const listHandler = (() => {
  const m = PROJECTS.match(/router\.get\("\/", authorize\(\{ feature: "projects\.list"[\s\S]*?ORDER BY p\.id DESC LIMIT 500/);
  if (!m) throw new Error("GET / (projects list) not found");
  return m[0];
})();

describe("projects list — trash view", () => {
  it("GET / honours deleted=true and shows ONLY soft-deleted rows", () => {
    expect(listHandler).toMatch(/const showDeleted = \(req\.query as Record<string, string \| undefined>\)\.deleted === "true";/);
    expect(listHandler).toMatch(/where \+= showDeleted \? ` AND p\."deletedAt" IS NOT NULL` : ` AND p\."deletedAt" IS NULL`;/);
    expect(listHandler).not.toMatch(/WHERE \$\{where\} AND p\."deletedAt" IS NULL/);
  });
});

describe("POST /:id/restore (projects)", () => {
  it("requires delete permission + resource guard", () => {
    expect(restoreHandler).toMatch(/authorize\(\{ feature: "projects\.list", action: "delete", resource: \{ table: "projects", idParam: "id" \} \}\)/);
  });
  it("clears deletedAt ONLY for a deleted project of this company", () => {
    expect(restoreHandler).toMatch(/UPDATE projects SET "deletedAt"=NULL WHERE id=\$1 AND "companyId"=\$2 AND "deletedAt" IS NOT NULL/);
  });
  it("404s when nothing to restore + emits audit/event", () => {
    expect(restoreHandler).toMatch(/if \(!affectedRows\) throw new NotFoundError/);
    expect(restoreHandler).toMatch(/action: "restore", entity: "projects"/);
    expect(restoreHandler).toMatch(/action: "project\.restored"/);
  });
});
