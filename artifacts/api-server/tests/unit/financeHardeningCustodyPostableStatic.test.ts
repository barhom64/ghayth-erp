import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Intercompany-transfer + custody fallbacks must be POSTABLE leaves, not the
 * phantom parents (1200 AR / 2100 AP / 4000 revenue) or absent code (1400)
 * that blocked posting. Closes 4 of the tracked debt
 * (docs/side-issues/finance-phantom-account-fallbacks.md).
 */
const root = join(import.meta.dirname!, "../../../..");
const H = readFileSync(join(root, "artifacts/api-server/src/routes/finance-hardening.ts"), "utf8");
const C = readFileSync(join(root, "artifacts/api-server/src/routes/finance-custodies.ts"), "utf8");

describe("intercompany + custody fallbacks are postable leaves", () => {
  it("intercompany AR/AP/revenue → 1131 / 2111 / 4130 (not 1200/2100/4000 parents)", () => {
    expect(H).toMatch(/arAccountCode: z\.string\(\)\.default\("1131"\)/);
    expect(H).toMatch(/apAccountCode: z\.string\(\)\.default\("2111"\)/);
    expect(H).toMatch(/revenueAccountCode: z\.string\(\)\.default\("4130"\)/);
    expect(H).not.toMatch(/default\("(1200|2100|4000)"\)/);
  });
  it("custody_account → 1113 العهد النقدية (not absent 1400)", () => {
    expect(C).toMatch(/"custody_account", "debit", "1113"/);
    expect(C).not.toMatch(/"1400"/);
  });
});
