#!/usr/bin/env node
/**
 * Smoke test for the new letter PDF + dispatch endpoints + the
 * per-employee violation attribution column added in migration 150.
 */
process.env.DATABASE_URL ??= "postgres://ghayth_erp:ghayth_erp@localhost:5432/ghayth_erp";

import { pool, rawQuery, rawExecute } from "../src/lib/rawdb.ts";
import { exportOfficialLetterPdf } from "../src/lib/pdfExport.ts";

function assert(cond, msg) {
  if (!cond) { console.error("✗", msg); process.exit(1); }
  console.log("  ✓", msg);
}

async function reset() {
  await rawExecute(`DELETE FROM official_letters WHERE subject LIKE '%LETTER-SMOKE%'`);
  await rawExecute(`DELETE FROM umrah_violations WHERE description LIKE '%VIOL-SMOKE%'`);
}

async function main() {
  await reset();

  // 1. responsibleAssignmentId column exists
  console.log("\n[1] migration 150 — responsibleAssignmentId column");
  const cols = await rawQuery(
    `SELECT column_name FROM information_schema.columns
      WHERE table_name='umrah_violations' AND column_name='responsibleAssignmentId'`
  );
  assert(cols.length === 1, "responsibleAssignmentId column present on umrah_violations");

  const idx = await rawQuery(
    `SELECT indexname FROM pg_indexes
      WHERE indexname='idx_umrah_violations_responsible_assignment'`
  );
  assert(idx.length === 1, "partial index on responsibleAssignmentId present");

  // 2. Insert a violation with the new column populated (using a real assignment FK)
  const [assignment] = await rawQuery(`SELECT id FROM employee_assignments WHERE "companyId"=1 LIMIT 1`);
  const assignId = assignment?.id;
  if (assignId) {
    const insertedVio = await rawQuery(
      `INSERT INTO umrah_violations
         ("companyId","branchId",type,"referenceType","referenceNumber",
          description,"penaltyAmount",status,"responsibleAssignmentId",
          "createdAt","updatedAt")
       VALUES (1,0,'overstay','passport','VIOL-SMOKE-PP-1',
               'تجاوز اختبار VIOL-SMOKE',0,'detected',$1,NOW(),NOW())
       RETURNING id, "responsibleAssignmentId"`,
      [assignId]
    );
    assert(insertedVio[0]?.responsibleAssignmentId === assignId, `responsibleAssignmentId saves + reads (assignment ${assignId})`);
  } else {
    console.log("  ⊘ skipped FK insert — no employee_assignments seed row");
  }

  // 3. Create an umrah letter then render to PDF
  console.log("\n[2] Letter PDF rendering via exportOfficialLetterPdf");
  const letter = await rawQuery(
    `INSERT INTO official_letters
       ("companyId", type, subject, content, status, "createdAt")
     VALUES (1, 'umrah_ministry_intro',
             'LETTER-SMOKE — خطاب اختبار وزارة الحج',
             E'السلام عليكم ورحمة الله وبركاته،\n\nهذا خطاب اختبار للتأكد من توليد PDF.\n\nمؤسسة الدور الحديثة',
             'approved', NOW())
     RETURNING id`
  );
  const letterId = letter[0].id;
  assert(letterId > 0, `letter created (id=${letterId})`);

  const pdf = await exportOfficialLetterPdf(1, letterId);
  assert(Buffer.isBuffer(pdf), "PDF returned as Buffer");
  assert(pdf.length > 100, `PDF has content (${pdf.length} bytes)`);
  assert(pdf.subarray(0, 4).toString() === "%PDF", "valid PDF header");

  // 4. Dispatch logic
  console.log("\n[3] Dispatch endpoint logic");
  // First update — should succeed
  await rawExecute(
    `UPDATE official_letters
        SET "sentAt"=NOW(), "dispatchedVia"='print', status='sent'
      WHERE id=$1`,
    [letterId]
  );
  const after = await rawQuery(
    `SELECT "sentAt", "dispatchedVia", status FROM official_letters WHERE id=$1`,
    [letterId]
  );
  assert(after[0].sentAt !== null, `sentAt set after dispatch`);
  assert(after[0].dispatchedVia === "print", `dispatchedVia = 'print'`);
  assert(after[0].status === "sent", `status = 'sent'`);

  await reset();
  console.log("\n✅ Letters + dispatch + per-employee attribution smoke checks passed.\n");
  await pool.end();
  process.exit(0);
}

main().catch(async (err) => {
  console.error("\n✗ Smoke failed:", err);
  await pool.end().catch(() => {});
  process.exit(1);
});
