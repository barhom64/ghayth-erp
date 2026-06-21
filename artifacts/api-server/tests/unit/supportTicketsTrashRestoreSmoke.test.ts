import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2713 (تعميم على تذاكر الدعم) — سلة المحذوفات + الاسترجاع، بلا هجرة
 * (support_tickets.deletedAt قائم). اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const SUPPORT = readFileSync(join(import.meta.dirname!, "../../src/routes/support.ts"), "utf8");

const restoreHandler = (() => {
  const m = SUPPORT.match(/router\.post\("\/tickets\/:id\/restore"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /tickets/:id/restore not found");
  return m[0];
})();

const listHandler = (() => {
  const m = SUPPORT.match(/router\.get\("\/tickets"[\s\S]*?ORDER BY t\.id DESC LIMIT 500/);
  if (!m) throw new Error("GET /tickets not found");
  return m[0];
})();

describe("support tickets list — trash view", () => {
  it("GET /tickets honours deleted=true and shows ONLY soft-deleted rows", () => {
    expect(listHandler).toMatch(/const showDeleted = \(req\.query as Record<string, string \| undefined>\)\.deleted === "true";/);
    expect(listHandler).toMatch(/where \+= showDeleted \? ` AND t\."deletedAt" IS NOT NULL` : ` AND t\."deletedAt" IS NULL`;/);
    expect(listHandler).not.toMatch(/WHERE \$\{where\} AND t\."deletedAt" IS NULL/);
  });
});

describe("POST /tickets/:id/restore", () => {
  it("requires delete permission + resource guard", () => {
    expect(restoreHandler).toMatch(/authorize\(\{ feature: "support\.tickets", action: "delete", resource: \{ table: "support_tickets", idParam: "id" \} \}\)/);
  });
  it("clears deletedAt ONLY for a deleted ticket of this company", () => {
    expect(restoreHandler).toMatch(/UPDATE support_tickets SET "deletedAt"=NULL WHERE id=\$1 AND "companyId"=\$2 AND "deletedAt" IS NOT NULL/);
  });
  it("404s when nothing to restore + emits audit/event", () => {
    expect(restoreHandler).toMatch(/if \(!affectedRows\) throw new NotFoundError/);
    expect(restoreHandler).toMatch(/action: "restore", entity: "support_tickets"/);
    expect(restoreHandler).toMatch(/action: "support\.ticket\.restored"/);
  });
});
