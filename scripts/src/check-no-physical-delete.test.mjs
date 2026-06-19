// اختبارات منطق حارس منع الحذف الفيزيائي (المادة 18).
// التشغيل: node scripts/src/check-no-physical-delete.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { findPhysicalDeletes, stripJs, PROTECTED_TABLES, TABLE_GROUP } from "./check-no-physical-delete.mjs";

test("يرصد حذفًا على الدفتر داخل template literal", () => {
  const v = findPhysicalDeletes("await rawExecute(`DELETE FROM journal_lines WHERE id = $1`, [id]);");
  assert.equal(v.length, 1);
  assert.equal(v[0].table, "journal_lines");
  assert.equal(v[0].group, "الدفتر المحاسبي");
});

test("يرصد حذفًا على جدول تعاقدي وجذري تشغيلي", () => {
  assert.equal(findPhysicalDeletes("`DELETE FROM contracts WHERE id=$1`")[0].group, "مالي/تعاقدي");
  assert.equal(findPhysicalDeletes("`DELETE FROM employees WHERE id=$1`")[0].group, "كيان جذري تشغيلي");
});

test("يرصد public. و quotes وحالة أحرف مختلطة", () => {
  assert.equal(findPhysicalDeletes(`delete from public."journal_entries" where x`).length, 1);
  assert.equal(findPhysicalDeletes(`DELETE FROM "chart_of_accounts"`).length, 1);
});

test("لا يرصد جدولًا تقنيًا/إعداديًا مشروع الحذف", () => {
  assert.equal(findPhysicalDeletes("`DELETE FROM idempotency_keys WHERE id=$1`").length, 0);
  assert.equal(findPhysicalDeletes("`DELETE FROM event_outbox WHERE status='processed'`").length, 0);
  assert.equal(findPhysicalDeletes("`DELETE FROM journal_entry_template_lines WHERE x`").length, 0);
});

test("لا يرصد جدولًا فرعيًا مشابهًا بالاسم (employee_assignments ليس employees)", () => {
  assert.equal(findPhysicalDeletes("`DELETE FROM employee_assignments WHERE id=$1`").length, 0);
});

test("لا يرصد DELETE داخل تعليق (سطري أو كتلي)", () => {
  assert.equal(findPhysicalDeletes(`// DELETE FROM journal_lines — موثّق فقط`).length, 0);
  assert.equal(findPhysicalDeletes(`/* DELETE FROM contracts */`).length, 0);
});

test("لا يرصد UPDATE/SELECT (ليست حذفًا)", () => {
  assert.equal(findPhysicalDeletes(`UPDATE journal_entries SET status='reversed'`).length, 0);
  assert.equal(findPhysicalDeletes(`SELECT * FROM employees`).length, 0);
});

test("يرصد عدة مخالفات بأرقام أسطر صحيحة", () => {
  const src = "x\n`DELETE FROM journal_entries WHERE 1`\ny\n`DELETE FROM invoices WHERE 2`\n";
  const v = findPhysicalDeletes(src);
  assert.equal(v.length, 2);
  assert.equal(v[0].line, 2);
  assert.equal(v[1].line, 4);
});

test("المجموعات تشمل الدفتر والتعاقدي والجذور التشغيلية", () => {
  for (const t of ["journal_entries", "invoices", "employees", "vehicles"]) {
    assert.ok(PROTECTED_TABLES.includes(t), `يجب أن يحرس ${t}`);
    assert.ok(TABLE_GROUP[t], `يجب أن يكون لـ ${t} مجموعة`);
  }
});

test("stripJs يحافظ على الأسطر", () => {
  assert.equal(stripJs("a\n// c\nb").split("\n").length, 3);
});
