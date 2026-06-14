import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { FinancialJournalPreviewPanel, type JournalPreview } from "./impact-preview";

/**
 * FIN-P8-JOURNAL-PREVIEW (#2238) — the «معاينة القيد المحاسبي» panel renders the
 * REAL debit/credit table from the backend plan (never a frontend re-computation):
 *  • a balanced fuel plan shows the lines, the balanced badge, and the dimensions.
 *  • a plan with blockers surfaces them (the page uses these to disable save).
 *  • an incomplete plan shows the "complete the data" prompt, NOT fake numbers.
 */
const balancedFuel: JournalPreview = {
  ready: true,
  lines: [
    {
      lineNo: 1, accountCode: "5510", accountName: "وقود المركبات", debit: 200, credit: 0,
      role: "expense", dimensions: { vehicleId: 12 }, derivationReason: "قاعدة توجيه محاسبي (#3)",
      accountSource: "mapping", status: "ok",
    },
    {
      lineNo: 2, accountCode: "1111", accountName: "الصندوق", debit: 0, credit: 200,
      role: "source", dimensions: {}, derivationReason: "مصدر الصرف المختار (cash)",
      accountSource: "selected", status: "ok",
    },
  ],
  totals: { debit: 200, credit: 200 },
  balanced: true,
  blockers: [],
  warnings: [],
  sourceContext: { paymentMethod: "cash", sourceAccountCode: "1111", sourceAccountName: "الصندوق" },
  suggestedDocumentStatus: "draft", suggestedPaymentStatus: "paid", suggestedPostingStatus: "unposted",
};

describe("#2238 FinancialJournalPreviewPanel", () => {
  it("renders the journal table with both legs, the balanced badge and the dimension", () => {
    render(<FinancialJournalPreviewPanel preview={balancedFuel} />);
    expect(screen.getByText("معاينة القيد المحاسبي")).toBeTruthy();
    expect(screen.getByText("متوازن")).toBeTruthy();
    expect(screen.getByText("5510")).toBeTruthy();
    expect(screen.getByText("1111")).toBeTruthy();
    // dimension chip shows the vehicle dimension carried on the expense leg.
    expect(screen.getByText(/مركبة: 12/)).toBeTruthy();
  });

  it("surfaces blockers when the plan cannot post", () => {
    const blocked: JournalPreview = {
      ...balancedFuel,
      blockers: [{ code: "dimension_contract", field: "vehicleId", message: "الحساب «5510» يتطلب ربطه بـ«مركبة»" }],
    };
    render(<FinancialJournalPreviewPanel preview={blocked} />);
    expect(screen.getByText(/يتطلب ربطه بـ«مركبة»/)).toBeTruthy();
  });

  it("shows the incomplete prompt (no fabricated numbers) when not ready", () => {
    const incomplete: JournalPreview = {
      ready: false, incompleteReason: "أدخل مبلغ المصروف لعرض القيد",
      lines: [], totals: { debit: 0, credit: 0 }, balanced: false, blockers: [], warnings: [],
      sourceContext: { paymentMethod: null, sourceAccountCode: null, sourceAccountName: null },
    };
    render(<FinancialJournalPreviewPanel preview={incomplete} />);
    expect(screen.getByText("أدخل مبلغ المصروف لعرض القيد")).toBeTruthy();
    expect(screen.queryByText("معاينة القيد المحاسبي")).toBeNull();
  });
});
