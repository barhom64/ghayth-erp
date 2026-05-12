/**
 * NCB / SNB (National Commercial Bank / Saudi National Bank) WPS
 * adapter.
 *
 * Per the publicly-documented spec (`SNB Corporate Internet Banking
 * — Payroll File Specification`), NCB uses a comma-separated layout
 * with these distinguishing details:
 *
 *   - Header tag is "1" (not "H")
 *   - Amounts use Halalas (multiply by 100, no decimal point)
 *   - Period in header is YYYYMM (no dash)
 *   - Trailer tag is "9"; carries record count + grand total
 *   - Line endings: CRLF
 */
import type { BankAdapter } from "./types.js";
import {
  joinLines,
  normaliseIban,
  periodDigits,
  round2dp,
  sanitiseFreeText,
  totalAmount,
} from "./_shared.js";

function halalas(amount: number): string {
  // Bank-side ingest interprets the field as Halalas — convert SAR
  // to Halalas by × 100 and emit as an integer string.
  return Math.round(round2dp(amount) * 100).toString();
}

export const ncbAdapter: BankAdapter = {
  code: "NCB",
  name: "البنك الأهلي السعودي",
  build({ summary, entries }) {
    const total = totalAmount(entries);

    const header = [
      "1",
      summary.companyId,
      summary.crNumber ?? "",
      summary.companyIban ?? "",
      periodDigits(summary.period),
      halalas(total),
      entries.length,
    ].join(",");

    const detail = entries.map((e) =>
      [
        "2",
        sanitiseFreeText(e.iqamaOrId),
        normaliseIban(e.iban),
        halalas(e.amount),
        halalas(e.basicSalary),
        halalas(e.housingAllowance),
        halalas(e.otherAllowances),
        halalas(e.deductions),
        sanitiseFreeText(e.remark ?? ""),
      ].join(","),
    );

    const trailer = ["9", entries.length, halalas(total)].join(",");

    return {
      fileBytes: joinLines([header, ...detail, trailer], "CRLF"),
      totalAmount: total,
      recordCount: entries.length,
    };
  },
};
