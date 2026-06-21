import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2716 — منع تكرار المورد عند الإنشاء.
 *
 * التدقيق (2026-06-20) أثبت أن منع تكرار **العميل** موجود فعلًا في
 * clients.ts (فحص بريد+هاتف داخل withTransaction مع FOR UPDATE)، بينما
 * المورد كان يُدرَج بـ INSERT مباشر بلا أي فحص. هذه الدفعة تحاكي نمط
 * العميل بدقة داخل المسار المالك (finance-vendors.ts) — تشغيلية، بلا
 * هجرة وبلا مساس دفتر. قيد UNIQUE على مستوى القاعدة مؤجَّل لهجرة باعتماد.
 *
 * الاختبار ثابت (يقرأ المصدر) لأن الفحص منطق مسار لا حساب رقمي — لا DB.
 */

const VENDORS = readFileSync(
  join(import.meta.dirname!, "../../src/routes/finance-vendors.ts"),
  "utf8",
);
const CLIENTS = readFileSync(
  join(import.meta.dirname!, "../../src/routes/clients.ts"),
  "utf8",
);

// أعزل جسم معالج POST /vendors لتبقى التأكيدات على مسار الإنشاء وحده.
const CREATE = (() => {
  const m = VENDORS.match(
    /vendorsRouter\.post\("\/vendors"[\s\S]*?(?=\nvendorsRouter\.(?:get|post|patch|put|delete)\(|\nexport \{)/,
  );
  if (!m) throw new Error("POST /vendors handler not found");
  return m[0];
})();

describe("finance-vendors — atomic dedup wiring", () => {
  it("imports withTransaction from rawdb (the atomic check+insert primitive)", () => {
    expect(VENDORS).toMatch(/import \{[^}]*\bwithTransaction\b[^}]*\} from "\.\.\/lib\/rawdb\.js"/);
  });

  it("wraps the existence-check + INSERT in a single withTransaction", () => {
    expect(CREATE).toMatch(/await withTransaction\(async \(txClient\) => \{/);
  });

  it("INSERT happens inside the tx via txClient with RETURNING id (not a bare rawExecute)", () => {
    expect(CREATE).toMatch(/txClient\.query<\{ id: number \}>\(\s*`INSERT INTO suppliers[\s\S]*RETURNING id`/);
  });

  it("scopes every dedup probe per-company and ignores soft-deleted rows, FOR UPDATE", () => {
    const probes = CREATE.match(
      /SELECT id FROM suppliers WHERE [^\n]*"companyId" = \$2 AND "deletedAt" IS NULL LIMIT 1 FOR UPDATE/g,
    );
    expect(probes && probes.length).toBe(3); // phone + email + taxNumber
  });
});

describe("finance-vendors — the three duplicate guards", () => {
  it("rejects a duplicate phone with an Arabic ConflictError", () => {
    expect(CREATE).toMatch(/WHERE phone = \$1[\s\S]{0,180}?ConflictError\("رقم الهاتف مستخدم لمورد آخر"/);
  });

  it("rejects a duplicate email with an Arabic ConflictError", () => {
    expect(CREATE).toMatch(/WHERE email = \$1[\s\S]{0,180}?ConflictError\("البريد الإلكتروني مستخدم لمورد آخر"/);
  });

  it("rejects a duplicate taxNumber with an Arabic ConflictError", () => {
    expect(CREATE).toMatch(/WHERE "taxNumber" = \$1[\s\S]{0,180}?ConflictError\("الرقم الضريبي مستخدم لمورد آخر"/);
  });

  it("each guard only fires when the field is provided (empty quick-create values skip)", () => {
    expect(CREATE).toMatch(/if \(phone\) \{/);
    expect(CREATE).toMatch(/if \(email\) \{/);
    expect(CREATE).toMatch(/if \(taxNumber\) \{/);
  });
});

describe("parity with the proven client pattern (source of truth)", () => {
  it("clients.ts still carries the email+phone dedup the vendor guard mirrors", () => {
    // Guards against silent drift: if the client pattern is ever removed,
    // the rationale for mirroring it on vendors must be revisited.
    expect(CLIENTS).toMatch(/SELECT id FROM clients WHERE email = \$1[\s\S]*FOR UPDATE/);
    expect(CLIENTS).toMatch(/SELECT id FROM clients WHERE phone = \$1[\s\S]*FOR UPDATE/);
  });
});
