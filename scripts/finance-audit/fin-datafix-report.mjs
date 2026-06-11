#!/usr/bin/env node
//
// fin-datafix-report.mjs  (#2090 / FIN-DATAFIX — READ ONLY)
//
// Runs scripts/finance-audit/fin_datafix_subsidiary_parent_audit.sql against
// $DATABASE_URL and prints the suspect subsidiary accounts (opened under the
// wrong control parent by the pre-#2070 code) as a table + a severity summary,
// and writes a timestamped markdown report under docs/finance-audit/findings/.
//
// It is STRICTLY READ ONLY: it executes only the audit SELECT — it NEVER
// writes, re-parents, or touches balances. Use it to produce the report the
// owner reviews BEFORE any correction is planned (#2090 scope: report only).
//
// Usage:
//   DATABASE_URL=postgres://… node scripts/finance-audit/fin-datafix-report.mjs
//
import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(HERE, "../..");
const SQL = readFileSync(join(HERE, "fin_datafix_subsidiary_parent_audit.sql"), "utf8");

// Defensive: refuse to run anything that isn't a single read-only SELECT/WITH.
if (/\b(insert|update|delete|alter|drop|truncate|create|grant|revoke)\b/i.test(
  SQL.replace(/--.*$/gm, "").replace(/createSubsidiaryAccountsForEntity/g, "")
)) {
  console.error("[fin-datafix] refusing to run — the audit SQL contains a write keyword.");
  process.exit(2);
}

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("[fin-datafix] DATABASE_URL is required.");
  process.exit(1);
}

const client = new pg.Client({ connectionString: DATABASE_URL });
await client.connect();
// Belt-and-braces: a read-only transaction so the DB itself rejects any write.
await client.query("BEGIN TRANSACTION READ ONLY");
let rows;
try {
  ({ rows } = await client.query(SQL));
} finally {
  await client.query("ROLLBACK");
  await client.end();
}

const bySeverity = { high: 0, medium: 0, low: 0 };
const byDisposition = { auto_fixable: 0, needs_finance_review: 0 };
for (const r of rows) {
  bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
  byDisposition[r.disposition] = (byDisposition[r.disposition] ?? 0) + 1;
}

console.log(`\n[fin-datafix] subsidiary-account wrong-parent audit — ${rows.length} suspect(s)`);
console.log(`  severity:    high=${bySeverity.high}  medium=${bySeverity.medium}  low=${bySeverity.low}`);
console.log(`  disposition: auto_fixable=${byDisposition.auto_fixable}  needs_finance_review=${byDisposition.needs_finance_review}\n`);
if (rows.length > 0) console.table(rows);

// Markdown report for the owner's review.
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const outDir = join(REPO_ROOT, "docs/finance-audit/findings");
mkdirSync(outDir, { recursive: true });
const md = [
  `# FIN-DATAFIX — تقرير حصر الحسابات الفرعية تحت أصل خاطئ (read-only)`,
  ``,
  `> #2090 · مُولَّد: ${new Date().toISOString()} · القاعدة: \`${DATABASE_URL.replace(/:[^:@/]*@/, ":***@")}\``,
  `> **read-only** — لا تعديل بيانات ولا نقل ولا تصحيح أرصدة. يُعرض على المالك قبل أي تصحيح.`,
  ``,
  `## الملخص`,
  `- إجمالي المشتبه بها: **${rows.length}**`,
  `- الخطورة: high=${bySeverity.high} · medium=${bySeverity.medium} · low=${bySeverity.low}`,
  `- التصرف: auto_fixable=${byDisposition.auto_fixable} · needs_finance_review=${byDisposition.needs_finance_review}`,
  ``,
  `## التفاصيل`,
  rows.length === 0
    ? `لا حسابات فرعية مشتبه بها على هذه القاعدة. (قاعدة نظيفة بعد #2070 لا تحوي صفوفًا قديمة.)`
    : [
        `| الحساب | الأصل الحالي | الأصل الصحيح المقترح | الكيان | الرصيد | قيود | مُرحَّلة | السبب | الخطورة | التصرف |`,
        `|---|---|---|---|--:|--:|--:|---|---|---|`,
        ...rows.map((r) =>
          `| ${r.account} | ${r.current_parent} | ${r.proposed_correct_parent} | ${r.entity} | ${r.current_balance} | ${r.linked_lines} | ${r.posted_lines} | ${r.suspicion_reason} | ${r.severity} | ${r.disposition} |`),
      ].join("\n"),
  ``,
  `## القاعدة`,
  `- \`auto_fixable\`: رصيد صفر وبلا قيود مُرحَّلة → يصلح لإعادة ربط آلية (إعادة تصنيف بحتة) **بعد موافقتك**.`,
  `- \`needs_finance_review\`: عليه رصيد أو قيود مُرحَّلة → يحتاج قيد تحويل رصيد + مراجعة مالية، لا إعادة ربط مباشرة.`,
  `- لم يُعدَّل أي شيء. التصحيح (PR منفصل) لا يبدأ إلا بموافقتك على هذا الحصر.`,
  ``,
].join("\n");
const outFile = join(outDir, `FIN-DATAFIX_subsidiary_parent_report_${stamp}.md`);
writeFileSync(outFile, md);
console.log(`[fin-datafix] markdown report → ${outFile.replace(REPO_ROOT + "/", "")}`);
