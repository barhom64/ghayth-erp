/**
 * Shared utilities for the per-bank WPS adapters.
 * No I/O — every helper is a pure string manipulator.
 */

import type { WpsPayrollEntry } from "../../types.js";

export function round2dp(value: number): number {
  if (!Number.isFinite(value)) return value;
  const sign = value < 0 ? -1 : 1;
  return sign * Math.round(Math.abs(value) * 100 + Number.EPSILON) / 100;
}

/**
 * Sum the per-entry amounts to 2dp — the trailer total every bank
 * format uses.
 */
export function totalAmount(entries: WpsPayrollEntry[]): number {
  return round2dp(entries.reduce((s, e) => s + e.amount, 0));
}

/**
 * Strip pipes / commas / newlines / tabs from free-text fields so
 * a malformed remark can't smuggle extra columns into any of the
 * formats. Length-cap to 80 chars (SAMA spec for the remark).
 */
export function sanitiseFreeText(value: string): string {
  return value.replace(/[|,\r\n\t]+/g, " ").trim().slice(0, 80);
}

/**
 * Normalise an IBAN by stripping whitespace and uppercasing — most
 * bank specs require the bare 24-char form.
 */
export function normaliseIban(iban: string): string {
  return iban.replace(/\s+/g, "").toUpperCase();
}

/**
 * Validate the period as YYYY-MM and return the YYYYMM digits. Some
 * bank formats want the dashless form in their header.
 */
export function periodDigits(period: string): string {
  const m = /^(\d{4})-(\d{2})$/.exec(period);
  if (!m) {
    throw new Error(`WPS adapter: period must be YYYY-MM, got "${period}"`);
  }
  return `${m[1]}${m[2]}`;
}

/**
 * Append a CRLF (banks that ingest the file via legacy MQ pipelines
 * expect Windows line endings; the generic format uses LF only).
 */
export function joinLines(lines: string[], eol: "LF" | "CRLF" = "LF"): string {
  const sep = eol === "CRLF" ? "\r\n" : "\n";
  return lines.join(sep) + sep;
}
