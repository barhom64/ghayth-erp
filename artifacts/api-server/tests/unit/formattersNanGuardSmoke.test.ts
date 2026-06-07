import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * formatters.ts — NaN guard pins.
 *
 * Without these guards, `Number("")` or `parseFloat("abc")` or
 * `Number(undefined)` flow into formatCurrency / formatNumber as
 * NaN. Then `(NaN).toLocaleString("en-US")` returns the literal
 * string "NaN", and operators see "NaN ر.س" rendered in every cell
 * bound to a malformed value. That's not a crash, but it's also not
 * recoverable inside a normal session — the operator has to reload
 * and hope.
 *
 * The static-text checks below pin:
 *   1. NaN is rejected (Number.isFinite is the canonical filter).
 *   2. The fallback is "-" (matches the null/undefined fallback —
 *      consistent UI signal that a value is missing).
 */

const FORMATTERS = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/lib/formatters.ts"),
  "utf8",
);

describe("formatters.ts — NaN guard on formatCurrency", () => {
  it("rejects NaN via Number.isFinite check", () => {
    // Drift alarm: if anyone reverts to `if (num == null)` alone the
    // NaN path opens up again and operators get "NaN ر.س" in tables.
    expect(FORMATTERS).toMatch(/export function formatCurrency\([\s\S]{0,600}if \(num == null \|\| !Number\.isFinite\(num\)\) return "-"/);
  });
});

describe("formatters.ts — NaN guard on formatNumber", () => {
  it("rejects NaN via Number.isFinite check (parity with formatCurrency)", () => {
    // Same guard on formatNumber so neither helper renders "NaN"
    // verbatim — operators get a "-" placeholder either way.
    expect(FORMATTERS).toMatch(/export function formatNumber\([\s\S]{0,400}if \(num == null \|\| !Number\.isFinite\(num\)\) return "-"/);
  });
});
