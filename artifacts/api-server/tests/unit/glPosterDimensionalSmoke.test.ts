import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");

const POSTER = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/gl/journal-poster.ts"),
  "utf8",
);
const POSTING = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/gl/posting.ts"),
  "utf8",
);
const MUDAD = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/saudi-compliance/mudad/post-salary-journal.ts"),
  "utf8",
);

// ─── gl/posting.ts dimensional payload (financial-integrity gap #6 / Mudad) ─
// Before this fix the gl/posting.ts INSERT only wrote 6 columns
// (journalId / accountId / accountCode / debit / credit / description).
// Every entry posted through it — Mudad salary, FX revaluation, FX
// realised, cycle-count variance, inventory write-off — landed in
// journal_lines with the dimensional columns NULL. Reports that needed
// to roll those entries up by employee / branch / cost-center returned
// empty.

describe("JournalLine type accepts dimensional fields", () => {
  const REQUIRED_FIELDS = [
    "employeeId", "departmentId", "branchId",
    "costCenterId", "projectId", "vehicleId", "propertyId",
    "unitId", "assetId", "contractId", "productId",
    "clientId", "vendorId", "driverId",
    "umrahSeasonId", "umrahAgentId", "activityType",
  ];
  for (const field of REQUIRED_FIELDS) {
    it(`JournalLine has optional ${field}`, () => {
      const ifaceStart = POSTER.indexOf("export interface JournalLine");
      const ifaceEnd = POSTER.indexOf("}", ifaceStart);
      const iface = POSTER.slice(ifaceStart, ifaceEnd);
      expect(iface).toMatch(new RegExp(`\\b${field}\\?:`));
    });
  }
});

describe("posting.ts INSERT writes the dimensional columns", () => {
  const REQUIRED_COLS = [
    '"employeeId"', '"departmentId"', '"branchId"',
    '"costCenterId"', '"projectId"', '"vehicleId"', '"propertyId"',
    '"unitId"', '"assetId"', '"contractId"', '"productId"',
    '"clientId"', '"vendorId"', '"driverId"',
    '"umrahSeasonId"', '"umrahAgentId"', '"activityType"',
    '"sourceLineTable"', '"sourceLineId"',
  ];
  for (const col of REQUIRED_COLS) {
    it(`INSERT lists ${col} column`, () => {
      const idx = POSTING.indexOf("INSERT INTO journal_lines");
      const block = POSTING.slice(idx, idx + 2000);
      expect(block).toContain(col);
    });
  }

  it("each dim param uses `line.<field> ?? null`", () => {
    // The params array maps line.<field> ?? null for every nullable dim.
    const idx = POSTING.indexOf("INSERT INTO journal_lines");
    const block = POSTING.slice(idx, idx + 2500);
    for (const field of [
      "line.employeeId", "line.departmentId", "line.branchId",
      "line.costCenterId", "line.projectId",
    ]) {
      expect(block).toContain(`${field} ?? null`);
    }
  });

  it("placeholders bump from $6 to $25", () => {
    const idx = POSTING.indexOf("INSERT INTO journal_lines");
    const block = POSTING.slice(idx, idx + 2000);
    expect(block).toContain("$25");
    expect(block).not.toMatch(/\$\b(26|27|28)\b/);
  });
});

describe("Mudad salary booking carries the dimensions", () => {
  it("buildSalaryEntryInput signature accepts departmentId + branchId", () => {
    expect(MUDAD).toContain("departmentId?: number | null");
    expect(MUDAD).toContain("branchId?: number | null");
  });

  it("constructs a shared dims object spread on every line", () => {
    // Locate the const dims = { ... } block specific to Mudad
    const m = MUDAD.match(/const dims = \{\s*\n\s*employeeId:\s*opts\.employeeId,[\s\S]{0,300}?\};/);
    expect(m).not.toBeNull();
    expect(m![0]).toContain("opts.departmentId != null");
    expect(m![0]).toContain("opts.branchId != null");
  });

  it("all 3 GL lines spread dims (expense, payable, deductions)", () => {
    // Look for ...dims appearing 3 times inside the lines array.
    const arrayStart = MUDAD.indexOf("const lines: BuildEntryInput[\"lines\"] = []");
    const arrayEnd = MUDAD.indexOf("return { description: opts.description, lines };");
    const block = MUDAD.slice(arrayStart, arrayEnd);
    const matches = block.match(/\.\.\.dims/g) ?? [];
    expect(matches.length).toBeGreaterThanOrEqual(3);
  });

  it("DB driver resolves dept + branch from employee_assignments", () => {
    expect(MUDAD).toMatch(/SELECT "departmentId", "branchId" FROM employee_assignments/);
    expect(MUDAD).toContain("status = 'active'");
  });

  it("DB driver passes the dims into buildSalaryEntryInput", () => {
    expect(MUDAD).toContain("departmentId: asn?.departmentId");
    expect(MUDAD).toContain("branchId: asn?.branchId");
  });
});
