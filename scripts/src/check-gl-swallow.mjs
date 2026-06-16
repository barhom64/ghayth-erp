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

// From a `)` index, walk back to its matching `(`. Used to scan a function
// header's parameter list (which may span lines / contain nested parens).
function findParenStart(src, closeParen) {
  let depth = 0;
  for (let i = closeParen; i >= 0; i--) {
    if (src[i] === ")") depth++;
    else if (src[i] === "(") { depth--; if (depth === 0) return i; }
  }
  return -1;
}

// A GL-posting failure is NOT silently lost when it is RECORDED to
// financial_posting_failures (the postingFailureRetry cron drains it). That
// recording happens whenever the post runs through `createGuardedJournalEntry`
// (businessHelpers.ts) — i.e. any GL call that passes a `guardTable`. So a
// `catch (glErr)` that does not rethrow is still SAFE if the post it wraps is
// guaranteed-recording. We compute that set of functions statically here:
//   directRE = functions whose body passes `guardTable:` OR calls
//              createGuardedJournalEntry OR INSERTs financial_posting_failures.
//   RE       = directRE + one transitive level (a thin wrapper like
//              postInventoryMovementGl that just delegates to a directRE
//              helper, e.g. warehouseEngine.postMovementGL).
// `createGuardedJournalEntry` itself is always recording.
const RECORD_SIGNAL = /guardTable\s*:|(?<!\w)createGuardedJournalEntry\b|financial_posting_failures/;

function extractFunctionBodies(src) {
  // Match a function/method/arrow header: an identifier, a (possibly
  // multi-line) parameter list, an optional return type, then `{`.
  const out = [];
  const re = /([A-Za-z_$][\w$]*)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const name = m[1];
    // Skip keywords — especially `async`, which would otherwise capture every
    // `async (...) => {…}` arrow as a phantom function named "async" and
    // poison the recording set (any function with an inline async callback
    // would then look like it "calls async()").
    if (["if", "for", "while", "switch", "catch", "return", "function",
         "async", "await", "new", "typeof", "void", "yield", "delete",
         "instanceof", "in", "of", "do", "else", "case"].includes(name)) continue;
    // find the `)` that closes this param list, then require `{` (allowing
    // an optional `: ReturnType` and `=>` between `)` and `{`).
    const paramOpen = src.indexOf("(", m.index);
    if (paramOpen < 0) continue;
    let depth = 0, paramClose = -1;
    for (let i = paramOpen; i < src.length; i++) {
      if (src[i] === "(") depth++;
      else if (src[i] === ")") { depth--; if (depth === 0) { paramClose = i; break; } }
    }
    if (paramClose < 0) continue;
    const between = src.slice(paramClose + 1, src.indexOf("{", paramClose) + 1);
    // header → body only when what's between `)` and `{` is a return type /
    // `=>` (no `;`, `)`, or `}` — which would mean it was a call, not a def).
    if (!/^[^;){}]*\{$/.test(between)) continue;
    const open = src.indexOf("{", paramClose);
    const end = findBlockEnd(src, open);
    if (end < 0) continue;
    out.push({ name, body: src.slice(open + 1, end) });
    re.lastIndex = open; // skip past the header; nested defs still matched on the next file pass
  }
  return out;
}

function computeRecordingEmitters(allBodies) {
  const direct = new Set(["createGuardedJournalEntry"]);
  for (const { name, body } of allBodies) {
    if (RECORD_SIGNAL.test(body)) direct.add(name);
  }
  const re = new Set(direct);
  // one transitive level: a function that calls a directly-recording function
  // (a thin delegator) is itself recording.
  for (const { name, body } of allBodies) {
    if (re.has(name)) continue;
    for (const d of direct) {
      if (new RegExp(`(?<!\\w)${d}\\s*\\(`).test(body)) { re.add(name); break; }
    }
  }
  return re;
}

// The try-body that a catch at `catchIdx` guards: from the `}` immediately
// before `catch` walk back to its matching `{` (the `try {`).
function tryBodyForCatch(src, catchIdx) {
  let j = catchIdx - 1;
  while (j >= 0 && src[j] !== "}") j--;
  if (j < 0) return "";
  // walk back to the matching `{`
  let depth = 0;
  for (let i = j; i >= 0; i--) {
    if (src[i] === "}") depth++;
    else if (src[i] === "{") { depth--; if (depth === 0) return src.slice(i + 1, j); }
  }
  return "";
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
  let recordingSkipped = 0;

  // Pass 1: compute the set of GL emitters that GUARANTEE the failure is
  // recorded (so swallowing their rethrow loses nothing). Built across the
  // whole tree so cross-file delegators resolve.
  const allBodies = [];
  const strippedByFile = new Map();
  for (const file of files) {
    const raw = await readFile(file, "utf8");
    const src = stripJs(raw);
    strippedByFile.set(file, { src, hasCatch: /catch\s*\(\s*(glErr|glError|journalErr|journalError|postErr|postError)\b/.test(raw) });
    allBodies.push(...extractFunctionBodies(src));
  }
  const recordingEmitters = computeRecordingEmitters(allBodies);
  const callsRecordingEmitter = (snippet) => {
    if (RECORD_SIGNAL.test(snippet)) return true;
    for (const name of recordingEmitters) {
      if (new RegExp(`(?<!\\w)${name}\\s*\\(`).test(snippet)) return true;
    }
    return false;
  };

  for (const file of files) {
    const { src, hasCatch } = strippedByFile.get(file);
    if (!hasCatch) continue;
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
      // SAFE if the failure is recorded: the wrapped post is guaranteed-
      // recording (guardTable → createGuardedJournalEntry → financial_posting_failures),
      // or the catch body itself records / surfaces the failure.
      if (callsRecordingEmitter(tryBodyForCatch(src, m.index)) || callsRecordingEmitter(body)) {
        recordingSkipped++;
        continue;
      }
      total++;
      hits.push(src.slice(0, m.index).split("\n").length);
    }
    if (hits.length === 0) continue;
    if (allow.has(rel)) continue;
    offenders.push({ file: relative(REPO_ROOT, file), rel, lines: hits });
  }

  console.log(
    `[check:gl-swallow] scanned ${files.length} file(s) · ${total} non-rethrowing+non-recording GL catch(es) · ${recordingSkipped} recorded-to-queue (safe) · ${allow.size} file(s) baselined.`,
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
