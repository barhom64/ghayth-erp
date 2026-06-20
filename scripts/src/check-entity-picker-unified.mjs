#!/usr/bin/env node
//
// scripts/src/check-entity-picker-unified.mjs
//
// حارس «النموذج الموحّد للاختيار/البحث» — قاموس المفاهيم §3 + الدستور المادة 15
// (لا إدخال حر في حقل مرتبط بكيان: بحث ذكي / اختيار متسلسل موحّد).
//
// كل مكوّن قابل لإعادة الاستخدام للبحث/الاختيار (`*-select|picker|selector.tsx`
// في components/shared) يجب أن يُعيد استخدام النواة الموحّدة `searchable-select`
// (أو `entity-selects` المبني عليها) — لا أن يبني قائمته المنسدلة من الصفر.
// المكوّنات المنفصلة القائمة مجمّدة كأساس (baseline) فيبدأ الحارس أخضر ويمنع
// **نمو** التفاوت؛ تُحذف من الأساس تباعًا عند توحيدها (دفعة B).
//
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SHARED = join(REPO_ROOT, "artifacts/ghayth-erp/src/components/shared");

// النواة نفسها لا تُحاسَب (هي البيت الموحّد).
export const CORE_FILE = "searchable-select.tsx";

// الأساس المجمّد: مكوّنات منفصلة قائمة قبل اعتماد الحارس. لا يُضاف إليها —
// تُحذف فقط عند توحيدها على النواة. (map/location-kind قد تبقى لطبيعتها المختلفة.)
export const BASELINE = new Set([
  "journal-template-picker.tsx",
  "location-kind-picker.tsx",
  "map-location-picker.tsx",
  "umrah-group-picker.tsx",
]);

// اسم ملف مكوّن بحث/اختيار قابل لإعادة الاستخدام؟ (دالة نقية)
export function isPickerFile(name) {
  return /-(select|picker|selector)\.tsx$/.test(name) && name !== CORE_FILE;
}

// هل المحتوى يُعيد استخدام النواة الموحّدة؟ (دالة نقية)
export function reusesCore(content) {
  return /from\s+["'][^"']*(searchable-select|entity-selects)["']/.test(content);
}

// يرجع أسماء المكوّنات المنفصلة الجديدة (ليست في الأساس) من قائمة { name, content }.
export function violationsFrom(entries, baseline = BASELINE) {
  return entries
    .filter((e) => isPickerFile(e.name) && !reusesCore(e.content) && !baseline.has(e.name))
    .map((e) => e.name)
    .sort();
}

async function main() {
  let names;
  try {
    names = (await readdir(SHARED, { withFileTypes: true }))
      .filter((e) => e.isFile() && e.name.endsWith(".tsx"))
      .map((e) => e.name);
  } catch (e) {
    console.error(`✗ check:entity-picker-unified — تعذّر قراءة ${relative(REPO_ROOT, SHARED)}: ${e.message}`);
    process.exit(1);
  }

  const entries = [];
  for (const name of names) {
    if (!isPickerFile(name)) continue;
    entries.push({ name, content: await readFile(join(SHARED, name), "utf8") });
  }

  const fresh = violationsFrom(entries);
  const present = entries.map((e) => e.name);
  const stale = [...BASELINE].filter((n) => !present.includes(n)).sort();

  if (stale.length) {
    console.log(`[check:entity-picker-unified] ملاحظة: ${stale.length} مدخلًا في الأساس لم يعد موجودًا (وُحِّد/حُذف) — احذفه من BASELINE:`);
    for (const n of stale) console.log(`    - ${n}`);
  }

  if (fresh.length) {
    console.error(`\n✗ check:entity-picker-unified — ${fresh.length} مكوّن بحث/اختيار جديد لا يُعيد استخدام النواة الموحّدة (دستور 15):\n`);
    for (const n of fresh) {
      console.error(`  • components/shared/${n} — يبني قائمته المنسدلة بنفسه`);
    }
    console.error(`\n  أعِد استخدام searchable-select (أو entity-selects) بدل بناء منسدلة جديدة — نموذج إدخال/بحث واحد للنظام كله.\n`);
    process.exit(1);
  }

  const pickers = entries.length;
  const unified = entries.filter((e) => reusesCore(e.content)).length;
  console.log(`✓ check:entity-picker-unified — ${pickers} مكوّن مفحوص · ${unified} موحّد + ${BASELINE.size} أساس مجمّد · 0 منفصل جديد.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
