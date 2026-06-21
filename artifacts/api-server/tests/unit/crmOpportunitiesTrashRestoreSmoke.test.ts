import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2713 (تعميم على فرص CRM) — سلة المحذوفات + الاسترجاع، بلا هجرة
 * (crm_opportunities.deletedAt قائم). اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const CRM = readFileSync(join(import.meta.dirname!, "../../src/routes/crm.ts"), "utf8");

const restoreHandler = (() => {
  const m = CRM.match(/router\.post\("\/opportunities\/:id\/restore"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /opportunities/:id/restore not found");
  return m[0];
})();

const listHandler = (() => {
  const m = CRM.match(/router\.get\("\/opportunities"[\s\S]*?ORDER BY o\.id DESC LIMIT 500/);
  if (!m) throw new Error("GET /opportunities not found");
  return m[0];
})();

describe("crm opportunities list — trash view", () => {
  it("GET /opportunities honours deleted=true and shows ONLY soft-deleted rows", () => {
    expect(listHandler).toMatch(/const showDeleted = \(req\.query as Record<string, string \| undefined>\)\.deleted === "true";/);
    expect(listHandler).toMatch(/where \+= showDeleted \? ` AND o\."deletedAt" IS NOT NULL` : ` AND o\."deletedAt" IS NULL`;/);
    // the deletedAt predicate must no longer be hard-coded after ${where}
    expect(listHandler).not.toMatch(/WHERE \$\{where\} AND o\."deletedAt" IS NULL/);
  });
});

describe("POST /opportunities/:id/restore", () => {
  it("requires delete permission + resource guard", () => {
    expect(restoreHandler).toMatch(/authorize\(\{ feature: "crm\.opportunities", action: "delete", resource: \{ table: "crm_opportunities", idParam: "id" \} \}\)/);
  });
  it("clears deletedAt ONLY for a deleted opportunity of this company", () => {
    expect(restoreHandler).toMatch(/UPDATE crm_opportunities SET "deletedAt"=NULL WHERE id=\$1 AND "companyId"=\$2 AND "deletedAt" IS NOT NULL/);
  });
  it("404s when nothing to restore + emits audit/event", () => {
    expect(restoreHandler).toMatch(/if \(!affectedRows\) throw new NotFoundError/);
    expect(restoreHandler).toMatch(/action: "restore", entity: "crm_opportunities"/);
    expect(restoreHandler).toMatch(/action: "crm\.opportunity\.restored"/);
  });
});
