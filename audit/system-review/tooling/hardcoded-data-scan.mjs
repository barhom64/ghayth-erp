#!/usr/bin/env node
// hardcoded-data-scan.mjs — Read-only.
// Scans every source-file in _page-inventory.json for likely hardcoded
// data that should come from the API or i18n:
//   - mock arrays: `const \w+ = [` containing object literals on next 2 lines
//   - dummy names / values: e.g. "أحمد محمد", "test@", "0501234567"
//   - magic numbers / dates inside JSX text nodes
//
// Conservative: flags candidates with file:line; does NOT auto-fix.
// Output: tooling/_hardcoded-hits.json

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const INV = JSON.parse(readFileSync(join(__dirname, "_page-inventory.json"), "utf8"));

// Patterns
const DUMMY_NAMES = [
  /["'`]أحمد محمد["'`]/,
  /["'`]فاطمة["'`]/,
  /["'`]Mohammed Ali["'`]/i,
  /["'`]John Doe["'`]/i,
  /["'`]Test User["'`]/i,
  /["'`]example@/i,
  /["'`]test@/i,
];
const DUMMY_PHONES = /["'`]05\d{8}["'`]/; // KSA mobile-shaped
const DUMMY_IBAN = /SA\d{2}[A-Z0-9]{20}/;
const FAKE_AVATAR = /\/avatars\/(?:1|2|3|4|5)\.png/;
// Match obvious placeholders in *content* (not React `placeholder=` attrs)
const PLACEHOLDER = /(\blorem ipsum\b|TODO\s*\(?\s*mock|FIXME\s*mock|XXX\s*mock|stub data|fake data)/i;

function scanFile(src) {
  const hits = [];
  const lines = src.split(/\r?\n/);

  // Mock arrays: `const xxx = [` followed within 5 lines by `{`
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const m = l.match(/\bconst\s+(\w*(?:mock|fake|dummy|sample|fixture|seed|demo)\w*)\s*=\s*\[/i);
    if (m) {
      hits.push({ line: i + 1, kind: "mock-array", evidence: `${m[1]} = [...]`, text: l.trim().slice(0, 120) });
      continue;
    }
    // const xxx = [   ... { ... } ... ] inline literal with objects.
    // We only care about literal *business data* (names, phones, monetary
    // values that should come from the DB). Filter out UI/enum config:
    //   • UPPER_SNAKE constants (PAYMENT_METHODS, TAX_CATEGORIES) — enum
    //   • Named like kpis|statCards|tabs|options|buckets|columns — UI scaffolds
    //   • Object literals whose value side references variables/optional
    //     chaining (`stats?.total ?? items.length`) — values come from API,
    //     the array is just label scaffolding
    const constNameMatch = /\bconst\s+(\w+)\s*=\s*\[\s*(?:$|\{)/.exec(l);
    if (constNameMatch) {
      const name = constNameMatch[1];
      const isUpperSnake = /^[A-Z][A-Z0-9_]+$/.test(name);
      // Recognised UI/enum-scaffold names. The list is broad on purpose:
      // every entry here either declares static labels for charts/tabs/
      // option lists or is a developer-defined enum. None are business
      // data that should live in the DB.
      const isUiScaffold = /^(kpis|statCards|summaryCards|tabs|tabConfig|options|columns|menu|cards|stages|buckets|colors|icons|filters|sections|steps|legends|severities|categories|sources|types|stats|metrics|labels|chartData|pieData|barData|cols|fields|tableHeaders|alertCards|statusOptions|daysOfWeek|months|weekdays|violationTypes|leaveTypes|currencyOptions|countries|cities|salaryComponents|riskLevels|priorityOptions)$/i.test(name);
      // Also skip any name that ENDS in a scaffold suffix
      const hasScaffoldSuffix = /(?:Options|Config|Cards|Tabs|Stages|Buckets|Columns|Types|Labels|Categories|Steps|Filters|Stats|Kpis|Metrics)$/.test(name);
      if (isUpperSnake || isUiScaffold || hasScaffoldSuffix) continue;

      const window = lines.slice(i, Math.min(lines.length, i + 8)).join("\n");
      const labelCount = (window.match(/\b(id|name|title|label)\s*:/g) || []).length;
      // Value side references API or local computed state? → scaffolding.
      const valuesAreDynamic = /\?\.[A-Za-z_]|\?\?|items\.|\bstats\b|\bdata\b|\.filter\(|\.map\(|\.reduce\(/.test(window);
      if (labelCount >= 2 &&
          !/useApi|fetch\(|axios/.test(window) &&
          !valuesAreDynamic &&
          /\d+/.test(window)) {
        hits.push({ line: i + 1, kind: "inline-data-array", text: l.trim().slice(0, 120) });
      }
    }
  }

  // Per-line pattern scans. Skip the line entirely if the literal sits
  // inside a `placeholder="..."` attribute — those are UX hints, not data.
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    const isPlaceholderAttr = /\bplaceholder\s*=\s*["'`]/.test(l);
    if (DUMMY_NAMES.some((re) => re.test(l)) && !isPlaceholderAttr) {
      hits.push({ line: i + 1, kind: "dummy-name", text: l.trim().slice(0, 120) });
    }
    if (DUMMY_PHONES.test(l) && !isPlaceholderAttr) {
      hits.push({ line: i + 1, kind: "dummy-phone", text: l.trim().slice(0, 120) });
    }
    if (DUMMY_IBAN.test(l) && !isPlaceholderAttr) {
      hits.push({ line: i + 1, kind: "dummy-iban", text: l.trim().slice(0, 120) });
    }
    if (FAKE_AVATAR.test(l)) {
      hits.push({ line: i + 1, kind: "fake-avatar", text: l.trim().slice(0, 120) });
    }
    if (PLACEHOLDER.test(l)) {
      hits.push({ line: i + 1, kind: "placeholder", text: l.trim().slice(0, 120) });
    }
  }

  return hits;
}

const result = {};
let totalHits = 0;
for (const row of INV) {
  if (!row.sourceFile) continue;
  const full = join(REPO, row.sourceFile);
  if (!existsSync(full)) continue;
  const src = readFileSync(full, "utf8");
  const hits = scanFile(src);
  if (hits.length) {
    result[row.path] = {
      sourceFile: row.sourceFile,
      module: row.module,
      hits,
    };
    totalHits += hits.length;
  }
}

writeFileSync(join(__dirname, "_hardcoded-hits.json"), JSON.stringify(result, null, 2));
console.log(`hardcoded-data-scan: ${Object.keys(result).length} pages with hits, ${totalHits} total hits`);

// Breakdown by kind
const byKind = {};
for (const r of Object.values(result)) {
  for (const h of r.hits) byKind[h.kind] = (byKind[h.kind] || 0) + 1;
}
for (const [k, n] of Object.entries(byKind).sort((a, b) => b[1] - a[1])) {
  console.log(`  ${k.padEnd(20)} ${n}`);
}
