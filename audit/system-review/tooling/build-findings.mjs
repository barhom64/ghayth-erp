#!/usr/bin/env node
// build-findings.mjs — Read-only.
// Aggregates issues from all _*.json artifacts into:
//   findings/FINDINGS.csv         — one row per issue
//   findings/hardcoded-data.md    — by page
//   findings/orphan-buttons.md    — buttons whose onClick can't be tied to API
//   findings/broken-integrations.md - write CTAs without matching endpoint
//   findings/modeling-gaps.md     - tables missing audit columns

import { readFileSync, writeFileSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const inv = JSON.parse(readFileSync(join(__dirname, "_page-inventory.json"), "utf8"));
const buttons = JSON.parse(readFileSync(join(__dirname, "_buttons-by-page.json"), "utf8"));
const apiAudit = JSON.parse(readFileSync(join(__dirname, "_api-audit.json"), "utf8"));
const hardcoded = JSON.parse(readFileSync(join(__dirname, "_hardcoded-hits.json"), "utf8"));
const schema = JSON.parse(readFileSync(join(__dirname, "_schema-by-entity.json"), "utf8"));

const apiIdx = new Map();
for (const e of apiAudit) {
  apiIdx.set(`${e.method} ${e.path.replace(/^\/api/, "")}`, e);
}
function findEp(method, path) {
  const norm = path.replace(/^\/api/, "");
  if (apiIdx.has(`${method} ${norm}`)) return apiIdx.get(`${method} ${norm}`);
  const stripped = norm.replace(/:[a-zA-Z0-9_]+/g, ":id");
  for (const [k, v] of apiIdx.entries()) {
    if (k === `${method} ${stripped}`) return v;
  }
  return null;
}

const rows = [];
const orphanButtons = {};
const brokenIntegrations = {};

for (const r of inv) {
  const b = buttons[r.path];
  if (!b) continue;

  // Writes without matching endpoint
  for (const c of b.apiCalls || []) {
    if (c.method === "GET" || c.method === "?") continue;
    const ep = findEp(c.method, c.path);
    if (!ep) {
      rows.push({
        module: r.module,
        page: r.path,
        severity: "high",
        category: "broken-integration",
        evidence: `${b.sourceFile}: ${c.method} ${c.path} not found in api-server routes`,
      });
      brokenIntegrations[r.path] = brokenIntegrations[r.path] || [];
      brokenIntegrations[r.path].push(c);
    } else {
      // Endpoint exists but missing audit/permission/tenant on a write
      if (!ep.hasAudit) {
        rows.push({
          module: r.module,
          page: r.path,
          severity: "medium",
          category: "missing-audit",
          evidence: `${ep.file}:${ep.line} ${ep.method} ${ep.path}`,
        });
      }
      if (!ep.hasPermission) {
        rows.push({
          module: r.module,
          page: r.path,
          severity: "high",
          category: "missing-permission",
          evidence: `${ep.file}:${ep.line} ${ep.method} ${ep.path}`,
        });
      }
      if (!ep.hasTenant) {
        rows.push({
          module: r.module,
          page: r.path,
          severity: "high",
          category: "missing-tenant-scope",
          evidence: `${ep.file}:${ep.line} ${ep.method} ${ep.path}`,
        });
      }
    }
  }

  // Buttons with no onClick and no API call nearby
  for (const btn of b.buttons || []) {
    if (!btn.onClick && !btn.label) continue;
    if (!btn.onClick && (b.apiCalls || []).length === 0) {
      // probably dead button
      if (btn.label && !/إلغاء|رجوع|إغلاق|Cancel|Close|Back/i.test(btn.label)) {
        rows.push({
          module: r.module,
          page: r.path,
          severity: "low",
          category: "orphan-button",
          evidence: `${b.sourceFile}:${btn.line} "${btn.label}"`,
        });
        orphanButtons[r.path] = orphanButtons[r.path] || [];
        orphanButtons[r.path].push(btn);
      }
    }
  }

  // Hardcoded data
  const hc = hardcoded[r.path];
  if (hc) {
    for (const h of hc.hits) {
      rows.push({
        module: r.module,
        page: r.path,
        severity: h.kind === "inline-data-array" || h.kind === "mock-array" ? "high" : "medium",
        category: `hardcoded-${h.kind}`,
        evidence: `${hc.sourceFile}:${h.line} ${h.text?.slice(0, 80) || h.evidence || ""}`,
      });
    }
  }
}

// Modeling gaps
for (const [name, t] of Object.entries(schema)) {
  if (!t.audit.tenant) {
    rows.push({
      module: "schema",
      page: name,
      severity: "high",
      category: "modeling-no-tenant",
      evidence: `lib/db/src/schema/index.ts: table ${name} has no tenant column`,
    });
  }
  if (!t.audit.createdAt) {
    rows.push({
      module: "schema",
      page: name,
      severity: "medium",
      category: "modeling-no-createdAt",
      evidence: `lib/db/src/schema/index.ts: table ${name} has no createdAt`,
    });
  }
}

// Write CSV
const header = "module,page,severity,category,evidence";
const csv = [header, ...rows.map((r) =>
  [r.module, r.page, r.severity, r.category, `"${r.evidence.replace(/"/g, '""')}"`].join(",")
)].join("\n");
writeFileSync(join(ROOT, "findings/FINDINGS.csv"), csv);

// Per-category MD
function groupBy(arr, key) {
  const m = {};
  for (const r of arr) (m[r[key]] = m[r[key]] || []).push(r);
  return m;
}

function writeMd(file, title, items) {
  const byPage = groupBy(items, "page");
  const md = [`# ${title}`, "", `إجمالي: **${items.length}**`, ""];
  for (const [page, rs] of Object.entries(byPage).sort((a, b) => b[1].length - a[1].length)) {
    md.push(`## \`${page}\` — ${rs.length}`);
    md.push("");
    for (const r of rs) md.push(`- _${r.severity}_ **${r.category}** — ${r.evidence}`);
    md.push("");
  }
  writeFileSync(join(ROOT, "findings", file), md.join("\n"));
}

writeMd("hardcoded-data.md", "بيانات وهمية ثابتة — Hardcoded Data Findings",
  rows.filter((r) => r.category.startsWith("hardcoded-")));
writeMd("orphan-buttons.md", "أزرار بلا تأثير خلفي — Orphan Buttons",
  rows.filter((r) => r.category === "orphan-button"));
writeMd("broken-integrations.md", "تكاملات مقطوعة — Broken Integrations",
  rows.filter((r) => r.category === "broken-integration"));
writeMd("modeling-gaps.md", "ثغرات النمذجة — Modeling Gaps",
  rows.filter((r) => r.category.startsWith("modeling-") || r.category === "missing-audit" ||
                     r.category === "missing-permission" || r.category === "missing-tenant-scope"));

// Summary
const bySev = groupBy(rows, "severity");
const byCat = groupBy(rows, "category");
console.log(`build-findings: ${rows.length} issues`);
for (const s of ["high", "medium", "low"]) {
  console.log(`  ${s.padEnd(8)} ${(bySev[s] || []).length}`);
}
console.log(`by category:`);
for (const [c, rs] of Object.entries(byCat).sort((a, b) => b[1].length - a[1].length)) {
  console.log(`  ${c.padEnd(30)} ${rs.length}`);
}
