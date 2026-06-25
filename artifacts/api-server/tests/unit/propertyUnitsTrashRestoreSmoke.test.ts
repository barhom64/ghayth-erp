import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2713 (تعميم على وحدات الأملاك) — سلة المحذوفات + الاسترجاع، بلا هجرة
 * (property_units.deletedAt قائم). اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const PROPERTIES = readFileSync(join(import.meta.dirname!, "../../src/routes/properties.ts"), "utf8");

const restoreHandler = (() => {
  const m = PROPERTIES.match(/router\.post\("\/units\/:id\/restore"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /units/:id/restore not found");
  return m[0];
})();

const listHandler = (() => {
  const m = PROPERTIES.match(/router\.get\("\/units"[\s\S]*?const countParams = \[\.\.\.params\]/);
  if (!m) throw new Error("GET /units not found");
  return m[0];
})();

describe("property units list — trash view", () => {
  it("GET /units honours deleted=true and shows ONLY soft-deleted rows", () => {
    expect(listHandler).toMatch(/const showDeleted = \(req\.query as Record<string, string \| undefined>\)\.deleted === "true";/);
    expect(listHandler).toMatch(/conditions\.push\(showDeleted \? `u\."deletedAt" IS NOT NULL` : `u\."deletedAt" IS NULL`\)/);
  });
});

describe("POST /units/:id/restore", () => {
  it("requires delete permission + resource guard", () => {
    expect(restoreHandler).toMatch(/authorize\(\{ feature: "properties\.units", action: "delete", resource: \{ table: "property_units", idParam: "id" \} \}\)/);
  });
  it("clears deletedAt ONLY for a deleted unit of this company", () => {
    expect(restoreHandler).toMatch(/UPDATE property_units SET "deletedAt"=NULL WHERE id=\$1 AND "companyId"=\$2 AND "deletedAt" IS NOT NULL/);
  });
  it("404s when nothing to restore + emits audit/event", () => {
    expect(restoreHandler).toMatch(/if \(!affectedRows\) throw new NotFoundError/);
    expect(restoreHandler).toMatch(/action: "restore", entity: "property_units"/);
    expect(restoreHandler).toMatch(/action: "property\.unit\.restored"/);
  });
});
