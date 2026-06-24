import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * العزل متعدد الشركات على مهام الأتمتة (cron_jobs له companyId قابل لـNULL
 * للمهام النظامية، هجرة 124). كل قراءة/كتابة لـcron_jobs في automation.ts يجب
 * أن تحمل قيد companyId — وإلا يكشف/يُشغّل مديرٌ مهامَ شركةٍ أخرى (IDOR، تدقيق
 * الأخطاء الفادحة 2026-06-23). الحارس يمنع الارتداد لاستعلام cron_jobs غير مُقيَّد.
 */
const SRC = readFileSync(
  join(import.meta.dirname!, "../../src/routes/automation.ts"),
  "utf8",
);

describe("automation cron_jobs queries are company-scoped (no cross-tenant leak)", () => {
  it("every `FROM cron_jobs` statement carries a companyId predicate", () => {
    // match each "FROM cron_jobs … <until ; or backtick>" chunk and require a
    // "companyId" predicate somewhere in the same statement.
    const stmts = SRC.match(/FROM cron_jobs[\s\S]*?(?=`)/g) ?? [];
    expect(stmts.length, "expected cron_jobs queries to exist").toBeGreaterThan(0);
    const unscoped = stmts.filter((s) => !/"companyId"/.test(s));
    expect(unscoped, `استعلام cron_jobs بلا قيد companyId: ${unscoped.join(" | ")}`).toEqual([]);
  });
});
