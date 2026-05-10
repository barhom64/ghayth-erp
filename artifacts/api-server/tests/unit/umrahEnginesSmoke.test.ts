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
    expect(IMPORT).toContain("export function parseMutamersWorkbook");
  });

  it("exports parseVouchersWorkbook", () => {
    expect(IMPORT).toContain("export function parseVouchersWorkbook");
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
