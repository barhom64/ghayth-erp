import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Finance-entry Batch 1: the expense/cash account FALLBACKS must point at REAL
 * postable leaves (5399 general G&A, 1111 main cash) — never the non-postable
 * parents 5000 («المصروفات») / 1100 («الأصول المتداولة») that produced a dead
 * journal and blocked the user. Static guard against regressing to the phantoms.
 */
const root = join(import.meta.dirname!, "../../../..");
const J = readFileSync(join(root, "artifacts/api-server/src/routes/finance-journal.ts"), "utf8");
const H = readFileSync(join(root, "artifacts/api-server/src/routes/finance-hardening.ts"), "utf8");
const C = readFileSync(join(root, "artifacts/api-server/src/routes/finance-custodies.ts"), "utf8");
const BOOT = readFileSync(join(root, "artifacts/api-server/src/lib/companyBootstrap.ts"), "utf8");

describe("expense/cash fallbacks point at postable leaves, not phantom parents", () => {
  it("finance-journal no longer uses 5000/1100 as account-code fallbacks", () => {
    expect(J).not.toMatch(/\|\| "1100"/);
    expect(J).not.toMatch(/expenseAccountCode = "5000"/);
    expect(J).not.toMatch(/overrideAccountCode \?\? "5000"/);
    // the resolveAccountCode general-expense fallback is now 5399
    expect(J).toMatch(/"debit",\s*\n\s*"5399"/);
  });
  it("finance-hardening default expense account is 5399 (not 5000)", () => {
    expect(H).toMatch(/z\.string\(\)\.default\("5399"\)/);
    expect(H).not.toMatch(/default\("5000"\)/);
  });
  it("finance-custodies cash source falls back to 1111 (not 1100)", () => {
    expect(C).not.toMatch(/sourceAccountCode \|\| "1100"/);
    expect(C).toMatch(/sourceAccountCode \|\| "1111"/);
  });
  it("bootstrap seeds the postable general-expense leaf 5399 under 5300", () => {
    expect(BOOT).toMatch(/code: "5399"[\s\S]*?parentCode: "5300"/);
  });
});
