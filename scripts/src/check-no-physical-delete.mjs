#!/usr/bin/env node
//
// scripts/src/check-no-physical-delete.mjs
//
// حارس «منع الحذف الفيزيائي» — دستور غيث، المادة 18 (+ سلامة الدفتر 16–17).
//
// الأصل التعطيل/الأرشفة/الإلغاء المنطقي. يُمنع الحذف الفيزيائي (DELETE FROM)
// للبيانات التشغيلية أو التعاقدية أو المالية بعد استخدامها. أي `DELETE FROM`
// على جدول محروس في كود الخادم (خارج migrations) = مخالفة دستورية تُرفض.
// الحارس يبدأ أخضر (صفر مخالفات حاليًا) ويمسك أي محاولة مستقبلية.
//
// النطاق: artifacts/api-server/src/**.ts ما عدا /migrations/ (عمليات مخطط لمرة
// واحدة). التعليقات تُحيَّد قبل الفحص؛ محتوى السلاسل/الـ templates يُبقى لأن SQL
// الفعلي يعيش داخل rawExecute(`…`). جداول القوالب/الإعدادات/التقنية مستثناة عمدًا.
//
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(REPO_ROOT, "artifacts/api-server/src");

// الجداول المحروسة مجمَّعة حسب التصنيف الدستوري. كل جدول هنا تُعطَّل صفوفه أو
// تُلغى منطقيًا، لا تُحذف فيزيائيًا. (جميعها صفر حذف حاليًا — الحارس يبدأ أخضر.)
export const PROTECTED_GROUPS = {
  // الدفتر المُرحَّل الثابت (مادة 16–18). القوالب مستثناة (إعدادات قابلة للتحرير).
  "الدفتر المحاسبي": [
    "journal_entries", "journal_lines", "chart_of_accounts",
    "general_ledger", "account_balances",
  ],
  // مالية/تعاقدية ثابتة بعد الإصدار/الإنشاء (مادة 18، تصنيف تعاقدي).
  "مالي/تعاقدي": ["invoices", "payments", "contracts", "legal_cases"],
  // الكيانات الجذرية التشغيلية (مادة 11 + 18): تُعطَّل لا تُحذف.
  "كيان جذري تشغيلي": [
    "employees", "clients", "suppliers", "vendors",
    "properties", "vehicles", "projects", "payroll_runs",
  ],
};

// خريطة جدول → مجموعته، وقائمة مسطّحة بكل المحروس.
export const TABLE_GROUP = Object.fromEntries(
  Object.entries(PROTECTED_GROUPS).flatMap(([g, ts]) => ts.map((t) => [t, g])),
);
export const PROTECTED_TABLES = Object.keys(TABLE_GROUP);

// يحيّد **تعليقات JS فقط** (سطرية وكتلية) بمسافات، مع الإبقاء على محتوى
// السلاسل و template literals — لأن استعلامات SQL تعيش داخلها (rawExecute(`…`)).
export function stripJs(src) {
  let out = "";
  let st = null; // line | block | sq | dq | tpl
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const nx = src[i + 1];
    if (st === null) {
      if (ch === "/" && nx === "/") { st = "line"; out += "  "; i++; continue; }
      if (ch === "/" && nx === "*") { st = "block"; out += "  "; i++; continue; }
      if (ch === "'") { st = "sq"; out += ch; continue; }
      if (ch === '"') { st = "dq"; out += ch; continue; }
      if (ch === "`") { st = "tpl"; out += ch; continue; }
      out += ch; continue;
    }
    if (st === "line") { if (ch === "\n") { st = null; out += "\n"; } else out += " "; continue; }
    if (st === "block") { if (ch === "*" && nx === "/") { st = null; out += "  "; i++; } else out += ch === "\n" ? "\n" : " "; continue; }
    if (st === "sq") { out += ch; if (ch === "\\") { out += nx ?? ""; i++; } else if (ch === "'") st = null; continue; }
    if (st === "dq") { out += ch; if (ch === "\\") { out += nx ?? ""; i++; } else if (ch === '"') st = null; continue; }
    if (st === "tpl") { out += ch; if (ch === "\\") { out += nx ?? ""; i++; } else if (ch === "`") st = null; continue; }
  }
  return out;
}

// يرجع مخالفات الحذف الفيزيائي [{ line, table, group, text }] في مصدر ملف واحد.
export function findPhysicalDeletes(source) {
  const code = stripJs(source);
  const re = new RegExp(`\\bDELETE\\s+FROM\\s+(?:public\\.)?"?(${PROTECTED_TABLES.join("|")})\\b`, "gi");
  const hits = [];
  let m;
  while ((m = re.exec(code)) !== null) {
    const table = m[1].toLowerCase();
    const line = code.slice(0, m.index).split("\n").length;
    hits.push({ line, table, group: TABLE_GROUP[table], text: source.split("\n")[line - 1]?.trim() ?? "" });
  }
  return hits;
}

async function walk(dir) {
  const out = [];
  let entries;
  try { entries = await readdir(dir, { withFileTypes: true }); } catch { return out; }
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "migrations" || e.name === "node_modules") continue;
      out.push(...await walk(p));
    } else if (e.name.endsWith(".ts") && !e.name.endsWith(".d.ts")) {
      out.push(p);
    }
  }
  return out;
}

async function main() {
  const files = await walk(SRC);
  const violations = [];
  for (const f of files) {
    const src = await readFile(f, "utf8");
    for (const v of findPhysicalDeletes(src)) {
      violations.push({ file: relative(REPO_ROOT, f), ...v });
    }
  }
  if (violations.length) {
    console.error(`\n✗ check:no-physical-delete — ${violations.length} مخالفة (دستور غيث، المادة 18):\n`);
    for (const v of violations) {
      console.error(`  • ${v.file}:${v.line} — DELETE فيزيائي على «${v.table}» (${v.group})`);
      console.error(`      ${v.text}`);
      console.error(`      لا يُحذف فيزيائيًا — استخدم التعطيل/الأرشفة/الإلغاء المنطقي (status/deletedAt/reversal).\n`);
    }
    process.exit(1);
  }
  console.log(`✓ check:no-physical-delete — ${files.length} ملف مفحوص · صفر حذف فيزيائي على ${PROTECTED_TABLES.length} جدولًا محروسًا (${Object.keys(PROTECTED_GROUPS).length} مجموعات).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
