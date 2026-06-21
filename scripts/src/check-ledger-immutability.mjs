#!/usr/bin/env node
//
// scripts/src/check-ledger-immutability.mjs
//
// حارس «حصانة الدفتر المرحّل» — دستور غيث، المادة 16 (المعمارية المالية)
// + المادة 18 (لا حذف/مسح للمحتوى المالي بعد استخدامه).
//
// المحتوى المالي لسطر القيد — المبلغ (debit/credit) والحساب
// (accountId/accountCode) — **غير قابل للتعديل بعد كتابته**. التصحيح يكون
// بـ«قيد عكسي» (reversal) عبر مسار الترحيل المعتمد، لا بـ UPDATE صامت يغيّر
// مبلغًا أو يعيد توجيه السطر إلى حساب آخر. تعديل الأبعاد (costCenterId,
// projectId, …) أو الوصف أو الحالة مسموح — تلك ليست محتوى ماليًا.
//
// الحارس يبدأ أخضر: لا يوجد في المستودع أي UPDATE يغيّر debit/credit/account
// على journal_lines (التحديث الوحيد القائم يَسِم البُعد costCenterId فقط).
// أي محاولة مستقبلية لتعديل المحتوى المالي = مخالفة دستورية تُرفض.
//
import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(REPO_ROOT, "artifacts/api-server/src");

// الجدول الذي يحمل المحتوى المالي الفعلي (المبلغ + الحساب) لكل سطر قيد.
export const FROZEN_TABLE = "journal_lines";

// الأعمدة المجمّدة بعد الترحيل — تعديلها يغيّر مبلغًا أو يعيد توجيه الحساب.
export const FROZEN_COLUMNS = ["debit", "credit", "accountId", "accountCode"];

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

// يرجع مواضع UPDATE على journal_lines تُعدّل عمودًا ماليًا مجمّدًا
// [{ line, columns, text }].
export function findLedgerMutations(source) {
  const code = stripJs(source);
  const updRe = new RegExp(`\\bUPDATE\\s+(?:public\\.)?"?${FROZEN_TABLE}"?\\b`, "gi");
  const hits = [];
  let m;
  while ((m = updRe.exec(code)) !== null) {
    // جملة SET تقع بين SET وأول FROM/WHERE/نهاية القالب.
    const rest = code.slice(m.index);
    const setM = /\bSET\b([\s\S]*?)(?:\bFROM\b|\bWHERE\b|`|;|$)/i.exec(rest);
    if (!setM) continue;
    const setClause = setM[1];
    const cols = [];
    for (const col of FROZEN_COLUMNS) {
      // إسناد للعمود (مع بادئة alias اختيارية وعلامات اقتباس)، لا مقارنة ==.
      const colRe = new RegExp(`(?:^|[,\\s(])(?:\\w+\\.)?"?${col}"?\\s*=(?!=)`, "i");
      if (colRe.test(setClause)) cols.push(col);
    }
    if (cols.length) {
      const line = code.slice(0, m.index).split("\n").length;
      hits.push({ line, columns: cols, text: source.split("\n")[line - 1]?.trim() ?? "" });
    }
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
    for (const v of findLedgerMutations(src)) {
      violations.push({ file: relative(REPO_ROOT, f), ...v });
    }
  }
  if (violations.length) {
    console.error(`\n✗ check:ledger-immutability — ${violations.length} تعديل للمحتوى المالي لسطر قيد بعد كتابته (دستور 16، 18):\n`);
    for (const v of violations) {
      console.error(`  • ${v.file}:${v.line} — UPDATE يغيّر «${v.columns.join("، ")}» على ${FROZEN_TABLE}`);
      console.error(`      ${v.text}`);
      console.error(`      المحتوى المالي محصّن — صحّح بقيد عكسي (reversal) عبر مسار الترحيل، لا بتعديل المبلغ/الحساب.\n`);
    }
    process.exit(1);
  }
  console.log(`✓ check:ledger-immutability — ${files.length} ملف مفحوص · لا تعديل للمحتوى المالي (${FROZEN_COLUMNS.join("/")}) على ${FROZEN_TABLE}.`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  main().catch((e) => { console.error(e); process.exit(1); });
}
