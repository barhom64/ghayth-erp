// Integration test — PATCH /properties/maintenance-requests/:id completion GL atomicity
//
// Verifies the invariant introduced when the completion handler was wrapped
// in withTransaction:
//   1. SUCCESS — postMaintenanceExpenseGL posts a balanced expense JE
//      (DR property_maintenance_expense / CR property_maintenance_payable)
//      on sourceType='maintenance_requests', debit = credit.
//   2. ATOMICITY — when the GL posting throws (e.g. a closed financial
//      period), the completion status flip is ROLLED BACK: the request
//      stays in_progress and NO journal entry is left behind. This mirrors
//      the route's `withTransaction(async () => { UPDATE ...; await
//      postMaintenanceExpenseGL(...); })` block exactly.
//
// Run: E2E=1 DATABASE_URL=<seeded DB> npx vitest run \
//        tests/integration/propertyMaintenanceGLAtomicity.dynamic.test.ts
// Requires a seeded DB (companyId=2, Al-Diyaa — full chart of accounts).

import { describe, it, expect, vi } from "vitest";
import { rawQuery, rawExecute, withTransaction } from "../../src/lib/rawdb.js";
import { propertiesEngine } from "../../src/lib/engines/index.js";

const SKIP = !process.env.E2E;
const COMPANY_ID = 2; // Al-Diyaa — has full COA

async function insertRequest(status: string): Promise<number> {
  const { insertId } = await rawExecute(
    `INSERT INTO maintenance_requests ("companyId", category, description, status, priority)
     VALUES ($1, 'سباكة', 'بلاغ تجريبي — اختبار ذرّية القيد', $2, 'medium')`,
    [COMPANY_ID, status],
  );
  return insertId;
}

async function cleanup(id: number) {
  await rawExecute(
    `DELETE FROM journal_lines WHERE "journalId" IN (SELECT id FROM journal_entries WHERE "sourceType"='maintenance_requests' AND "sourceId"=$1)`,
    [id],
  );
  await rawExecute(`DELETE FROM journal_entries WHERE "sourceType"='maintenance_requests' AND "sourceId"=$1`, [id]);
  await rawExecute(`DELETE FROM tasks WHERE "linkedEntityType"='maintenance_request' AND "linkedEntityId"=$1`, [id]);
  await rawExecute(`DELETE FROM maintenance_requests WHERE id=$1`, [id]);
}

describe.skipIf(SKIP)("maintenance completion — GL atomicity", () => {
  it("success: a balanced maintenance-expense JE is posted (DR=CR)", async () => {
    const id = await insertRequest("in_progress");
    try {
      await propertiesEngine.postMaintenanceExpenseGL(
        { companyId: COMPANY_ID, branchId: null, createdBy: 1 },
        { id, propertyId: 0, unitId: null, tenantId: null, totalCost: 1200, type: "سباكة" },
      );

      const [je] = await rawQuery<{ id: number; sourceKey: string }>(
        `SELECT id, "sourceKey" FROM journal_entries WHERE "sourceType"='maintenance_requests' AND "sourceId"=$1`,
        [id],
      );
      expect(je).toBeTruthy();
      expect(je.sourceKey).toBe(`property:maintenance:${id}`);

      const [bal] = await rawQuery<{ d: string; c: string }>(
        `SELECT SUM(debit) AS d, SUM(credit) AS c FROM journal_lines WHERE "journalId"=$1`,
        [je.id],
      );
      expect(Number(bal.d)).toBeCloseTo(Number(bal.c), 2); // balanced
      expect(Number(bal.d)).toBe(1200);
    } finally {
      await cleanup(id);
    }
  });

  it("atomicity: a GL failure rolls back the completion (status unchanged, no JE)", async () => {
    const id = await insertRequest("in_progress");
    const spy = vi
      .spyOn(propertiesEngine, "postMaintenanceExpenseGL")
      .mockRejectedValueOnce(new Error("forced GL failure — closed period"));
    try {
      let threw = false;
      try {
        // Mirror the route's atomic completion block.
        await withTransaction(async () => {
          await rawExecute(
            `UPDATE maintenance_requests SET status='completed', "completedAt"=NOW(), "updatedAt"=NOW() WHERE id=$1 AND "companyId"=$2`,
            [id, COMPANY_ID],
          );
          await propertiesEngine.postMaintenanceExpenseGL(
            { companyId: COMPANY_ID, branchId: null, createdBy: 1 },
            { id, propertyId: 0, unitId: null, tenantId: null, totalCost: 500, type: "سباكة" },
          );
        });
      } catch {
        threw = true;
      }
      expect(threw).toBe(true);
      expect(spy).toHaveBeenCalled();

      // The status flip must have rolled back with the failed GL post.
      const [row] = await rawQuery<{ status: string }>(
        `SELECT status FROM maintenance_requests WHERE id=$1`,
        [id],
      );
      expect(row.status).toBe("in_progress");

      // No orphan journal entry from the rolled-back attempt.
      const [je] = await rawQuery<{ id: number }>(
        `SELECT id FROM journal_entries WHERE "sourceType"='maintenance_requests' AND "sourceId"=$1`,
        [id],
      );
      expect(je).toBeFalsy();
    } finally {
      spy.mockRestore();
      await cleanup(id);
    }
  });
});
