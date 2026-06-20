// اختبارات حارس النموذج الموحّد للاختيار/البحث (الدفعة A).
// التشغيل: node scripts/src/check-entity-picker-unified.test.mjs
import { test } from "node:test";
import assert from "node:assert/strict";
import { isPickerFile, reusesCore, violationsFrom, BASELINE } from "./check-entity-picker-unified.mjs";

test("isPickerFile يرصد *-select/picker/selector فقط", () => {
  assert.ok(isPickerFile("client-select.tsx"));
  assert.ok(isPickerFile("supplier-item-picker.tsx"));
  assert.ok(isPickerFile("booking-source-selector.tsx"));
  assert.ok(!isPickerFile("invoice-form.tsx"));
  assert.ok(!isPickerFile("searchable-select.tsx")); // النواة مستثناة
});

test("reusesCore يرصد إعادة استخدام النواة", () => {
  assert.ok(reusesCore('import { SearchableSelect } from "./searchable-select";'));
  assert.ok(reusesCore('import { ClientSelect } from "@/components/shared/entity-selects";'));
  assert.ok(!reusesCore('import { Popover } from "@/components/ui/popover";'));
});

test("لا مخالفة على مكوّن في الأساس", () => {
  assert.deepEqual(
    violationsFrom([{ name: "umrah-group-picker.tsx", content: "// bespoke" }]),
    [],
  );
});

test("يرصد مكوّن منفصل جديد (ليس في الأساس)", () => {
  assert.deepEqual(
    violationsFrom([{ name: "warehouse-new-picker.tsx", content: 'import { Popover } from "x";' }]),
    ["warehouse-new-picker.tsx"],
  );
});

test("لا مخالفة على مكوّن جديد يعيد استخدام النواة", () => {
  assert.deepEqual(
    violationsFrom([{ name: "warehouse-new-select.tsx", content: 'import { SearchableSelect } from "./searchable-select";' }]),
    [],
  );
});

test("الأساس يضم المنفصلة المتبقّية (بعد توحيد supplier-item في B1)", () => {
  for (const n of ["umrah-group-picker.tsx", "journal-template-picker.tsx", "location-kind-picker.tsx", "map-location-picker.tsx"]) {
    assert.ok(BASELINE.has(n), `يجب أن يكون ${n} في الأساس`);
  }
  assert.ok(!BASELINE.has("supplier-item-picker.tsx")); // وُحِّد في B1
  assert.equal(BASELINE.size, 4);
});
