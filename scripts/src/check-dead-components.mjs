#!/usr/bin/env node
//
// scripts/src/check-dead-components.mjs
//
// حارس «المكوّنات الميتة/غير المستخدمة» — الدستور المادة 5 (لا مكوّن جديد بلا
// أصل/استخدام) + هدف «علم وجود مكوّنات ليست ذات علاقة». يكشف ملف مكوّن
// (.tsx تحت components/ أو pages/) لا يستورده أي ملف آخر في الواجهة — يتيم/ميت.
//
// بناء الكشف:
//   • نبني رسم الاستيراد لكل ملفات .ts/.tsx تحت src (بما فيها الاختبارات
//     ومسجّلات المسارات وملفات index، فأي استيراد — ولو من اختبار أو barrel أو
//     lazy(() => import("@/pages/X")) — يُحسب «استخدامًا»، تحفّظًا ضد الإيجابيات
//     الكاذبة).
//   • المرشّحون = ملفات components/**.tsx و pages/**.tsx (عدا الاختبارات).
//   • الميت = مرشّح لا يرد في مجموعة المستورَدة، وليس نقطة دخول (App/main) أو
//     ملف مسارات.
//
// نمط baseline: الأيتام الحاليون مجمّدون في scripts/dead-components-allowlist.txt
// (تقرير «العلم»)؛ يفشل الحارس فقط على يتيم **جديد** — فيبدأ أخضر ويمنع تراكم
// مكوّنات ميتة جديدة. ملاحظة: الاستيراد عبر مسار نصّي مُركَّب (نادر) قد يُظهر
// إيجابًا كاذبًا — يُضاف للأساس بسطر معلَّل.
//
import { readdir, readFile } from "node:fs/promises";
import { join, relative, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(REPO_ROOT, "artifacts/ghayth-erp/src");
const LIB = join(REPO_ROOT, "lib");
const ALLOWLIST = join(REPO_ROOT, "scripts/dead-components-allowlist.txt");
// علامة المسار من خارج SRC (kit facades في lib/* تُعيد تصدير مكوّنات التطبيق
// عبر "../../../artifacts/ghayth-erp/src/...").
const SRC_MARKER = "artifacts/ghayth-erp/src/";

// من محتوى ملف خارجي (lib/*) يرجع مسارات SRC-relative المُعاد تصديرها (دالة نقية).
// تُحسب «استيرادًا» فلا يُصنّف المكوّن الحيّ خلف الـkit يتيمًا (خلل رصده تنظيف #3007).
export function externalSrcTargets(content) {
  const out = [];
  for (const spec of extractSpecifiers(content)) {
    const i = spec.indexOf(SRC_MARKER);
    if (i >= 0) out.push(spec.slice(i + SRC_MARKER.length));
  }
  return out;
}

// نقاط دخول لا تُحسب مرشّحات (جذور الرسم) ولا تُفحص.
export const ENTRY_FILES = new Set(["App.tsx", "main.tsx"]);
// أدلّة المسارات: ملفاتها مُسجّلات تُستورد ضمنيًا من App (جذور).
export function isRouteFile(rel) {
  return /(^|\/)routes\//.test(rel) || /routes?\.tsx?$/.test(rel);
}
// مرشّح للفحص؟ (.tsx تحت components أو pages، عدا الاختبارات/نقاط الدخول)
export function isCandidate(rel) {
  if (!rel.endsWith(".tsx")) return false;
  if (rel.endsWith(".test.tsx") || rel.endsWith(".stories.tsx")) return false;
  if (ENTRY_FILES.has(rel.split("/").pop())) return false;
  if (isRouteFile(rel)) return false;
  return /(^|\/)(components|pages)\//.test(rel);
}

// إسقاط التعليقات قبل استخراج المواصفات (دالة نقية) — وإلا فإن مرجعًا معلَّقًا
// (block أو {/* … */} أو سطر فيه import) يُحسب استيرادًا فيُنجّي مكوّنًا ميتًا
// (ثغرة رصدتها مراجعة Codex على #2982). لا تمسّ http:// (الشرطة قبلها «:»).
export function stripComments(src) {
  let s = src;
  s = s.replace(/\/\*[\s\S]*?\*\//g, " ");        // تعليقات الكتل (تشمل {/* … */})
  s = s.replace(/(^|[^:])\/\/[^\n]*/g, "$1");      // تعليقات السطر (لا تمسّ ://)
  return s;
}

// استخراج المواصفات المستورَدة من ملف (دالة نقية): import …from "x"،
// export …from "x"، و dynamic import("x") (يشمل lazy(() => import("x"))).
// يُسقط التعليقات أولًا فلا يُحسب مرجع معلَّق استيرادًا.
export function extractSpecifiers(srcRaw) {
  const src = stripComments(srcRaw);
  const specs = [];
  const reFrom = /(?:^|\n)\s*(?:import|export)[\s\S]*?from\s+["']([^"']+)["']/g;
  const reSide = /(?:^|\n)\s*import\s+["']([^"']+)["']/g;
  const reDyn = /\bimport\(\s*["']([^"']+)["']\s*\)/g;
  let m;
  while ((m = reFrom.exec(src))) specs.push(m[1]);
  while ((m = reSide.exec(src))) specs.push(m[1]);
  while ((m = reDyn.exec(src))) specs.push(m[1]);
  return specs;
}

// حلّ مواصفة استيراد إلى مسار نسبي من SRC (أو null لو خارجية/غير محلولة).
// candidatesByPath: Set بأشكال المسار الممكنة (بلا/مع امتداد، وindex).
export function resolveSpecifier(spec, fromRel, knownRelSet) {
  let base;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) {
    base = relativeJoin(dirname(fromRel), spec);
  } else return null; // حزمة خارجية
  const cands = [
    base + ".tsx", base + ".ts",
    base + "/index.tsx", base + "/index.ts",
    base, // قد يكون أُدرج بامتداده
  ];
  for (const c of cands) if (knownRelSet.has(c)) return c;
  return null;
}
// ضمّ مسار نسبي بنمط POSIX داخل الرسم (دالة نقية مساعدة).
export function relativeJoin(dir, spec) {
  const parts = (dir === "." ? [] : dir.split("/")).concat(spec.split("/"));
  const out = [];
  for (const p of parts) {
    if (p === "" || p === ".") continue;
    if (p === "..") out.pop();
    else out.push(p);
  }
  return out.join("/");
}

// يحسب الأيتام من خريطة { rel -> content }. (دالة نقية، قابلة للاختبار)
// externalTargets: مسارات SRC-relative مُعاد تصديرها من خارج SRC (kit facades في
// lib/*) — تُحسب «مستوردة» فلا تُصنّف يتيمة. resolved مسبقًا (بلا/مع امتداد).
export function deadFrom(filesByRel, externalTargets = []) {
  const knownRel = new Set(Object.keys(filesByRel));
  const imported = new Set();
  for (const [rel, content] of Object.entries(filesByRel)) {
    for (const spec of extractSpecifiers(content)) {
      const r = resolveSpecifier(spec, rel, knownRel);
      if (r) imported.add(r);
    }
  }
  // إعادة التصدير من lib/* (المسار بصيغة SRC-relative؛ نحلّه لأقرب ملف معروف).
  for (const t of externalTargets) {
    for (const c of [t, t + ".tsx", t + ".ts", t + "/index.tsx", t + "/index.ts"]) {
      if (knownRel.has(c)) { imported.add(c); break; }
    }
  }
  return Object.keys(filesByRel)
    .filter((rel) => isCandidate(rel) && !imported.has(rel))
    .sort();
}

// لا نبتلع خطأ القراءة: غياب/تعذّر قراءة المصدر يجب أن يفشل الحارس مغلقًا
// (لا أن يمرّ بمسح صفر/جزئي يجعل كل المكوّنات تبدو «غير ميتة») — ملاحظة Codex.
async function collect(dir, exts, acc = []) {
  const ents = await readdir(dir, { withFileTypes: true });
  for (const e of ents) {
    const p = join(dir, e.name);
    if (e.isDirectory()) await collect(p, exts, acc);
    else if (e.isFile() && exts.some((x) => e.name.endsWith(x))) acc.push(p);
  }
  return acc;
}

// فشل مغلق: مسح صفر ملف = مصدر مفقود/مكسور. (دالة نقية قابلة للاختبار)
export function assertScannedNonEmpty(count) {
  if (count === 0) throw new Error("scanned 0 files — مصدر مفقود أو مسح مكسور (فشل مغلق)");
}

async function readBaseline() {
  try {
    const txt = await readFile(ALLOWLIST, "utf8");
    return new Set(txt.split("\n").map((l) => l.trim()).filter((l) => l && !l.startsWith("#")));
  } catch { return new Set(); }
}

async function main() {
  const files = await collect(SRC, [".ts", ".tsx"]);
  assertScannedNonEmpty(files.length);
  const filesByRel = {};
  for (const p of files) {
    const rel = relative(SRC, p).split("\\").join("/");
    filesByRel[rel] = await readFile(p, "utf8");
  }

  // مسح kit facades في lib/* لرصد المكوّنات المُعاد تصديرها (حيّة وإن لم
  // يستوردها ملف داخل SRC مباشرةً) — تفادي إيجاب كاذب على البيت الحيّ خلف الـkit.
  const externalTargets = [];
  for (const p of await collect(LIB, [".ts", ".tsx"])) {
    for (const t of externalSrcTargets(await readFile(p, "utf8"))) externalTargets.push(t);
  }

  const dead = deadFrom(filesByRel, externalTargets);
  const baseline = await readBaseline();
  const fresh = dead.filter((d) => !baseline.has(d));
  const stale = [...baseline].filter((b) => !dead.includes(b)).sort();

  if (stale.length) {
    console.log(`[check:dead-components] ملاحظة: ${stale.length} مدخل أساس لم يعد يتيمًا (رُبط/حُذف) — احذفه من الأساس:`);
    for (const s of stale) console.log(`    - ${s}`);
  }

  if (fresh.length) {
    console.error(`\n✗ check:dead-components — ${fresh.length} مكوّن يتيم جديد لا يستورده أي ملف (ميت — دستور 5):\n`);
    for (const d of fresh) console.error(`  • ${d}`);
    console.error(`\n  اربط المكوّن بمكانه الصحيح (مسار/قائمة)، أو احذفه إن كان ميتًا فعلًا (PR مستقل بشرح السبب).`);
    console.error(`  إن كان يُستورد عبر مسار نصّي مُركَّب (نادر)، أضِفه لـ scripts/dead-components-allowlist.txt بسطر معلَّل.\n`);
    process.exit(1);
  }

  const candidates = Object.keys(filesByRel).filter(isCandidate).length;
  console.log(`✓ check:dead-components — ${candidates} مكوّن مفحوص · ${baseline.size} يتيم في الأساس · 0 يتيم جديد.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
