#!/usr/bin/env node
//
// scripts/src/check-usememo-setstate.mjs
//
// React "setState inside useMemo" guard. Catches the render-phase
// side-effect anti-pattern:
//
//     useMemo(() => { setFoo(...); }, [deps]);
//
// useMemo runs during render. Calling a state setter there re-fires on
// every render; combined with an unstable callback prop and/or a setState
// that always produces a NEW reference (a fresh array/object), it becomes
// an INFINITE render loop that pegs the main thread and wedges the tab.
// This is invisible to typecheck/build/lint — it only manifests at
// runtime — so it needs a static gate of its own.
//
// Real incident: artifacts/ghayth-erp/src/pages/finance/income-statement-trend.tsx
// looped forever (off-screen <MonthQuery> children calling onData inside a
// useMemo, an un-memoized parent callback, and a setBuckets that always
// rebuilt the array) and cascaded a whole runtime-audit timeout cluster.
// Side effects belong in useEffect, not useMemo.
//
// Detector:
//   1. Walk every `.tsx` under each frontend artifact's `src/`.
//   2. Extract each `useMemo(` / `React.useMemo(` call's balanced argument
//      region (skipping strings, template literals, and comments).
//   3. Flag the file if that region contains a BARE state-setter call —
//      `set[A-Z]\w*(` NOT preceded by `.` (so Date/DOM mutators like
//      `today.setHours(` or `dueDate.setMonth(` are excluded) and NOT part
//      of a longer identifier.
//   4. A flagged file NOT on the allowlist is a regression -> fail.
//      `--write-allowlist` rewrites the baseline from current findings.
//
// OFFLINE: pure source scan, no DB / build / server needed — runs
// unconditionally in CI (like check:button-nesting / check:dump-drift).
//
// Usage:
//   node scripts/src/check-usememo-setstate.mjs                 # gate
//   node scripts/src/check-usememo-setstate.mjs --write-allowlist
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWLIST_PATH = join(REPO_ROOT, "scripts/usememo-setstate-allowlist.txt");

const FRONTEND_SRC_DIRS = [
  "artifacts/ghayth-erp/src",
  "artifacts/client-portal/src",
  "artifacts/careers-portal/src",
];

// A bare React state-setter call: `setFoo(` where the char before `set` is
// not `.` (excludes `obj.setHours(`) and not a word char (excludes
// `offset(`/`reset_x`). Capital letter after `set` matches the React
// `set<Name>` convention and skips lowercase Date mutators (none exist) and
// helpers like `settle(`.
const BARE_SETTER_RE = /(^|[^.\w$])set[A-Z]\w*\s*\(/;

// Extract every `useMemo(...)` argument region (the text between the opening
// `(` after `useMemo` and its balanced closing `)`), skipping string and
// comment contents so braces/parens inside them don't desync the counter.
export function extractUseMemoRegions(text) {
  const regions = [];
  const re = /(?:^|[^.\w$])(?:React\.)?useMemo\s*\(/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = text.indexOf("(", m.index + m[0].length - 1);
    if (open === -1) continue;
    const region = readBalanced(text, open);
    if (region !== null) regions.push(region);
  }
  return regions;
}

// Starting at the index of an opening paren, return the substring up to and
// including its matching close paren, ignoring parens inside strings,
// template literals, and comments. Returns null if unbalanced.
function readBalanced(text, openIdx) {
  let depth = 0;
  let i = openIdx;
  const n = text.length;
  while (i < n) {
    const c = text[i];
    const c2 = text[i + 1];
    // line comment
    if (c === "/" && c2 === "/") {
      const nl = text.indexOf("\n", i);
      i = nl === -1 ? n : nl;
      continue;
    }
    // block comment
    if (c === "/" && c2 === "*") {
      const end = text.indexOf("*/", i + 2);
      i = end === -1 ? n : end + 2;
      continue;
    }
    // strings / template literals
    if (c === '"' || c === "'" || c === "`") {
      i = skipString(text, i, c);
      continue;
    }
    if (c === "(") depth++;
    else if (c === ")") {
      depth--;
      if (depth === 0) return text.slice(openIdx, i + 1);
    }
    i++;
  }
  return null;
}

function skipString(text, i, quote) {
  const n = text.length;
  i++; // past opening quote
  while (i < n) {
    const c = text[i];
    if (c === "\\") { i += 2; continue; }
    if (c === quote) return i + 1;
    // template-literal ${...} can itself contain quotes/parens; skip it
    if (quote === "`" && c === "$" && text[i + 1] === "{") {
      let depth = 1;
      i += 2;
      while (i < n && depth > 0) {
        if (text[i] === "{") depth++;
        else if (text[i] === "}") depth--;
        i++;
      }
      continue;
    }
    i++;
  }
  return n;
}

// Index of the matching `}` for the `{` at openIdx, skipping strings/comments.
function matchBrace(s, openIdx) {
  let depth = 0;
  let i = openIdx;
  const n = s.length;
  while (i < n) {
    const c = s[i], c2 = s[i + 1];
    if (c === "/" && c2 === "/") { const nl = s.indexOf("\n", i); i = nl === -1 ? n : nl; continue; }
    if (c === "/" && c2 === "*") { const e = s.indexOf("*/", i + 2); i = e === -1 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === "`") { i = skipString(s, i, c); continue; }
    if (c === "{") depth++;
    else if (c === "}") { depth--; if (depth === 0) return i; }
    i++;
  }
  return -1;
}

// End (exclusive) of an expression-bodied arrow starting at j: scan until a
// `,`/`;` at the same bracket depth, or until an enclosing closer drops the
// depth below zero.
function exprEnd(s, j) {
  let i = j;
  const n = s.length;
  let round = 0, square = 0, curly = 0;
  while (i < n) {
    const c = s[i], c2 = s[i + 1];
    if (c === "/" && c2 === "/") { const nl = s.indexOf("\n", i); i = nl === -1 ? n : nl; continue; }
    if (c === "/" && c2 === "*") { const e = s.indexOf("*/", i + 2); i = e === -1 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === "`") { i = skipString(s, i, c); continue; }
    if (c === "(") round++;
    else if (c === "[") square++;
    else if (c === "{") curly++;
    else if (c === ")") { if (round === 0) return i; round--; }
    else if (c === "]") { if (square === 0) return i; square--; }
    else if (c === "}") { if (curly === 0) return i; curly--; }
    else if ((c === "," || c === ";") && round === 0 && square === 0 && curly === 0) return i;
    i++;
  }
  return n;
}

// Ranges within `s` that belong to a NESTED function/arrow (handlers,
// callbacks, etc.). A setter inside one of these runs on the inner
// function's invocation (e.g. an onClick), NOT during the useMemo's render.
function nestedFunctionRanges(s) {
  const ranges = [];
  let i = 0;
  const n = s.length;
  while (i < n) {
    const c = s[i], c2 = s[i + 1];
    if (c === "/" && c2 === "/") { const nl = s.indexOf("\n", i); i = nl === -1 ? n : nl; continue; }
    if (c === "/" && c2 === "*") { const e = s.indexOf("*/", i + 2); i = e === -1 ? n : e + 2; continue; }
    if (c === '"' || c === "'" || c === "`") { i = skipString(s, i, c); continue; }
    // `function` declaration/expression
    if (
      s.startsWith("function", i) &&
      !/[\w$]/.test(s[i - 1] || "") &&
      !/[\w$]/.test(s[i + 8] || "")
    ) {
      const brace = s.indexOf("{", i);
      if (brace !== -1) {
        const end = matchBrace(s, brace);
        if (end !== -1) { ranges.push([i, end + 1]); i = end + 1; continue; }
      }
    }
    // arrow `=>`
    if (c === "=" && c2 === ">") {
      let j = i + 2;
      while (j < n && /\s/.test(s[j])) j++;
      if (s[j] === "{") {
        const end = matchBrace(s, j);
        if (end !== -1) { ranges.push([i, end + 1]); i = end + 1; continue; }
      } else {
        const end = exprEnd(s, j);
        ranges.push([i, end]);
        i = end;
        continue;
      }
    }
    i++;
  }
  return ranges;
}

// Isolate the useMemo callback body inside a full `(...)` region, then return
// true iff a bare setter is called at the body's TOP level (not inside any
// nested handler/callback).
export function regionHasTopLevelSetter(region) {
  // Isolate the useMemo callback BODY. Support both arrow and
  // function-expression callbacks: useMemo(() => …) and useMemo(function(){…}).
  let body;
  const lead = region.slice(1).trimStart(); // drop the opening "(" of useMemo(
  if (lead.startsWith("function")) {
    const brace = region.indexOf("{", region.indexOf("function"));
    if (brace === -1) return false;
    const end = matchBrace(region, brace);
    if (end === -1) return false;
    body = region.slice(brace + 1, end); // function block body, braces excluded
  } else {
    const arrow = region.indexOf("=>");
    if (arrow === -1) return false;
    let j = arrow + 2;
    while (j < region.length && /\s/.test(region[j])) j++;
    if (region[j] === "{") {
      const end = matchBrace(region, j);
      if (end === -1) return false;
      body = region.slice(j + 1, end); // block body, braces excluded
    } else {
      body = region.slice(j, exprEnd(region, j)); // expression body
    }
  }
  const nested = nestedFunctionRanges(body);
  const re = new RegExp(BARE_SETTER_RE.source, "g");
  let m;
  while ((m = re.exec(body)) !== null) {
    const idx = m.index + m[0].length - 1; // index of the matched `set...(`
    const inNested = nested.some(([a, b]) => idx >= a && idx < b);
    if (!inNested) return true;
  }
  return false;
}

export function fileHasUseMemoSetState(text) {
  return extractUseMemoRegions(text).some((r) => regionHasTopLevelSetter(r));
}

async function walkTsx(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      await walkTsx(full, out);
    } else if (e.isFile() && e.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

async function findOffenders() {
  const offenders = [];
  for (const rel of FRONTEND_SRC_DIRS) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const files = await walkTsx(abs, []);
    for (const f of files) {
      const text = await readFile(f, "utf8");
      if (fileHasUseMemoSetState(text)) {
        offenders.push(relative(REPO_ROOT, f).split("\\").join("/"));
      }
    }
  }
  offenders.sort();
  return offenders;
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return new Set();
  const raw = readFileSync(ALLOWLIST_PATH, "utf8");
  const set = new Set();
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    set.add(t);
  }
  return set;
}

async function main() {
  const writeMode = process.argv.includes("--write-allowlist");
  const offenders = await findOffenders();

  if (writeMode) {
    const header = [
      "# usememo-setstate-allowlist.txt",
      "#",
      "# Pre-existing files that call a state setter inside useMemo.",
      "# These are accepted baseline offenders; the guard only fails on a",
      "# file NOT listed here. Regenerate with:",
      "#   node scripts/src/check-usememo-setstate.mjs --write-allowlist",
      "# Fix by moving the side effect into useEffect, then prune the line.",
      "#",
      `# Baseline captured: ${offenders.length} file(s).`,
      "",
    ].join("\n");
    await writeFile(ALLOWLIST_PATH, header + offenders.join("\n") + (offenders.length ? "\n" : ""), "utf8");
    console.log(`[check:usememo-setstate] wrote ${offenders.length} entries to ${relative(REPO_ROOT, ALLOWLIST_PATH)}`);
    return;
  }

  const allow = loadAllowlist();
  const fresh = offenders.filter((f) => !allow.has(f));
  const stale = [...allow].filter((f) => !offenders.includes(f)).sort();

  if (stale.length) {
    console.log(
      `[check:usememo-setstate] NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale ` +
        `(file fixed or removed) — prune from ${relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
    );
    for (const f of stale) console.log(`    - ${f}`);
  }

  if (fresh.length) {
    console.error(
      `\n[check:usememo-setstate] FAIL: ${fresh.length} file(s) call a state setter inside useMemo ` +
        `(render-phase side effect → infinite-render-loop risk):`,
    );
    for (const f of fresh) console.error(`    ✗ ${f}`);
    console.error(
      "\n  Fix: move the side effect into useEffect (and memoize any callback\n" +
        "  passed to children + bail out of setState when nothing changed).\n" +
        "  If this is genuinely intentional, add the path to scripts/usememo-setstate-allowlist.txt.",
    );
    process.exit(1);
  }

  console.log(
    `[check:usememo-setstate] OK — 0 setState-in-useMemo offenders` +
      (allow.size ? ` (${allow.size} allowlisted)` : "") + ".",
  );
}

main().catch((err) => {
  console.error("[check:usememo-setstate] ERROR:", err);
  process.exit(2);
});
