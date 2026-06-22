/**
 * حدّ معماري (#2839) — ختم معرّف القيد على حركات المخزون عبر عقد المخزون المالك.
 *
 * مسار المالية (finance-invoices) كان يحدّث warehouse_movements مباشرةً (ختم
 * journalEntryId على حركات عكس COGS عند الإشعارات الدائنة). جدول حركات المخزون
 * مملوك للمخزون (مواد 4–9).
 *
 * الإصلاح: نقل الـUPDATE إلى عقد warehouse.stampMovementsJournalEntry تستدعيه
 * المالية ضمن نفس المعاملة — سلوكيًا مطابق (نفس شرط WHERE + type='return').
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../../../..");
const read = (p: string) => readFileSync(resolve(ROOT, p), "utf8");

const FINANCE = read("artifacts/api-server/src/routes/finance-invoices.ts");
const WAREHOUSE = read("artifacts/api-server/src/routes/warehouse.ts");

describe("#2839 — ختم قيد حركات المخزون عبر عقد المخزون", () => {
  it("المالية لا تحدّث warehouse_movements مباشرة", () => {
    expect(FINANCE).not.toMatch(/UPDATE\s+warehouse_movements/i);
  });
  it("المالية تستدعي عقد المخزون للختم", () => {
    expect(FINANCE).toMatch(/stampMovementsJournalEntry/);
  });
  it("عقد المخزون موجود ويملك كتابة warehouse_movements", () => {
    expect(WAREHOUSE).toMatch(/export async function stampMovementsJournalEntry/);
    expect(WAREHOUSE).toMatch(/UPDATE warehouse_movements[\s\S]{0,80}"journalEntryId" = \$1/);
  });
});
