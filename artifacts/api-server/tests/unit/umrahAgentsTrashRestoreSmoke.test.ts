import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2713 (تعميم على وكلاء العمرة) — سلة المحذوفات + الاسترجاع، بلا هجرة
 * (umrah_agents.deletedAt قائم). اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const UMRAH = readFileSync(join(import.meta.dirname!, "../../src/routes/umrah.ts"), "utf8");

const restoreHandler = (() => {
  const m = UMRAH.match(/router\.post\("\/agents\/:id\/restore"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /agents/:id/restore not found");
  return m[0];
})();

const listHandler = (() => {
  const m = UMRAH.match(/router\.get\("\/agents"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("GET /agents not found");
  return m[0];
})();

describe("umrah agents list — trash view", () => {
  it("GET /agents honours deleted=true and shows ONLY soft-deleted rows (no SQL interpolation)", () => {
    expect(listHandler).toMatch(/const showDeleted = \(req\.query as Record<string, string \| undefined>\)\.deleted === "true";/);
    expect(listHandler).toMatch(/"deletedAt" IS NOT NULL ORDER BY name/);
    expect(listHandler).toMatch(/"deletedAt" IS NULL ORDER BY name/);
  });
});

describe("POST /agents/:id/restore", () => {
  it("requires update permission", () => {
    expect(restoreHandler).toMatch(/authorize\(\{ feature: "umrah", action: "update" \}\)/);
  });
  it("clears deletedAt ONLY for a deleted agent of this company", () => {
    expect(restoreHandler).toMatch(/UPDATE umrah_agents SET "deletedAt"=NULL, "updatedAt"=NOW\(\) WHERE id=\$1 AND "companyId"=\$2 AND "deletedAt" IS NOT NULL/);
  });
  it("404s when nothing to restore + emits audit/event", () => {
    expect(restoreHandler).toMatch(/if \(!affectedRows\) throw new NotFoundError/);
    expect(restoreHandler).toMatch(/action: "restore", entity: "umrah_agents"/);
    expect(restoreHandler).toMatch(/action: "umrah\.agent\.restored"/);
  });
});
