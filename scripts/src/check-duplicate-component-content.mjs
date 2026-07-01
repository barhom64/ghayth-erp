#!/usr/bin/env node
//
// scripts/src/check-duplicate-component-content.mjs
//
// حارس «تكرار محتوى المكوّنات» — الدستور المادة 15 (لا تكرار) + المادة 5 (لا
// مكوّن جديد إذا يوجد أصل قائم). الهدف: علم وجود مكوّنات مكرّرة.
//
// يكشف ملفّي .tsx **مختلفي الاسم** لكن محتواهما متطابق بعد التطبيع (نسخ-لصق
// صريح) — وهو ما لا يلتقطه check-dup-filenames (يقارن الأسماء فقط). التطبيع
// يُسقط التعليقات وأسطر الاستيراد ويوحّد الفراغات، فيلتقط نسخة طبق الأصل حتى لو
// اختلفت مساراتها أو تعليقاتها.
//
// نمط baseline (كـ check-dup-filenames): مجموعات التكرار الحالية مجمّدة في
// scripts/duplicate-component-content-allowlist.txt (كل سطر = مسارات مجموعة
// مرتّبة مفصولة بفواصل)؛ يفشل الحارس فقط على مجموعة تكرار **جديدة** أو تغيّرت
// أعضاؤها — فيبدأ أخضر ويمنع نمو التكرار. والأساس نفسه هو تقرير «العلم» بما
// هو مكرّر الآن.
//
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createHash } from "node:crypto";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROOTS = ["artifacts/ghayth-erp/src/pages", "artifacts/ghayth-erp/src/components"];
const ALLOWLIST = join(REPO_ROOT, "scripts/duplicate-component-content-allowlist.txt");

// تجاهل الملفات القصيرة جدًا بعد التطبيع (stubs / re-exports / boilerplate)
// لتفادي تصادمات تافهة لا قيمة لها.
export const MIN_NORMALIZED_LEN = 240;

// تطبيع المحتوى (دالة نقية): يُسقط التعليقات وأسطر الاستيراد ويوحّد الفراغات.
export function normalize(src) {
  let s = src;
  s = s.replace(/\/\*[\s\S]*?\*\//g, " ");                       // تعليقات الكتل
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, "$1 ");                   // تعليقات السطر (لا تمسّ http://)
  s = s.replace(/^\s*import\s[\s\S]*?from\s+["'][^"']*["'];?\s*$/gm, " "); // import … from "x"
  s = s.replace(/^\s*import\s+["'][^"']*["'];?\s*$/gm, " ");      // import "x" (أثر جانبي)
  s = s.replace(/\s+/g, " ").trim();                             // توحيد الفراغات
  return s;
}

// من [{name, content}] يرجع مجموعات التكرار: [[name1,name2,...], …] مرتّبة.
export function duplicateGroups(entries, minLen = MIN_NORMALIZED_LEN) {
  const byHash = new Map();
  for (const e of entries) {
    const n = normalize(e.content);
    if (n.length < minLen) continue;
    const h = createHash("sha1").update(n).digest("hex");
    if (!byHash.has(h)) byHash.set(h, []);
    byHash.get(h).push(e.name);
  }
  return [...byHash.values()]
    .filter((g) => g.length > 1)
    .map((g) => g.slice().sort())
    .sort((a, b) => a[0].localeCompare(b[0]));
}

// مفتاح المجموعة في الأساس: مسارات مرتّبة مفصولة بفواصل.
export function groupKey(group) { return group.join(","); }

// المجموعات غير المغطّاة بالأساس (الجديدة/المتغيّرة).
export function freshGroups(groups, baseline) {
  return groups.filter((g) => !baseline.has(groupKey(g)));
}

// لا نبتلع خطأ القراءة: غياب/تعذّر قراءة المصدر يجب أن يفشل الحارس مغلقًا
// (لا أن يمرّ بمسح صفر/جزئي) — ملاحظة Codex على #2984.
async function collectTsx(dir, acc = []) {
  const ents = await readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await collectTsx(p, acc);
    else if (e.isFile() && e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx") && !e.name.endsWith(".stories.tsx")) acc.push(p);
  }
  return acc;
}

// فشل مغلق: مسح صفر ملف = مصدر مفقود/مكسور، لا «نظيف». (دالة نقية قابلة للاختبار)
export function assertScannedNonEmpty(count) {
  if (count === 0) throw new Error("scanned 0 .tsx files — مصدر مفقود أو مسح مكسور (فشل مغلق)");
}

async function readBaseline() {
  try {
    const txt = await readFile(ALLOWLIST, "utf8");
    return new Set(txt.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  } catch { return new Set(); }
}

async function main() {
  const files = [];
  for (const r of ROOTS) await collectTsx(join(REPO_ROOT, r), files);
  assertScannedNonEmpty(files.length);
  const entries = [];
  for (const p of files) entries.push({ name: relative(REPO_ROOT, p), content: await readFile(p, "utf8") });

  const groups = duplicateGroups(entries);
  const baseline = await readBaseline();
  const fresh = freshGroups(groups, baseline);
  const stale = [...baseline].filter((k) => !groups.some((g) => groupKey(g) === k)).sort();

  if (stale.length) {
    console.log(`[check:duplicate-component-content] ملاحظة: ${stale.length} مجموعة أساس لم تعد مكرّرة (وُحِّدت/تغيّرت) — حدّث الأساس:`);
    for (const k of stale) console.log(`    - ${k}`);
  }

  if (fresh.length) {
    console.error(`\n✗ check:duplicate-component-content — ${fresh.length} مجموعة مكوّنات متطابقة المحتوى جديدة/متغيّرة (نسخ-لصق — دستور 15/5):\n`);
    for (const g of fresh) {
      console.error(`  • محتوى متطابق:`);
      for (const n of g) console.error(`      - ${n}`);
    }
    console.error(`\n  استخرج المنطق المشترك إلى مكوّن واحد قابل لإعادة الاستخدام بدل النسخ.`);
    console.error(`  إن كان التطابق مقصودًا ومبرّرًا، أضِف سطر المجموعة إلى scripts/duplicate-component-content-allowlist.txt.\n`);
    process.exit(1);
  }

  console.log(`✓ check:duplicate-component-content — ${entries.length} ملف مفحوص · ${groups.length} مجموعة تكرار في الأساس · 0 جديدة.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
