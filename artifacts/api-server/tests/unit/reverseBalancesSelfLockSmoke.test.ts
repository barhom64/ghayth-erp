import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * GL balance apply/reverse symmetry + self-locking.
 *
 * applyJournalEntryBalances moves chart_of_accounts.currentBalance by
 * +(debit − credit) per account and takes a FOR UPDATE lock on the journal
 * row to stop two concurrent applies double-counting. reverseAccountBalances
 * is its exact inverse — −(debit − credit) — but historically lacked the same
 * self-lock, relying on every caller to hold the row lock externally (the
 * posted-entry reject paths do, via applyTransition; the draft-delete callers
 * are no-ops). These assertions pin BOTH the mirror-image deltas and the
 * matching FOR UPDATE so a future caller can't reintroduce a double-rewind.
 */
const SRC = readFileSync(
  join(import.meta.dirname!, "../../src/lib/businessHelpers.ts"),
  "utf8",
);

describe("apply/reverse account balances", () => {
  it("forward applies +(debit − credit) per account", () => {
    expect(SRC).toMatch(/const delta = Number\(line\.debit\) - Number\(line\.credit\);/);
  });

  it("reverse applies the exact inverse −(debit − credit)", () => {
    expect(SRC).toMatch(/const delta = -\(Number\(line\.debit\) - Number\(line\.credit\)\);/);
  });

  it("BOTH lock the journal row with FOR UPDATE before reading balancesApplied", () => {
    // Two SELECTs on journal_entries for "balancesApplied" — the forward and
    // the reverse — must each carry FOR UPDATE.
    const matches = SRC.match(/"balancesApplied"[\s\S]{0,160}?FOR UPDATE/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(2);
  });

  it("both skip near-zero net deltas and gate on a closed period", () => {
    expect(SRC).toMatch(/Math\.abs\(delta\) < 0\.001/);
    expect(SRC).toMatch(/checkFinancialPeriodOpen/);
  });
});
