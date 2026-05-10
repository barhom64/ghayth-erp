/**
 * Alinma Bank WPS adapter.
 *
 * Alinma's spec mirrors the SAMA generic pipe layout but appends a
 * SHA-256 checksum row at the end so the bank's ingest can flag
 * tampered files. The checksum covers the header + every detail
 * row (excluding itself + the trailer).
 *
 * Distinguishing details:
 *   - Pipe-delimited (same as SAMA)
 *   - Tags: H / D / T (matches SAMA)
 *   - Adds a "C" checksum row right after the trailer
 *   - Period YYYY-MM
 *   - Line endings: LF
 */
import { createHash } from "node:crypto";
import type { BankAdapter } from "./types.js";
import {
  joinLines,
  normaliseIban,
  round2dp,
  sanitiseFreeText,
  totalAmount,
} from "./_shared.js";

export const alinmaAdapter: BankAdapter = {
  code: "ALINMA",
  name: "مصرف الإنماء",
  build({ summary, entries }) {
    const total = totalAmount(entries);

    const header = [
      "H",
      summary.companyId,
      summary.vatNumber ?? "",
      summary.crNumber ?? "",
      summary.period,
      total.toFixed(2),
      entries.length,
    ].join("|");

    const detail = entries.map((e) =>
      [
        "D",
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

    const trailer = ["T", entries.length, total.toFixed(2)].join("|");

    // Checksum covers the header + detail rows joined by LF — this
    // is the canonical form the bank also computes on their side.
    const checksumInput = [header, ...detail].join("\n");
    const sha = createHash("sha256").update(checksumInput, "utf8").digest("hex");
    const checksumRow = ["C", sha].join("|");

    return {
      fileBytes: joinLines([header, ...detail, trailer, checksumRow], "LF"),
      totalAmount: total,
      recordCount: entries.length,
    };
  },
};
