// اختبارات منطق حارس بيت المحرّك الواحد (B1).
// التشغيل: node scripts/src/check-engine-home.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { findOutOfHomeEngines, violationsFrom, BASELINE } from "./check-engine-home.mjs";

test("يرصد ملفات *Engine.ts فقط", () => {
  assert.deepEqual(
    findOutOfHomeEngines(["fooEngine.ts", "barService.ts", "x.ts", "bazEngine.ts"]),
    ["bazEngine.ts", "fooEngine.ts"],
  );
});

test("يتجاهل .d.ts", () => {
  assert.deepEqual(findOutOfHomeEngines(["fooEngine.d.ts", "barEngine.ts"]), ["barEngine.ts"]);
});

test("لا مخالفة على محرّك في الأساس", () => {
  assert.deepEqual(violationsFrom(["notificationEngine.ts", "policyEngine.ts"]), []);
});

test("يرصد محرّكًا جديدًا خارج البيت وليس في الأساس", () => {
  assert.deepEqual(violationsFrom(["brandNewEngine.ts", "policyEngine.ts"]), ["brandNewEngine.ts"]);
});

test("Service لا يُرصد (قدرة محايدة)", () => {
  assert.deepEqual(violationsFrom(["pushService.ts", "numberingService.ts"]), []);
});

test("الأساس يضم المحرّكات المنثورة المعروفة", () => {
  for (const n of ["notificationEngine.ts", "workflowEngine.ts", "umrahPenaltyEngine.ts", "lifecycleEngine.ts"]) {
    assert.ok(BASELINE.has(n), `يجب أن يكون ${n} في الأساس`);
  }
  assert.equal(BASELINE.size, 24);
});
