#!/usr/bin/env node
//
// scripts/src/check-canonical-component-pairs.mjs
//
// حارس «المكوّن القانوني مقابل بديله الخام» (سجلّ مُعمَّم) — الدستور المادة 15
// (لا تكرار) + المادة 5 (لا مكوّن جديد إذا يوجد أصل قائم).
//
// لكل زوج في السجلّ PAIRS: مكوّن «قانوني» موحّد (canonical) هو البيت الصحيح
// للوظيفة، و«بديل خام» (raw) لا يجوز أن يتعايش معه في الملف نفسه (وجودهما معًا
// = مدخَلان لنفس الوظيفة = تكرار ظاهر). يُعمّم هذا الحارس نمطَي:
//   • check-attachment-workspace-unified (دُمج في #2978، يُستبدل بهذا السجلّ)
//   • فكرة المنتقي الموحّد (check-entity-picker-unified يبقى مستقلًّا لأنه عن
//     إعادة استخدام نواة، لا تعايش زوج).
// إضافة زوج جديد = سطر واحد في PAIRS (لا حارس منفصل لكل حالة).
//
// نمط baseline: التعايشات الحالية مجمّدة في
// scripts/canonical-component-pairs-allowlist.txt (مفاتيح `id:file`)؛ يفشل على
// أي تعايش جديد. فارغ الآن (زوج المرفقات عولج في #2975).
//
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(REPO_ROOT, "artifacts/ghayth-erp/src");
const ALLOWLIST = join(REPO_ROOT, "scripts/canonical-component-pairs-allowlist.txt");

// سجلّ الأزواج. id ثابت للمفتاح؛ canonical/raw مُعرّفان (لا مسار الوحدة، فاستيراد
// النوع وحده — مثل `type Attachment` — لا يُعدّ استخدامًا للمكوّن).
export const PAIRS = [
  {
    id: "financial-attachment",
    canonical: "FinancialAttachmentViewer",
    raw: "FileDropZone",
    reason:
      "لوحة «مستند السجل المالي» الموحّدة (#2237) هي البيت الموحّد للمرفق المالي؛ " +
      "وجود FileDropZone بجانبها = مدخَلا رفع لنفس المستند (عولج في #2975). " +
      "لاستيراد النوع فقط: import { type Attachment } from \"@/components/shared/file-drop-zone\".",
  },
  // أضِف أزواجًا جديدة هنا: { id, canonical, raw, reason }
];

// هل يستخدم المحتوى مُعرّفًا (كلمة كاملة)؟ (دالة نقية)
export function usesIdentifier(content, ident) {
  return new RegExp(`\\b${ident}\\b`).test(content);
}

// من [{name, content}] يرجع التعايشات المخالفة (خارج الأساس)، مرتّبة بالمفتاح.
export function violationsFor(entries, pairs = PAIRS, baseline = new Set()) {
  const out = [];
  for (const e of entries) {
    for (const p of pairs) {
      if (usesIdentifier(e.content, p.canonical) && usesIdentifier(e.content, p.raw)) {
        const key = `${p.id}:${e.name}`;
        if (!baseline.has(key)) out.push({ id: p.id, file: e.name, key, reason: p.reason, canonical: p.canonical, raw: p.raw });
      }
    }
  }
  return out.sort((a, b) => a.key.localeCompare(b.key));
}

// لا نبتلع خطأ القراءة: لو غاب/تعذّر قراءة المصدر يجب أن يفشل الحارس مغلقًا
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
  const files = await collectTsx(SRC);
  assertScannedNonEmpty(files.length);
  const entries = [];
  for (const p of files) entries.push({ name: relative(REPO_ROOT, p), content: await readFile(p, "utf8") });

  const baseline = await readBaseline();
  const violations = violationsFor(entries, PAIRS, baseline);

  if (violations.length) {
    console.error(`\n✗ check:canonical-component-pairs — ${violations.length} ملف يجمع مكوّنًا قانونيًا وبديله الخام (تكرار — دستور 15/5):\n`);
    for (const v of violations) {
      console.error(`  • ${v.file} — يجمع ${v.canonical} و ${v.raw}`);
      console.error(`      ${v.reason}`);
    }
    console.error(`\n  استخدم المكوّن القانوني وحده وأزِل البديل الخام؛ أو أضِف المفتاح للأساس بسطر معلَّل إن كان مبرّرًا.\n`);
    process.exit(1);
  }

  console.log(`✓ check:canonical-component-pairs — ${entries.length} ملف مفحوص · ${PAIRS.length} زوج في السجلّ · ${baseline.size} أساس · 0 تعايش جديد.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
