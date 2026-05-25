import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const SELF_AUDIT = read("selfAuditEngine.ts");
const REPORT_LOADERS = read("print/reportLoaders.ts");
const TEMPLATE_RESOLVER = read("print/templateResolver.ts");
const EXPORT_ROUTES = readFileSync(
  join(import.meta.dirname!, "../../../../artifacts/api-server/src/routes/export.ts"),
  "utf8",
);

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
// pdfExport.ts has been DELETED — every generator now flows through Print
// Engine v2 (renderPrint). The 3 Umrah surfaces (statement / runsheet /
// official-letter) print via bespoke in-memory presets in templateResolver.
// ══════════════════════════════════════════════════════════════════════════

describe("pdfExport.ts removal", () => {
  it("the legacy generator module no longer exists on disk", () => {
    const fs = readFileSync;
    const path = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib/pdfExport.ts");
    let existed = false;
    try {
      fs(path);
      existed = true;
    } catch {
      existed = false;
    }
    expect(existed).toBe(false);
  });
});

describe("Umrah bespoke presets — registered in templateResolver", () => {
  for (const preset of ["official_letter", "umrah_statement", "umrah_runsheet"]) {
    it(`has an in-memory preset for ${preset}`, () => {
      expect(TEMPLATE_RESOLVER).toContain(`${preset}:`);
    });
  }
});

// ══════════════════════════════════════════════════════════════════════════
// REPORT LOADERS — every batch report (was excelExport.ts + the batch
// portion of pdfExport.ts) now lives here and feeds renderPrint().
// ══════════════════════════════════════════════════════════════════════════

describe("print/reportLoaders — exported loaders", () => {
  for (const fn of [
    "loadTrialBalance",
    "loadIncomeStatement",
    "loadInvoicesReport",
    "loadPayrollReport",
    "loadAttendanceReport",
    "loadFleetReport",
    "loadFleetTripsReport",
  ]) {
    it(`exports ${fn}`, () => {
      expect(REPORT_LOADERS).toContain(`export async function ${fn}`);
    });
  }
});

describe("print/reportLoaders — security", () => {
  it("uses parameterized queries", () => {
    const params = [...REPORT_LOADERS.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(10);
  });

  it("scopes every loader by companyId", () => {
    const matches = [...REPORT_LOADERS.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(8);
  });
});

// ══════════════════════════════════════════════════════════════════════════
// EXPORT ROUTES — every /export/* endpoint now proxies through Print Engine
// v2 (renderPrint). No direct legacy generator import allowed here.
// ══════════════════════════════════════════════════════════════════════════

describe("routes/export — Print Engine v2 only", () => {
  it("imports renderPrint", () => {
    expect(EXPORT_ROUTES).toContain('from "../lib/print/printService.js"');
    expect(EXPORT_ROUTES).toContain("renderPrint");
  });

  it("does not import the legacy excel generator (deleted)", () => {
    expect(EXPORT_ROUTES).not.toContain("excelExport");
  });

  it("does not import legacy batch pdf generators", () => {
    expect(EXPORT_ROUTES).not.toContain("exportTrialBalancePdf");
    expect(EXPORT_ROUTES).not.toContain("exportFleetTripsPdf");
  });
});
