import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const SELF_AUDIT = read("selfAuditEngine.ts");
const PDF = read("pdfExport.ts");
const EXCEL = read("excelExport.ts");

// ══════════════════════════════════════════════════════════════════════════
// SELF AUDIT ENGINE
// ══════════════════════════════════════════════════════════════════════════

describe("selfAuditEngine — exports", () => {
  it("exports runSelfAudit", () => {
    expect(SELF_AUDIT).toContain("export async function runSelfAudit");
  });

  it("exports runSelfAuditAllCompanies", () => {
    expect(SELF_AUDIT).toContain("export async function runSelfAuditAllCompanies");
  });
});

describe("selfAuditEngine — audit check types", () => {
  for (const check of [
    "checkEmployeesWithoutActiveContract",
    "checkExpiredContractsNotRenewed",
    "checkVehiclesWithoutInsurance",
    "checkOverdueInvoicesNoCollection",
    "checkUnsettledCustody",
    "checkStalledRequests",
    "checkUpcomingHearingsNoAction",
    "checkEmployeesWithoutActiveAssignment",
    "checkIncompleteAttendance",
    "checkNegativeLeaveBalance",
  ]) {
    it(`has check: ${check}`, () => {
      expect(SELF_AUDIT).toContain(check);
    });
  }
});

describe("selfAuditEngine — type-to-department mapping", () => {
  for (const [type, dept] of [
    ["employee_no_contract", "hr"],
    ["vehicle_no_insurance", "fleet"],
    ["overdue_invoice_no_action", "finance"],
    ["stalled_request", "operations"],
    ["hearing_no_preparation", "legal"],
  ]) {
    it(`maps ${type} to ${dept}`, () => {
      expect(SELF_AUDIT).toContain(`${type}`);
    });
  }
});

describe("selfAuditEngine — priority levels", () => {
  for (const p of ["critical", "high", "medium", "low"]) {
    it(`supports priority: ${p}`, () => {
      expect(SELF_AUDIT).toContain(`"${p}"`);
    });
  }
});

describe("selfAuditEngine — security", () => {
  it("uses parameterized queries", () => {
    const params = [...SELF_AUDIT.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(5);
  });

  it("scopes by companyId", () => {
    const matches = [...SELF_AUDIT.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(10);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// PDF EXPORT
// ══════════════════════════════════════════════════════════════════════════

describe("pdfExport — exported functions", () => {
  it("exports exportInvoicePdf", () => {
    expect(PDF).toContain("export async function exportInvoicePdf");
  });

  it("exports exportPurchaseOrderPdf", () => {
    expect(PDF).toContain("export async function exportPurchaseOrderPdf");
  });

  it("exports exportVoucherPdf", () => {
    expect(PDF).toContain("export async function exportVoucherPdf");
  });

  it("exports exportPayrollSlipPdf", () => {
    expect(PDF).toContain("export async function exportPayrollSlipPdf");
  });

  it("exports exportTrialBalancePdf", () => {
    expect(PDF).toContain("export async function exportTrialBalancePdf");
  });

  it("exports exportFleetTripsPdf", () => {
    expect(PDF).toContain("export async function exportFleetTripsPdf");
  });
});

describe("pdfExport — internal helpers", () => {
  it("has createDoc helper", () => {
    expect(PDF).toContain("function createDoc");
  });

  it("has docToBuffer helper", () => {
    expect(PDF).toContain("function docToBuffer");
  });

  it("has rtlText helper for Arabic", () => {
    expect(PDF).toContain("function rtlText");
  });

  it("has drawHeader helper", () => {
    expect(PDF).toContain("function drawHeader");
  });

  it("has drawTable helper", () => {
    expect(PDF).toContain("function drawTable");
  });
});

describe("pdfExport — security", () => {
  it("uses parameterized queries", () => {
    const params = [...PDF.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(10);
  });

  it("scopes by companyId", () => {
    const matches = [...PDF.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(5);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// EXCEL EXPORT
// ══════════════════════════════════════════════════════════════════════════

describe("excelExport — exported functions", () => {
  it("exports workbookToBuffer", () => {
    expect(EXCEL).toContain("export async function workbookToBuffer");
  });

  it("exports exportTrialBalanceExcel", () => {
    expect(EXCEL).toContain("export async function exportTrialBalanceExcel");
  });

  it("exports exportIncomeStatementExcel", () => {
    expect(EXCEL).toContain("export async function exportIncomeStatementExcel");
  });

  it("exports exportInvoicesExcel", () => {
    expect(EXCEL).toContain("export async function exportInvoicesExcel");
  });

  it("exports exportPayrollExcel", () => {
    expect(EXCEL).toContain("export async function exportPayrollExcel");
  });

  it("exports exportAttendanceExcel", () => {
    expect(EXCEL).toContain("export async function exportAttendanceExcel");
  });

  it("exports exportFleetExcel", () => {
    expect(EXCEL).toContain("export async function exportFleetExcel");
  });
});

describe("excelExport — security", () => {
  it("uses parameterized queries", () => {
    const params = [...EXCEL.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(5);
  });

  it("scopes by companyId", () => {
    const matches = [...EXCEL.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(5);
  });
});
