// §5 of #1870 — INTEGRATION TEST for the unified-HR commission JE.
//
// Operator directive («العمولة (مسوّق/راتب+عمولة) تُرحَّل عبر HR»):
// the marketer's commission obligation now joins the HR payroll
// obligation pool by routing the CR to salary_payable instead of
// commission_payable, so the SAME payable is cleared at payroll
// time instead of two separate liabilities.
//
// Confirms end-to-end against a provisioned agent DB:
//   1. With commission_via_hr unset OR 'true' → CR posts to
//      salary_payable (2120-T in the test setup).
//   2. With commission_via_hr='false' → CR posts to commission_payable
//      (2150-T) — legacy split mode preserved.
//   3. Both modes carry employeeId + umrahSeasonId on every line.
//
// Skips cleanly when DATABASE_URL has no test marker.

import { describe, it, expect, beforeAll, afterAll } from "vitest";

const TEST_URL_MARKERS = ["_test", "localhost:54329", "127.0.0.1:54329"];
const dbUrl = process.env.DATABASE_URL ?? "";
const dbReady =
  !!dbUrl &&
  TEST_URL_MARKERS.some((m) => dbUrl.includes(m)) &&
  !!process.env.JWT_SECRET &&
  (process.env.JWT_SECRET ?? "").length >= 32;

const d = dbReady ? describe : describe.skip;

const COMPANY_ID = 2;

d("§5 — commission JE routes through HR's salary_payable (operator-configurable)", () => {
  let rawQuery: any;
  let rawExecute: any;
  let calculateCommissionForPlan: any;
  const ids: {
    branchId?: number;
    userId?: number;
    seasonId?: number;
    employeeId?: number;
    assignmentId?: number;
    planId?: number;
  } = {};

  async function teardown() {
    if (!ids.planId && !ids.employeeId) return;
    try {
      if (ids.planId) {
        await rawExecute(
          `DELETE FROM journal_lines WHERE "journalId" IN
             (SELECT id FROM journal_entries WHERE "sourceType" = 'employee_commission_calculations' AND "sourceId" = $1)`,
          [ids.planId]
        );
        await rawExecute(
          `DELETE FROM journal_entries WHERE "sourceType" = 'employee_commission_calculations' AND "sourceId" = $1`,
          [ids.planId]
        );
        await rawExecute(`DELETE FROM employee_commission_calculations WHERE "planId" = $1`, [ids.planId]);
        await rawExecute(`DELETE FROM employee_commission_plans WHERE id = $1`, [ids.planId]);
      }
      if (ids.assignmentId) await rawExecute(`DELETE FROM employee_assignments WHERE id = $1`, [ids.assignmentId]);
      if (ids.employeeId) await rawExecute(`DELETE FROM employees WHERE id = $1`, [ids.employeeId]);
      if (ids.seasonId) await rawExecute(`DELETE FROM umrah_seasons WHERE id = $1`, [ids.seasonId]);
      await rawExecute(
        `DELETE FROM system_settings WHERE "companyId"=$1 AND "branchId" IS NULL AND key = 'commission_via_hr'`,
        [COMPANY_ID]
      );
      await rawExecute(
        `DELETE FROM chart_of_accounts WHERE "companyId"=$1 AND code IN ('6200-T','2120-T','2150-T') AND name LIKE '%TEST%'`,
        [COMPANY_ID]
      );
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[commission-via-hr-test] teardown warning:", (e as Error).message);
    }
  }

  beforeAll(async () => {
    const db = await import("../../src/lib/rawdb.js");
    rawQuery = db.rawQuery;
    rawExecute = db.rawExecute;
    const engine = await import("../../src/lib/umrahCommissionEngine.js");
    calculateCommissionForPlan = engine.calculateCommissionForPlan;

    const [branch] = await rawQuery<{ id: number }>(
      `SELECT id FROM branches WHERE "companyId"=$1 ORDER BY id LIMIT 1`,
      [COMPANY_ID]
    );
    ids.branchId = branch.id;
    const [user] = await rawQuery<{ id: number }>(
      `SELECT id FROM users WHERE email = 'owner@local.test' LIMIT 1`
    );
    ids.userId = user.id;

    // CoA hooks (all 3 accounts the engine may resolve to).
    const ensureAccount = async (code: string, name: string, type: string) => {
      await rawExecute(
        `INSERT INTO chart_of_accounts ("companyId", code, name, type, "allowPosting", "isActive", "createdAt", "updatedAt")
           VALUES ($1, $2, $3, $4, true, true, NOW(), NOW())
           ON CONFLICT ("companyId", code) DO UPDATE SET name = EXCLUDED.name`,
        [COMPANY_ID, code, name, type]
      );
    };
    await ensureAccount("6200-T", "مصروف عمولة (TEST)", "expense");
    await ensureAccount("2120-T", "رواتب مستحقة (TEST)", "liability");
    await ensureAccount("2150-T", "عمولات مستحقة (TEST)", "liability");
    await rawExecute(
      `INSERT INTO accounting_mappings ("companyId", "operationType", "operationLabel", "debitAccountCode", "creditAccountCode", "isActive")
         VALUES
           ($1, 'commission_expense', 'Commission expense', '6200-T', NULL, true),
           ($1, 'salary_payable',     'Salary payable',     NULL, '2120-T', true),
           ($1, 'commission_payable', 'Commission payable', NULL, '2150-T', true)
       ON CONFLICT ("companyId", "operationType") DO UPDATE
         SET "debitAccountCode" = EXCLUDED."debitAccountCode",
             "creditAccountCode" = EXCLUDED."creditAccountCode"`,
      [COMPANY_ID]
    );

    // Season.
    const [season] = await rawQuery<{ id: number }>(
      `INSERT INTO umrah_seasons ("companyId", title, "startDate", "endDate", status)
          VALUES ($1, 'Season Test §5', '2026-01-01', '2026-12-31', 'open')
          RETURNING id`,
      [COMPANY_ID]
    );
    ids.seasonId = season.id;

    // Employee + active assignment (the marketer).
    const [emp] = await rawQuery<{ id: number }>(
      `INSERT INTO employees (name, status, "createdAt")
          VALUES ('Marketer Test §5', 'active', NOW()) RETURNING id`,
      []
    );
    ids.employeeId = emp.id;
    const [assn] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_assignments ("employeeId", "companyId", "branchId", "jobTitle", role, salary, "isPrimary", "hireDate", status, "createdAt", "updatedAt")
          VALUES ($1, $2, $3, 'مسوّق عمرة', 'employee', 5000, true, '2026-01-01', 'active', NOW(), NOW())
          RETURNING id`,
      [ids.employeeId, COMPANY_ID, ids.branchId]
    );
    ids.assignmentId = assn.id;

    // Commission plan — fixed amount so we don't depend on sales aggregation.
    const [plan] = await rawQuery<{ id: number }>(
      `INSERT INTO employee_commission_plans
          ("companyId", "branchId", "employeeId", "assignmentId", "seasonId", "planName",
           "baseSalary", "commissionType", "fixedAmount", "conditionType",
           "excludedMonths", "tierUnit", "partialTiersAllowed", "violationBlocksCommission",
           status, "createdBy", "createdAt", "updatedAt", version)
          VALUES ($1, $2, $3, $4, $5, 'Test Plan §5',
                  5000, 'fixed', 1500, 'none',
                  '[]'::jsonb, 10000, false, false,
                  'active', $6, NOW(), NOW(), 1)
          RETURNING id`,
      [COMPANY_ID, ids.branchId, ids.employeeId, ids.assignmentId, ids.seasonId, ids.userId]
    );
    ids.planId = plan.id;
  });

  afterAll(async () => {
    await teardown();
  });

  async function jeLinesForLatest(): Promise<Array<{ accountCode: string; debit: string; credit: string; employeeId: number | null; umrahSeasonId: number | null }>> {
    const [je] = await rawQuery<{ id: number }>(
      `SELECT id FROM journal_entries
        WHERE "sourceType" = 'employee_commission_calculations' AND "sourceId" = $1
        ORDER BY id DESC LIMIT 1`,
      [ids.planId]
    );
    if (!je) return [];
    return rawQuery(
      `SELECT "accountCode", debit, credit, "employeeId", "umrahSeasonId"
         FROM journal_lines WHERE "journalId" = $1 ORDER BY id`,
      [je.id]
    );
  }

  async function clearPriorJE() {
    await rawExecute(
      `DELETE FROM journal_lines WHERE "journalId" IN
         (SELECT id FROM journal_entries WHERE "sourceType" = 'employee_commission_calculations' AND "sourceId" = $1)`,
      [ids.planId]
    );
    await rawExecute(
      `DELETE FROM journal_entries WHERE "sourceType" = 'employee_commission_calculations' AND "sourceId" = $1`,
      [ids.planId]
    );
    await rawExecute(
      `DELETE FROM employee_commission_calculations WHERE "planId" = $1`,
      [ids.planId]
    );
  }

  it("default mode (commission_via_hr unset) → CR routes to salary_payable (2120-T)", async () => {
    await clearPriorJE();
    await rawExecute(
      `DELETE FROM system_settings WHERE "companyId"=$1 AND "branchId" IS NULL AND key = 'commission_via_hr'`,
      [COMPANY_ID]
    );
    await calculateCommissionForPlan(ids.planId!, 6, 2026, ids.userId!, COMPANY_ID);
    const lines = await jeLinesForLatest();
    expect(lines.length).toBe(2);
    const dr = lines.find((l) => Number(l.debit) > 0)!;
    const cr = lines.find((l) => Number(l.credit) > 0)!;
    expect(dr.accountCode).toBe("6200-T");
    expect(cr.accountCode).toBe("2120-T"); // salary_payable — HR's account
    expect(Number(dr.debit)).toBe(1500);
    expect(Number(cr.credit)).toBe(1500);
  });

  it("explicit commission_via_hr='true' → same as default (CR to salary_payable)", async () => {
    await clearPriorJE();
    await rawExecute(
      `INSERT INTO system_settings ("companyId", "branchId", key, value, "createdAt", "updatedAt")
         VALUES ($1, NULL, 'commission_via_hr', 'true', NOW(), NOW())`,
      [COMPANY_ID]
    );
    await calculateCommissionForPlan(ids.planId!, 7, 2026, ids.userId!, COMPANY_ID);
    const lines = await jeLinesForLatest();
    const cr = lines.find((l) => Number(l.credit) > 0)!;
    expect(cr.accountCode).toBe("2120-T");
  });

  it("commission_via_hr='false' → legacy split mode (CR to commission_payable 2150-T)", async () => {
    await clearPriorJE();
    await rawExecute(
      `DELETE FROM system_settings WHERE "companyId"=$1 AND "branchId" IS NULL AND key = 'commission_via_hr'`,
      [COMPANY_ID]
    );
    await rawExecute(
      `INSERT INTO system_settings ("companyId", "branchId", key, value, "createdAt", "updatedAt")
         VALUES ($1, NULL, 'commission_via_hr', 'false', NOW(), NOW())`,
      [COMPANY_ID]
    );
    await calculateCommissionForPlan(ids.planId!, 8, 2026, ids.userId!, COMPANY_ID);
    const lines = await jeLinesForLatest();
    const cr = lines.find((l) => Number(l.credit) > 0)!;
    expect(cr.accountCode).toBe("2150-T"); // commission_payable — legacy account
  });

  it("every JE line carries employeeId + umrahSeasonId in BOTH modes (drill-by-employee/season works)", async () => {
    // The previous test left commission_via_hr='false' set; verify the
    // legacy mode also carries the dimensions, then check the default
    // mode by clearing the setting and re-running.
    const linesFalse = await jeLinesForLatest();
    expect(linesFalse.length).toBe(2);
    for (const l of linesFalse) {
      expect(l.employeeId).toBe(ids.employeeId);
      expect(l.umrahSeasonId).toBe(ids.seasonId);
    }

    await clearPriorJE();
    await rawExecute(
      `DELETE FROM system_settings WHERE "companyId"=$1 AND "branchId" IS NULL AND key = 'commission_via_hr'`,
      [COMPANY_ID]
    );
    await calculateCommissionForPlan(ids.planId!, 9, 2026, ids.userId!, COMPANY_ID);
    const linesDefault = await jeLinesForLatest();
    expect(linesDefault.length).toBe(2);
    for (const l of linesDefault) {
      expect(l.employeeId).toBe(ids.employeeId);
      expect(l.umrahSeasonId).toBe(ids.seasonId);
    }
  });
});
