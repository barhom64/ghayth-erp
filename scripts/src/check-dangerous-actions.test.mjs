// scripts/src/check-dangerous-actions.test.mjs
//
// اختبارات وحدة لكاشف الإجراءات الخطرة (دوال نقية، بلا نظام ملفات).
// تشغيل: node --test scripts/src/check-dangerous-actions.test.mjs
//
import { test } from "node:test";
import assert from "node:assert/strict";
import { findNativeConfirms, signatureFor } from "./check-dangerous-actions.mjs";

test("يرصد استدعاء confirm() الأصلي", () => {
  const src = `const del = () => {\n  if (!confirm("حذف؟")) return;\n};`;
  const hits = findNativeConfirms(src);
  assert.equal(hits.length, 1);
  assert.equal(hits[0].line, 2);
});

test("يرصد window.confirm()", () => {
  const hits = findNativeConfirms(`if (window.confirm("متأكد؟")) doIt();`);
  assert.equal(hits.length, 1);
});

test("لا يرصد onConfirm/ConfirmDialog/confirmLabel (اختلاف حالة/سياق)", () => {
  const src = [
    `<ConfirmDeleteDialog onConfirm={handle} confirmLabel="تأكيد" />`,
    `const onConfirm = () => {};`,
    `setConfirmOpen(true);`,
    `confirmPerm="finance:approve"`,
  ].join("\n");
  assert.deepEqual(findNativeConfirms(src), []);
});

test("لا يرصد confirm داخل تعليق", () => {
  const src = [
    `// Replaces window.confirm() with a proper dialog`,
    ` * was a confirm("…") native call`,
    `/* confirm( legacy */`,
  ].join("\n");
  assert.deepEqual(findNativeConfirms(src), []);
});

test("لا يرصد confirmSomething( (لاحقة بحرف كبير)", () => {
  assert.deepEqual(findNativeConfirms(`confirmDelete();`), []);
});

test("signatureFor مستقرّ ولا يعتمد رقم السطر", () => {
  const a = signatureFor("pages/x.tsx", 'if (!confirm("حذف؟")) return;');
  const b = signatureFor("pages/x.tsx", 'if (!confirm("حذف؟")) return;');
  assert.equal(a, b);
  assert.match(a, /\tif \(!confirm/);
});

test("يطبّع المسافات في نصّ السطر", () => {
  const hits = findNativeConfirms(`    if (  !confirm( "x" )  )  return;`);
  assert.equal(hits[0].text, `if ( !confirm( "x" ) ) return;`);
});
