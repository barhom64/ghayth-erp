#!/usr/bin/env node
//
// scripts/src/check-dangerous-actions.mjs
//
// حارس الإجراءات الخطرة (واجهة غيث) — يكمّل دستور غيث (المواد 12، 15) و
// docs/ux/DYNAMIC_ACTIONS_MATRIX.md.
//
// المبدأ: الإجراءات الخطرة (حذف/تعطيل/إنهاء/إلغاء/إغلاق/ترحيل/صرف/اعتماد) يجب أن
// تمرّ عبر مكوّنات التأكيد الموحّدة (ConfirmDeleteDialog / ConfirmActionDialog) لا
// عبر نافذة المتصفّح الأصلية `confirm()`. الأخيرة:
//   - تكسر العربية و RTL والثيم الداكن (نص النظام لا يُنسّق).
//   - بلا impact-preview ولا عرض blockers (409) ولا أثر متّسق.
//   - لا تشبه بقية النظام (تجربة مستخدم مكسورة للإجراء الخطر).
//
// الوضع الحالي (الأساس) مجمّد كـ baseline: الحارس يبدأ أخضر ويمنع **نمو** النمط؛
// كل استدعاء `confirm()` يُحوَّل لاحقًا إلى الـdialog الموحّد يُحذف من الأساس.
//
// الكشف دقيق ومنخفض الإيجابيات الكاذبة: استدعاء دالة `confirm(` بحرف صغير فقط
// (يستثني تلقائيًا onConfirm/ConfirmDialog/confirmLabel … لاختلاف حالة الأحرف)،
// مع تجاهل أسطر التعليقات.
//
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const REPO_ROOT = join(__dirname, "..", "..");
const SRC_DIR = join(REPO_ROOT, "artifacts", "ghayth-erp", "src");
const BASELINE_FILE = join(REPO_ROOT, "scripts", "dangerous-actions-baseline.txt");

// استدعاء confirm الأصلي: `confirm(` أو `window.confirm(` بحرف صغير، مع حدّ كلمة
// قبله حتى لا يلتقط onConfirm/ recordConfirm وغيرها (التي تحمل حرفًا قبل c).
const NATIVE_CONFIRM = /(?:^|[^.\w])confirm\s*\(|window\.confirm\s*\(/;

// هل السطر تعليق (لا يُحسب كموضع حقيقي)؟
function isCommentLine(line) {
  const t = line.trim();
  return t.startsWith("//") || t.startsWith("*") || t.startsWith("/*");
}

function normalize(line) {
  return line.trim().replace(/\s+/g, " ");
}

/**
 * كاشف نقي: يرجع مواضع استدعاء confirm() الأصلي في النصّ (سطر 1-based + النصّ
 * المُطبَّع). مُصدَّر ليختبره الـ.test.mjs على نماذج بلا نظام ملفات.
 */
export function findNativeConfirms(source) {
  const hits = [];
  const lines = source.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (isCommentLine(line)) continue;
    if (NATIVE_CONFIRM.test(line)) {
      hits.push({ line: i + 1, text: normalize(line) });
    }
  }
  return hits;
}

// توقيع ثابت لا يعتمد على رقم السطر (مقاوم لإزاحة الأسطر): المسار + نصّ السطر.
export function signatureFor(relPath, normalizedText) {
  return `${relPath}\t${normalizedText}`;
}

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (name === "node_modules" || name === "dist" || name === ".vite") continue;
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) out.push(...walk(full));
    else if (/\.(tsx|ts)$/.test(name) && !/\.d\.ts$/.test(name)) out.push(full);
  }
  return out;
}

function collectCurrent() {
  const found = new Map(); // signature -> {file, line, text}
  for (const file of walk(SRC_DIR)) {
    const rel = relative(REPO_ROOT, file);
    const src = readFileSync(file, "utf8");
    for (const hit of findNativeConfirms(src)) {
      found.set(signatureFor(rel, hit.text), { file: rel, ...hit });
    }
  }
  return found;
}

function readBaseline() {
  try {
    return new Set(
      readFileSync(BASELINE_FILE, "utf8")
        .split("\n")
        .map((l) => l.replace(/\r$/, ""))
        .filter((l) => l && !l.startsWith("#")),
    );
  } catch {
    return new Set();
  }
}

function writeBaseline(found) {
  const header =
    "# أساس حارس الإجراءات الخطرة — مواضع confirm() الأصلية المجمّدة.\n" +
    "# لا يُضاف إليه يدويًا. يُحدَّث بـ: node scripts/src/check-dangerous-actions.mjs --write-baseline\n" +
    "# كل سطر: <المسار>\\t<نصّ السطر المُطبَّع>. الهدف: تقليصه لصفر بتحويلها لـ ConfirmDeleteDialog/ConfirmActionDialog.\n";
  const body = [...found.keys()].sort().join("\n");
  // كتابة متأخّرة كي لا تُستورد fs/promises إلا عند الحاجة.
  return { path: BASELINE_FILE, content: `${header}${body}\n` };
}

function main() {
  const PASS = "\x1b[32m✓\x1b[0m";
  const FAIL = "\x1b[31m✗\x1b[0m";
  const writeMode = process.argv.includes("--write-baseline");

  const found = collectCurrent();

  if (writeMode) {
    const { path, content } = writeBaseline(found);
    writeFileSync(path, content, "utf8");
    console.log(`${PASS} check-dangerous-actions: كُتب الأساس (${found.size} موضعًا) في ${relative(REPO_ROOT, path)}`);
    return 0;
  }

  const baseline = readBaseline();
  const currentSigs = new Set(found.keys());

  const fresh = [...currentSigs].filter((s) => !baseline.has(s));
  const stale = [...baseline].filter((s) => !currentSigs.has(s));

  if (stale.length) {
    console.log(`[check:dangerous-actions] ملاحظة: ${stale.length} موضع أساس لم يعد موجودًا (نُقل لـ dialog موحّد) — حدّث الأساس بـ --write-baseline:`);
    for (const s of stale.slice(0, 20)) console.log(`    - ${s.replace(/\t/, "  ·  ")}`);
  }

  if (fresh.length) {
    console.error(`\n${FAIL} check-dangerous-actions: ${fresh.length} استدعاء confirm() أصلي جديد (نمط مضادّ للإجراءات الخطرة):\n`);
    for (const s of fresh) {
      const [file, text] = s.split("\t");
      const loc = found.get(s);
      console.error(`  • ${file}:${loc?.line ?? "?"}  ${text}`);
    }
    console.error(
      `\n  استبدل نافذة المتصفّح confirm() بمكوّن التأكيد الموحّد:\n` +
        `    - حذف:   <ConfirmDeleteDialog … />  (impact-preview + blockers)\n` +
        `    - إجراء: <ConfirmActionDialog variant="destructive|caution|confirm" confirmPerm="…" />\n` +
        `  (RTL + عربي + أثر متّسق + احترام الصلاحية.)\n`,
    );
    return 1;
  }

  console.log(`${PASS} check-dangerous-actions: ${baseline.size} موضع أساس مجمّد · 0 استدعاء confirm() أصلي جديد.`);
  return 0;
}

const invokedDirectly = process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  process.exit(main());
}
