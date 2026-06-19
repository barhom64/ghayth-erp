#!/usr/bin/env node
//
// scripts/src/check-ledger-no-physical-delete.mjs
//
// حارس «منع الحذف الفيزيائي على الدفتر المحاسبي» — دستور غيث، المواد 16–18.
//
// لا يجوز أبدًا حذف قيد أو سطر قيد أو حساب من الدفتر فيزيائيًا (DELETE FROM).
// الأصل التعطيل/الإلغاء المنطقي، والدفتر ثابت لا يُمحى. أي `DELETE FROM` على
// جدول من جداول الدفتر في كود الخادم (خارج migrations) = مخالفة دستورية حرجة
// تُرفض. الحارس يبدأ أخضر (صفر مخالفات حاليًا) ويمسك أي محاولة مستقبلية.
//
// النطاق: artifacts/api-server/src/**.ts ما عدا /migrations/ (الهجرات عمليات
// مخطط لمرة واحدة، خارج التشغيل اليومي). التعليقات والسلاسل النصية تُحيَّد قبل
// الفحص فلا تُحسب مطابقة داخل تعليق أو نص.
//
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(REPO_ROOT, "artifacts/api-server/src");

// جداول الدفتر المُرحَّل الثابتة التي يُمنع حذف صفوفها فيزيائيًا (المواد 16–18).
// ملاحظة: جداول القوالب (journal_entry_templates / _template_lines) مستثناة
// عمدًا — فهي إعدادات قابلة للتحرير بالاستبدال (طبقة 2 من تصنيف البيانات)، لا
// الدفتر المُرحَّل. المحروس هنا: القيود وأسطرها، دليل الحسابات، والأرصدة.
export const LEDGER_TABLES = [
  "journal_entries",
  "journal_lines",
  "chart_of_accounts",
  "general_ledger",
  "account_balances",
];

// يحيّد **تعليقات JS فقط** (سطرية وكتلية) بمسافات، مع الإبقاء على محتوى
// السلاسل و template literals — لأن استعلامات SQL تعيش داخلها (rawExecute(`…`)).
// يتتبّع حالة السلسلة/التمبلت ليميّز `//` التعليق عن `//` داخل نص.
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
    // داخل سلسلة/تمبلت: نُبقي المحتوى كما هو (هنا يقع الـ SQL).
    if (st === "sq") { out += ch; if (ch === "\\") { out += nx ?? ""; i++; } else if (ch === "'") st = null; continue; }
    if (st === "dq") { out += ch; if (ch === "\\") { out += nx ?? ""; i++; } else if (ch === '"') st = null; continue; }
    if (st === "tpl") { out += ch; if (ch === "\\") { out += nx ?? ""; i++; } else if (ch === "`") st = null; continue; }
  }
  return out;
}

// يرجع قائمة المخالفات [{ line, table, text }] في مصدر ملف واحد.
export function findLedgerDeletes(source) {
  const code = stripJs(source);
  const tableAlt = LEDGER_TABLES.join("|");
  // DELETE FROM [public.]"?<ledger_table>  — حساس لحالة الأحرف عبر i.
  const re = new RegExp(`\\bDELETE\\s+FROM\\s+(?:public\\.)?"?(${tableAlt})\\b`, "gi");
  const hits = [];
  let m;
  while ((m = re.exec(code)) !== null) {
    const line = code.slice(0, m.index).split("\n").length;
    hits.push({ line, table: m[1], text: source.split("\n")[line - 1]?.trim() ?? "" });
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
    for (const v of findLedgerDeletes(src)) {
      violations.push({ file: relative(REPO_ROOT, f), ...v });
    }
  }
  if (violations.length) {
    console.error(`\n✗ check:ledger-no-physical-delete — ${violations.length} مخالفة (دستور غيث، المواد 16–18):\n`);
    for (const v of violations) {
      console.error(`  • ${v.file}:${v.line} — DELETE فيزيائي على جدول الدفتر «${v.table}»`);
      console.error(`      ${v.text}`);
      console.error(`      الدفتر لا يُمحى — استخدم التعطيل/الإلغاء المنطقي (status/reversal)، لا الحذف الفيزيائي.\n`);
    }
    process.exit(1);
  }
  console.log(`✓ check:ledger-no-physical-delete — ${files.length} ملف مفحوص · صفر حذف فيزيائي على جداول الدفتر (${LEDGER_TABLES.length} جدولًا محروسًا).`);
}

// شغّل main فقط عند التنفيذ المباشر، لا عند الاستيراد من الاختبار.
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
