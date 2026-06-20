#!/usr/bin/env node
//
// scripts/src/check-scope-suffix-glue.mjs
//
// "scope suffix glued to a path with no query separator" guard. The frontend
// convention (from useAppContext) is:
//
//     const scopeSuffix = scopeQueryString ? `&${scopeQueryString}` : "";
//
// `scopeSuffix` ALWAYS begins with `&`, so it may only be appended AFTER a `?`
// has already opened the query string:
//
//     `/employees?page=1&limit=1${scopeSuffix}`   // OK — there is a `?`
//     `/hr/stats${scopeSuffix}`                    // BUG — yields /hr/stats&companyIds=...
//
// The buggy form produces `/hr/stats&companyIds=1` which the router 404s (the
// `&...` is part of the PATH, not the query). The runtime audit recorded this
// as a 404 on /api/hr/stats&companyIds. This is invisible to typecheck/build/
// lint — the template literal is valid TS — and only manifests at runtime, so
// it needs a static gate.
//
// The separator is NOT always `&` — some components define it with `?`
// (`scopeQueryString ? `?${scopeQueryString}` : ""`), in which case the suffix
// must be glued onto a BARE path (and gluing it after an existing `?` would
// produce a double `?`). So the guard reads the in-scope separator and checks
// the matching invariant.
//
// Detector:
//   1. Scan every frontend source file (default: ghayth-erp/src).
//   2. Collect every `scopeSuffix = ... `<sep>...` ` definition and its `<sep>`
//      (`&` or `?`) with its source offset.
//   3. For each `${scopeSuffix}` interpolation, resolve the nearest PRECEDING
//      definition (its `<sep>`), then inspect the enclosing template literal
//      text before the interpolation:
//        - sep `&` : a `?` MUST already be present  (else `/path&a=1` 404).
//        - sep `?` : a `?` must NOT already be present (else `/path?a=1?b=2`).
//   4. Any mismatch -> violation.
//
// OFFLINE: pure source scan, no DB / build / server needed — runs
// unconditionally in CI (like check:register-limiter-misuse / check:dump-drift).
//
// Usage:
//   node scripts/src/check-scope-suffix-glue.mjs
//
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SCAN_DIRS = ["artifacts/ghayth-erp/src"];
const NEEDLE = "${scopeSuffix}";
// `scopeSuffix = ... `<sep>...` ` — capture the first char inside the first
// template literal of the definition's right-hand side. `<sep>` is `&` or `?`.
const DEF_RE = /scopeSuffix\s*=\s*[^;\n]*?`([?&])/g;

/** Collect every scopeSuffix definition's `{ index, sep }` (`&` or `?`). */
export function collectSuffixDefs(source) {
  const defs = [];
  let m;
  DEF_RE.lastIndex = 0;
  while ((m = DEF_RE.exec(source)) !== null) {
    defs.push({ index: m.index, sep: m[1] });
  }
  return defs;
}

/** Separator of the nearest definition PRECEDING `usageIdx`, or null. */
function sepForUsage(defs, usageIdx) {
  let sep = null;
  let best = -1;
  for (const d of defs) {
    if (d.index < usageIdx && d.index > best) {
      best = d.index;
      sep = d.sep;
    }
  }
  return sep;
}

/**
 * Return the malformed-glue snippets in `source`: each `${scopeSuffix}`
 * interpolation whose enclosing template literal violates the in-scope
 * separator's invariant (sep `&` needs a preceding `?`; sep `?` needs none).
 */
export function findScopeSuffixGlue(source) {
  const violations = [];
  const defs = collectSuffixDefs(source);
  let idx = 0;
  while ((idx = source.indexOf(NEEDLE, idx)) !== -1) {
    const sep = sepForUsage(defs, idx);
    // No resolvable in-scope definition -> can't judge the invariant; skip.
    if (sep === null) {
      idx += NEEDLE.length;
      continue;
    }
    // `${scopeSuffix}` is only valid inside a template literal, so the nearest
    // preceding backtick is this template's opening delimiter.
    const open = source.lastIndexOf("`", idx);
    if (open !== -1) {
      const before = source.slice(open + 1, idx);
      const hasQ = before.includes("?");
      const bad = sep === "&" ? !hasQ : hasQ;
      if (bad) {
        const close = source.indexOf("`", idx + NEEDLE.length);
        const snippet = source
          .slice(open, close !== -1 ? close + 1 : idx + NEEDLE.length)
          .replace(/\s+/g, " ")
          .slice(0, 120);
        violations.push(`[sep '${sep}'] ${snippet}`);
      }
    }
    idx += NEEDLE.length;
  }
  return violations;
}

function listSourceFiles(absDir) {
  const out = [];
  for (const ent of readdirSync(absDir)) {
    if (ent === "node_modules" || ent === "dist") continue;
    const abs = join(absDir, ent);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...listSourceFiles(abs));
    else if (/\.(tsx?|jsx?)$/.test(ent) && !ent.endsWith(".d.ts")) out.push(abs);
  }
  return out;
}

function main() {
  const findings = [];
  let scanned = 0;
  for (const dir of SCAN_DIRS) {
    const absDir = join(REPO_ROOT, dir);
    if (!existsSync(absDir)) continue;
    for (const abs of listSourceFiles(absDir)) {
      const source = readFileSync(abs, "utf8");
      if (!source.includes(NEEDLE)) continue;
      scanned++;
      for (const snippet of findScopeSuffixGlue(source)) {
        findings.push(`${relative(REPO_ROOT, abs)}: ${snippet}`);
      }
    }
  }

  if (findings.length > 0) {
    console.error(
      "\u2717 check:scope-suffix-glue — `${scopeSuffix}` appended to a path with no `?` query separator:\n",
    );
    for (const f of findings) console.error(`  - ${f}`);
    console.error(
      "\n`scopeSuffix` always begins with `&` (it is `scopeQueryString ? `&...` : \"\"`),\n" +
        "so it must be appended only AFTER a `?` has opened the query string. Appending it\n" +
        "to a bare path yields e.g. `/hr/stats&companyIds=1` which the router 404s. Use\n" +
        "`/path?${scopeQueryString || \"\"}` instead, or ensure a `?` precedes ${scopeSuffix}.\n",
    );
    process.exit(1);
  }

  console.log(
    `\u2713 check:scope-suffix-glue — every \${scopeSuffix} is appended after a \`?\` (${scanned} file(s) used it).`,
  );
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main();
