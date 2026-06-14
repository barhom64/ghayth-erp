import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// #1715 wave-1 guardrail #6: every finance operation must flow through a
// FinanceOperationContext. This lint-pattern test pins the expense + voucher
// create handlers to the unified context so they cannot silently regress back
// to calling the posting policy inline (the scattered pattern we consolidated).

const __dirname = dirname(fileURLToPath(import.meta.url));
const SRC = readFileSync(
  resolve(__dirname, "../../src/routes/finance-journal.ts"),
  "utf8",
);

describe("finance-journal create flows route through FinanceOperationContext", () => {
  it("imports the adapters from financeOperationContext", () => {
    expect(SRC).toContain("fromLegacyExpenseForm");
    expect(SRC).toContain("fromLegacyVoucherForm");
    expect(SRC).toContain("financeOperationContext.js");
  });

  it("validates each create flow via assertOperationValid", () => {
    // Three call sites: /expenses (save), /vouchers (save), and the #2238
    // expense journal-preview — the preview reaches the money-source ↔ method
    // policy ONLY through the same context wrapper, so the check can never drift
    // between what the preview shows and what the save enforces.
    const calls = SRC.match(/await assertOperationValid\(/g) ?? [];
    expect(calls.length).toBe(3);
  });

  it("no longer calls assertPaymentSourceAllowed inline in the create flows", () => {
    // The policy is now reached only through the context wrapper, never
    // imported directly inside finance-journal's create handlers.
    expect(SRC).not.toContain("assertPaymentSourceAllowed");
  });

  it("feeds the resolved money account + method into the adapter", () => {
    // sourceAcct (expense) and cashAcct (voucher) are the post-default money
    // accounts; both must be the sourceAccountCode the adapter forwards.
    expect(SRC).toContain("sourceAccountCode: sourceAcct");
    expect(SRC).toContain("sourceAccountCode: cashAcct");
  });
});
