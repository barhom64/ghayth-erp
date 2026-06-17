import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * #2230 — «نفرّق دائمًا بين تاريخ الإنشاء وتاريخ المستند».
 *
 * CreationDateField renders the AUTO «تاريخ الإنشاء» (read-only). Forms that
 * also take a MANUAL document date were labelling it a bare «التاريخ», which
 * collides visually with the auto creation date. Each manual picker now
 * carries its own document-date label.
 */
const base = join(import.meta.dirname!, "../../../ghayth-erp/src/pages/create/finance");
const read = (f: string) => readFileSync(join(base, f), "utf8");

describe("finance create forms — created-date vs document-date are distinct", () => {
  it("voucher manual date is «تاريخ السند»", () => {
    expect(read("vouchers-create.tsx")).toContain('label="تاريخ السند"');
  });
  it("invoice manual date is «تاريخ الفاتورة»", () => {
    expect(read("invoices-create.tsx")).toContain('label="تاريخ الفاتورة"');
  });
  it("manual-journal date is «تاريخ القيد»", () => {
    expect(read("journal-manual-create.tsx")).toContain("تاريخ القيد");
  });
});
