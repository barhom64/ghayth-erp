#!/usr/bin/env node
//
// scripts/src/check-audit-coverage.mjs
//
// Audit-coverage guard for api-server WRITE endpoints.
//
// Threat-model requirement (see threat_model.md → Repudiation):
//   "Sensitive mutations MUST log the acting principal, tenant, action, and
//    target entity." Every state-changing endpoint (POST/PUT/PATCH/DELETE)
//   must therefore either:
//     - call createAuditLog(...) / emitEvent(...) inside the handler, OR
//     - be covered by the global auditMiddleware ENTITY_MAP prefix (app.ts),
//       which auto-logs any mutating request under a mapped prefix.
//
// Why this exists: a 2026-06-13 audit (SYSTEM_AUDIT) found ~18% of write
// endpoints with no detectable audit trail — including sensitive financial
// mutations (fiscal-period close/reopen/lock, journal approve/post/reverse,
// payment-run execute, opening-balances, vendor-advance apply). The number
// itself is partly a static-scan limitation (engines that audit out of the
// handler window read as gaps), so rather than churn 158 handlers blindly
// this guard FREEZES the current baseline and blocks the gap from GROWING:
// every NEW write endpoint must carry audit, or be explicitly allowlisted
// with a documented reason. As real gaps get audit wired in, prune them
// from the allowlist and the covered % climbs monotonically.
//
// OFFLINE: pure source scan of artifacts/api-server/src/routes + the
// auditMiddleware ENTITY_MAP, no DB / build / server needed — so it runs
// unconditionally in CI (like check:dump-drift / check:dup-filenames).
//
// Detection mirrors audit/system-review/tooling/api-to-audit-map.mjs exactly
// so the two stay in lockstep (same mount-map parse, same middleware-prefix
// awareness, same 200-line handler window, same hasAudit predicate).
//
// Allowlist key: `METHOD /full/mounted/path` (mount-aware, line-independent
// so it survives handlers moving up/down the file).
//
// Usage:
//   node scripts/src/check-audit-coverage.mjs                 # gate
//   node scripts/src/check-audit-coverage.mjs --write-allowlist
//
import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../..");
const ROUTES = join(REPO, "artifacts/api-server/src/routes");
const INDEX_TS = join(ROUTES, "index.ts");
const AUDIT_MW = join(REPO, "artifacts/api-server/src/middlewares/auditMiddleware.ts");
const ALLOWLIST_PATH = join(REPO, "scripts/audit-coverage-allowlist.txt");

// ── import clause → { localSymbol: routerFile.ts }. Handles default imports
// (`import foo from "./x"`), namespace (`import * as foo from "./x"`), and —
// critically — multi-symbol named lists (`import { a, b as c, d } from "./x"`),
// each with optional `as` aliases. The earlier single-(\w+) regex captured only
// the FIRST symbol of a named list, so every router after the first (e.g. the
// wiring-stubs.js routers) fell back to an empty mount prefix and produced
// non-canonical allowlist keys like `POST /:id/ocr/rerun`.
function parseRouterImports(src) {
  const routerToFile = {};
  const importRe = /import\s+([^;]+?)\s+from\s+["'](\.\/[^"']+)["']/g;
  let m;
  while ((m = importRe.exec(src))) {
    const clause = m[1].trim();
    const file = m[2].replace(/\.js$/, ".ts").replace(/^\.\//, "");
    const brace = clause.match(/\{([^}]*)\}/);
    if (brace) {
      for (const part of brace[1].split(",")) {
        const name = part.trim().split(/\s+as\s+/).pop().trim();
        if (/^\w+$/.test(name)) routerToFile[name] = file;
      }
    } else {
      const name = clause.replace(/^\*\s+as\s+/, "").trim();
      if (/^\w+$/.test(name)) routerToFile[name] = file;
    }
  }
  return routerToFile;
}

// ── mount map: routerFile.ts → [mountPrefix, ...] (parsed from routes/index.ts)
// `srcOverride` lets the test feed synthetic index.ts source without disk I/O.
export function buildMountMap(srcOverride) {
  const src = srcOverride != null ? srcOverride : readFileSync(INDEX_TS, "utf8");
  const routerToFile = parseRouterImports(src);
  const useRe = /router\.use\(\s*["']([^"']+)["']([^;]*?)(\w+Router)\s*\)/g;
  const map = {};
  let m;
  while ((m = useRe.exec(src))) {
    const file = routerToFile[m[3]];
    if (!file) continue;
    (map[file] = map[file] || new Set()).add(m[1]);
  }
  for (const k of Object.keys(map)) map[k] = [...map[k]];
  return map;
}

// ── auditMiddleware ENTITY_MAP prefixes (auto-audited mutating routes)
function buildAuditedPrefixes() {
  try {
    const src = readFileSync(AUDIT_MW, "utf8");
    const block = src.match(/ENTITY_MAP\s*:[^=]*=\s*\{([\s\S]*?)\};/);
    if (!block) return [];
    const prefixes = [];
    for (const mm of block[1].matchAll(/["']([^"']+)["']\s*:\s*["'][^"']+["']/g)) {
      prefixes.push(mm[1]);
    }
    return prefixes.sort((a, b) => b.length - a.length);
  } catch {
    return [];
  }
}

function makeIsAuditedByMiddleware(prefixes) {
  return (fullPath) => {
    for (const p of prefixes) {
      if (fullPath === p || fullPath.startsWith(p + "/")) return true;
    }
    return false;
  };
}

// Audit primitives, by name. A handler-window match on any of these means the
// handler logs who/what/when directly.
const AUDIT_PRIMITIVE = /createAuditLog\s*\(|auditFromRequest\s*\(|auditMutation\s*\(|emitEvent\s*\(/;

// Cross-file audit wrappers: library helpers (imported, not file-local) that
// UNCONDITIONALLY write an audit_logs row internally, so any handler calling
// them is audited even with no inline primitive. `applyTransition`
// (lib/lifecycleEngine.ts) always calls createAuditLog after every committed
// state change — see lifecycleEngine.ts. Calling it counts as coverage.
// The optional `<…>` group recognises generic-typed calls
// (`applyTransition<Record<string, unknown>>({…})`) — without it the bare
// `\s*\(` cannot match because the type-argument list sits between the name
// and the call paren, so 22 audited finance/legal/support lifecycle handlers
// were mis-reported as audit gaps. `[^(){};]*` keeps the match on the call's
// own statement (never crosses a paren/brace/`;`); greedy backtracking
// handles nested generics like `<Record<string, unknown>>`.
export const KNOWN_AUDIT_WRAPPERS = /(?<!\.)\b(?:applyTransition)\s*(?:<[^(){};]*>)?\s*\(/;

// Many routers funnel every write through a thin file-local wrapper instead of
// calling the primitive inline — e.g. org.ts `audit(req, …)` and
// inboxConversations.ts `recordConversationAction(req, …)`, both of which call
// auditFromRequest + emitEvent internally. The wrapper's NAME is not an audit
// primitive, so the per-handler window scan reported these audited endpoints as
// gaps. This detects such wrappers (a function/const defined in THIS file whose
// OWN body — balanced-brace scoped, so it cannot bleed into a neighbouring
// handler — calls a primitive) and returns a RegExp matching a NON-METHOD call
// to any of them, so a handler that delegates to the wrapper is correctly
// counted as audited. It can only REDUCE false positives: a genuinely-unaudited
// handler calls neither a primitive nor an auditing wrapper, so it stays flagged.
//
// Returns the wrapper's OWN body. It first walks past the parameter list by
// paren depth — so braces inside the signature (`= {}` defaults, `params: {…}`
// inline object types, multi-line signatures) are never mistaken for the body —
// then balances the body braces so the scan stops at the wrapper's closing `}`
// and cannot bleed into following code. For a brace-less arrow (`=> expr`) the
// body is the expression text after `=>`.
function wrapperBody(lines, defIdx) {
  const text = lines.slice(defIdx, Math.min(defIdx + 120, lines.length)).join("\n");
  const lp = text.indexOf("(");
  if (lp === -1) return "";
  let i = lp, pdepth = 0;
  for (; i < text.length; i++) {
    if (text[i] === "(") pdepth++;
    else if (text[i] === ")") { pdepth--; if (pdepth === 0) { i++; break; } }
  }
  const bo = text.indexOf("{", i);
  if (bo === -1) {
    const ar = text.indexOf("=>", i);
    return ar === -1 ? "" : text.slice(ar + 2, ar + 400); // brace-less arrow
  }
  let depth = 0;
  for (let p = bo; p < text.length; p++) {
    if (text[p] === "{") depth++;
    else if (text[p] === "}") { depth--; if (depth === 0) return text.slice(bo, p + 1); }
  }
  return text.slice(bo);
}

// Common collection/Promise method names that are never audit wrappers — guards
// against a stray `.push(`/`.set(`/`.then(` being read as a wrapper call.
const NON_WRAPPER_NAMES = new Set([
  "push", "pop", "shift", "unshift", "splice", "set", "get", "add", "has", "delete",
  "map", "filter", "forEach", "reduce", "find", "some", "every", "then", "catch",
  "finally", "join", "slice", "concat", "includes", "sort", "keys", "values",
]);

export function auditWrapperCallMatcher(src) {
  const lines = src.split(/\r?\n/);
  const defRe = /(?:async\s+function|function)\s+([A-Za-z_]\w*)\s*\(|(?:const|let)\s+([A-Za-z_]\w*)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*(?::[^=]*?)?=>|[A-Za-z_]\w*\s*=>)/;
  const primitiveNames = new Set(["createAuditLog", "auditFromRequest", "auditMutation", "emitEvent"]);
  const names = new Set();
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(defRe);
    if (!m) continue;
    const name = m[1] || m[2];
    if (!name || primitiveNames.has(name) || NON_WRAPPER_NAMES.has(name)) continue;
    if (AUDIT_PRIMITIVE.test(wrapperBody(lines, i))) names.add(name);
  }
  if (names.size === 0) return null;
  // (?<!\.) so a method call like `arr.<name>(` is NOT read as a wrapper call.
  return new RegExp(`(?<!\\.)\\b(?:${[...names].join("|")})\\s*\\(`);
}

function scanFile(file, mountMap, isAuditedByMiddleware) {
  const src = readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  const wrapperRe = auditWrapperCallMatcher(src);
  const endpoints = [];
  const re = /\b(\w+)\.(get|post|put|patch|delete)\(\s*[`"']([^`"']+)[`"']/i;
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    const winStart = i;
    let winEnd = i + 1;
    while (winEnd < lines.length && winEnd - winStart < 200) {
      if (re.test(lines[winEnd])) break;
      winEnd++;
    }
    const win = lines.slice(winStart, winEnd).join("\n");
    const fileRel = file.replace(REPO + "/", "");
    const fileBase = fileRel.replace(/^artifacts\/api-server\/src\/routes\//, "");
    const prefixes = mountMap[fileBase] || [""];
    for (const prefix of prefixes) {
      let joined = prefix + m[3];
      if (joined.length > 1 && joined.endsWith("/")) joined = joined.slice(0, -1);
      endpoints.push({
        method: m[2].toUpperCase(),
        path: joined,
        file: fileRel,
        line: i + 1,
        hasAudit:
          AUDIT_PRIMITIVE.test(win) ||
          KNOWN_AUDIT_WRAPPERS.test(win) ||
          (wrapperRe !== null && wrapperRe.test(win)) ||
          isAuditedByMiddleware(joined),
      });
    }
  }
  return endpoints;
}

// ── PURE, testable core ──────────────────────────────────────────────────
// Given endpoint records {method, path, hasAudit}, return the sorted set of
// allowlist keys ("METHOD path") for WRITE endpoints lacking an audit trail.
// Exported so the predicate is unit-testable without touching disk.
export function unauditedWriteKeys(endpoints) {
  const keys = new Set();
  for (const e of endpoints) {
    if (e.method === "GET") continue;
    if (e.hasAudit) continue;
    keys.add(`${e.method} ${e.path}`);
  }
  return [...keys].sort();
}

function scanAll() {
  const mountMap = buildMountMap();
  const isAuditedByMiddleware = makeIsAuditedByMiddleware(buildAuditedPrefixes());
  const all = [];
  for (const f of readdirSync(ROUTES)) {
    if (!f.endsWith(".ts")) continue;
    all.push(...scanFile(join(ROUTES, f), mountMap, isAuditedByMiddleware));
  }
  return all;
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return new Set();
  const set = new Set();
  for (const line of readFileSync(ALLOWLIST_PATH, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    set.add(t);
  }
  return set;
}

function main() {
  const writeMode = process.argv.includes("--write-allowlist");
  const endpoints = scanAll();
  const gaps = unauditedWriteKeys(endpoints);

  if (writeMode) {
    const header = [
      "# audit-coverage-allowlist.txt",
      "#",
      "# WRITE endpoints (POST/PUT/PATCH/DELETE) with no statically-detectable",
      "# audit trail (no createAuditLog/emitEvent in the handler window and not",
      "# under an auditMiddleware ENTITY_MAP prefix). These are the accepted",
      "# baseline; the guard fails only on a NEW unaudited write endpoint.",
      "# Regenerate with:",
      "#   node scripts/src/check-audit-coverage.mjs --write-allowlist",
      "# As real gaps get audit wired in, prune their line here — the covered %",
      "# climbs monotonically and can never silently regress.",
      "#",
      `# Baseline captured: ${gaps.length} unaudited write endpoint(s).`,
      "",
    ].join("\n");
    writeFileSync(ALLOWLIST_PATH, header + gaps.join("\n") + "\n", "utf8");
    console.log(`[check:audit-coverage] wrote ${gaps.length} entries to ${relative(REPO, ALLOWLIST_PATH)}`);
    return;
  }

  const allow = loadAllowlist();
  const fresh = gaps.filter((k) => !allow.has(k));
  const stale = [...allow].filter((k) => !gaps.includes(k)).sort();

  if (stale.length) {
    console.log(
      `[check:audit-coverage] NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale ` +
        `(endpoint now audited or removed) — prune from ${relative(REPO, ALLOWLIST_PATH)}:`,
    );
    for (const k of stale) console.log(`    - ${k}`);
  }

  if (fresh.length) {
    console.error(
      `\n[check:audit-coverage] FAIL: ${fresh.length} NEW write endpoint(s) with no audit trail:`,
    );
    for (const k of fresh) console.error(`    \u2717 ${k}`);
    console.error(
      "\n  Every state-changing endpoint must log who/what/when. Fix by either:\n" +
        "    - calling createAuditLog(...) or emitEvent(...) in the handler, or\n" +
        "    - mounting it under an auditMiddleware ENTITY_MAP prefix.\n" +
        "  If it genuinely needs no audit (rare), add its `METHOD /path` line to\n" +
        "  scripts/audit-coverage-allowlist.txt with a comment explaining why.",
    );
    process.exit(1);
  }

  const writes = endpoints.filter((e) => e.method !== "GET");
  const covered = writes.length - gaps.length;
  console.log(
    `[check:audit-coverage] OK — ${covered}/${writes.length} write endpoints audited; ` +
      `${gaps.length} baseline gap(s) allowlisted, 0 new.`,
  );
}

// Run only when invoked directly (sibling .test.mjs imports the pure helper).
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    main();
  } catch (err) {
    console.error("[check:audit-coverage] ERROR:", err);
    process.exit(2);
  }
}
