#!/usr/bin/env node
//
// scripts/src/check-attachment-workspace-unified.mjs
//
// حارس «لوحة المرفق المالي الموحّدة» — الدستور المادة 15 (لا تكرار) + المادة 5
// (لا مكوّن جديد إذا يوجد أصل قائم يؤدّي الغرض).
//
// لوحة «مستند السجل المالي» (FinancialAttachmentViewer #2237) هي البيت الموحّد
// لرفع/عرض/استبدال/حذف المرفق المالي. أي صفحة تتبنّاها يجب ألّا تُبقي أيضًا
// مربّع رفع خامًا (FileDropZone) لنفس الغرض — الجمع بينهما = مدخَلا رفع لنفس
// المستند يكتبان نفس الحالة = تكرار ظاهر للمستخدم (عُولج في PR #2975 لصفحتَي
// expenses-create و vouchers-create). يمنع هذا الحارس عودة الجمع بينهما.
//
// ملاحظة دقّة: استيراد النوع فقط `import { type Attachment } from ".../file-drop-zone"`
// مسموح (ليس استخدامًا للمكوّن)، لذا نفحص المُعرّف `FileDropZone` لا مسار الوحدة.
//
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(REPO_ROOT, "artifacts/ghayth-erp/src");

// الأساس المجمّد: ملفات يُسمح فيها بالاثنين معًا لسبب مشروع. لا يوجد حاليًا
// (الحارس يبدأ أخضر). إن ظهر سبب مشروع مستقبلًا يُضاف هنا مع تعليل.
export const BASELINE = new Set([]);

// دوال نقية (للاختبار):
export function usesViewer(content) {
  return /\bFinancialAttachmentViewer\b/.test(content);
}
export function usesDropZone(content) {
  // المكوّن نفسه، لا استيراد النوع `type Attachment` من نفس الوحدة.
  return /\bFileDropZone\b/.test(content);
}
export function isViolation(content) {
  return usesViewer(content) && usesDropZone(content);
}
// من قائمة { name, content } يرجع أسماء المخالفين (ليسوا في الأساس)، مرتّبة.
export function violationsFrom(entries, baseline = BASELINE) {
  return entries
    .filter((e) => isViolation(e.content) && !baseline.has(e.name))
    .map((e) => e.name)
    .sort();
}

// مسح كل ملفات .tsx (عدا الاختبارات) تحت src.
async function collectTsx(dir, acc = []) {
  const ents = await readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await collectTsx(p, acc);
    else if (e.isFile() && e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) acc.push(p);
  }
  return acc;
}

async function main() {
  let files;
  try {
    files = await collectTsx(SRC);
  } catch (e) {
    console.error(`✗ check:attachment-workspace-unified — تعذّر قراءة ${relative(REPO_ROOT, SRC)}: ${e.message}`);
    process.exit(1);
  }

  const entries = [];
  for (const p of files) {
    const content = await readFile(p, "utf8");
    if (usesViewer(content) || usesDropZone(content)) entries.push({ name: relative(SRC, p), content });
  }

  const fresh = violationsFrom(entries);
  const present = entries.filter((e) => isViolation(e.content)).map((e) => e.name);
  const stale = [...BASELINE].filter((n) => !present.includes(n)).sort();

  if (stale.length) {
    console.log(`[check:attachment-workspace-unified] ملاحظة: ${stale.length} مدخل أساس لم يعد مخالفًا — احذفه من BASELINE:`);
    for (const n of stale) console.log(`    - ${n}`);
  }

  if (fresh.length) {
    console.error(`\n✗ check:attachment-workspace-unified — ${fresh.length} ملف يجمع اللوحة الموحّدة ومربّع الرفع الخام معًا (تكرار — دستور 15/5):\n`);
    for (const n of fresh) console.error(`  • ${n} — فيه FinancialAttachmentViewer و FileDropZone معًا`);
    console.error(`\n  استخدم لوحة «مستند السجل المالي» (FinancialAttachmentViewer) وحدها للرفع/العرض، وأزِل FileDropZone المكرّر.`);
    console.error(`  لاستيراد النوع فقط: import { type Attachment } from "@/components/shared/file-drop-zone"\n`);
    process.exit(1);
  }

  const viewerCount = entries.filter((e) => usesViewer(e.content)).length;
  console.log(`✓ check:attachment-workspace-unified — ${viewerCount} صفحة تستخدم اللوحة الموحّدة · 0 تكرار مع FileDropZone.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
