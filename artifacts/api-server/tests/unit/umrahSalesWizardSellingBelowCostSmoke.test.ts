import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the surfacing of PR #1457's new margin-VAT signals
 * (sellingBelowCost + costBasis + marginBase) in the sales-wizard
 * UI. Without this UI work the backend flag was returned but
 * invisible — operators wouldn't see the loss warning.
 */
const WIZARD = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/sales-wizard.tsx"),
  "utf8",
);

describe("sales-wizard — sellingBelowCost guardrail", () => {
  it("checks result.sellingBelowCost on the mutation success path", () => {
    expect(WIZARD).toMatch(/result\?\.sellingBelowCost === true/);
  });

  it("emits a destructive-variant toast when the flag is true", () => {
    // The success toast still fires; the warning is a SEPARATE
    // toast so it can't be missed (and so the operator still sees
    // the ref/total they need for follow-up steps).
    const block = WIZARD.match(/result\?\.sellingBelowCost === true[\s\S]{1,800}/);
    expect(block).not.toBeNull();
    expect(block![0]).toMatch(/variant: "destructive"/);
    expect(block![0]).toContain("بيع أقل من التكلفة");
  });

  it("warning toast shows the cost basis the operator priced below", () => {
    // Without the cost number the operator has no actionable
    // signal — they'd see "you priced below cost" but not by how
    // much. Including costBasis lets them adjust prices in one pass.
    expect(WIZARD).toMatch(/تكلفة نسك:\s*\$\{formatCurrency\(Number\(result\?\.costBasis \?\? 0\)\)\}/);
  });

  it("success toast appends margin when available (operator sees gross profit at a glance)", () => {
    expect(WIZARD).toMatch(/result\?\.marginBase != null/);
    expect(WIZARD).toMatch(/هامش: \$\{formatCurrency\(Number\(result\.marginBase\)\)\}/);
  });

  it("success toast still fires on the happy path (regression safety)", () => {
    // The "تم إنشاء الفاتورة" toast must run REGARDLESS of the
    // belowCost branch — both toasts fire on a loss, only the
    // success toast on a healthy invoice.
    expect(WIZARD).toContain("تم إنشاء الفاتورة");
    // The success toast call isn't gated by sellingBelowCost. Loose
    // anchor: the "title: تم إنشاء الفاتورة" string appears AFTER the
    // sellingBelowCost block (which closes with `}` after the toast
    // call), inside a SEPARATE toast({...}).
    const sellingIdx = WIZARD.indexOf("sellingBelowCost === true");
    const successIdx = WIZARD.indexOf('title: "تم إنشاء الفاتورة"');
    expect(sellingIdx).toBeGreaterThan(0);
    expect(successIdx).toBeGreaterThan(sellingIdx);
  });
});
