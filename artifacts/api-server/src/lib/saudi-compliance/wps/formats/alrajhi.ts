/**
 * Al Rajhi Bank WPS adapter.
 *
 * Per the published "Al Rajhi Online Corporate — Payroll Upload
 * File Format" spec, the bank uses a pipe-delimited layout very
 * close to SAMA's reference but with two-character row tags + a
 * Halalas grand total in the trailer.
 *
 * Distinguishing details:
 *   - Header tag "HD", detail "DT", trailer "TR"
 *   - Amounts in SAR with 2 decimal places (NOT halalas)
 *   - Period format YYYY-MM (matches SAMA reference)
 *   - Line endings: LF
 *   - Adds an extra "AR" row carrying the bank account name (from
 *     wps_settings.bankAccountName) for reconciliation
 */
import type { BankAdapter } from "./types.js";
import {
  joinLines,
  normaliseIban,
  round2dp,
  sanitiseFreeText,
  totalAmount,
} from "./_shared.js";

export const alrajhiAdapter: BankAdapter = {
  code: "ALRAJHI",
  name: "مصرف الراجحي",
  build({ summary, entries }) {
    const total = totalAmount(entries);

    const header = [
      "HD",
      summary.companyId,
      summary.crNumber ?? "",
      summary.vatNumber ?? "",
      summary.period,
      total.toFixed(2),
      entries.length,
    ].join("|");

    const accountRow = [
      "AR",
      summary.companyIban ?? "",
      "SAR",
    ].join("|");

    const detail = entries.map((e, idx) =>
      [
        "DT",
        idx + 1,
        sanitiseFreeText(e.iqamaOrId),
        normaliseIban(e.iban),
        round2dp(e.amount).toFixed(2),
        round2dp(e.basicSalary).toFixed(2),
        round2dp(e.housingAllowance).toFixed(2),
        round2dp(e.otherAllowances).toFixed(2),
        round2dp(e.deductions).toFixed(2),
        sanitiseFreeText(e.remark ?? ""),
      ].join("|"),
    );

    const trailer = ["TR", entries.length, total.toFixed(2)].join("|");

    return {
      fileBytes: joinLines([header, accountRow, ...detail, trailer], "LF"),
      totalAmount: total,
      recordCount: entries.length,
    };
  },
};
