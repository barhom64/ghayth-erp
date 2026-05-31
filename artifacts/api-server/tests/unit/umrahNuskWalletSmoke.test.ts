import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Pins the NUSK wallet endpoint + UI.
 *
 * Architecture decision: the "wallet" is NOT a separate table — it's
 * the running balance of the NUSK supplier in the standard AP ledger.
 *   walletBalance = SUM(payments TO nusk supplier)
 *                   - SUM(nusk invoice totals net of refunds)
 *
 * This means the wallet view and the vendor statement (PR #1453) read
 * from the same source rows and CAN'T DRIFT.
 */
const ROUTE = readFileSync(
  join(import.meta.dirname!, "../../src/routes/umrah.ts"),
  "utf8",
);
const PAGE = readFileSync(
  join(import.meta.dirname!, "../../../ghayth-erp/src/pages/umrah/settings.tsx"),
  "utf8",
);

describe("GET /umrah/nusk-wallet — derived balance over AP", () => {
  it("registers under feature: umrah, action: view (read-only derived view)", () => {
    expect(ROUTE).toMatch(/router\.get\("\/nusk-wallet",\s*authorize\(\{\s*feature:\s*"umrah",\s*action:\s*"view"\s*\}\)/);
  });

  it("returns configured: false when nuskSupplierId is unset (CTA path)", () => {
    // Operators landing on the page before configuring the supplier
    // should see a "configure NUSK first" prompt, NOT misleading
    // zeroes that look like a balanced wallet.
    // Scope to JUST the /nusk-wallet handler — it's the LAST route
    // in the file, so anchor on `export default` rather than the next
    // router declaration.
    const m = ROUTE.match(/router\.get\("\/nusk-wallet"[\s\S]*?(?=export default)/);
    expect(m).not.toBeNull();
    expect(m![0]).toMatch(/if \(nuskSupplierId == null\)/);
    expect(m![0]).toMatch(/configured: false/);
  });

  it("deposits query matches the vendor-statement filter set (no drift)", () => {
    // Both views compute against the same join + JE filters
    // (balancesApplied + not reversed + soft-delete guards). The
    // wallet's "deposits" number = vendor-statement's "debit" total.
    expect(ROUTE).toMatch(/SUM\(spa\.amount\)[\s\S]{1,1000}je\."balancesApplied" = true[\s\S]{1,200}je\."reversedById" IS NULL/);
  });

  it("obligations exclude cancelled NUSK invoices and net out refunds", () => {
    // Same shape as PR #1457's cost-basis fix — cancelled rows aren't
    // owed, and refunds reduce the owed amount.
    expect(ROUTE).toMatch(/SUM\("totalAmount"\)[\s\S]{1,200}SUM\("refundAmount"\)[\s\S]{1,400}"nuskStatus" NOT IN \('cancelled'\)/);
  });

  it("walletBalance = totalDeposits - totalObligations (no separate math)", () => {
    expect(ROUTE).toMatch(/totalObligations = grossObligations - totalRefunds/);
    expect(ROUTE).toMatch(/walletBalance = totalDeposits - totalObligations/);
  });

  it("returns the breakdown components so the UI can show each row", () => {
    // Display needs deposits + obligations + refunds + balance — the
    // operator wants to see "deposited X, consumed Y, refunded Z =
    // balance W", not a black-box single number.
    expect(ROUTE).toMatch(/res\.json\(\{\s*configured: true,\s*nuskSupplierId,\s*walletBalance,\s*totalDeposits,\s*totalObligations,\s*totalRefunds/);
  });
});

describe("settings page — NUSK wallet card", () => {
  it("only renders when wallet.configured = true (no card on fresh install)", () => {
    expect(PAGE).toMatch(/wallet\?\.configured && \(/);
    expect(PAGE).toContain('data-testid="nusk-wallet-card"');
  });

  it("balance amount has color signal: green positive / muted zero / red negative", () => {
    expect(PAGE).toMatch(/wallet\.walletBalance > 0[\s\S]{1,100}text-status-success-foreground/);
    expect(PAGE).toMatch(/wallet\.walletBalance === 0[\s\S]{1,100}text-muted-foreground/);
    expect(PAGE).toMatch(/text-status-error-foreground/);
  });

  it("RED-banner warning when balance < 0 (operator must top up before next invoice)", () => {
    // This is the soft enforcement of "cannot buy a visa without
    // money in the wallet" — the actual hard guardrail (refuse the
    // import) is a separate PR; this PR just makes the violation
    // visible.
    expect(PAGE).toMatch(/wallet\.walletBalance < 0[\s\S]{1,400}border-status-error-surface/);
    expect(PAGE).toContain("التزاماتك تجاوزت تحويلاتك");
    expect(PAGE).toMatch(/يجب تحويل[\s\S]{0,200}إلى مورد نسك/);
  });

  it("breakdown shows the 3 components (deposits / obligations / refunds)", () => {
    expect(PAGE).toContain('data-testid="nusk-wallet-deposits"');
    expect(PAGE).toContain('data-testid="nusk-wallet-obligations"');
    expect(PAGE).toContain('data-testid="nusk-wallet-refunds"');
    expect(PAGE).toContain("إجمالي التحويلات لنسك");
    expect(PAGE).toContain("إجمالي فواتير نسك");
    expect(PAGE).toContain("إجمالي المرتجعات");
  });

  it("save action refetches the wallet too (defensive consistency)", () => {
    // Saving settings doesn't change wallet balance, but the user's
    // mental model is "if I touch settings, refresh everything" —
    // small UX win for negligible code cost.
    expect(PAGE).toMatch(/refetchWallet\(\)/);
  });
});
