/**
 * Riyad Bank WPS adapter.
 *
 * Riyad's spec uses a fixed-width layout for the detail rows —
 * the bank's older mainframe ingest doesn't tolerate a variable
 * number of separators. The header and trailer remain pipe-
 * delimited (parsed by a different downstream system).
 *
 * Distinguishing details:
 *   - Header / trailer pipe-delimited; detail FIXED-WIDTH
 *   - Amounts in SAR with 2 decimal places, right-padded
 *   - Period YYYYMM (no dash) in the header
 *   - Line endings: CRLF
 *
 * Field widths (detail):
 *   tag    = 1   ("D")
 *   iqama  = 15
 *   iban   = 24
 *   amount = 15  (right-padded with zeros, e.g. "000000005000.00")
 *   remark = 80  (left-justified, space-padded)
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

function padLeft(value: string, width: number, fill = "0"): string {
  if (value.length >= width) return value.slice(0, width);
  return fill.repeat(width - value.length) + value;
}

function padRight(value: string, width: number, fill = " "): string {
  if (value.length >= width) return value.slice(0, width);
  return value + fill.repeat(width - value.length);
}

function fixedAmount(value: number): string {
  // Right-justify with leading zeros so the bank's mainframe ingest
  // sees a stable column width regardless of magnitude.
  return padLeft(round2dp(value).toFixed(2), 15, "0");
}

export const riyadAdapter: BankAdapter = {
  code: "RIYAD",
  name: "بنك الرياض",
  build({ summary, entries }) {
    const total = totalAmount(entries);

    const header = [
      "H",
      summary.companyId,
      summary.crNumber ?? "",
      summary.companyIban ?? "",
      periodDigits(summary.period),
      total.toFixed(2),
      entries.length,
    ].join("|");

    const detail = entries.map((e) =>
      [
        "D",
        padRight(sanitiseFreeText(e.iqamaOrId), 15),
        padRight(normaliseIban(e.iban), 24),
        fixedAmount(e.amount),
        padRight(sanitiseFreeText(e.remark ?? ""), 80),
      ].join(""),
    );

    const trailer = ["T", entries.length, total.toFixed(2)].join("|");

    return {
      fileBytes: joinLines([header, ...detail, trailer], "CRLF"),
      totalAmount: total,
      recordCount: entries.length,
    };
  },
};
