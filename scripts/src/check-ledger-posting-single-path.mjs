#!/usr/bin/env node
//
// scripts/src/check-ledger-posting-single-path.mjs
//
// حارس «مسار ترحيل واحد للدفتر» — دستور غيث، المادة 9 (مصدر الحقيقة الواحد)
// + المادة 16 (المعمارية المالية) + عقد الأبعاد (assertLedgerTruth).
//
// أي `INSERT INTO journal_entries|journal_lines` يجب أن يمرّ حصرًا عبر خدمة
// الترحيل المعتمدة (gl/posting.ts و businessHelpers.createJournalEntry وما
// يفوّض إليها). أي كتابة مباشرة للدفتر من route أو محرك مسار تتجاوز عقد
// الأبعاد واشتقاق الحساب = مخالفة دستورية تُرفض. الحارس يبدأ أخضر (كل الكتابات
// الحالية داخل الملفات المعتمدة) ويمسك أي تجاوز مستقبلي.
//
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(REPO_ROOT, "artifacts/api-server/src");

// الملفات الوحيدة المسموح لها بالكتابة المباشرة على جداول الدفتر (مسار الترحيل).
export const ALLOWED_FILES = new Set([
  "artifacts/api-server/src/lib/gl/posting.ts",
  "artifacts/api-server/src/lib/businessHelpers.ts",
  "artifacts/api-server/src/lib/engines/financialEngine.ts",
]);

export const LEDGER_TABLES = ["journal_entries", "journal_lines"];

// يحيّد تعليقات JS فقط، ويُبقي محتوى السلاسل/الـ templates (حيث SQL الفعلي).
export function stripJs(src) {
  let out = "";
  let st = null;
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

// يرجع مواضع INSERT INTO على جداول الدفتر [{ line, table, text }].
export function findLedgerInserts(source) {
  const code = stripJs(source);
  const re = new RegExp(`\\bINSERT\\s+INTO\\s+(?:public\\.)?"?(${LEDGER_TABLES.join("|")})\\b`, "gi");
  const hits = [];
  let m;
  while ((m = re.exec(code)) !== null) {
    const line = code.slice(0, m.index).split("\n").length;
    hits.push({ line, table: m[1].toLowerCase(), text: source.split("\n")[line - 1]?.trim() ?? "" });
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
    const rel = relative(REPO_ROOT, f);
    if (ALLOWED_FILES.has(rel)) continue; // الملفات المعتمدة مستثناة.
    const src = await readFile(f, "utf8");
    for (const v of findLedgerInserts(src)) {
      violations.push({ file: rel, ...v });
    }
  }
  if (violations.length) {
    console.error(`\n✗ check:ledger-posting-single-path — ${violations.length} كتابة مباشرة على الدفتر خارج مسار الترحيل (دستور 9، 16):\n`);
    for (const v of violations) {
      console.error(`  • ${v.file}:${v.line} — INSERT مباشر على «${v.table}» يتجاوز خدمة الترحيل`);
      console.error(`      ${v.text}`);
      console.error(`      رحّل عبر postJournalEntry / createJournalEntry (تُطبّق عقد الأبعاد واشتقاق الحساب)، لا INSERT مباشر.\n`);
    }
    process.exit(1);
  }
  console.log(`✓ check:ledger-posting-single-path — ${files.length} ملف مفحوص · كل كتابات الدفتر عبر مسار الترحيل المعتمد (${ALLOWED_FILES.size} ملفات).`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
