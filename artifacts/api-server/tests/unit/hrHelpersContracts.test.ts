import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const HELPERS_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/hrHelpers.ts"),
  "utf8"
);
const ENUMS_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/lib/hrEnums.ts"),
  "utf8"
);

// ─── hrHelpers Contract Tests ──────────────────────────────────────────────
// Tests structural contracts of utility functions and validates
// hrEnums consistency (all _VALUES match keys, INCIDENT_TYPES match engine).

// ─── nextPeriod contracts ──────────────────────────────────────────────────

describe("nextPeriod contracts", () => {
  it("parses period by splitting on dash", () => {
    const idx = HELPERS_SRC.indexOf("function nextPeriod");
    const section = HELPERS_SRC.slice(idx, idx + 300);
    expect(section).toContain('period.split("-")');
  });

  it("wraps month 12 to 01 of next year", () => {
    const idx = HELPERS_SRC.indexOf("function nextPeriod");
    const section = HELPERS_SRC.slice(idx, idx + 300);
    expect(section).toContain("month === 12");
    expect(section).toContain("year + 1");
    expect(section).toContain('`${year + 1}-01`');
  });

  it("pads month to 2 digits", () => {
    const idx = HELPERS_SRC.indexOf("function nextPeriod");
    const section = HELPERS_SRC.slice(idx, idx + 300);
    expect(section).toContain('padStart(2, "0")');
  });
});

// ─── advancePeriod contracts ───────────────────────────────────────────────

describe("advancePeriod contracts", () => {
  it("iteratively calls nextPeriod count times", () => {
    const idx = HELPERS_SRC.indexOf("function advancePeriod");
    const section = HELPERS_SRC.slice(idx, idx + 200);
    expect(section).toContain("for (let i = 0; i < count; i++)");
    expect(section).toContain("nextPeriod(result)");
  });
});

// ─── currentPeriod (moved to businessHelpers) ────────────────────────────

describe("currentPeriod — centralized", () => {
  it("currentPeriod removed from hrHelpers (now in businessHelpers)", () => {
    expect(HELPERS_SRC).not.toContain("function currentPeriod");
  });
});

// ─── calcHourlyRate contracts (Saudi Article 98) ───────────────────────────

describe("calcHourlyRate contracts", () => {
  it("divides monthly salary by 30 days then by 8 hours", () => {
    const idx = HELPERS_SRC.indexOf("function calcHourlyRate");
    const section = HELPERS_SRC.slice(idx, idx + 200);
    expect(section).toContain("monthlySalary / 30 / 8");
  });

  it("rounds to 2 decimal places", () => {
    const idx = HELPERS_SRC.indexOf("function calcHourlyRate");
    const section = HELPERS_SRC.slice(idx, idx + 200);
    expect(section).toContain("roundTo2(");
  });
});

// ─── calcOvertimeAmount contracts ──────────────────────────────────────────

describe("calcOvertimeAmount contracts", () => {
  it("multiplies hourlyRate × hours × multiplier", () => {
    const idx = HELPERS_SRC.indexOf("function calcOvertimeAmount");
    const section = HELPERS_SRC.slice(idx, idx + 300);
    expect(section).toContain("calcHourlyRate(monthlySalary) * hours * multiplier");
  });

  it("defaults multiplier to 1.5 (Saudi overtime rate)", () => {
    const idx = HELPERS_SRC.indexOf("function calcOvertimeAmount");
    const section = HELPERS_SRC.slice(idx, idx + 200);
    expect(section).toContain("multiplier: number = 1.5");
  });

  it("rounds to 2 decimal places", () => {
    const idx = HELPERS_SRC.indexOf("function calcOvertimeAmount");
    const section = HELPERS_SRC.slice(idx, idx + 300);
    expect(section).toContain("roundTo2(");
  });
});

// ─── yearsOfService contracts ──────────────────────────────────────────────

describe("yearsOfService contracts", () => {
  it("calculates millisecond difference between dates", () => {
    const idx = HELPERS_SRC.indexOf("function yearsOfService");
    const section = HELPERS_SRC.slice(idx, idx + 300);
    expect(section).toContain("end.getTime() - start.getTime()");
  });

  it("uses 365.25 days per year for accurate year calculation", () => {
    const idx = HELPERS_SRC.indexOf("function yearsOfService");
    const section = HELPERS_SRC.slice(idx, idx + 300);
    expect(section).toContain("365.25");
  });

  it("rounds to 2 decimal places", () => {
    const idx = HELPERS_SRC.indexOf("function yearsOfService");
    const section = HELPERS_SRC.slice(idx, idx + 300);
    expect(section).toContain("roundTo2(");
  });

  it("accepts both string and Date inputs", () => {
    expect(HELPERS_SRC).toContain("startDate: string | Date, endDate: string | Date");
  });
});

// ─── calcGratuity contracts (Saudi Article 84) ────────────────────────────

describe("calcGratuity contracts", () => {
  it("first 5 years: half month salary per year", () => {
    const idx = HELPERS_SRC.indexOf("function calcGratuity");
    const section = HELPERS_SRC.slice(idx, idx + 500);
    expect(section).toContain("Math.min(years, 5)");
    expect(section).toContain("monthlySalary * 0.5 * first5");
  });

  it("after 5 years: full month salary per year", () => {
    const idx = HELPERS_SRC.indexOf("function calcGratuity");
    const section = HELPERS_SRC.slice(idx, idx + 500);
    expect(section).toContain("Math.max(0, years - 5)");
    expect(section).toContain("monthlySalary * 1 * after5");
  });

  it("returns breakdown {first5Years, after5Years, total}", () => {
    const idx = HELPERS_SRC.indexOf("function calcGratuity");
    const section = HELPERS_SRC.slice(idx, idx + 500);
    expect(section).toContain("first5Years,");
    expect(section).toContain("after5Years,");
    expect(section).toContain("total: roundTo2(first5Years + after5Years)");
  });
});

// ─── generateSequentialNumber contracts ────────────────────────────────────

describe("generateSequentialNumber contracts", () => {
  it("generates {prefix}-{year}-{4-digit seq} format", () => {
    const idx = HELPERS_SRC.indexOf("function generateSequentialNumber");
    const section = HELPERS_SRC.slice(idx, idx + 500);
    expect(section).toContain('`${prefix}-${year}-${String(seq).padStart(4, "0")}`');
  });

  it("counts existing records in same year for sequencing", () => {
    const idx = HELPERS_SRC.indexOf("function generateSequentialNumber");
    const section = HELPERS_SRC.slice(idx, idx + 500);
    expect(section).toContain("COUNT(*)::int AS cnt");
    expect(section).toContain('EXTRACT(YEAR FROM "createdAt")');
  });

  it("scopes by companyId", () => {
    const idx = HELPERS_SRC.indexOf("function generateSequentialNumber");
    const section = HELPERS_SRC.slice(idx, idx + 500);
    expect(section).toContain('"companyId" = $1');
  });

  it("defaults year to currentYear() from businessHelpers", () => {
    expect(HELPERS_SRC).toContain("year: number = currentYear()");
  });
});

// ─── actionOk removed (moved to unused) ────────────────────────────────────

describe("actionOk removed from hrHelpers", () => {
  it("no longer exports actionOk", () => {
    expect(HELPERS_SRC).not.toContain("function actionOk");
  });
});

// ─── hrEnums consistency validation ────────────────────────────────────────

describe("hrEnums no longer exports dead _VALUES/_LABELS derivatives", () => {
  it("removed _VALUES and _LABELS dead exports", () => {
    expect(ENUMS_SRC).not.toContain("LOAN_STATUS_VALUES");
    expect(ENUMS_SRC).not.toContain("LOAN_STATUS_LABELS");
    expect(ENUMS_SRC).not.toContain("LOAN_TYPE_VALUES");
    expect(ENUMS_SRC).not.toContain("EXIT_STATUS_VALUES");
    expect(ENUMS_SRC).not.toContain("EXIT_TYPE_VALUES");
    expect(ENUMS_SRC).not.toContain("OVERTIME_STATUS_VALUES");
    expect(ENUMS_SRC).not.toContain("DISCIPLINE_STATUS_VALUES");
    expect(ENUMS_SRC).not.toContain("INCIDENT_TYPE_VALUES");
    expect(ENUMS_SRC).not.toContain("LEAVE_STATUS_VALUES");
    expect(ENUMS_SRC).not.toContain("LEAVE_TYPE_VALUES");
    expect(ENUMS_SRC).not.toContain("ATTENDANCE_STATUS_VALUES");
  });
});

describe("hrEnums INCIDENT_TYPES matches disciplineEngine IncidentType", () => {
  const DISCIPLINE_SRC = readFileSync(
    join(REPO_ROOT, "artifacts/api-server/src/lib/disciplineEngine.ts"),
    "utf8"
  );

  it("INCIDENT_TYPES.LATE matches engine 'late'", () => {
    expect(ENUMS_SRC).toContain('LATE: "late"');
    expect(DISCIPLINE_SRC).toContain('"late"');
  });

  it("INCIDENT_TYPES.EARLY_LEAVE matches engine 'early_leave'", () => {
    expect(ENUMS_SRC).toContain('EARLY_LEAVE: "early_leave"');
    expect(DISCIPLINE_SRC).toContain('"early_leave"');
  });

  it("INCIDENT_TYPES.ABSENCE matches engine 'absence'", () => {
    expect(ENUMS_SRC).toContain('ABSENCE: "absence"');
    expect(DISCIPLINE_SRC).toContain('"absence"');
  });

  it("INCIDENT_TYPES.BEHAVIOR matches engine 'behavior'", () => {
    expect(ENUMS_SRC).toContain('BEHAVIOR: "behavior"');
    expect(DISCIPLINE_SRC).toContain('"behavior"');
  });

  it("INCIDENT_TYPES.ORGANIZATION matches engine 'organization'", () => {
    expect(ENUMS_SRC).toContain('ORGANIZATION: "organization"');
    expect(DISCIPLINE_SRC).toContain('"organization"');
  });

  it("INCIDENT_TYPES.GPS_OUT_OF_RANGE matches engine 'gps_out_of_range'", () => {
    expect(ENUMS_SRC).toContain('GPS_OUT_OF_RANGE: "gps_out_of_range"');
    expect(DISCIPLINE_SRC).toContain('"gps_out_of_range"');
  });

  it("INCIDENT_TYPES.CUSTOM matches engine 'custom'", () => {
    expect(ENUMS_SRC).toContain('CUSTOM: "custom"');
    expect(DISCIPLINE_SRC).toContain('"custom"');
  });
});

describe("hrEnums LOAN_STATUS has all standard workflow states", () => {
  it("has pending, approved, active, completed, rejected, cancelled", () => {
    expect(ENUMS_SRC).toContain('PENDING: "pending"');
    expect(ENUMS_SRC).toContain('APPROVED: "approved"');
    expect(ENUMS_SRC).toContain('ACTIVE: "active"');
    expect(ENUMS_SRC).toContain('COMPLETED: "completed"');
    expect(ENUMS_SRC).toContain('REJECTED: "rejected"');
    expect(ENUMS_SRC).toContain('CANCELLED: "cancelled"');
  });
});

describe("hrEnums DISCIPLINE_STATUS has 5-step inquiry memo workflow", () => {
  it("has all 9 workflow states", () => {
    expect(ENUMS_SRC).toContain('DRAFT: "draft"');
    expect(ENUMS_SRC).toContain('PENDING_EMPLOYEE: "pending_employee"');
    expect(ENUMS_SRC).toContain('PENDING_MANAGER: "pending_manager"');
    expect(ENUMS_SRC).toContain('PENDING_HR_DECISION: "pending_hr_decision"');
    expect(ENUMS_SRC).toContain('PENDING_GM: "pending_gm"');
    expect(ENUMS_SRC).toContain('APPROVED: "approved"');
    expect(ENUMS_SRC).toContain('REJECTED: "rejected"');
    expect(ENUMS_SRC).toContain('APPEALED: "appealed"');
    expect(ENUMS_SRC).toContain('CANCELLED: "cancelled"');
  });
});

describe("hrEnums HR_TABLES match actual table names", () => {
  it("LOANS maps to hr_employee_loans", () => {
    expect(ENUMS_SRC).toContain('LOANS: "hr_employee_loans"');
  });

  it("OVERTIME maps to hr_overtime_requests", () => {
    expect(ENUMS_SRC).toContain('OVERTIME: "hr_overtime_requests"');
  });

  it("EXIT maps to hr_exit_requests", () => {
    expect(ENUMS_SRC).toContain('EXIT: "hr_exit_requests"');
  });

  it("DISCIPLINE_MEMOS maps to hr_inquiry_memos", () => {
    expect(ENUMS_SRC).toContain('DISCIPLINE_MEMOS: "hr_inquiry_memos"');
  });

  it("DISCIPLINE_REGULATION maps to hr_discipline_regulation", () => {
    expect(ENUMS_SRC).toContain('DISCIPLINE_REGULATION: "hr_discipline_regulation"');
  });

  it("ATTENDANCE maps to attendance", () => {
    expect(ENUMS_SRC).toContain('ATTENDANCE: "attendance"');
  });
});

describe("hrEnums NUMBER_PREFIXES match production data", () => {
  it("LOAN prefix is LOAN", () => {
    expect(ENUMS_SRC).toContain('LOAN: "LOAN"');
  });

  it("OVERTIME prefix is OT", () => {
    expect(ENUMS_SRC).toContain('OVERTIME: "OT"');
  });

  it("EXIT prefix is EXIT", () => {
    expect(ENUMS_SRC).toContain('EXIT: "EXIT"');
  });

  it("MEMO prefix is MEMO", () => {
    expect(ENUMS_SRC).toContain('MEMO: "MEMO"');
  });

  it("LETTER prefix is LTR", () => {
    expect(ENUMS_SRC).toContain('LETTER: "LTR"');
  });
});
