import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * الفوترة المتكررة للعملاء — الدفعة (1): القوالب فقط (غير دفتري).
 * اختبار ثابت — لا DB. يؤكّد هجرة 395 + CRUD القوالب + التسجيل. سطور القالب
 * تطابق SalesInvoiceLineInput ليكون التوليد لاحقًا تحويلًا مباشرًا.
 */
const API_SRC = join(import.meta.dirname!, "../../src");
const ROUTE = readFileSync(join(API_SRC, "routes/finance-recurring-invoices.ts"), "utf8");
const INDEX = readFileSync(join(API_SRC, "routes/index.ts"), "utf8");

describe("recurring invoices — migration 395 (templates only, non-ledger)", () => {
  it("creates recurring_invoice_templates (scoped, soft-delete, due index, rollback)", () => {
    const p = join(API_SRC, "migrations/395_recurring_invoice_templates.sql");
    expect(existsSync(p)).toBe(true);
    const sql = readFileSync(p, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS recurring_invoice_templates/);
    expect(sql).toMatch(/"companyId"\s+INTEGER NOT NULL REFERENCES companies\(id\) ON DELETE CASCADE/);
    expect(sql).toMatch(/"nextRunDate" DATE NOT NULL/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_rit_due[\s\S]*active = TRUE AND "deletedAt" IS NULL/);
    expect(sql).toMatch(/@rollback: DROP TABLE IF EXISTS recurring_invoice_templates;/);
  });
});

describe("recurring invoices — template CRUD (finance.recurring RBAC)", () => {
  it("guards every route under finance.recurring with the right action", () => {
    expect(ROUTE).toMatch(/\.get\("\/recurring-invoices",\s*authorize\(\{ feature: "finance\.recurring", action: "list" \}\)/);
    expect(ROUTE).toMatch(/\.post\("\/recurring-invoices",\s*authorize\(\{ feature: "finance\.recurring", action: "create" \}\)/);
    expect(ROUTE).toMatch(/\.patch\("\/recurring-invoices\/:id",\s*authorize\(\{ feature: "finance\.recurring", action: "update" \}\)/);
    expect(ROUTE).toMatch(/\.delete\("\/recurring-invoices\/:id",\s*authorize\(\{ feature: "finance\.recurring", action: "delete" \}\)/);
  });
  it("validates client ownership + line shape matches SalesInvoiceLineInput + Audit", () => {
    expect(ROUTE).toMatch(/SELECT id FROM clients WHERE id=\$1 AND "companyId"=\$2 AND "deletedAt" IS NULL/);
    expect(ROUTE).toMatch(/unitPriceExclTax/);
    expect(ROUTE).toMatch(/isTaxable/);
    expect(ROUTE).toMatch(/taxCode/);
    expect(ROUTE).toMatch(/auditFromRequest\(req, "create", "recurring_invoice_templates"/);
  });
  it("seeds nextRunDate = startDate on create (first run due at start)", () => {
    expect(ROUTE).toMatch(/"startDate","nextRunDate"[\s\S]*VALUES \(\$1,\$2,\$3,\$4,\$5::jsonb,\$6,\$7,\$8,\$8,/);
  });
  it("this batch is templates-only — NO ledger posting yet (no engine import/call)", () => {
    // لا عبارة استيراد فعلية لمحرك القيود (ذكره في التعليقات للتوثيق فقط).
    expect(ROUTE).not.toMatch(/import \{[^}]*financialEngine[^}]*\} from/);
    expect(ROUTE).not.toMatch(/financialEngine\.postSalesInvoice\(/);
    expect(ROUTE).not.toMatch(/postJournalEntry\(/);
  });
});

describe("recurring invoices — wired into the finance router", () => {
  it("is registered under /finance with finance module + financial guards", () => {
    expect(INDEX).toMatch(/import \{ recurringInvoicesRouter \} from "\.\/finance-recurring-invoices\.js";/);
    expect(INDEX).toMatch(/router\.use\("\/finance", requireModule\("finance"\), requireGuards\("financial"\), recurringInvoicesRouter\)/);
  });
});
