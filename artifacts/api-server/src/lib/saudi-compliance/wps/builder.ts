/**
 * WPS (Wage Protection System) file builder.
 *
 * Produces the pipe-delimited payroll file Saudi banks accept for
 * monthly salary settlement. The generic format is:
 *
 *   H|<companyId>|<vatNumber>|<crNumber>|<period>|<totalAmount>|<recordCount>
 *   D|<iqamaOrId>|<iban>|<bankCode>|<amount>|SAR|<basic>|<housing>|<other>|<deductions>|<remark>
 *   ...
 *   T|<recordCount>|<totalAmount>
 *
 * Per-bank adapters (NCB, Al Rajhi, Riyad, Alinma) ship in week 4
 * once we have sample files from each bank. The generic format
 * matches the SAMA-published reference layout the smaller banks
 * accept by default.
 *
 * Pure: no DB, no time. Caller pulls the payroll-run from DB and
 * hands the entries here. Output is a UTF-8 string ready to write
 * to wps_runs.fileBytes.
 */
import type {
  WpsBuildResult,
  WpsFormat,
  WpsPayrollEntry,
  WpsRunSummary,
} from "../types.js";
import { ADAPTERS } from "./formats/index.js";

export interface BuildWpsFileInput {
  summary: WpsRunSummary;
  entries: WpsPayrollEntry[];
  format?: WpsFormat;
}

/**
 * Build the WPS file string for a payroll run. Validates each
 * entry's IBAN + amount before emitting; throws on malformed
 * input rather than producing a half-valid file the bank would
 * reject.
 */
export function buildWpsFile(input: BuildWpsFileInput): WpsBuildResult {
  const format = input.format ?? "generic_pipe";

  if (input.entries.length === 0) {
    throw new Error("WPS build: payroll has no entries");
  }
  if (!/^\d{4}-\d{2}$/.test(input.summary.period)) {
    throw new Error(`WPS build: period must be YYYY-MM, got "${input.summary.period}"`);
  }

  validateEntries(input.entries);

  if (format === "generic_pipe") {
    return buildGenericPipe(input);
  }

  // Per-bank adapters dispatch by tag (week-4 of the rollout).
  const adapter = ADAPTERS[format];
  if (!adapter) {
    throw new Error(`WPS build: unknown format "${format as string}"`);
  }
  return adapter.build({ summary: input.summary, entries: input.entries });
}

// ─────────────────────────────────────────────────────────────────────
// Generic pipe-delimited format
// ─────────────────────────────────────────────────────────────────────

function buildGenericPipe(input: BuildWpsFileInput): WpsBuildResult {
  const { summary, entries } = input;
  const totalAmount = round2dp(entries.reduce((sum, e) => sum + e.amount, 0));
  const recordCount = entries.length;

  const header = [
    "H",
    summary.companyId,
    summary.vatNumber ?? "",
    summary.crNumber ?? "",
    summary.period,
    totalAmount.toFixed(2),
    recordCount,
  ].join("|");

  const detailLines = entries.map((e) =>
    [
      "D",
      sanitize(e.iqamaOrId),
      sanitize(e.iban),
      summary.bankCode,
      e.amount.toFixed(2),
      "SAR",
      e.basicSalary.toFixed(2),
      e.housingAllowance.toFixed(2),
      e.otherAllowances.toFixed(2),
      e.deductions.toFixed(2),
      sanitize(e.remark ?? ""),
    ].join("|"),
  );

  const trailer = ["T", recordCount, totalAmount.toFixed(2)].join("|");

  const fileBytes = [header, ...detailLines, trailer].join("\n") + "\n";
  return { fileBytes, totalAmount, recordCount };
}

// ─────────────────────────────────────────────────────────────────────
// Validation
// ─────────────────────────────────────────────────────────────────────

function validateEntries(entries: WpsPayrollEntry[]): void {
  for (const e of entries) {
    if (!Number.isFinite(e.amount) || e.amount <= 0) {
      throw new Error(`WPS build: amount must be positive finite, got ${e.amount} for employeeId=${e.employeeId}`);
    }
    if (!isSaudiIban(e.iban)) {
      throw new Error(
        `WPS build: invalid Saudi IBAN "${e.iban}" for employeeId=${e.employeeId} ` +
          `(must be 24 chars starting "SA")`,
      );
    }
    if (!e.iqamaOrId || e.iqamaOrId.trim() === "") {
      throw new Error(`WPS build: missing iqamaOrId for employeeId=${e.employeeId}`);
    }
  }
}

/**
 * Sanity-check a Saudi IBAN: 24 chars, starts with SA, alphanumeric.
 * The full mod-97 check is done by the bank — we just catch the
 * obvious copy-paste mistakes (whitespace, wrong country code).
 */
export function isSaudiIban(value: string): boolean {
  if (typeof value !== "string") return false;
  const cleaned = value.replace(/\s+/g, "").toUpperCase();
  if (cleaned.length !== 24) return false;
  if (!cleaned.startsWith("SA")) return false;
  if (!/^[A-Z0-9]+$/.test(cleaned)) return false;
  return true;
}

/**
 * Strip pipes + line breaks from free-text fields so a malformed
 * remark can't smuggle extra columns or rows into the file.
 */
function sanitize(value: string): string {
  return value.replace(/[|\r\n]+/g, " ").trim().slice(0, 80);
}

function round2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}
