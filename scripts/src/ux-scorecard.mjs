#!/usr/bin/env node
//
// scripts/src/ux-scorecard.mjs
//
// بطاقة قياس بوابة قبول تجربة المستخدم — نظام غيث.
// (يكمّل docs/ux/UX_ACCEPTANCE_GATE.md و CLAUDE.md: العربية أولًا، كل إجراء له أثر.)
//
// فحص ثابت سريع بلا تبعيات ولا قاعدة بيانات: يتحقق من أن أساس بوابة UX سليم
// ومتسق بنيويًا قبل الدمج — فلا تتسرّب البوابة كوثيقة ميتة. الرحلة المتصفّحية
// الفعلية (`@ux-gate`) تعمل داخل وظيفة `e2e` الحالية لأنها داخل e2e/tests.
//
// ما يفحصه (موانع — أي خرق ⇒ خروج 1):
//   1. اكتمال وثائق البوابة الأربع تحت docs/ux/.
//   2. وجود اختبار e2e/tests/ux-acceptance-gate.spec.ts ووسمه @ux-gate و @mobile.
//   3. تطابق قائمة الرحلات الحرجة بين الاختبار ومصفوفة UX_TEST_MATRIX.md (منع الانجراف).
//   4. أوزان بطاقة القياس في UX_SCORECARD.md تجمع 100 بالضبط.
//
import { readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));

export const REQUIRED_DOCS = [
  "docs/ux/UX_ACCEPTANCE_GATE.md",
  "docs/ux/UX_SCORECARD.md",
  "docs/ux/UX_TEST_MATRIX.md",
  "docs/ux/FINAL_UX_REPORT_TEMPLATE.md",
];

export const SPEC_PATH = "e2e/tests/ux-acceptance-gate.spec.ts";
export const MATRIX_PATH = "docs/ux/UX_TEST_MATRIX.md";
export const SCORECARD_PATH = "docs/ux/UX_SCORECARD.md";

// يستخرج مصفوفة DEFAULT_CRITICAL_ROUTES من نصّ اختبار البوابة. دالة نقية.
export function parseSpecRoutes(specSource) {
  const block = specSource.match(/DEFAULT_CRITICAL_ROUTES\s*=\s*\[([\s\S]*?)\]/);
  if (!block) return [];
  return [...block[1].matchAll(/["']([^"']+)["']/g)].map((m) => m[1]);
}

// يستخرج قائمة "Automated route smoke list" من مصفوفة الرحلات. دالة نقية.
export function parseMatrixRoutes(matrixSource) {
  const section = matrixSource.match(/Automated route smoke list([\s\S]*?)(?:\n##\s|$)/);
  if (!section) return [];
  return [...section[1].matchAll(/^- +`([^`]+)`/gm)].map((m) => m[1]);
}

// يقارن قائمتي مسارات ويرجع الفروقات في الاتجاهين. دالة نقية.
export function diffRoutes(specRoutes, matrixRoutes) {
  const inSpec = new Set(specRoutes);
  const inMatrix = new Set(matrixRoutes);
  return {
    missingFromMatrix: specRoutes.filter((r) => !inMatrix.has(r)),
    missingFromSpec: matrixRoutes.filter((r) => !inSpec.has(r)),
  };
}

// يجمع أوزان جدول بطاقة القياس (آخر عمود رقمي في كل صف). دالة نقية.
export function sumScorecardWeights(scorecardSource) {
  const weights = [];
  for (const line of scorecardSource.split("\n")) {
    // صفوف الجدول التي تنتهي بوزن رقمي، مع تجاهل صف الإجمالي (يحمل ** أو الكلمة).
    const m = line.match(/^\|[^|]+\|\s*(\d+)\s*\|\s*$/);
    if (m && !/إجمالي|الإجمالي|Total/i.test(line)) weights.push(Number(m[1]));
  }
  return weights.reduce((a, b) => a + b, 0);
}

async function readRepo(rel) {
  return readFile(join(REPO_ROOT, rel), "utf8");
}

async function main() {
  const problems = [];
  const notes = [];

  // 1) اكتمال الوثائق.
  let presentDocs = 0;
  for (const doc of REQUIRED_DOCS) {
    try {
      await readRepo(doc);
      presentDocs += 1;
    } catch {
      problems.push(`وثيقة بوابة ناقصة: ${doc}`);
    }
  }

  // 2) وجود الاختبار ووسومه.
  let specSource = "";
  try {
    specSource = await readRepo(SPEC_PATH);
  } catch {
    problems.push(`اختبار البوابة غير موجود: ${SPEC_PATH}`);
  }
  if (specSource) {
    if (!specSource.includes("@ux-gate")) problems.push(`الاختبار ${SPEC_PATH} لا يحمل الوسم @ux-gate`);
    if (!specSource.includes("@mobile")) problems.push(`الاختبار ${SPEC_PATH} لا يحمل وسم الجوال @mobile`);
    // منع النجاح الكاذب: يجب أن يرفض الاختبار صفحات fallback (غير موجودة / غير مصرح)
    // وإلا اعتبر صفحة محظورة عربية RTL نجاحًا. (حارس ضد ارتداد هذا الإصلاح.)
    if (!specSource.includes("FALLBACK_PAGE_PATTERNS") || !specSource.includes("الصفحة غير موجودة")) {
      problems.push(`الاختبار ${SPEC_PATH} لا يرفض صفحات fallback (غير موجودة/غير مصرح) — خطر نجاح كاذب`);
    }
  }

  // 3) تطابق الرحلات الحرجة بين الاختبار والمصفوفة.
  let specRoutes = [];
  let matrixRoutes = [];
  if (specSource) specRoutes = parseSpecRoutes(specSource);
  try {
    matrixRoutes = parseMatrixRoutes(await readRepo(MATRIX_PATH));
  } catch {
    /* عُولج كوثيقة ناقصة أعلاه */
  }
  if (specRoutes.length === 0 && specSource) problems.push(`تعذّر استخراج الرحلات الحرجة من ${SPEC_PATH}`);
  if (specRoutes.length && matrixRoutes.length) {
    const { missingFromMatrix, missingFromSpec } = diffRoutes(specRoutes, matrixRoutes);
    for (const r of missingFromMatrix) problems.push(`الرحلة ${r} في الاختبار لكنها غير مذكورة في ${MATRIX_PATH}`);
    for (const r of missingFromSpec) problems.push(`الرحلة ${r} في المصفوفة لكنها غير مغطّاة في ${SPEC_PATH}`);
  }

  // 4) أوزان بطاقة القياس تجمع 100.
  let weightTotal = 0;
  try {
    weightTotal = sumScorecardWeights(await readRepo(SCORECARD_PATH));
    if (weightTotal !== 100) problems.push(`مجموع أوزان ${SCORECARD_PATH} = ${weightTotal} (المطلوب 100)`);
  } catch {
    /* عُولج كوثيقة ناقصة أعلاه */
  }

  // طباعة البطاقة.
  console.log("بطاقة قياس بوابة قبول تجربة المستخدم — نظام غيث");
  console.log("──────────────────────────────────────────────");
  console.log(`الوثائق المرجعية   : ${presentDocs}/${REQUIRED_DOCS.length} موجودة`);
  console.log(`اختبار @ux-gate    : ${specSource ? "موجود" : "مفقود"}`);
  console.log(`الرحلات الحرجة     : ${specRoutes.length} في الاختبار · ${matrixRoutes.length} في المصفوفة`);
  console.log(`مجموع أوزان القياس : ${weightTotal}/100`);
  for (const n of notes) console.log(`  ملاحظة: ${n}`);
  console.log("──────────────────────────────────────────────");

  if (problems.length) {
    console.error(`\n✗ ux-scorecard — ${problems.length} خرق في أساس بوابة UX:\n`);
    for (const p of problems) console.error(`  • ${p}`);
    console.error(`\n  راجع docs/ux/UX_ACCEPTANCE_GATE.md وأصلح الانجراف قبل الدمج.\n`);
    process.exit(1);
  }

  console.log("✓ ux-scorecard — أساس بوابة UX مكتمل ومتسق (وثائق + اختبار + رحلات + أوزان).");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => {
    console.error(`✗ ux-scorecard — خطأ غير متوقع: ${e.message}`);
    process.exit(1);
  });
}
