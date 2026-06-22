import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2713 — سلة المحذوفات والاسترجاع (طيّار: العملاء، بلا هجرة — يستخدم عمود
 * deletedAt القائم). القائمة تعرض المحذوف فقط عند deleted=true، والاسترجاع
 * يصفّر deletedAt بصلاحية تعديل + Audit. اختبار ثابت (يقرأ المصدر) — لا DB.
 */
const CLIENTS = readFileSync(join(import.meta.dirname!, "../../src/routes/clients.ts"), "utf8");

const restoreHandler = (() => {
  const m = CLIENTS.match(/router\.post\("\/:id\/restore"[\s\S]*?\n\}\);/);
  if (!m) throw new Error("POST /:id/restore not found");
  return m[0];
})();

describe("clients list — trash view", () => {
  it("GET / accepts deleted=true and lists ONLY soft-deleted rows", () => {
    expect(CLIENTS).toMatch(/const showDeleted = deleted === "true";/);
    expect(CLIENTS).toMatch(/showDeleted \? ` AND "deletedAt" IS NOT NULL` : ` AND "deletedAt" IS NULL`/);
  });
});

describe("POST /:id/restore — undelete (ownership + audit)", () => {
  it("requires update permission (not a separate destructive grant)", () => {
    expect(restoreHandler).toMatch(/authorize\(\{ feature: "crm\.clients", action: "update" \}\)/);
  });
  it("clears deletedAt ONLY for a currently-deleted row of this company", () => {
    expect(restoreHandler).toMatch(/UPDATE clients SET "deletedAt" = NULL WHERE id = \$1 AND "companyId" = \$2 AND "deletedAt" IS NOT NULL/);
  });
  it("404s when there is nothing to restore", () => {
    expect(restoreHandler).toMatch(/if \(!affectedRows\) throw new NotFoundError/);
  });
  it("leaves an audit trail + emits a restore event", () => {
    expect(restoreHandler).toMatch(/action: "restore", entity: "clients"/);
    expect(restoreHandler).toMatch(/action: "client\.restored"/);
  });
});
