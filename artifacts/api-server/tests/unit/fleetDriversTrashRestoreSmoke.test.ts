import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2713 (تعميم على سائقي الأسطول) — سلة المحذوفات + الاسترجاع، بلا هجرة
 * (fleet_drivers.deletedAt قائم). اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const FLEET = readFileSync(join(import.meta.dirname!, "../../src/routes/fleet.ts"), "utf8");

const restoreHandler = (() => {
  const m = FLEET.match(/router\.post\("\/drivers\/:id\/restore"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /drivers/:id/restore not found");
  return m[0];
})();

const listHandler = (() => {
  const m = FLEET.match(/router\.get\("\/drivers"[\s\S]*?ORDER BY d\.name LIMIT 500/);
  if (!m) throw new Error("GET /drivers not found");
  return m[0];
})();

describe("fleet drivers list — trash view", () => {
  it("GET /drivers honours deleted=true and shows ONLY soft-deleted rows", () => {
    expect(listHandler).toMatch(/const showDeleted = \(req\.query as Record<string, string \| undefined>\)\.deleted === "true";/);
    expect(listHandler).toMatch(/where \+= showDeleted \? ` AND d\."deletedAt" IS NOT NULL` : ` AND d\."deletedAt" IS NULL`;/);
    // the deletedAt predicate must no longer be hard-coded in the SQL body
    expect(listHandler).not.toMatch(/WHERE \$\{where\} AND d\."deletedAt" IS NULL/);
  });
});

describe("POST /drivers/:id/restore", () => {
  it("requires delete permission + resource guard (loadResourceRecord does not filter deletedAt)", () => {
    expect(restoreHandler).toMatch(/authorize\(\{ feature: "fleet\.vehicles", action: "delete", resource: \{ table: "fleet_drivers", idParam: "id" \} \}\)/);
  });
  it("clears deletedAt ONLY for a deleted driver of this company", () => {
    expect(restoreHandler).toMatch(/UPDATE fleet_drivers SET "deletedAt"=NULL WHERE id=\$1 AND "companyId"=\$2 AND "deletedAt" IS NOT NULL/);
  });
  it("404s when nothing to restore + emits audit/event", () => {
    expect(restoreHandler).toMatch(/if \(!affectedRows\) throw new NotFoundError/);
    expect(restoreHandler).toMatch(/action: "restore", entity: "fleet_drivers"/);
    expect(restoreHandler).toMatch(/action: "fleet\.driver\.restored"/);
  });
});
