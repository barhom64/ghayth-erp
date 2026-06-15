import { describe, it, expect } from "vitest";
import {
  buildExpenseEntityLink,
  buildVendorInvoiceLines,
  evaluateVendorInvoicePlan,
} from "../../src/lib/vendorInvoiceJournalPlan.js";

/**
 * FIN-P11-VENDOR-INVOICE-WORKSPACE (#2241) — المُجمِّع المشترك لقيد فاتورة المورد.
 *
 * يثبت أن المعاينة والحفظ يبنيان نفس شكل القيد متعدّد السطور، وأن:
 *  (a) فاتورة آجلة بسطر واحد → مدين البند + دائن ذمة المورد، vendorId على الكل، متوازنة، بلا سطر مصدر.
 *  (b) متعددة البنود → N سطر مدين + سطر ذمة دائن واحد = المجموع، متوازنة، كل بند يحفظ أبعاده.
 *  (c) فاتورة مدفوعة → الطرف الدائن = مصدر الصرف (لا ذمة المورد)، متوازنة.
 *  (d) ضريبة مدخلات → سطر vat_input مدين، إجمالي المدين = الصافي+الضريبة = الدائن.
 *  (e) عقد journal_lines الإلزامي: سطر بسيناريو مركبة، الحساب المحلول ليس fallback
 *      (لا account_not_found عبر knownAccountCodes)، وvendorId + vehicleId عليه، القيد متوازن.
 *  (f) التقييم يكشف الحساب المجهول (account_not_found) وعدم التوازن (unbalanced).
 */

const AP = "2111"; // purchase_vendor_ap → موردون محليون
const VAT_INPUT = "1180"; // vat_input
const SOURCE = "1111"; // money source (paid)

describe("#2241 buildVendorInvoiceLines — credit (آجل) single line", () => {
  it("single-line CREDIT invoice → DR expense, CR = AP, vendorId on all, balanced, no money-source line", () => {
    const { entityLink } = buildExpenseEntityLink({
      accountCode: "5210",
      relatedEntityType: "supplier",
      relatedEntityId: 7,
    });
    const lines = buildVendorInvoiceLines({
      lines: [{ expenseAccountCode: "5210", baseAmount: 1000, entityLink }],
      paid: false,
      apAccountCode: AP,
      totalWithVat: 1000,
      vendorId: 7,
    });
    expect(lines).toHaveLength(2);
    expect(lines[0]).toMatchObject({ accountCode: "5210", debit: 1000, credit: 0, role: "expense", vendorId: 7 });
    // the single credit leg is the AP (supplier payable), NOT a money source.
    expect(lines[1]).toMatchObject({ accountCode: AP, debit: 0, credit: 1000, role: "source", vendorId: 7 });
    expect(lines.some((l) => l.accountCode === SOURCE)).toBe(false);
    // vendorId on EVERY line.
    expect(lines.every((l) => l.vendorId === 7)).toBe(true);
    const d = lines.reduce((s, l) => s + l.debit, 0);
    const c = lines.reduce((s, l) => s + l.credit, 0);
    expect(d).toBe(c);
  });
});

describe("#2241 buildVendorInvoiceLines — multi-line", () => {
  it("multi-line → N DR legs + one AP CR = sum, balanced, each line keeps its dims", () => {
    const l1 = buildExpenseEntityLink({ accountCode: "5210", relatedEntityType: "vehicle", relatedEntityId: 12 }).entityLink;
    const l2 = buildExpenseEntityLink({ accountCode: "5310", projectId: 3 }).entityLink;
    const lines = buildVendorInvoiceLines({
      lines: [
        { expenseAccountCode: "5210", baseAmount: 600, entityLink: l1 },
        { expenseAccountCode: "5310", baseAmount: 400, entityLink: l2 },
      ],
      paid: false,
      apAccountCode: AP,
      totalWithVat: 1000,
      vendorId: 9,
    });
    const drLegs = lines.filter((l) => l.role === "expense");
    expect(drLegs).toHaveLength(2);
    // dims preserved per line.
    expect(drLegs[0]).toMatchObject({ vehicleId: 12, vendorId: 9 });
    expect(drLegs[1]).toMatchObject({ projectId: 3, vendorId: 9 });
    // exactly one AP credit leg = sum of debits.
    const crLegs = lines.filter((l) => l.credit > 0);
    expect(crLegs).toHaveLength(1);
    expect(crLegs[0]).toMatchObject({ accountCode: AP, credit: 1000 });
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0));
  });
});

describe("#2241 buildVendorInvoiceLines — paid invoice", () => {
  it("PAID invoice → CR = source account (not AP), balanced", () => {
    const { entityLink } = buildExpenseEntityLink({ accountCode: "5210", relatedEntityType: "supplier", relatedEntityId: 7 });
    const lines = buildVendorInvoiceLines({
      lines: [{ expenseAccountCode: "5210", baseAmount: 500, entityLink }],
      paid: true,
      sourceAccountCode: SOURCE,
      apAccountCode: AP,
      totalWithVat: 500,
      vendorId: 7,
    });
    const credit = lines.find((l) => l.credit > 0)!;
    expect(credit.accountCode).toBe(SOURCE);
    expect(credit.accountCode).not.toBe(AP);
    expect(lines.reduce((s, l) => s + l.debit, 0)).toBe(lines.reduce((s, l) => s + l.credit, 0));
  });
});

describe("#2241 buildVendorInvoiceLines — input VAT", () => {
  it("input VAT → vat_input DR leg, totalDebit = net + vat = credit", () => {
    const { entityLink } = buildExpenseEntityLink({ accountCode: "5210", relatedEntityType: "supplier", relatedEntityId: 7 });
    const lines = buildVendorInvoiceLines({
      lines: [{ expenseAccountCode: "5210", baseAmount: 1000, vatAmount: 150, entityLink }],
      paid: false,
      apAccountCode: AP,
      vatInputAccountCode: VAT_INPUT,
      totalWithVat: 1150,
      vendorId: 7,
    });
    const vatLeg = lines.find((l) => l.role === "vat_input")!;
    expect(vatLeg).toMatchObject({ accountCode: VAT_INPUT, debit: 150, credit: 0, vendorId: 7 });
    const d = lines.reduce((s, l) => s + l.debit, 0);
    const c = lines.reduce((s, l) => s + l.credit, 0);
    expect(d).toBe(1150);
    expect(d).toBe(c);
  });
});

describe("#2241 evaluateVendorInvoicePlan — journal_lines dimension contract", () => {
  it("MANDATORY: vehicle-scenario line resolves a REAL account (not fallback), balanced, dims present", () => {
    const { entityLink } = buildExpenseEntityLink({
      accountCode: "5510",
      relatedEntityType: "vehicle",
      relatedEntityId: 12,
    });
    const lines = buildVendorInvoiceLines({
      lines: [{ expenseAccountCode: "5510", baseAmount: 800, entityLink }],
      paid: false,
      apAccountCode: AP,
      totalWithVat: 800,
      vendorId: 7,
    });
    // The DR account is present in the known (postable) set — i.e. it is NOT a
    // missing/fallback account the engine couldn't resolve.
    const r = evaluateVendorInvoicePlan({ lines, knownAccountCodes: new Set(["5510", AP]) });
    expect(r.balanced).toBe(true);
    expect(r.blockers.some((b) => b.code === "account_not_found")).toBe(false);
    // vehicle line carries both vendorId AND vehicleId (journal_lines contract).
    const veh = lines.find((l) => l.role === "expense")!;
    expect(veh.vendorId).toBe(7);
    expect(veh.vehicleId).toBe(12);
  });
});

describe("#2241 evaluateVendorInvoicePlan — integrity verdict", () => {
  it("unknown account → account_not_found blocker", () => {
    const { entityLink } = buildExpenseEntityLink({ accountCode: "5210", relatedEntityType: "supplier", relatedEntityId: 7 });
    const lines = buildVendorInvoiceLines({
      lines: [{ expenseAccountCode: "5210-XYZ", baseAmount: 100, entityLink }],
      paid: false,
      apAccountCode: AP,
      totalWithVat: 100,
      vendorId: 7,
    });
    const r = evaluateVendorInvoicePlan({ lines, knownAccountCodes: new Set([AP]) });
    expect(r.blockers.some((b) => b.code === "account_not_found")).toBe(true);
  });

  it("unbalanced lines → unbalanced blocker", () => {
    const r = evaluateVendorInvoicePlan({
      lines: [
        { accountCode: "5210", debit: 1000, credit: 0, vendorId: 7 },
        { accountCode: AP, debit: 0, credit: 900, vendorId: 7 },
      ],
    });
    expect(r.balanced).toBe(false);
    expect(r.blockers.some((b) => b.code === "unbalanced")).toBe(true);
  });
});
