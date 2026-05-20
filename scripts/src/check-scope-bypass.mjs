#!/usr/bin/env node
// scripts/src/check-scope-bypass.mjs
//
// Issue #685 — Scope-bypass inventory scanner (route layer). PR-1.
//
// Reports every hand-rolled `"companyId" = $N` tenant predicate under
// artifacts/api-server/src/routes/**, classified by the shape of the SQL
// statement it sits in, so the real normalization surface is visible:
//
//   - list-scan    — a multi-row SELECT whose company filter is hand-rolled
//                    instead of going through buildScopedWhere(). These are
//                    the actual normalization targets (RCA #685 Category A/B).
//   - detail-fetch — a SELECT that also has an `id = $` predicate (single-row
//                    fetch). The companyId here is a correct tenant guard,
//                    NOT a buildScopedWhere candidate.
//   - write-guard  — an UPDATE / DELETE WHERE clause. Correct tenant guard.
//   - insert       — companyId inside an INSERT (sub-select / ON CONFLICT).
//   - unknown      — no SQL verb found within the lookback window.
//
// This is a REPORT-ONLY scanner: it always exits 0 and never blocks CI.
// It exists because the inventory in docs/audit/SCOPE_NORMALIZATION_RCA_685.md
// reported 17 files / 68 hits — a small fraction of the real surface. An
// enforcing allowlist ratchet is deliberately deferred to a later PR, once
// the true surface (this report) has been triaged.
//
// Usage:
//   node scripts/src/check-scope-bypass.mjs           # write report + print summary
//   node scripts/src/check-scope-bypass.mjs --check   # print summary only, no writes
//
// Outputs (default mode only):
//   audit/system-review/tooling/_scope-bypass.json
//   docs/audit/SCOPE_BYPASS.md
//
// Per-line opt-out (supported for future use; PR-1 adds no such comments):
//   append `// scope-ok: <reason>` to a line to exclude its hits from the count.
//
// Exit codes: 0 = always (report-only). 2 = scan failed.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCAN_DIR = "artifacts/api-server/src/routes";
const JSON_OUT = "audit/system-review/tooling/_scope-bypass.json";
const MD_OUT = "docs/audit/SCOPE_BYPASS.md";

// Files where a hand-rolled companyId predicate is legitimate by design and
// must NOT be migrated to buildScopedWhere (RCA #685 Category C):
//   - portal handlers run before the employee authMiddleware (own-token scope)
//   - auth.ts /me resolves roles during session bootstrap (scope not built yet)
//   - admin.ts is intentionally cross-tenant
//   - pdpl.ts export scoping is data-subject-driven, not tenant-list
const MANUAL_REVIEW_FILES = new Set([
  "clientPortal.ts",
  "careersPortal.ts",
  "auth.ts",
  "admin.ts",
  "pdpl.ts",
]);

// A hand-rolled company predicate: optional `alias.` prefix, the quoted
// "companyId" column, `=`, then a `$N` placeholder (also `= ANY($N)`).
const HIT_RE = /(?:\b\w+\.)?"companyId"\s*=\s*(?:ANY\s*\(\s*)?\$\d+/gi;
// An id predicate anywhere in the statement → the SELECT is a single-row fetch.
const ID_PRED_RE = /(?:"id"|(?<![A-Za-z0-9_])id(?![A-Za-z0-9_]))\s*=\s*\$\d/i;
const LOOKBACK = 120;
const LOOKAHEAD = 12;

function stripComments(src) {
  let out = src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "));
  out = out.replace(/\{\/\*[\s\S]*?\*\/\}/g, (m) => m.replace(/[^\n]/g, " "));
  return out;
}

function stripLineComment(line) {
  let inStr = null;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inStr) {
      if (c === "\\") { i++; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { inStr = c; continue; }
    if (c === "/" && line[i + 1] === "/") return line.slice(0, i);
  }
  return line;
}

// A dynamic query-fragment builder: a predicate string assigned to / pushed
// into a `where` / `conditions` / `filters` variable. These feed a SELECT
// list query that is assembled later (`SELECT ... WHERE ${where}`), so the
// hit has no literal SELECT next to it. Treated as `list-scan`.
const BUILDER_RE =
  /(?<!["\w])(?:where|whereClause|whereParts|conditions?|filters?|clauses?|predicates?|sqlParts?|qParts?)\s*(?::[\w[\]<>., |]*)?\s*(?:=(?!=)|\.push\s*\(|\.concat\s*\()/i;

function isBuilderFragment(line) {
  return BUILDER_RE.test(line);
}

// Classify the SQL statement a hit sits in by walking up to the nearest
// preceding SQL verb. Heuristic — see the "Limitations" section of the
// generated report.
function classifyShape(lines, idx) {
  let verb = null;
  let verbLine = -1;
  for (let j = idx; j >= Math.max(0, idx - LOOKBACK); j--) {
    const m = lines[j].match(/\b(SELECT|UPDATE|DELETE|INSERT)\b/i);
    if (m) {
      verb = m[1].toUpperCase();
      verbLine = j;
      break;
    }
  }
  if (!verb) return "unknown";
  if (verb === "UPDATE" || verb === "DELETE") return "write-guard";
  if (verb === "INSERT") return "insert";
  const stmt = lines
    .slice(verbLine, Math.min(lines.length, idx + LOOKAHEAD + 1))
    .join("\n");
  return ID_PRED_RE.test(stmt) ? "detail-fetch" : "list-scan";
}

function scanFile(rel) {
  const abs = path.join(REPO_ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const original = src.split("\n");
  const stripped = stripComments(src).split("\n");
  const hits = [];
  let suppressed = 0;
  for (let i = 0; i < stripped.length; i++) {
    const code = stripLineComment(stripped[i]);
    if (!code.includes('"companyId"')) continue;
    HIT_RE.lastIndex = 0;
    let m;
    while ((m = HIT_RE.exec(code)) !== null) {
      if (/scope-ok\s*:/i.test(original[i] ?? "")) {
        suppressed++;
        continue;
      }
      const builder = isBuilderFragment(code);
      hits.push({
        line: i + 1,
        shape: builder ? "list-scan" : classifyShape(stripped, i),
        builder,
        aliased: /^\w+\./.test(m[0]),
        snippet: (original[i] ?? "").trim().slice(0, 100),
      });
    }
  }
  return {
    hits,
    suppressed,
    usesBuildScopedWhere: src.includes("buildScopedWhere"),
    usesParseScopeFilters: src.includes("parseScopeFilters"),
  };
}

function walk(dir, out) {
  const abs = path.join(REPO_ROOT, dir);
  if (!fs.existsSync(abs)) return;
  for (const entry of fs.readdirSync(abs, { withFileTypes: true }).sort((a, b) =>
    a.name < b.name ? -1 : 1,
  )) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "dist") continue;
      walk(rel, out);
    } else if (/\.ts$/.test(entry.name) && !/\.test\.ts$/.test(entry.name)) {
      out.push(rel);
    }
  }
}

function build() {
  const files = [];
  walk(SCAN_DIR, files);

  const byFile = [];
  const allHits = [];
  let suppressed = 0;
  for (const rel of files) {
    let res;
    try {
      res = scanFile(rel);
    } catch (err) {
      console.error(`[check:scope-bypass] could not read ${rel}: ${err.message}`);
      process.exit(2);
    }
    suppressed += res.suppressed;
    if (res.hits.length === 0) continue;
    const base = path.basename(rel);
    const manualReview = MANUAL_REVIEW_FILES.has(base);
    const shapes = {};
    for (const h of res.hits) {
      shapes[h.shape] = (shapes[h.shape] || 0) + 1;
      allHits.push({ file: rel, manualReview, ...h });
    }
    byFile.push({
      file: rel,
      occurrences: res.hits.length,
      shapes,
      usesBuildScopedWhere: res.usesBuildScopedWhere,
      usesParseScopeFilters: res.usesParseScopeFilters,
      manualReview,
      hits: res.hits,
    });
  }
  byFile.sort((a, b) => b.occurrences - a.occurrences);

  const byShape = {
    "list-scan": 0,
    "detail-fetch": 0,
    "write-guard": 0,
    insert: 0,
    unknown: 0,
  };
  for (const h of allHits) byShape[h.shape]++;

  // Migration-relevant subset: list-scan SELECTs in files that are NOT
  // manual-review by design. Split by aliased column (≈ RCA Category B,
  // needs a companyColumn override) vs plain (≈ RCA Category A).
  let listPlain = 0;
  let listJoined = 0;
  let listManual = 0;
  let dynamicBuilders = 0;
  for (const h of allHits) {
    if (h.builder) dynamicBuilders++;
    if (h.shape !== "list-scan") continue;
    if (h.manualReview) listManual++;
    else if (h.aliased) listJoined++;
    else listPlain++;
  }

  return {
    meta: {
      generatedBy: "scripts/src/check-scope-bypass.mjs",
      scanDir: SCAN_DIR,
      scannedFiles: files.length,
      filesWithHits: byFile.length,
    },
    totals: {
      occurrences: allHits.length,
      scopeOkSuppressed: suppressed,
      dynamicBuilders,
      byShape,
      migrationTargets: {
        listScanPlain: listPlain,
        listScanJoined: listJoined,
        listScanInManualReviewFiles: listManual,
        total: listPlain + listJoined,
      },
      legitimateNonTargets:
        byShape["detail-fetch"] + byShape["write-guard"] + byShape.insert,
    },
    byFile,
  };
}

function renderMarkdown(r) {
  const t = r.totals;
  const pct = (n) =>
    t.occurrences ? ((n / t.occurrences) * 100).toFixed(1) : "0.0";
  const top = r.byFile.slice(0, 25);
  const manual = r.byFile.filter((f) => f.manualReview);
  const lines = [];
  lines.push("# Issue #685 — Scope-Bypass Inventory (route layer)");
  lines.push("");
  lines.push("**Generated by:** `scripts/src/check-scope-bypass.mjs` (PR-1, report-only).");
  lines.push("**Status:** machine-generated inventory. Do not hand-edit — re-run the scanner.");
  lines.push("");
  lines.push(
    "> This report supersedes the inventory in `docs/audit/SCOPE_NORMALIZATION_RCA_685.md`,",
  );
  lines.push(
    "> which reported **17 files / 68 hits**. That figure came from a partial",
  );
  lines.push(
    "> exploration sweep; a full scan of the route layer finds the numbers below.",
  );
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push("```");
  lines.push(`  scanned route files            ${r.meta.scannedFiles}`);
  lines.push(`  files with >=1 hand-rolled hit ${r.meta.filesWithHits}`);
  lines.push(`  total "companyId" = $N hits    ${t.occurrences}`);
  lines.push(`  // scope-ok suppressed         ${t.scopeOkSuppressed}`);
  lines.push("```");
  lines.push("");
  lines.push("## By SQL statement shape");
  lines.push("");
  lines.push("| Shape | Hits | % | Migration meaning |");
  lines.push("|---|---:|---:|---|");
  lines.push(
    `| \`list-scan\` | ${t.byShape["list-scan"]} | ${pct(t.byShape["list-scan"])} | multi-row SELECT — **the buildScopedWhere normalization target** |`,
  );
  lines.push(
    `| \`detail-fetch\` | ${t.byShape["detail-fetch"]} | ${pct(t.byShape["detail-fetch"])} | SELECT with an \`id = $\` predicate — legitimate single-row tenant guard |`,
  );
  lines.push(
    `| \`write-guard\` | ${t.byShape["write-guard"]} | ${pct(t.byShape["write-guard"])} | UPDATE / DELETE WHERE clause — legitimate tenant guard |`,
  );
  lines.push(
    `| \`insert\` | ${t.byShape.insert} | ${pct(t.byShape.insert)} | companyId inside an INSERT — legitimate |`,
  );
  lines.push(
    `| \`unknown\` | ${t.byShape.unknown} | ${pct(t.byShape.unknown)} | no SQL verb within ${LOOKBACK} lines — needs manual read |`,
  );
  lines.push("");
  lines.push(
    `Of all hits, **${t.dynamicBuilders}** are dynamic query-builder fragments`,
  );
  lines.push(
    "(`let where = ...`, `conditions.push(...)`) — counted as `list-scan` because",
  );
  lines.push("they assemble a SELECT list query whose WHERE is built at runtime.");
  lines.push("");
  lines.push("## Migration-relevant subset");
  lines.push("");
  lines.push(
    "Only `list-scan` hits are candidates for a `buildScopedWhere` migration. The",
  );
  lines.push(
    "rest (`detail-fetch`, `write-guard`, `insert`) are correct tenant guards and",
  );
  lines.push("must be left alone.");
  lines.push("");
  lines.push("| Category | Hits | ≈ RCA #685 class |");
  lines.push("|---|---:|---|");
  lines.push(
    `| \`list-scan\`, plain \`"companyId" = $\` | ${t.migrationTargets.listScanPlain} | A (safe mechanical swap) |`,
  );
  lines.push(
    `| \`list-scan\`, aliased \`x."companyId" = $\` | ${t.migrationTargets.listScanJoined} | B (needs \`companyColumn\` override) |`,
  );
  lines.push(
    `| \`list-scan\` in a manual-review file | ${t.migrationTargets.listScanInManualReviewFiles} | C (do NOT migrate) |`,
  );
  lines.push(
    `| **migration target total (A + B)** | **${t.migrationTargets.total}** | |`,
  );
  lines.push("");
  lines.push("## Manual-review files (RCA #685 Category C)");
  lines.push("");
  lines.push(
    "Hand-rolled scope here is legitimate by design — portal own-token scope, session",
  );
  lines.push(
    "bootstrap, intentionally cross-tenant admin, or regulatory PDPL export scoping.",
  );
  lines.push("These must never be migrated to `buildScopedWhere`.");
  lines.push("");
  if (manual.length) {
    lines.push("| File | Hits |");
    lines.push("|---|---:|");
    for (const f of manual) lines.push(`| \`${f.file}\` | ${f.occurrences} |`);
  } else {
    lines.push("_(none found with hits)_");
  }
  lines.push("");
  lines.push("## Top 25 files by hit count");
  lines.push("");
  lines.push("| File | Hits | list-scan | detail | write | uses helper |");
  lines.push("|---|---:|---:|---:|---:|:--:|");
  for (const f of top) {
    lines.push(
      `| \`${f.file}\` | ${f.occurrences} | ${f.shapes["list-scan"] || 0} | ${
        f.shapes["detail-fetch"] || 0
      } | ${f.shapes["write-guard"] || 0} | ${f.usesBuildScopedWhere ? "yes" : "no"} |`,
    );
  }
  lines.push("");
  lines.push("## Limitations (regex heuristic)");
  lines.push("");
  lines.push(
    "- **Statement shape is heuristic.** Each hit is classified by walking up to the",
  );
  lines.push(
    `  nearest SQL verb within ${LOOKBACK} lines. A \`"companyId" = $\` inside a`,
  );
  lines.push(
    "  sub-SELECT of an UPDATE is classified `list-scan`/`detail-fetch`, not `write-guard`.",
  );
  lines.push(
    "- **`list-scan` vs `detail-fetch`** turns on finding an `id = $` predicate in the",
  );
  lines.push(
    "  statement window; a list query joined to another table on its id can be",
  );
  lines.push("  misread as `detail-fetch`.");
  lines.push(
    "- **Only `\"companyId\"` is scanned.** `\"branchId\"` predicates and unquoted",
  );
  lines.push("  `companyId` are out of scope for this pass.");
  lines.push(
    "- The scanner is **report-only** — it never fails CI. Treat the counts as a",
  );
  lines.push("  triage starting point, not a verified migration list.");
  lines.push("");
  lines.push("## How a file leaves this report");
  lines.push("");
  lines.push(
    "A file's `list-scan` count drops as its list/report handlers are migrated to",
  );
  lines.push(
    "`buildScopedWhere` (separate per-cluster PRs). When a file's `list-scan` count",
  );
  lines.push(
    "reaches 0 it is no longer a migration target — its remaining `detail-fetch` /",
  );
  lines.push("`write-guard` hits are expected and correct.");
  lines.push("");
  lines.push("## Refresh");
  lines.push("");
  lines.push("```bash");
  lines.push("node scripts/src/check-scope-bypass.mjs");
  lines.push("```");
  lines.push("");
  return lines.join("\n");
}

function printSummary(r) {
  const t = r.totals;
  console.log(
    "[check:scope-bypass] route-layer scope-bypass inventory (#685, report-only)",
  );
  console.log(`  scanned route files             ${r.meta.scannedFiles}`);
  console.log(
    `  hand-rolled "companyId" = $N    ${t.occurrences} in ${r.meta.filesWithHits} file(s)`,
  );
  console.log("  by SQL shape:");
  console.log(
    `    list-scan      ${String(t.byShape["list-scan"]).padStart(5)}  (buildScopedWhere normalization candidates)`,
  );
  console.log(
    `    detail-fetch   ${String(t.byShape["detail-fetch"]).padStart(5)}  (legitimate single-row tenant guard)`,
  );
  console.log(
    `    write-guard    ${String(t.byShape["write-guard"]).padStart(5)}  (legitimate UPDATE/DELETE guard)`,
  );
  console.log(
    `    insert         ${String(t.byShape.insert).padStart(5)}  (legitimate)`,
  );
  console.log(
    `    unknown        ${String(t.byShape.unknown).padStart(5)}  (no SQL verb in window)`,
  );
  console.log(
    `    (of which dynamic query-builders: ${t.dynamicBuilders})`,
  );
  console.log(
    `  migration targets (list-scan, excl. manual-review files): ${t.migrationTargets.total}`,
  );
  console.log(
    `    plain  "companyId" = $       ${String(t.migrationTargets.listScanPlain).padStart(5)}  (~RCA Category A)`,
  );
  console.log(
    `    joined alias."companyId" = $ ${String(t.migrationTargets.listScanJoined).padStart(5)}  (~RCA Category B)`,
  );
  console.log("  report-only — guard not blocked.");
}

function main() {
  const checkOnly = process.argv.includes("--check");
  const report = build();

  if (!checkOnly) {
    fs.writeFileSync(
      path.join(REPO_ROOT, JSON_OUT),
      JSON.stringify(report, null, 2) + "\n",
    );
    fs.writeFileSync(path.join(REPO_ROOT, MD_OUT), renderMarkdown(report));
    console.log(`[check:scope-bypass] wrote ${JSON_OUT}`);
    console.log(`[check:scope-bypass] wrote ${MD_OUT}`);
  }
  printSummary(report);
  process.exit(0);
}

main();
