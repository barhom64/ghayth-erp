#!/usr/bin/env node
// scripts/src/check-scoped-branch-qualified.mjs
//
// Guard: a `buildScopedWhere(...)` call that ALIAS-QUALIFIES its company column
// must ALSO either alias-qualify its branch column or opt out of branch scoping
// — never leave the branch predicate on the unqualified default.
//
// Why this is a real bug, not a style rule:
//   `buildScopedWhere` (lib/scopedQuery.ts) defaults companyColumn to
//   `"companyId"` and branchColumn to `"branchId"`. The moment a route joins a
//   second relation and aliases the scoped table, the caller has to pass a
//   qualified `companyColumn: 'e."companyId"'` so the company predicate binds to
//   the right table. But the branch predicate is generated from a SEPARATE
//   option that still defaults to a bare `"branchId"`. In a multi-table FROM
//   that bare reference is either:
//       * 42702  column reference "branchId" is ambiguous   (two joined tables
//                both have branchId) — a hard 500, or
//       * silently bound to the WRONG table's branchId — a cross-scope data
//                leak / wrong-rows bug that no test or typecheck sees.
//   This is exactly the warehouse-advanced (ambiguous 500) and
//   warehouse-cycle-counts (wrong-table scoping) class fixed in 2026-06: the fix
//   was to qualify branchColumn too, or set `disableBranchScope: true` for a
//   table that has no branchId. Across the whole routes+lib tree those were the
//   ONLY two calls that qualified company but not branch, so the convention is
//   already universal — this guard just freezes it and blocks regressions.
//
// What satisfies the guard once companyColumn is qualified (has a `.`):
//   * `branchColumn: 'e."branchId"'`  — branch column also alias-qualified, OR
//   * `disableBranchScope: true`      — table has no branchId at all.
//   NOTE: `enforceBranchScope: false` does NOT satisfy it — that only turns off
//   the cascade default; `buildScopedWhere` still emits a `branchId = $x`
//   predicate when the request carries `?branchIds=...`, so the unqualified
//   column is still reachable.
//
// Static limits (kept deliberately conservative → near-zero false positives):
//   * Only calls whose 3rd argument is an inline object literal are analyzed.
//     A call that passes an options *variable* is skipped (can't see inside).
//   * "Qualified" = the option value contains a `.` before the column name
//     (e.g. `e."companyId"`, `b.companyId`, `${a}."companyId"`); the bare
//     default `"companyId"` has no dot and is treated as unqualified.
//
// Scan scope: artifacts/api-server/src/{routes,lib}/**/*.ts (recursive).
// Allowlist: scripts/scoped-branch-qualified-allowlist.txt — one
// `file::line::companyColumnValue` key per vetted pre-existing exception.
//
// Exit codes: 0 = clean, 1 = violation(s), 2 = scan failed.
//
// KNOWN BLIND SPOTS (accepted — soundness over coverage):
//   * Only INLINE options objects are parsed. A `buildScopedWhere(table, opts)`
//     where `opts` is a variable assembled elsewhere is skipped — we cannot see
//     its `companyColumn`/`branchColumn` keys statically.
//   * Alias CONSISTENCY between the two columns is not checked: if both are
//     qualified but to different aliases the guard passes. It only enforces the
//     real bug shape (qualified company + unqualified/absent branch). Both gaps
//     are deliberate to keep the false-positive rate at zero.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import {
  readBalancedArgs,
  splitTopLevelArgs,
  collectTsFiles,
  loadAllowlist,
} from "./check-rawquery-param-arity.mjs";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const SCAN_DIRS = [
  "artifacts/api-server/src/routes",
  "artifacts/api-server/src/lib",
];
const ALLOWLIST = "scripts/scoped-branch-qualified-allowlist.txt";

// The scoped-WHERE builder whose options carry companyColumn/branchColumn.
const CALL_RE = /\bbuildScopedWhere\s*\(/g;

// Extract the value text of `key` from an object-literal body (already stripped
// of its outer braces). Returns null when the key is absent. The value is read
// up to the next TOP-LEVEL comma so nested objects/arrays/calls are preserved.
export function readObjectKey(objBody, key) {
  const re = new RegExp(`(^|[,{\\s])${key}\\s*:`, "g");
  const m = re.exec(objBody);
  if (!m) return null;
  const start = m.index + m[0].length;
  const rest = objBody.slice(start);
  const parts = splitTopLevelArgs(rest);
  return parts.length ? parts[0].trim() : "";
}

// Does an object-literal body declare `key` at all (regardless of value)?
export function hasObjectKey(objBody, key) {
  return new RegExp(`(^|[,{\\s])${key}\\s*:`).test(objBody);
}

// A column option is "qualified" when it references the column via an alias —
// i.e. there is a `.` ahead of the column name. The bare default `"companyId"`
// (no dot) is unqualified.
export function isQualified(value, column) {
  if (value == null) return false;
  // strip surrounding quotes/backticks for a cleaner match, but the dot test
  // works on the raw value too.
  return new RegExp(`[\\w}$\\)]\\s*\\.\\s*[\`'"\\\\]*\\s*${column}`).test(value);
}

// True when branch scoping is explicitly disabled (`disableBranchScope: true`).
export function branchScopeDisabled(objBody) {
  const v = readObjectKey(objBody, "disableBranchScope");
  return v != null && /^true\b/.test(v);
}

function lineOf(src, offset) {
  let line = 1;
  for (let i = 0; i < offset && i < src.length; i++) if (src[i] === "\n") line++;
  return line;
}

// Analyze one source file. Returns a list of violations.
export function analyzeSource(relFile, src) {
  const violations = [];
  CALL_RE.lastIndex = 0;
  let m;
  while ((m = CALL_RE.exec(src)) !== null) {
    const openParen = CALL_RE.lastIndex - 1;
    const argStr = readBalancedArgs(src, openParen);
    if (argStr == null) continue;
    const args = splitTopLevelArgs(argStr);
    // buildScopedWhere(scope, filters, options, startParamIndex?)
    const optionsArg = (args[2] || "").trim();
    if (!optionsArg.startsWith("{") || !optionsArg.endsWith("}")) continue; // not an inline literal
    const objBody = optionsArg.slice(1, -1);

    const companyVal = readObjectKey(objBody, "companyColumn");
    if (!isQualified(companyVal, "companyId")) continue; // unqualified/default → not the bug class

    const branchVal = readObjectKey(objBody, "branchColumn");
    const branchQualified = isQualified(branchVal, "branchId");
    if (branchQualified || branchScopeDisabled(objBody)) continue; // satisfied

    const line = lineOf(src, m.index);
    violations.push({
      file: relFile,
      line,
      companyVal,
      key: `${relFile}::${line}::${companyVal}`,
      msg:
        `buildScopedWhere qualifies companyColumn (${companyVal}) but leaves branchColumn ` +
        `on the unqualified default — pass a qualified branchColumn or disableBranchScope:true ` +
        `(42702 ambiguous-column / wrong-table scoping)`,
    });
  }
  return violations;
}

export function runCheck({ repoRoot = REPO_ROOT } = {}) {
  const allow = loadAllowlist(path.join(repoRoot, ALLOWLIST));
  const all = [];
  const seenFiles = new Set();
  for (const dir of SCAN_DIRS) {
    for (const abs of collectTsFiles(path.join(repoRoot, dir))) {
      if (seenFiles.has(abs)) continue;
      seenFiles.add(abs);
      const rel = path.relative(repoRoot, abs).split(path.sep).join("/");
      const src = fs.readFileSync(abs, "utf8");
      for (const v of analyzeSource(rel, src)) {
        if (allow.has(v.key)) continue;
        all.push(v);
      }
    }
  }
  return all;
}

function invokedDirectly() {
  return import.meta.url === url.pathToFileURL(process.argv[1] || "").href;
}

if (invokedDirectly()) {
  let violations;
  try {
    violations = runCheck();
  } catch (e) {
    console.error("check:scoped-branch-qualified — scan failed:", e?.stack || e);
    process.exit(2);
  }
  if (violations.length === 0) {
    console.log("check:scoped-branch-qualified — OK (no unqualified branch scopes)");
    process.exit(0);
  }
  console.error(`check:scoped-branch-qualified — ${violations.length} violation(s):\n`);
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.msg}`);
    console.error(`      allowlist key: ${v.key}`);
  }
  console.error(
    "\nWhen a buildScopedWhere call qualifies its companyColumn it must also\n" +
    "qualify its branchColumn (or set disableBranchScope:true). Fix the call,\n" +
    `or (only for a vetted case) add the printed key to ${ALLOWLIST}.`,
  );
  process.exit(1);
}
