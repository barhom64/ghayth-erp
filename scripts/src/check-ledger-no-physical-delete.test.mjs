// اختبارات منطق حارس منع الحذف الفيزيائي على الدفتر.
// التشغيل: node scripts/src/check-ledger-no-physical-delete.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { findLedgerDeletes, stripJs, LEDGER_TABLES } from "./check-ledger-no-physical-delete.mjs";

test("يرصد DELETE فيزيائيًا على journal_lines", () => {
  const v = findLedgerDeletes(`await rawExecute('DELETE FROM journal_lines WHERE id=$1', [id]);`);
  assert.equal(v.length, 1);
  assert.equal(v[0].table, "journal_lines");
});

test("يرصد journal_entries مع public. و quotes وحالة أحرف مختلطة", () => {
  assert.equal(findLedgerDeletes(`delete from public."journal_entries" where x`).length, 1);
  assert.equal(findLedgerDeletes(`DELETE FROM "chart_of_accounts"`).length, 1);
});

test("يرصد SQL داخل template literal (المسار الواقعي rawExecute(`…`))", () => {
  const src = "await rawExecute(`DELETE FROM journal_lines WHERE id = $1`, [id]);";
  assert.equal(findLedgerDeletes(src).length, 1);
});

test("لا يرصد جدولًا غير دفتري (حذف تقني مشروع)", () => {
  assert.equal(findLedgerDeletes("rawExecute(`DELETE FROM idempotency_keys WHERE id=$1`)").length, 0);
  assert.equal(findLedgerDeletes("rawExecute(`DELETE FROM event_outbox WHERE status='processed'`)").length, 0);
});

test("لا يرصد DELETE داخل تعليق (سطري أو كتلي)", () => {
  assert.equal(findLedgerDeletes(`// DELETE FROM journal_lines — موثّق فقط`).length, 0);
  assert.equal(findLedgerDeletes(`/* DELETE FROM journal_entries */`).length, 0);
});

test("لا يرصد UPDATE/SELECT على جدول الدفتر (ليست حذفًا)", () => {
  assert.equal(findLedgerDeletes(`UPDATE journal_entries SET status='reversed'`).length, 0);
  assert.equal(findLedgerDeletes(`SELECT * FROM journal_lines`).length, 0);
});

test("يرصد عدة مخالفات ويعطي رقم السطر الصحيح", () => {
  const src = `line1\nDELETE FROM journal_entries WHERE 1\nline3\nDELETE FROM journal_lines WHERE 2\n`;
  const v = findLedgerDeletes(src);
  assert.equal(v.length, 2);
  assert.equal(v[0].line, 2);
  assert.equal(v[1].line, 4);
});

test("stripJs يحافظ على الأسطر والمواضع", () => {
  const s = stripJs("a\n// c\nb");
  assert.equal(s.split("\n").length, 3);
});

test("قائمة جداول الدفتر تشمل الجوهرية", () => {
  for (const t of ["journal_entries", "journal_lines", "chart_of_accounts"]) {
    assert.ok(LEDGER_TABLES.includes(t), `يجب أن يحرس ${t}`);
  }
});
