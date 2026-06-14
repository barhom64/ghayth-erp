#!/usr/bin/env node
//
// scripts/src/check-gl-swallow.mjs
//
// GL-failure-handling guard (#2301). A `catch (glErr|journalErr|...)` block
// around a GL posting MUST rethrow — otherwise the request returns success
// while the journal entry silently never posted (non-atomic; recoverable only
// by an admin draining the financial_posting_failures queue). #2301 documented
// ~20 such sites across modules with three inconsistent patterns (rethrow /
// compensate / swallow); the correct pattern is hr-exit's `throw glErr`
// ("don't hide a lost balance-sheet liability").
//
// This freezes the surface: a NEW file that adds a GL-error catch which does
// NOT rethrow fails CI. Existing files are baselined (whole-file) in
// scripts/gl-swallow-allowlist.txt for triage in their owning tracks — keying
// by file (not line) keeps the baseline stable across edits.
//
// Source is run through stripJs() first so a `}` or `throw` inside a JS comment
// or string/template literal can't truncate a catch body (false-FAIL on valid
// rethrowing code) or fake a rethrow (false-PASS). Known residual limitations
// (rare, under-report only — never a false-fail): a `throw` inside a nested
// closure in the catch body, and `}`/`throw` inside a regex literal.
//
import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const SRC = join(REPO_ROOT, "artifacts/api-server/src");
const ALLOWLIST_FILE = join(REPO_ROOT, "scripts/gl-swallow-allowlist.txt");

const CATCH_RE =
  /catch\s*\(\s*(glErr|glError|journalErr|journalError|postErr|postError)\b[^)]*\)\s*\{/g;

// Replace JS line/block comments and string/template literals with spaces,
// preserving every offset and newline so byte indices and line numbers stay
// exact. After this, braces and the word `throw` survive only in real code.
function stripJs(src) {
  let out = "";
  let st = null; // "line" | "block" | "sq" | "dq" | "tpl"
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const nx = src[i + 1];
    if (st === null) {
      if (ch === "/" && nx === "/") { st = "line"; out += "  "; i++; continue; }
      if (ch === "/" && nx === "*") { st = "block"; out += "  "; i++; continue; }
      if (ch === "'") { st = "sq"; out += " "; continue; }
      if (ch === '"') { st = "dq"; out += " "; continue; }
      if (ch === "`") { st = "tpl"; out += " "; continue; }
      out += ch; continue;
    }
    if (st === "line") { if (ch === "\n") { st = null; out += "\n"; } else out += " "; continue; }
    if (st === "block") {
      if (ch === "*" && nx === "/") { st = null; out += "  "; i++; }
      else out += ch === "\n" ? "\n" : " ";
      continue;
    }
    // inside a string/template literal
    if (ch === "\\") { out += "  "; i++; continue; }
    if ((st === "sq" && ch === "'") || (st === "dq" && ch === '"') || (st === "tpl" && ch === "`")) {
      st = null; out += " "; continue;
    }
    out += ch === "\n" ? "\n" : " ";
  }
  return out;
}

// From the `{` at openBrace, return the index of the matching `}`. Operates on
// stripJs()'d source, so no string/comment awareness is needed here.
function findBlockEnd(src, openBrace) {
  let depth = 0;
  for (let i = openBrace; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

async function loadAllowlist() {
  if (!existsSync(ALLOWLIST_FILE)) return new Set();
  const txt = await readFile(ALLOWLIST_FILE, "utf8");
  const files = new Set();
  for (const raw of txt.split("\n")) {
    const line = raw.replace(/#.*$/, "").trim();
    if (line) files.add(line);
  }
  return files;
}

async function walk(dir, acc = []) {
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const full = join(dir, e.name);
    if (e.isDirectory()) await walk(full, acc);
    else if (e.name.endsWith(".ts") && !e.name.endsWith(".test.ts")) acc.push(full);
  }
  return acc;
}

async function main() {
  const allow = await loadAllowlist();
  const files = await walk(SRC);
  const offenders = [];
  let total = 0;

  for (const file of files) {
    const raw = await readFile(file, "utf8");
    if (!/catch\s*\(\s*(glErr|glError|journalErr|journalError|postErr|postError)\b/.test(raw)) continue;
    const src = stripJs(raw); // comment/string-safe; offsets + newlines preserved
    const rel = relative(join(REPO_ROOT, "artifacts/api-server/src"), file);
    CATCH_RE.lastIndex = 0;
    let m;
    const hits = [];
    while ((m = CATCH_RE.exec(src)) !== null) {
      const open = src.indexOf("{", m.index + m[0].length - 1);
      const end = findBlockEnd(src, open);
      if (end < 0) continue;
      const body = src.slice(open + 1, end);
      if (/\bthrow\b/.test(body)) continue; // rethrows — correct
      total++;
      hits.push(src.slice(0, m.index).split("\n").length);
    }
    if (hits.length === 0) continue;
    if (allow.has(rel)) continue;
    offenders.push({ file: relative(REPO_ROOT, file), rel, lines: hits });
  }

  console.log(
    `[check:gl-swallow] scanned ${files.length} file(s) · ${total} non-rethrowing GL catch(es) · ${allow.size} file(s) baselined.`,
  );

  if (offenders.length === 0) {
    console.log("[check:gl-swallow] OK — no NEW file swallows a GL-posting error without rethrowing.");
    process.exit(0);
  }

  console.error(
    `[check:gl-swallow] FAIL — ${offenders.length} non-baselined file(s) catch a GL-posting error without rethrowing (#2301):\n`,
  );
  for (const o of offenders) {
    console.error(`  ${o.file}  (line${o.lines.length > 1 ? "s" : ""} ${o.lines.join(", ")})`);
  }
  console.error(
    "\nFix: rethrow the GL error so the operation is atomic (see hr-exit.ts:complete —\n" +
      "`throw glErr; // block on GL failure`), or compensate the source row and then\n" +
      "rethrow / surface a pending-posting status. If the swallow-to-retry-queue is\n" +
      "intentional for this module, add the file to scripts/gl-swallow-allowlist.txt\n" +
      "(one `routes/<file>.ts` or `lib/<...>.ts` per line; # comments) and track it under #2301.\n",
  );
  process.exit(1);
}

const isDirectRun =
  import.meta.url === `file://${process.argv[1]}` ||
  import.meta.url.endsWith(process.argv[1]?.replace(/^.*\//, "") ?? "\0");
if (isDirectRun) {
  main().catch((err) => {
    console.error("[check:gl-swallow] crashed:", err);
    process.exit(2);
  });
}
