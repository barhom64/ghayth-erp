#!/usr/bin/env node
// generate-pages.mjs — Builds per-page Markdown sheets in modules/<module>/.
// Driven by _page-inventory.json + _buttons-by-page.json + _api-audit.json
// + _hardcoded-hits.json + _schema-by-entity.json
//
// One file per page. Pages in the same module share a folder.
// Skips routes whose module is "root" or "misc" unless --include-all is passed.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REPO = resolve(__dirname, "../../..");

const args = new Set(process.argv.slice(2));
const ONLY = [...args].filter((a) => a.startsWith("--module=")).map((a) => a.split("=")[1]);
const INCLUDE_ALL = args.has("--include-all");

const inventory = JSON.parse(readFileSync(join(__dirname, "_page-inventory.json"), "utf8"));
const buttons = JSON.parse(readFileSync(join(__dirname, "_buttons-by-page.json"), "utf8"));
const apiAudit = JSON.parse(readFileSync(join(__dirname, "_api-audit.json"), "utf8"));
const hardcoded = JSON.parse(readFileSync(join(__dirname, "_hardcoded-hits.json"), "utf8"));
const schema = JSON.parse(readFileSync(join(__dirname, "_schema-by-entity.json"), "utf8"));

// Build a method+path → endpoint index for cross-lookup
const apiIndex = new Map();
for (const e of apiAudit) {
  // Strip "/api" prefix if frontend uses it; api server doesn't have /api prefix
  const norm = e.path.replace(/^\/api/, "");
  apiIndex.set(`${e.method} ${norm}`, e);
}

function pageSlug(path) {
  return path.replace(/^\//, "").replace(/\/:?[\w-]+/g, (m) =>
    m.startsWith("/:") ? "-byid" : m
  ).replace(/\//g, "-").replace(/[^a-z0-9-]/gi, "-").toLowerCase() || "index";
}

function findEndpoint(method, path) {
  // Frontend often passes paths without /api; api server lacks /api too
  // Try direct match, then strip /api, then match prefix.
  const tries = [`${method} ${path}`, `${method} ${path.replace(/^\/api/, "")}`];
  for (const k of tries) {
    if (apiIndex.has(k)) return apiIndex.get(k);
  }
  // Last resort: ignore :id and match prefix
  const stripped = path.replace(/:[a-zA-Z0-9_]+/g, ":id").replace(/^\/api/, "");
  for (const [k, v] of apiIndex.entries()) {
    if (k.startsWith(`${method} `) && k.endsWith(stripped)) return v;
  }
  return null;
}

function badge(v) {
  return v ? "✅" : "—";
}

function buildPage(row) {
  const path = row.path;
  const b = buttons[path] || { buttons: [], apiCalls: [], lineCount: 0 };
  const hc = hardcoded[path];

  // Group api calls
  const writes = (b.apiCalls || []).filter((c) => c.method !== "GET" && c.method !== "?");
  const reads = (b.apiCalls || []).filter((c) => c.method === "GET");
  const otherFetches = (b.apiCalls || []).filter((c) => c.method === "?");

  // Resolve write calls against api-audit
  const writeRows = writes.map((c) => {
    const ep = findEndpoint(c.method, c.path);
    return { ...c, ep };
  });

  // Detect entity from path: /hr/leaves → leaves; /finance/invoices → invoices
  const entityGuess = path.split("/").filter(Boolean).slice(-1)[0]?.replace(/-create|-edit|-detail/, "") || "?";
  const schemaHit = schema[entityGuess] || schema[entityGuess + "s"] || schema[entityGuess.replace(/s$/, "")];

  const ctaTable = writeRows.length
    ? [
        "| الزر / CTA | API | Method | Audit | Event | Lifecycle | Notify | Perm | Tenant | Tx |",
        "|------------|-----|--------|-------|-------|-----------|--------|------|--------|----|",
        ...writeRows.map((w) => {
          const e = w.ep;
          if (!e) return `| _(call)_ | \`${w.path}\` | ${w.method} | 🔴 لم يُعثر على endpoint مطابق |||||||`;
          return `| _(write)_ | \`${e.path}\` | ${e.method} | ${badge(e.hasAudit)} | ${badge(e.hasEmitEvent)} | ${badge(e.hasLifecycle)} | ${badge(e.hasNotification)} | ${badge(e.hasPermission)} | ${badge(e.hasTenant)} | ${badge(e.hasTransaction)} |`;
        }),
      ].join("\n")
    : "_لا توجد طلبات كتابة من هذه الصفحة._";

  const buttonList = (b.buttons || []).slice(0, 30).map((btn) => {
    return `- L${btn.line}: "${btn.label || "(بلا تسمية)"}"${btn.onClick ? ` → \`${btn.onClick}\`` : ""}${btn.disabledHinted ? " 🔒" : ""}`;
  }).join("\n") || "_لم تُلتقط أزرار._";

  const readsList = reads.slice(0, 20).map((r) => `- GET \`${r.path}\``).join("\n") || "_لا قراءات._";

  const hcSection = hc
    ? hc.hits.map((h) => `- ⚠ L${h.line} _(${h.kind})_: \`${h.text || h.evidence || ""}\``).join("\n")
    : "✅ لا توجد بيانات وهمية ثابتة مكتشفة آلياً.";

  const schemaSection = schemaHit
    ? [
        `- الجدول: \`${schemaHit.tableName}\` (export: \`${schemaHit.exportName}\`, ${schemaHit.columnCount} عمود)`,
        `- tenant col: ${badge(schemaHit.audit.tenant)} | createdBy: ${badge(schemaHit.audit.createdBy)} | createdAt: ${badge(schemaHit.audit.createdAt)} | updatedAt: ${badge(schemaHit.audit.updatedAt)} | softDelete: ${badge(schemaHit.audit.softDelete)} | lifecycle col: ${badge(schemaHit.audit.lifecycle)}`,
        schemaHit.fks?.length ? `- FKs: ${schemaHit.fks.map((f) => `${f.to}.${f.col}`).join(", ")}` : "",
      ].filter(Boolean).join("\n")
    : `_لم يتم العثور على جدول Drizzle بالاسم المستنبط \`${entityGuess}\` — قد يكون معرّفًا في migrations فقط (راجع \`artifacts/api-server/src/migrations\`)._`;

  return `# ${path} — \`${row.sourceFile || row.componentName || "?"}\`

## 1. الميتاداتا
- المسار: \`${path}\`
- ملف الصفحة: \`${row.sourceFile || "—"}\`
- مسجّلة في: \`${row.routeFile}:${row.routeLine}\`
- المجموعة: \`${row.module}\`
- الكومبوننت: \`${row.componentName || "—"}\`
- subKey: ${row.subKey ? `\`${row.subKey}\`` : "—"} | minRoleLevel: ${row.minRoleLevel ?? "—"}
- الكيان المستنبط: \`${entityGuess}\`
- سطور الملف: ${b.lineCount}
- مصدر موجود: ${badge(row.sourceFileExists !== false)}

## 2. الأزرار والإجراءات
${ctaTable}

### تفاصيل الأزرار المرئية
${buttonList}

### القراءات (GET)
${readsList}

${otherFetches.length ? `### استدعاءات fetch خام (تحتاج مراجعة يدوية)\n${otherFetches.map((f) => `- \`${f.path}\``).join("\n")}` : ""}

## 3. الحركات ذات الصلة (Cross-Module Transactions)
- [ ] **TBD** — راجع \`docs/blueprints/${row.module}.md\` (إن وُجد) وعدّد:
  - القيود المحاسبية المتوقعة (gl_entries / posting-failures)
  - تأثير الأرصدة (balances, balances_history)
  - الإشعارات (notifications)
  - سير الموافقات (approval_chains)
  - تكامل خارجي (ZATCA / Mudad / WPS / Government)
- يتم تعبئتها يدوياً في مرحلة المراجعة المعزّزة.

## 4. النمذجة
${schemaSection}

## 5. البيانات الوهمية الثابتة
${hcSection}

## 6. النتيجة (Verdict)
- Runtime audit: **TBD** — راجع \`audit/runtime-audit-results.json\` (\`${path}\`)
- توصية: **TBD**
- المشاكل: ${(hc?.hits.length || 0) + writeRows.filter((w) => !w.ep).length} مدخل آلي. أضِفها إلى \`audit/system-review/findings/FINDINGS.csv\`.
`;
}

// ---- main ----
const wave1Modules = new Set(["finance", "hr", "governance"]);
const filtered = inventory.filter((r) => {
  if (ONLY.length) return ONLY.includes(r.module);
  if (INCLUDE_ALL) return true;
  return wave1Modules.has(r.module);
});

// Preserve human-authored §3 (Cross-Module Transactions). If the existing
// sheet has a §3 that has been hand-filled (any content other than the TBD
// template), we splice it back in so manual research isn't clobbered on
// every rerun. Detection: the auto-template's first content line starts
// with "- [ ] **TBD**".
function extractSection3(existing) {
  if (!existing) return null;
  const m = existing.match(/## 3\. الحركات ذات الصلة[^\n]*\n([\s\S]*?)\n## 4\./);
  if (!m) return null;
  const body = m[1].trim();
  if (body.startsWith("- [ ] **TBD**")) return null; // still the template
  return body;
}

function splice(generated, customSec3) {
  if (!customSec3) return generated;
  return generated.replace(
    /(## 3\. الحركات ذات الصلة[^\n]*\n)[\s\S]*?(\n## 4\.)/,
    `$1${customSec3}\n$2`
  );
}

const stats = { written: 0, preserved: 0, byModule: {} };
for (const row of filtered) {
  const folder = join(ROOT, "modules", row.module);
  mkdirSync(folder, { recursive: true });
  const slug = pageSlug(row.path);
  const file = join(folder, `${slug}.md`);
  const existing = existsSync(file) ? readFileSync(file, "utf8") : null;
  const customSec3 = extractSection3(existing);
  const generated = buildPage(row);
  writeFileSync(file, splice(generated, customSec3));
  stats.written++;
  if (customSec3) stats.preserved++;
  stats.byModule[row.module] = (stats.byModule[row.module] || 0) + 1;
}

console.log(`generate-pages: ${stats.written} files written, ${stats.preserved} §3 hand-filled preserved`);
for (const [m, n] of Object.entries(stats.byModule)) console.log(`  ${m.padEnd(16)} ${n}`);
