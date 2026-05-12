#!/usr/bin/env node
// merge-runtime-results.mjs — Updates section §6 (Verdict) of every page sheet
// with the corresponding row from audit/runtime-audit-results.json.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const REPO = resolve(__dirname, "../../..");

const results = JSON.parse(readFileSync(join(REPO, "audit/runtime-audit-results.json"), "utf8"));
const byRoute = new Map();
for (const r of results.results || []) {
  byRoute.set(r.route, r);
}

// Walk all generated MD pages
const modules = readdirSync(join(ROOT, "modules"));
let updated = 0, missing = 0;

function verdictBlock(r) {
  if (!r) {
    missing++;
    return "## 6. النتيجة (Verdict)\n- Runtime audit: **N/A** — لم يُشغّل بعد لهذا المسار.\n- توصية: **TBD**\n";
  }
  const axes = ["a1", "a2", "a3", "a4", "a5"];
  const labels = { a1: "render", a2: "fetch", a3: "CTA", a4: "nav", a5: "smoke" };
  const status = axes.map((a) => `${labels[a]}=${r[a]}`).join(" | ");
  const fail = axes.filter((a) => r[a] === "FAIL").length;
  const verdict = fail === 0 ? "✅ PASS" : fail >= 2 ? "🔴 FAIL" : "⚠ PARTIAL";
  const note = r.note ? `\n- ملاحظة: \`${r.note}\`` : "";
  const shot = r.shot ? `\n- لقطة: \`${r.shot}\`` : "";
  return `## 6. النتيجة (Verdict)\n- Runtime audit: **${verdict}** — ${status}${note}${shot}\n- landedUrl: \`${r.landedUrl || "?"}\`\n- توصية: ${verdict === "✅ PASS" ? "مغلق" : "**يحتاج إصلاح**"}\n`;
}

for (const mod of modules) {
  const dir = join(ROOT, "modules", mod);
  for (const f of readdirSync(dir)) {
    if (!f.endsWith(".md") || f === "_module.md") continue;
    const file = join(dir, f);
    const md = readFileSync(file, "utf8");
    // Extract path from §1: "- المسار: `/x`"
    const m = md.match(/-\s*المسار:\s*`([^`]+)`/);
    if (!m) continue;
    const path = m[1];
    const r = byRoute.get(path) || byRoute.get(path.replace(/:[\w]+/g, "1"));
    const newBlock = verdictBlock(r);
    const updatedMd = md.replace(/## 6\. النتيجة[\s\S]*$/, newBlock);
    if (updatedMd !== md) {
      writeFileSync(file, updatedMd);
      updated++;
    }
  }
}

console.log(`merge-runtime-results: ${updated} pages updated (${missing} without runtime row)`);
