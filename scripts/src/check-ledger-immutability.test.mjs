// اختبارات منطق حارس حصانة الدفتر المرحّل (المادتان 16، 18).
// التشغيل: node scripts/src/check-ledger-immutability.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { findLedgerMutations, stripJs, FROZEN_TABLE, FROZEN_COLUMNS } from "./check-ledger-immutability.mjs";

test("يرصد تعديل المبلغ (debit/credit) على journal_lines", () => {
  assert.equal(findLedgerMutations("`UPDATE journal_lines SET debit = $1 WHERE id = $2`")[0].columns.includes("debit"), true);
  assert.equal(findLedgerMutations("`UPDATE journal_lines SET credit = $1 WHERE id = $2`")[0].columns.includes("credit"), true);
});

test("يرصد إعادة توجيه الحساب (accountId/accountCode)", () => {
  assert.equal(findLedgerMutations(`\`UPDATE journal_lines SET "accountId" = $1 WHERE id=$2\``).length, 1);
  assert.equal(findLedgerMutations("`UPDATE journal_lines SET \"accountCode\" = '1100' WHERE id=$1`")[0].columns.includes("accountCode"), true);
});

test("يرصد مع alias في UPDATE ... FROM", () => {
  const v = findLedgerMutations("`UPDATE journal_lines jl SET debit = x.amount FROM staging x WHERE jl.id = x.id`");
  assert.equal(v.length, 1);
  assert.deepEqual(v[0].columns, ["debit"]);
});

test("لا يرصد تعديل بُعد تحليلي (costCenterId/projectId/departmentId)", () => {
  assert.equal(findLedgerMutations(`\`UPDATE journal_lines jl SET "costCenterId" = cc.id FROM cost_centers cc WHERE jl."journalId" = $1\``).length, 0);
  assert.equal(findLedgerMutations(`\`UPDATE journal_lines SET "projectId" = $1 WHERE id=$2\``).length, 0);
  assert.equal(findLedgerMutations(`\`UPDATE journal_lines SET "departmentId" = $1, description = $2 WHERE id=$3\``).length, 0);
});

test("لا يرصد UPDATE على journal_entries (رأس القيد: حالة/وصف، ليس محتوى سطر)", () => {
  assert.equal(findLedgerMutations("`UPDATE journal_entries SET status = 'posted' WHERE id=$1`").length, 0);
});

test("لا يرصد SELECT/INSERT (ليست تعديلًا للمحتوى القائم)", () => {
  assert.equal(findLedgerMutations("`SELECT debit, credit FROM journal_lines`").length, 0);
  assert.equal(findLedgerMutations("`INSERT INTO journal_lines (debit, credit) VALUES ($1,$2)`").length, 0);
});

test("لا يرصد داخل تعليق", () => {
  assert.equal(findLedgerMutations("// UPDATE journal_lines SET debit = 0 موثّق").length, 0);
  assert.equal(findLedgerMutations("/* UPDATE journal_lines SET credit = 0 */").length, 0);
});

test("public/quotes/حالة أحرف مختلطة", () => {
  assert.equal(findLedgerMutations(`\`update public."journal_lines" set debit = $1 where id=$2\``).length, 1);
});

test("يرصد عدة أعمدة مالية في جملة واحدة", () => {
  const v = findLedgerMutations("`UPDATE journal_lines SET debit = $1, credit = $2 WHERE id=$3`");
  assert.equal(v.length, 1);
  assert.deepEqual(v[0].columns.sort(), ["credit", "debit"]);
});

test("الثوابت المُصدَّرة صحيحة", () => {
  assert.equal(FROZEN_TABLE, "journal_lines");
  assert.deepEqual([...FROZEN_COLUMNS].sort(), ["accountCode", "accountId", "credit", "debit"]);
});

test("stripJs يحافظ على الأسطر", () => {
  assert.equal(stripJs("a\n// c\nb").split("\n").length, 3);
});
