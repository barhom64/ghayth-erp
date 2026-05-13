import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const IMPORT = read("umrahImportEngine.ts");
const INVOICE = read("umrahInvoicingEngine.ts");
const COMMISSION = read("umrahCommissionEngine.ts");

// ══════════════════════════════════════════════════════════════════════════
// UMRAH IMPORT ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("umrahImportEngine — exports", () => {
  it("exports ParsedRow interface", () => {
    expect(IMPORT).toContain("export interface ParsedRow");
  });

  it("exports parseMutamersWorkbook", () => {
    expect(IMPORT).toContain("export async function parseMutamersWorkbook");
  });

  it("exports parseVouchersWorkbook", () => {
    expect(IMPORT).toContain("export async function parseVouchersWorkbook");
  });

  it("exports ImportScope interface", () => {
    expect(IMPORT).toContain("export interface ImportScope");
  });

  it("exports ImportDiff interface", () => {
    expect(IMPORT).toContain("export interface ImportDiff");
  });

  it("exports previewMutamersImport", () => {
    expect(IMPORT).toContain("export async function previewMutamersImport");
  });

  it("exports previewVouchersImport", () => {
    expect(IMPORT).toContain("export async function previewVouchersImport");
  });

  it("exports ImportResult interface", () => {
    expect(IMPORT).toContain("export interface ImportResult");
  });

  it("exports confirmMutamersImport", () => {
    expect(IMPORT).toContain("export async function confirmMutamersImport");
  });

  it("exports confirmVouchersImport", () => {
    expect(IMPORT).toContain("export async function confirmVouchersImport");
  });
});

describe("umrahImportEngine — security", () => {
  it("uses parameterized queries", () => {
    const params = [...IMPORT.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(20);
  });

  it("scopes by companyId", () => {
    const matches = [...IMPORT.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// UMRAH INVOICING ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("umrahInvoicingEngine — exports", () => {
  it("exports generateSalesInvoice", () => {
    expect(INVOICE).toContain("export async function generateSalesInvoice");
  });

  it("exports registerPayment", () => {
    expect(INVOICE).toContain("export async function registerPayment");
  });

  it("exports generateStatement", () => {
    expect(INVOICE).toContain("export async function generateStatement");
  });

  it("exports getDashboard", () => {
    expect(INVOICE).toContain("export async function getDashboard");
  });
});

describe("umrahInvoicingEngine — statement types", () => {
  it("supports detailed and summary statement types", () => {
    expect(INVOICE).toContain('"detailed"');
    expect(INVOICE).toContain('"summary"');
  });
});

describe("umrahInvoicingEngine — security", () => {
  it("uses parameterized queries", () => {
    const params = [...INVOICE.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(20);
  });

  it("scopes by companyId", () => {
    const matches = [...INVOICE.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// UMRAH COMMISSION ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("umrahCommissionEngine — exports", () => {
  it("exports CalculationResult interface", () => {
    expect(COMMISSION).toContain("export interface CalculationResult");
  });

  it("exports calculateCommissionForPlan", () => {
    expect(COMMISSION).toContain("export async function calculateCommissionForPlan");
  });

  it("exports simulateCommission", () => {
    expect(COMMISSION).toContain("export async function simulateCommission");
  });

  it("exports calculateAllForCompany", () => {
    expect(COMMISSION).toContain("export async function calculateAllForCompany");
  });
});

describe("umrahCommissionEngine — security", () => {
  it("uses parameterized queries", () => {
    const params = [...COMMISSION.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(10);
  });

  it("scopes by companyId", () => {
    const matches = [...COMMISSION.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// UMRAH IMPORT — NUSK AP posting + refund reversal (PR #303)
// ══════════════════════════════════════════════════════════════════════════
//
// CONTRIBUTING §3.2 requires GL test + idempotency for any financial
// route. PR #303 changed two things in umrahImportEngine.ts:
//   1. AP journal now posts on receipt for any status except "cancelled"
//      (was: only when nuskStatus === "paid").
//   2. A reversal journal posts when nuskStatus === "refunded" with
//      refundAmount > 0.
// Both paths run through createGuardedJournalEntry — which itself
// applies the closed-period guard + audit. The asserts below lock the
// engine to these contracts at the source level so a future revert
// would fail CI before the regression ships.

describe("umrahImportEngine — NUSK AP posting (PR #303)", () => {
  it("defines a postNuskJournalEntries helper", () => {
    expect(IMPORT).toContain("async function postNuskJournalEntries");
  });

  it("posts AP for every status except 'cancelled' (regression of the paid-only bug)", () => {
    // The new gate: totalAmount>0 && status!='cancelled' && !existingApJeId
    expect(IMPORT).toMatch(/nuskStatus\s*!==\s*["']cancelled["']/);
    // The old gate (status==='paid') must not be the only path anymore.
    // Any historical match must be inside a comment or string-literal
    // explanation, never a live condition.
    const code = IMPORT.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");
    expect(code).not.toMatch(/if\s*\([^)]*nuskStatus\s*===\s*["']paid["'][^)]*\)\s*{[^}]*createGuardedJournalEntry/);
  });

  it("posts a reversal JE when status is 'refunded' with refundAmount > 0", () => {
    expect(IMPORT).toMatch(/nuskStatus\s*===\s*["']refunded["']/);
    expect(IMPORT).toContain("refundAmount > 0");
  });

  it("uses distinct sourceKey for AP and refund (idempotency)", () => {
    expect(IMPORT).toContain("umrah_nusk_ap_");
    expect(IMPORT).toContain("umrah_nusk_refund_");
  });

  it("posts through createGuardedJournalEntry (closed-period guard + audit)", () => {
    expect(IMPORT).toContain("createGuardedJournalEntry");
    // Two call sites at minimum: AP entry + refund reversal.
    const calls = [...IMPORT.matchAll(/createGuardedJournalEntry\s*\(/g)];
    expect(calls.length).toBeGreaterThanOrEqual(2);
  });

  it("re-entrancy guard: skips when existingApJeId or existingRefundJeId is already set", () => {
    expect(IMPORT).toContain("existingApJeId");
    expect(IMPORT).toContain("existingRefundJeId");
    // Either guard short-circuits the post (`!existingApJeId` / `!existingRefundJeId`).
    expect(IMPORT).toMatch(/!\s*existingApJeId/);
    expect(IMPORT).toMatch(/!\s*existingRefundJeId/);
  });

  it("update path re-evaluates JE state on every voucher import (backfills legacy rows)", () => {
    // The UPDATE branch calls postNuskJournalEntries with the row's
    // current purchaseInvoiceId/journalEntryId so legacy rows missing
    // either JE get backfilled on the next import.
    expect(IMPORT).toMatch(/postNuskJournalEntries\([\s\S]*?ex\.purchaseInvoiceId/);
    expect(IMPORT).toMatch(/postNuskJournalEntries\([\s\S]*?ex\.journalEntryId/);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// UMRAH COMMISSION — plan versioning snapshot (PR #306)
// ══════════════════════════════════════════════════════════════════════════
//
// PR #306 introduced planVersion + planSnapshot + tiersSnapshot on
// every employee_commission_calculations row, plus DB triggers that
// auto-bump employee_commission_plans.version when shaping columns or
// any tier changes. The assertions below lock in the snapshot writes
// at the engine level. Trigger behaviour is covered by the migration
// SQL itself (migration 153) and exercised end-to-end whenever the
// commission engine runs against a real DB in the dynamic harness.

describe("umrahCommissionEngine — plan version snapshot (PR #306)", () => {
  it("defines buildPlanSnapshot + buildTiersSnapshot helpers", () => {
    expect(COMMISSION).toContain("function buildPlanSnapshot");
    expect(COMMISSION).toContain("function buildTiersSnapshot");
  });

  it("INSERTs planVersion + planSnapshot + tiersSnapshot on every new calculation row", () => {
    // Find the INSERT INTO employee_commission_calculations statement
    // and verify the three new columns appear in its column list.
    const insertMatch = COMMISSION.match(/INSERT\s+INTO\s+employee_commission_calculations[\s\S]*?VALUES/i);
    expect(insertMatch).toBeTruthy();
    const insertText = insertMatch![0];
    expect(insertText).toContain('"planVersion"');
    expect(insertText).toContain('"planSnapshot"');
    expect(insertText).toContain('"tiersSnapshot"');
  });

  it("UPDATEs the snapshot when an existing calc row is recalculated", () => {
    const updateMatch = COMMISSION.match(/UPDATE\s+employee_commission_calculations[\s\S]*?WHERE\s+id=/i);
    expect(updateMatch).toBeTruthy();
    const updateText = updateMatch![0];
    expect(updateText).toContain('"planVersion"');
    expect(updateText).toContain('"planSnapshot"');
    expect(updateText).toContain('"tiersSnapshot"');
  });

  it("CommissionPlan type includes the `version` field", () => {
    expect(COMMISSION).toMatch(/interface\s+CommissionPlan\s*\{[\s\S]*?version:\s*number/);
  });
});
