// اختبارات حارس تكرار محتوى المكوّنات.
// التشغيل: node scripts/src/check-duplicate-component-content.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { normalize, duplicateGroups, groupKey, freshGroups, MIN_NORMALIZED_LEN, assertScannedNonEmpty } from "./check-duplicate-component-content.mjs";

test("assertScannedNonEmpty يفشل مغلقًا على صفر ملف (ملاحظة Codex)", () => {
  assert.throws(() => assertScannedNonEmpty(0));
  assert.doesNotThrow(() => assertScannedNonEmpty(3));
});

test("normalize يُسقط التعليقات والاستيراد ويوحّد الفراغات", () => {
  const a = normalize(`import { X } from "@/a";\n// تعليق\nfunction F(){ return 1; }`);
  const b = normalize(`import { X } from "@/DIFFERENT/path";\n/* مختلف */\nfunction F(){ return 1; }`);
  assert.equal(a, b); // المحتوى الفعّال نفسه رغم اختلاف الاستيراد/التعليق
});

test("normalize لا يكسر http:// (ليست تعليقًا)", () => {
  assert.ok(normalize('const u = "http://x.test/a";').includes("http://x.test/a"));
});

test("duplicateGroups يجمع المتطابقين فقط (فوق الحد الأدنى)", () => {
  const body = "function Component(){ return " + "x".repeat(MIN_NORMALIZED_LEN) + "; }";
  const groups = duplicateGroups([
    { name: "b.tsx", content: body },
    { name: "a.tsx", content: body },
    { name: "c.tsx", content: "function Other(){ return " + "y".repeat(MIN_NORMALIZED_LEN) + "; }" },
  ]);
  assert.deepEqual(groups, [["a.tsx", "b.tsx"]]); // مرتّب، c وحده ليس مجموعة
});

test("duplicateGroups يتجاهل القصير جدًا (أقل من الحد)", () => {
  assert.deepEqual(duplicateGroups([
    { name: "a.tsx", content: "const x=1;" },
    { name: "b.tsx", content: "const x=1;" },
  ]), []);
});

test("freshGroups يستثني المغطّى بالأساس", () => {
  const groups = [["a.tsx", "b.tsx"], ["c.tsx", "d.tsx"]];
  const baseline = new Set([groupKey(["a.tsx", "b.tsx"])]);
  assert.deepEqual(freshGroups(groups, baseline), [["c.tsx", "d.tsx"]]);
});
