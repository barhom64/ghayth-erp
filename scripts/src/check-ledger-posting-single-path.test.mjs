// اختبارات منطق حارس مسار الترحيل الواحد للدفتر.
// التشغيل: node scripts/src/check-ledger-posting-single-path.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { findLedgerInserts, stripJs, ALLOWED_FILES, LEDGER_TABLES } from "./check-ledger-posting-single-path.mjs";

test("يرصد INSERT INTO journal_lines داخل template", () => {
  const v = findLedgerInserts("await rawExecute(`INSERT INTO journal_lines (...) VALUES (...)`);");
  assert.equal(v.length, 1);
  assert.equal(v[0].table, "journal_lines");
});

test("يرصد journal_entries مع public/quotes/حالة أحرف", () => {
  assert.equal(findLedgerInserts(`insert into public."journal_entries" (x) values (1)`).length, 1);
});

test("لا يرصد INSERT على جدول غير دفتري", () => {
  assert.equal(findLedgerInserts("`INSERT INTO audit_logs (x) VALUES (1)`").length, 0);
});

test("لا يرصد SELECT/UPDATE على الدفتر (ليست كتابة جديدة)", () => {
  assert.equal(findLedgerInserts("`SELECT * FROM journal_lines`").length, 0);
  assert.equal(findLedgerInserts("`UPDATE journal_entries SET status=$1`").length, 0);
});

test("لا يرصد داخل تعليق", () => {
  assert.equal(findLedgerInserts("// INSERT INTO journal_lines موثّق").length, 0);
  assert.equal(findLedgerInserts("/* INSERT INTO journal_entries */").length, 0);
});

test("قائمة الملفات المعتمدة تشمل مسار الترحيل", () => {
  assert.ok(ALLOWED_FILES.has("artifacts/api-server/src/lib/gl/posting.ts"));
  assert.ok(ALLOWED_FILES.has("artifacts/api-server/src/lib/businessHelpers.ts"));
});

test("جداول الدفتر المرصودة", () => {
  assert.deepEqual([...LEDGER_TABLES].sort(), ["journal_entries", "journal_lines"]);
});

test("stripJs يحافظ على الأسطر", () => {
  assert.equal(stripJs("a\n// c\nb").split("\n").length, 3);
});
