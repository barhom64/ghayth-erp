#!/usr/bin/env node
//
// scripts/src/check-engine-home.mjs
//
// حارس «بيت المحرّك الواحد» — قاموس المفاهيم §1–2 (يكمّل دستور غيث، المادتان 4، 12).
//
// منطق المسار يعيش في محرّك واحد داخل lib/engines/ يرث domainEngineBase. أي
// `*Engine.ts` جديد في جذر lib/ (خارج engines/) = تشتيت لبيت المنطق ويُرفض.
// الوضع الحالي (24 محرّكًا منثورًا) مجمَّد كأساس (baseline) — الحارس يبدأ أخضر
// ويمنع **نمو** الفوضى؛ كل محرّك أساس يُنقل لاحقًا دفعةً دفعةً يُحذف من القائمة.
//
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const LIB = join(REPO_ROOT, "artifacts/api-server/src/lib");

// الأساس المجمّد: محرّكات منثورة قائمة قبل اعتماد القاموس. لا يُضاف إليها —
// تُحذف فقط عند نقل المحرّك إلى engines/ (دفعات التنظيف B4–B8).
export const BASELINE = new Set([
  "aiEngine.ts", "attendancePolicyEngine.ts", "autoViolationEngine.ts",
  "disciplineEngine.ts", "employeeLifecycleEngine.ts", "employeeScoringEngine.ts",
  "employeeSignalsEngine.ts", "genericImportEngine.ts", "journeyEngine.ts",
  "kpiEngine.ts", "lifecycleEngine.ts",
  "obligationsEngine.ts", "policyEngine.ts", "proactiveEngine.ts",
  "rulesEngine.ts", "selfAuditEngine.ts", "umrahAssistantEngine.ts",
  "umrahCommissionEngine.ts", "umrahImportEngine.ts", "umrahInvoicingEngine.ts",
  "umrahPenaltyEngine.ts", "umrahReclassifyEngine.ts", "workflowEngine.ts",
]);

// يرجع أسماء ملفات المحرّكات الخارجة عن البيت من قائمة أسماء (جذر lib فقط).
// دالة نقية قابلة للاختبار وحدةً.
export function findOutOfHomeEngines(fileNames) {
  return fileNames.filter((n) => /Engine\.ts$/.test(n) && !/\.d\.ts$/.test(n)).sort();
}

// يرجع المخالفات: محرّك خارج البيت وليس في الأساس.
export function violationsFrom(fileNames, baseline = BASELINE) {
  return findOutOfHomeEngines(fileNames).filter((n) => !baseline.has(n));
}

async function main() {
  let names = [];
  try {
    const entries = await readdir(LIB, { withFileTypes: true });
    names = entries.filter((e) => e.isFile()).map((e) => e.name);
  } catch (e) {
    console.error(`✗ check:engine-home — تعذّر قراءة ${relative(REPO_ROOT, LIB)}: ${e.message}`);
    process.exit(1);
  }

  const all = findOutOfHomeEngines(names);
  const fresh = violationsFrom(names);
  const stale = [...BASELINE].filter((n) => !all.includes(n)).sort();

  if (stale.length) {
    console.log(`[check:engine-home] ملاحظة: ${stale.length} مدخلًا في الأساس لم يعد موجودًا (نُقل/حُذف) — احذفه من BASELINE:`);
    for (const n of stale) console.log(`    - ${n}`);
  }

  if (fresh.length) {
    console.error(`\n✗ check:engine-home — ${fresh.length} محرّك جديد خارج بيت المحرّكات (قاموس المفاهيم §1–2):\n`);
    for (const n of fresh) {
      console.error(`  • artifacts/api-server/src/lib/${n} — محرّك منطق مسار يجب أن يعيش في lib/engines/`);
    }
    console.error(`\n  انقل الملف إلى lib/engines/ (يرث domainEngineBase)، أو إن كان قدرة تقنية محايدة فسمّه <capability>Service.ts.\n`);
    process.exit(1);
  }

  console.log(`✓ check:engine-home — ${all.length} محرّك أساس مجمّد، 0 جديد خارج البيت · لا نمو للتشتيت.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
