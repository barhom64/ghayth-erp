/**
 * حدّ معماري (#2839) — تعطيل الفرع في الإعدادات لا يكتب جداول HR/المالية مباشرة.
 *
 * الدستور (مواد 4–9): مسار الإعدادات (خادم لإدارة الفروع) ينسّق تعطيل فرع،
 * لكن الكتابة في employee_assignments (HR) وpurchase_orders (المالية) تبقى
 * مملوكة للمسار القائد. كان settings يحدّثهما مباشرة عند إعادة الإسناد.
 *
 * الإصلاح: نقل الكتابتين إلى عقدين يملكهما المسار القائد يُستدعَيان ضمن نفس
 * المعاملة (ذرّية محفوظة):
 *   • hr.reassignActiveAssignmentsToBranch
 *   • finance-purchase.reassignOpenPurchaseOrdersToBranch
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const SETTINGS = read("artifacts/api-server/src/routes/settings.ts");
const HR = read("artifacts/api-server/src/routes/hr.ts");
const PURCHASE = read("artifacts/api-server/src/routes/finance-purchase.ts");

describe("#2839 — تعطيل الفرع يمرّ عبر عقود المسار القائد", () => {
  it("settings لا يحدّث employee_assignments مباشرة", () => {
    expect(SETTINGS).not.toMatch(/UPDATE\s+employee_assignments\s+SET/i);
  });
  it("settings لا يحدّث purchase_orders مباشرة", () => {
    expect(SETTINGS).not.toMatch(/UPDATE\s+purchase_orders\s+SET/i);
  });
  it("settings يستدعي عقدَي HR والمالية لإعادة الإسناد", () => {
    expect(SETTINGS).toMatch(/reassignActiveAssignmentsToBranch/);
    expect(SETTINGS).toMatch(/reassignOpenPurchaseOrdersToBranch/);
  });
  it("عقد HR موجود ويملك كتابة employee_assignments", () => {
    expect(HR).toMatch(/export async function reassignActiveAssignmentsToBranch/);
    expect(HR).toMatch(/UPDATE employee_assignments SET "branchId"/);
  });
  it("عقد المالية موجود ويملك كتابة purchase_orders", () => {
    expect(PURCHASE).toMatch(/export async function reassignOpenPurchaseOrdersToBranch/);
    expect(PURCHASE).toMatch(/UPDATE purchase_orders SET "branchId"/);
  });
});
