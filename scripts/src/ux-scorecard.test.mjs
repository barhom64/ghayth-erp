// scripts/src/ux-scorecard.test.mjs
//
// اختبارات وحدة لمحلّلات بطاقة قياس بوابة UX (دوال نقية، بلا نظام ملفات).
// تشغيل: node --test scripts/src/ux-scorecard.test.mjs
//
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseSpecRoutes,
  parseMatrixRoutes,
  diffRoutes,
  sumScorecardWeights,
} from "./ux-scorecard.mjs";

test("parseSpecRoutes يستخرج مصفوفة الرحلات الحرجة من نصّ الاختبار", () => {
  const src = `
const DEFAULT_CRITICAL_ROUTES = [
  "/",
  "/employees",
  "/finance",
];
`;
  assert.deepEqual(parseSpecRoutes(src), ["/", "/employees", "/finance"]);
});

test("parseSpecRoutes يرجع [] عند غياب المصفوفة", () => {
  assert.deepEqual(parseSpecRoutes("no routes here"), []);
});

test("parseMatrixRoutes يستخرج قائمة الرحلات من المصفوفة فقط", () => {
  const src = `
## Core journeys

- \`not-a-route-line\`

## Automated route smoke list

- \`/\`
- \`/employees\`
- \`/finance\`

## Manual success definition

- \`/should-not-count\`
`;
  assert.deepEqual(parseMatrixRoutes(src), ["/", "/employees", "/finance"]);
});

test("diffRoutes يرصد الانجراف في الاتجاهين", () => {
  const d = diffRoutes(["/", "/a", "/b"], ["/", "/a", "/c"]);
  assert.deepEqual(d.missingFromMatrix, ["/b"]);
  assert.deepEqual(d.missingFromSpec, ["/c"]);
});

test("diffRoutes فارغ عند التطابق التام", () => {
  const d = diffRoutes(["/", "/a"], ["/", "/a"]);
  assert.deepEqual(d.missingFromMatrix, []);
  assert.deepEqual(d.missingFromSpec, []);
});

test("sumScorecardWeights يجمع الأوزان ويتجاهل صف الإجمالي", () => {
  const src = `
| المحور | الوزن |
|---|---:|
| نجاح الرحلات الحقيقية | 40 |
| الأداء | 20 |
| العربية و RTL والجوال | 15 |
| منع الأخطاء وسهولة التعافي | 10 |
| الوصول Accessibility | 10 |
| الأثر Audit/Event/Report | 5 |
| **الإجمالي** | **100** |
`;
  assert.equal(sumScorecardWeights(src), 100);
});
