import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins Phase 2 of the per-line refactor — GL revenue is now bucketed
 * by accountCode. Behavior-identical when every line uses the default
 * (null accountCode → falls back to revCode), but ready for Phase 3
 * where the operator's product-mapping picks per-itemType account
 * routes (visa-revenue / services-revenue / transport-revenue).
 *
 *   Phase 1 (#1467) — schema + INSERT persists per-line columns
 *   Phase 2 (this)  — GL posting reads them and buckets credit lines
 *   Phase 3 (next)  — product mapping populates accountCode at item
 *                     creation time, enabling actual split routing
 */
const ENGINE = readFileSync(
  join(import.meta.dirname!, "../../src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);

describe("GL revenue bucketing — Phase 2", () => {
  it("introduces a revenueByAccount Map keyed by accountCode", () => {
    expect(ENGINE).toMatch(/const revenueByAccount = new Map<string, number>\(\)/);
  });

  it("only 'group' items contribute revenue (penalties stay on their own line)", () => {
    // Penalties use umrah_penalty_revenue, not umrah_invoice_revenue,
    // so they must NOT mingle into the group-revenue bucket. The
    // continue guard keeps the two streams separate.
    expect(ENGINE).toMatch(/if \(li\.itemType !== "group"\) continue/);
  });

  it("each line's accountCode falls back to the default revCode (null-safe)", () => {
    expect(ENGINE).toMatch(/const code = li\.accountCode \?\? revCode/);
  });

  it("each accountCode accumulates the SUM of lineTotal in the map", () => {
    // Map.set with a get-fallback is the right shape — replacing the
    // entry each iteration would silently overwrite earlier values.
    expect(ENGINE).toMatch(/revenueByAccount\.set\(code, \(revenueByAccount\.get\(code\) \?\? 0\) \+ li\.lineTotal\)/);
  });

  it("emits one CR Revenue per accountCode bucket", () => {
    expect(ENGINE).toMatch(/for \(const \[code, amount\] of revenueByAccount\)/);
    expect(ENGINE).toMatch(/glLines\.push\(\{\s*accountCode: code,\s*debit: 0,\s*credit: amount/);
  });

  it("description distinguishes default-bucket lines from explicit-override ones", () => {
    // Default bucket reads "إيراد خدمات عمرة" (same as Phase 1, no
    // behavior visible to ZATCA). Override buckets show the code so
    // operators reading the JE see WHY the split happened.
    expect(ENGINE).toMatch(/code === revCode[\s\S]{1,200}إيراد خدمات عمرة[\s\S]{1,300}إيراد عمرة \(\$\{code\}\)/);
  });

  it("penalty line still uses penaltiesTotal (unchanged from Phase 1)", () => {
    // Penalty routing was already correct (separate account). This
    // PR ONLY touches the group-revenue split — pin the penalty
    // path so a future refactor can't accidentally collapse them.
    expect(ENGINE).toMatch(/if \(penaltiesTotal > 0\) \{[\s\S]{1,300}penaltyRevCode/);
  });

  it("AR line still posts the full debit total in one shot (no bucketing on the debit side)", () => {
    // The customer owes the FULL total — no reason to split debit
    // even when revenue is split. Pin to catch a future "let's
    // split AR too" mistake.
    expect(ENGINE).toMatch(/accountCode: arCode,\s*debit: total,\s*credit: 0/);
  });

  it("Phase 1's hardcoded single CR Revenue line is REMOVED (no double-credit)", () => {
    // If both the old hardcoded line AND the bucketing loop emitted
    // a CR Revenue, total credits would double the actual revenue.
    // The old `{ accountCode: revCode, ... credit: subtotal, ... }`
    // entry inside the initial glLines array must be gone.
    expect(ENGINE).not.toMatch(/glLines[\s\S]{0,200}: \[\s*\{ accountCode: arCode[\s\S]{1,300}\{ accountCode: revCode, debit: 0, credit: subtotal/);
  });

  it("Phase 2 docstring references the next Phase so future readers know the trajectory", () => {
    // The Phase 1 / 2 / 3 comments at the bucket explain WHY this
    // looks like a no-op today. Without it, a future reader might
    // "simplify" the bucketing back to a single line.
    expect(ENGINE).toMatch(/Phase 2 — bucket revenue by accountCode/);
    expect(ENGINE).toMatch(/Phase 3 resolver|product mapping lands/);
  });
});
