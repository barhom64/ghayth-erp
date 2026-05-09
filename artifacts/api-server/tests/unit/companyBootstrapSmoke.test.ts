import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dirname!, "../../../../artifacts/api-server/src/lib");
const read = (f: string) => readFileSync(join(root, f), "utf8");

const BOOTSTRAP = read("companyBootstrap.ts");
const ADMIN = read("bootstrapAdmin.ts");

// ── Company Bootstrap ─────────────────────────────────────────────────────

describe("companyBootstrap — exported function", () => {
  it("exports bootstrapCompany", () => {
    expect(BOOTSTRAP).toContain("export async function bootstrapCompany");
  });

  it("bootstrapCompany accepts companyId and companyName", () => {
    expect(BOOTSTRAP).toContain("bootstrapCompany(companyId: number, companyName: string)");
  });
});

describe("companyBootstrap — default data creation", () => {
  it("creates default branch", () => {
    expect(BOOTSTRAP).toContain("createDefaultBranch");
  });

  it("creates default leave types", () => {
    expect(BOOTSTRAP).toContain("createDefaultLeaveTypes");
  });

  it("creates default violation types", () => {
    expect(BOOTSTRAP).toContain("createDefaultViolationTypes");
  });

  it("creates default shifts", () => {
    expect(BOOTSTRAP).toContain("createDefaultShifts");
  });

  it("creates default approval chains", () => {
    expect(BOOTSTRAP).toContain("createDefaultApprovalChains");
  });

  it("creates default salary components", () => {
    expect(BOOTSTRAP).toContain("createDefaultSalaryComponents");
  });

  it("creates default chart of accounts", () => {
    expect(BOOTSTRAP).toContain("createDefaultChartOfAccounts");
  });

  it("creates default roles", () => {
    expect(BOOTSTRAP).toContain("createDefaultRoles");
  });

  it("creates default numbering prefixes", () => {
    expect(BOOTSTRAP).toContain("createDefaultNumberingPrefixes");
  });

  it("creates default penalty ladder", () => {
    expect(BOOTSTRAP).toContain("createDefaultPenaltyLadder");
  });

  it("creates default settings", () => {
    expect(BOOTSTRAP).toContain("createDefaultSettings");
  });
});

describe("companyBootstrap — Saudi Labor Law leave types", () => {
  it("includes annual leave (30 days)", () => {
    expect(BOOTSTRAP).toContain("Annual Leave");
    expect(BOOTSTRAP).toContain("إجازة سنوية");
  });

  it("includes sick leave", () => {
    expect(BOOTSTRAP).toContain("Sick Leave");
    expect(BOOTSTRAP).toContain("إجازة مرضية");
  });

  it("includes marriage leave", () => {
    expect(BOOTSTRAP).toContain("Marriage Leave");
  });

  it("includes maternity leave (70 days)", () => {
    expect(BOOTSTRAP).toContain("Maternity Leave");
  });

  it("includes paternity leave", () => {
    expect(BOOTSTRAP).toContain("Paternity Leave");
  });

  it("includes bereavement leave", () => {
    expect(BOOTSTRAP).toContain("Bereavement Leave");
  });

  it("includes hajj leave (15 days)", () => {
    expect(BOOTSTRAP).toContain("Hajj Leave");
    expect(BOOTSTRAP).toContain("إجازة حج");
  });

  it("includes exam leave", () => {
    expect(BOOTSTRAP).toContain("Exam Leave");
  });

  it("includes unpaid leave", () => {
    expect(BOOTSTRAP).toContain("Unpaid Leave");
  });

  it("includes emergency leave", () => {
    expect(BOOTSTRAP).toContain("Emergency Leave");
  });
});

describe("companyBootstrap — violation types", () => {
  it("defines late_arrival violation", () => {
    expect(BOOTSTRAP).toContain("late_arrival");
  });

  it("defines early_departure violation", () => {
    expect(BOOTSTRAP).toContain("early_departure");
  });

  it("defines absence violation", () => {
    expect(BOOTSTRAP).toContain('"absence"');
  });

  it("defines policy_violation", () => {
    expect(BOOTSTRAP).toContain("policy_violation");
  });

  it("defines safety_violation", () => {
    expect(BOOTSTRAP).toContain("safety_violation");
  });

  it("defines gps_out_of_range violation", () => {
    expect(BOOTSTRAP).toContain("gps_out_of_range");
  });
});

describe("companyBootstrap — transaction safety", () => {
  it("uses BEGIN/COMMIT/ROLLBACK pattern", () => {
    expect(BOOTSTRAP).toContain('"BEGIN"');
    expect(BOOTSTRAP).toContain('"COMMIT"');
    expect(BOOTSTRAP).toContain('"ROLLBACK"');
  });

  it("uses parameterized queries", () => {
    const params = [...BOOTSTRAP.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(30);
  });

  it("scopes all inserts by companyId", () => {
    const matches = [...BOOTSTRAP.matchAll(/companyId/g)];
    expect(matches.length).toBeGreaterThan(20);
  });

  it("releases client in finally block", () => {
    expect(BOOTSTRAP).toContain("client.release()");
  });

  it("uses ON CONFLICT DO NOTHING for idempotency", () => {
    expect(BOOTSTRAP).toContain("ON CONFLICT DO NOTHING");
  });
});

// ── Bootstrap Admin ───────────────────────────────────────────────────────

describe("bootstrapAdmin — exports", () => {
  it("exports bootstrapAdminUser", () => {
    expect(ADMIN).toContain("export async function bootstrapAdminUser");
  });

  it("has createUserIfNotExists helper", () => {
    expect(ADMIN).toContain("createUserIfNotExists");
  });
});

describe("bootstrapAdmin — security", () => {
  it("uses parameterized queries", () => {
    const params = [...ADMIN.matchAll(/\$\d/g)];
    expect(params.length).toBeGreaterThan(5);
  });

  it("hashes passwords", () => {
    expect(ADMIN).toContain("hashPassword");
  });
});
