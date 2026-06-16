/**
 * Employee 360 — final 3 tabs + default HR role templates seed.
 *
 * Closes #1799 priority #1 (14/14 tabs) and the §J seed for the 4
 * missing HR role templates.
 *
 * What this pins:
 *   - Backend extends GET /employees/:id with contract + position +
 *     custodies in the existing Promise.all.
 *   - Frontend adds 3 tabs to the TABS array (titles, contract,
 *     custodies). Total = 14.
 *   - Each new tab renders documented sections.
 *   - Migration 277 seeds 4 missing role templates as system rows
 *     (companyId IS NULL).
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname!, "../../../..");
const ROUTE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/routes/employees.ts"),
  "utf8",
);
const PAGE_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/ghayth-erp/src/pages/employee-detail.tsx"),
  "utf8",
);
const MIGRATION_SRC = readFileSync(
  join(REPO_ROOT, "artifacts/api-server/src/migrations/278_default_hr_role_templates.sql"),
  "utf8",
);

describe("Employee 360 — 14 tabs final", () => {
  const tabsBlock = PAGE_SRC.slice(PAGE_SRC.indexOf("const TABS = ["), PAGE_SRC.indexOf("] as const"));

  it("titles tab present", () => {
    expect(tabsBlock).toMatch(/key:\s*"titles",\s*label:\s*"المسميات والمناصب"/);
  });

  it("contract tab present", () => {
    expect(tabsBlock).toMatch(/key:\s*"contract",\s*label:\s*"العقد"/);
  });

  it("custodies tab present", () => {
    expect(tabsBlock).toMatch(/key:\s*"custodies",\s*label:\s*"العهد والأصول"/);
  });

  it("total of 18 entries in TABS array (HR-012 baseline 14 + PR-6 3 + PR-8 lifecycle)", () => {
    // PR-6 (#2077) added three tabs (documents, evaluation, activity).
    // PR-8 (#2077) added one more — «دورة الحياة» (lifecycle). The new
    // count is 18 = 14 + 3 + 1. hrLifecycleEngineSmoke pins the key
    // explicitly.
    const matches = tabsBlock.match(/\{\s*key:\s*"/g) ?? [];
    expect(matches.length).toBe(18);
  });

  it("custodies count surfaces in the tab badge", () => {
    expect(PAGE_SRC).toMatch(/tab\.key === "custodies" \? custodies\.length/);
  });
});

describe("Employee 360 — backend data wiring", () => {
  it("Promise.all destructures contract + custodies + position", () => {
    // Tolerant of later additions to the destructure (HR-014 added
    // latestScore + activeSignals at the end). Check the prefix only.
    expect(ROUTE_SRC).toMatch(
      /const \[tasks, attendance, leaves, trainings, payroll, violations, loans, overtime, userAccount, roles, contract, custodies, position[,\s][^\]]*\] = await Promise\.all/,
    );
  });

  it("contract query reads from employee_contracts (active or null status)", () => {
    expect(ROUTE_SRC).toMatch(
      /FROM employee_contracts c[\s\S]*?c\.status = 'active' OR c\.status IS NULL/,
    );
  });

  it("custodies query reads from employee_assets, active-first ordering", () => {
    expect(ROUTE_SRC).toMatch(
      /FROM employee_assets ea[\s\S]*?ORDER BY ea\."returnedAt" NULLS FIRST/,
    );
  });

  it("position query joins through employee_assignments + positions catalog", () => {
    expect(ROUTE_SRC).toMatch(
      /FROM employee_assignments ea\s+JOIN positions p ON p\.id = ea\."positionId"/,
    );
  });

  it("response payload includes contract + position + custodies", () => {
    expect(ROUTE_SRC).toMatch(/contract: Array\.isArray\(contract\)/);
    expect(ROUTE_SRC).toMatch(/position: Array\.isArray\(position\)/);
    expect(ROUTE_SRC).toMatch(/custodies: custodies \?\? \[\]/);
  });
});

describe("Tabs UI — titles tab", () => {
  it("renders job title + position side by side", () => {
    expect(PAGE_SRC).toContain("المسمى المهني");
    expect(PAGE_SRC).toContain("المنصب الإداري");
  });

  it("position level shown as outline badge when present", () => {
    expect(PAGE_SRC).toMatch(/position\.level != null/);
    expect(PAGE_SRC).toMatch(/مستوى \{position\.level\}/);
  });

  it("category surfaces «غير مصنّف» fallback when null", () => {
    expect(PAGE_SRC).toContain("غير مصنّف");
  });
});

describe("Tabs UI — contract tab", () => {
  it("empty state links to /hr/contracts", () => {
    expect(PAGE_SRC).toMatch(/لا يوجد عقد نشط/);
    expect(PAGE_SRC).toMatch(/\/hr\/contracts/);
  });

  it("surfaces ref + dates + probation + signature status", () => {
    expect(PAGE_SRC).toContain("رقم العقد");
    expect(PAGE_SRC).toContain("تاريخ البدء");
    expect(PAGE_SRC).toContain("انتهاء فترة التجربة");
    expect(PAGE_SRC).toContain("توقيع الموظف");
  });
});

describe("Tabs UI — custodies tab", () => {
  it("empty state explains what gets tracked", () => {
    expect(PAGE_SRC).toMatch(/لا توجد عهد مسجلة لهذا الموظف/);
    expect(PAGE_SRC).toMatch(/اللابتوب، الهاتف، SIM/);
  });

  it("returned assets render with opacity 60 (visually distinct)", () => {
    expect(PAGE_SRC).toMatch(/isReturned \? "opacity-60/);
  });

  it("active vs returned status badges", () => {
    expect(PAGE_SRC).toMatch(/مُعَاد/);
    expect(PAGE_SRC).toMatch(/نشط/);
  });

  it("condition fields render when present", () => {
    expect(PAGE_SRC).toContain("conditionOnAssign");
    expect(PAGE_SRC).toContain("conditionOnReturn");
  });
});

describe("Migration 277 — default HR role templates seed", () => {
  it("seeds 4 missing templates: attendance_officer, payroll_officer, discipline_officer, performance_reviewer", () => {
    expect(MIGRATION_SRC).toContain("'attendance_officer'");
    expect(MIGRATION_SRC).toContain("'payroll_officer'");
    expect(MIGRATION_SRC).toContain("'discipline_officer'");
    expect(MIGRATION_SRC).toContain("'performance_reviewer'");
  });

  it("templates use system scope (companyId IS NULL)", () => {
    // Every seed row's first column is NULL = system template.
    expect(MIGRATION_SRC).toMatch(/\(NULL,\s*'attendance_officer'/);
    expect(MIGRATION_SRC).toMatch(/\(NULL,\s*'payroll_officer'/);
    expect(MIGRATION_SRC).toMatch(/\(NULL,\s*'discipline_officer'/);
    expect(MIGRATION_SRC).toMatch(/\(NULL,\s*'performance_reviewer'/);
  });

  it("is_template = TRUE on every row", () => {
    const trueCount = (MIGRATION_SRC.match(/,\s*TRUE,\s*TRUE\)/g) ?? []).length;
    expect(trueCount).toBeGreaterThanOrEqual(4);
  });

  it("idempotent via ON CONFLICT DO NOTHING on the documented unique key", () => {
    expect(MIGRATION_SRC).toMatch(
      /ON CONFLICT \("companyId", role_key\) DO NOTHING/,
    );
  });

  it("@rollback annotation present", () => {
    expect(MIGRATION_SRC).toMatch(/@rollback:/);
  });

  it("levels follow #1799 §A.2 hierarchy guidance (40-50 range for officers)", () => {
    // attendance_officer=40, payroll_officer=50, discipline_officer=45,
    // performance_reviewer=45 — all between the «specialist» (20) and
    // «manager» (70) bands defined in migration 274.
    for (const expectedLevel of [40, 50, 45, 45]) {
      expect(MIGRATION_SRC).toMatch(new RegExp(`,\\s*${expectedLevel},\\s*'#`));
    }
  });
});
