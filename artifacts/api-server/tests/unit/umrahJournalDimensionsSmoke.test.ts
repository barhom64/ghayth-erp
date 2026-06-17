import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const INVOICES = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/finance-invoices.ts"),
  "utf8",
);
const UMRAH_INVOICING = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahInvoicingEngine.ts"),
  "utf8",
);
const UMRAH_COMMISSION = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/umrahCommissionEngine.ts"),
  "utf8",
);

// ─── Umrah dimensional consistency on journal_lines ─────────────────────────
// Audit finding: invoice approval + umrah sales invoice + umrah payment +
// umrah commission accrual all post journal entries, but four of the five
// posting sites used to silently drop `umrahAgentId` and/or `umrahSeasonId`
// before writing journal_lines. The columns existed; the dimensions weren't
// reaching them. These tests lock the fix so a future refactor can't quietly
// revert it.

describe("finance-invoices.ts bucket carries umrah dimensions", () => {
  it("bucket value type declares umrahSeasonId + umrahAgentId", () => {
    // Search inside the bucket Map type literal.
    const mapStart = INVOICES.indexOf("const buckets = new Map<string, {");
    expect(mapStart).toBeGreaterThan(0);
    const block = INVOICES.slice(mapStart, mapStart + 800);
    expect(block).toContain("umrahSeasonId: number | null");
    expect(block).toContain("umrahAgentId: number | null");
  });

  it("bucket key includes umrahSeasonId + umrahAgentId", () => {
    // The key array must include both dims so two lines with the same
    // account but different umrah dimensions land in different buckets.
    const keyMatch = INVOICES.match(/const key = \[[\s\S]{0,500}?\.join\("\|"\)/);
    expect(keyMatch).not.toBeNull();
    expect(keyMatch![0]).toContain("dims.umrahSeasonId");
    expect(keyMatch![0]).toContain("dims.umrahAgentId");
  });

  it("bucket-create branch persists both umrah dims", () => {
    // Locate the buckets.set(key,...) literal and assert it carries both
    // fields. The block is ~600 chars so the regex window is generous.
    const setMatch = INVOICES.match(/buckets\.set\(key,\s*\{[\s\S]{0,1200}?\}\)/);
    expect(setMatch).not.toBeNull();
    expect(setMatch![0]).toContain("umrahSeasonId: dims.umrahSeasonId");
    expect(setMatch![0]).toContain("umrahAgentId: dims.umrahAgentId");
  });

  it("revenueLines.push() passes both umrah dims to the JE engine", () => {
    const pushMatch = INVOICES.match(/revenueLines\.push\(\{[\s\S]{0,1000}?\} as any\)/);
    expect(pushMatch).not.toBeNull();
    expect(pushMatch![0]).toContain("umrahSeasonId: b.umrahSeasonId");
    expect(pushMatch![0]).toContain("umrahAgentId: b.umrahAgentId");
    // Step-3: explicit numeric cost-center propagated to the JE line.
    expect(pushMatch![0]).toContain("costCenterId: b.costCenterId");
  });

  it("fallback bucket key has the right slot count (no collision)", () => {
    // We extended the key from 10 → 12 → 14 dimension slots
    // (added umrahAgentId + umrahSeasonId, then unitId + assetId to close
    // a silent dim-loss bug). The header-level fallback bucket must use
    // an empty key with the matching slot count: 13 pipes for 14 slots.
    expect(INVOICES).toContain("`${invRevenueCode}|||||||||||||`");
  });
});

describe("umrahInvoicingEngine.generateSalesInvoice", () => {
  it("derives umrahDims from subAgent.agentId + seasonId", () => {
    expect(UMRAH_INVOICING).toContain("const umrahDims = {");
    expect(UMRAH_INVOICING).toContain("umrahAgentId: (subAgent.agentId as number | null)");
    expect(UMRAH_INVOICING).toContain("umrahSeasonId: (seasonId as number | null)");
  });

  it("AR + revenue gl lines spread umrahDims", () => {
    // Each of the seed gl lines must include `...umrahDims`.
    const arLine = UMRAH_INVOICING.match(/accountCode: arCode[\s\S]{0,200}/);
    expect(arLine).not.toBeNull();
    expect(arLine![0]).toContain("...umrahDims");
    // Phase 2 (PR #1468) refactored the single hardcoded CR Revenue
    // line into a bucketing loop over revenueByAccount. The literal
    // is now `accountCode: code` (the loop variable that defaults to
    // revCode when no override is set). The dimension contract is
    // unchanged — every bucket emission still spreads umrahDims.
    const revLine = UMRAH_INVOICING.match(/for \(const \[code, amount\] of revenueByAccount\)[\s\S]{0,500}glLines\.push\(\{[\s\S]{0,400}\}\);/);
    expect(revLine).not.toBeNull();
    expect(revLine![0]).toContain("...umrahDims");
  });

  it("optional penalty and VAT lines also carry umrahDims", () => {
    // Anchor the regex on `accountCode: ...Code` so we hit the
    // glLines.push() call and not the upstream getAccountCodeFromMapping.
    const penaltyMatch = UMRAH_INVOICING.match(/accountCode: penaltyRevCode[\s\S]{0,300}/);
    expect(penaltyMatch).not.toBeNull();
    expect(penaltyMatch![0]).toContain("...umrahDims");

    const vatMatch = UMRAH_INVOICING.match(/accountCode: vatPayableCode[\s\S]{0,300}/);
    expect(vatMatch).not.toBeNull();
    expect(vatMatch![0]).toContain("...umrahDims");
  });
});

describe("umrahInvoicingEngine.registerPayment", () => {
  it("selects agentId from umrah_sub_agents", () => {
    expect(UMRAH_INVOICING).toMatch(/SELECT id, "clientId", "agentId" FROM umrah_sub_agents/);
  });

  it("both JE lines on the cash settlement carry umrahAgentId", () => {
    // The two-line GL must propagate agentId on cash leg + AR leg.
    const cashLine = UMRAH_INVOICING.match(/accountCode: cashCode[\s\S]{0,200}/);
    expect(cashLine).not.toBeNull();
    expect(cashLine![0]).toContain("umrahAgentId");
    const arPayLine = UMRAH_INVOICING.match(/accountCode: arPayCode[\s\S]{0,200}/);
    expect(arPayLine).not.toBeNull();
    expect(arPayLine![0]).toContain("umrahAgentId");
  });
});

describe("umrahCommissionEngine accrual", () => {
  it("both commission lines carry umrahSeasonId from the plan", () => {
    const expenseLine = UMRAH_COMMISSION.match(/accountCode: expenseCode[\s\S]{0,200}/);
    expect(expenseLine).not.toBeNull();
    expect(expenseLine![0]).toContain("umrahSeasonId: plan.seasonId");
    const payableLine = UMRAH_COMMISSION.match(/accountCode: payableCode[\s\S]{0,200}/);
    expect(payableLine).not.toBeNull();
    expect(payableLine![0]).toContain("umrahSeasonId: plan.seasonId");
  });
});
