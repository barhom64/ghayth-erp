#!/usr/bin/env node
// scripts/src/check-frontend-backend-wiring.mjs
//
// Report-only frontend ↔ backend route wiring audit.
//
// Catches the class of bug where a page calls `apiFetch("/some/path")` but
// no backend route handles that URL — either because the backend route was
// renamed/deleted, or because the frontend has a typo, or because the
// feature was sketched on one side without the other.
//
// What it does:
//   1. Walks every .ts/.tsx under `artifacts/ghayth-erp/src/` and extracts
//      every string-literal first argument to:
//        - apiFetch("/url"…)            ← lib/api.ts low-level helper
//        - useApiQuery([…], "/url"…)    ← list/detail queries
//        - useApiMutation("/url", …)    ← mutations (POST/PUT/PATCH/DELETE)
//        - apiPatch("/url"…)            ← typed shortcut
//        - apiPost("/url"…)             ← typed shortcut
//        - apiPut("/url"…)              ← typed shortcut
//        - apiDelete("/url"…)           ← typed shortcut
//      Calls whose first arg is NOT a string literal (e.g. `(b) =>
//      \`/x/${b.id}\`` factory functions, template literals with
//      interpolation) are extracted by stripping the interpolation
//      placeholder so they can still be matched against routes.
//
//   2. Reuses the route-extraction logic from check-openapi-coverage.mjs
//      to build the catalog of real backend routes.
//
//   3. For each frontend URL, normalises it (template `${x}` → `:param`)
//      and reports:
//        - resolved: matches a backend route ✓
//        - orphan:   no backend route matches (real bug or typo)
//        - dynamic:  too dynamic to match statically (skipped)
//
// What it does NOT do (deliberately):
//   - Does NOT verify method matching (just path). A follow-up could
//     read the HTTP verb argument of useApiMutation and cross-check.
//   - Does NOT walk the api-server itself. Frontend wiring only.
//
// Failure mode:
//   - exit 0: every frontend call resolves to a real backend route
//   - exit 1: at least one orphan exists
//   The baseline today is 0 orphans (see forms-migration-report.md), so
//   the guard is hard from the start. Any commit that introduces an
//   unmatched apiFetch URL fails the build.
//
// Output: stdout. Pipe to a file if you want to track the baseline.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const FRONTEND_SRC = path.join(REPO, "artifacts/ghayth-erp/src");
const ROUTES_DIR = path.join(REPO, "artifacts/api-server/src/routes");
const ROUTES_INDEX = path.join(ROUTES_DIR, "index.ts");

// ---------- step 1: build the backend route catalog ----------
//
// This duplicates a chunk of check-openapi-coverage.mjs — the two scripts
// were written at different times and the OpenAPI one wasn't structured
// for reuse. Keep the extraction logic in sync if either side changes.

function parseRoutesIndex() {
  const src = fs.readFileSync(ROUTES_INDEX, "utf-8");
  const imports = new Map(); // localName -> module stem
  const mounts = new Map();  // localName -> Set<mountPrefix>  (some routers are mounted on multiple prefixes)
  // Default import: `import xRouter from "./y.js"`
  const defaultRe =
    /import\s+(\w+)\s+from\s+["']\.\/([\w\-./]+?)(?:\.js|\.ts)?["']/g;
  for (const m of src.matchAll(defaultRe)) imports.set(m[1], m[2]);
  // Named import: `import { aRouter, bRouter as c } from "./y.js"` — each
  // local name maps to the same module stem. Renames via `as` use the
  // local alias for the mounts-table lookup.
  const namedRe =
    /import\s+\{\s*([^}]+?)\s*\}\s+from\s+["']\.\/([\w\-./]+?)(?:\.js|\.ts)?["']/g;
  for (const m of src.matchAll(namedRe)) {
    const [, list, modPath] = m;
    for (const piece of list.split(",")) {
      const seg = piece.trim();
      if (!seg) continue;
      const local = (seg.split(/\s+as\s+/)[1] ?? seg.split(/\s+as\s+/)[0]).trim();
      imports.set(local, modPath);
    }
  }
  // router.use(...) — the middleware position between the path and the
  // router can include nested function calls (e.g.
  // `requireModule("notifications")`), so a flat `[^)]+?` regex closes
  // at the wrong paren. Walk char-by-char to find the balanced
  // matching `)` for each `router.use(` opening.
  for (let i = 0; i < src.length; i++) {
    if (!src.startsWith("router.use(", i)) continue;
    const startArgs = i + "router.use(".length;
    let depth = 1;
    let j = startArgs;
    for (; j < src.length && depth > 0; j++) {
      if (src[j] === "(") depth++;
      else if (src[j] === ")") depth--;
    }
    if (depth !== 0) continue;
    const argsBlob = src.slice(startArgs, j - 1);
    // Pull the leading string-literal path (if any).
    const pathMatch = argsBlob.match(/^\s*["']([^"']*)["']\s*,?\s*/);
    const mountPath = pathMatch ? pathMatch[1] : "";
    // Pull every bare identifier; pick the LAST one we know is a router import.
    const idents = [...argsBlob.matchAll(/\b([A-Za-z_][\w]*)\b/g)].map((x) => x[1]);
    const router = [...idents].reverse().find((id) => imports.has(id));
    if (!router) continue;
    if (!mounts.has(router)) mounts.set(router, new Set());
    mounts.get(router).add(mountPath);
    i = j; // advance past the matched call
  }
  return { imports, mounts };
}

function extractRouterCalls(filePath) {
  const src = fs.readFileSync(filePath, "utf-8");
  const calls = [];
  // Match both `router.get("/x")` and the more common `xxxRouter.get("/x")`
  // shape used across the codebase. Captures the var name so we can map
  // back to the mount prefix.
  const callRe =
    /(\w+)\.(get|post|put|patch|delete)\(\s*(?:["']([^"']+)["']|`([^`$]+)`)/g;
  for (const m of src.matchAll(callRe)) {
    const [, varName, method, dq, bt] = m;
    // Accept either the literal `router` (the conventional local name)
    // or any identifier ending in "Router" (e.g. journalRouter, hrRouter).
    if (varName !== "router" && !/Router$/.test(varName)) continue;
    const lit = dq ?? bt;
    if (lit) calls.push({ varName, method, path: lit });
  }
  return calls;
}

function buildBackendRoutes() {
  const { imports, mounts } = parseRoutesIndex();
  // Build stem → set of (importedName, mountPrefix) tuples. A given
  // .ts file usually exports one router under one symbol, but a few
  // files re-export under multiple names mounted on different
  // prefixes — preserve all of them.
  // stemToImports[stem] = [{ varName, mountPrefix }, …] — one tuple per
  // *mount* of an imported router from that file. A router mounted at
  // two paths produces two tuples, both with the same varName.
  const stemToImports = new Map();
  for (const [v, modStem] of imports.entries()) {
    const stem = modStem.split("/").pop();
    if (!stemToImports.has(stem)) stemToImports.set(stem, []);
    const prefixes = mounts.get(v);
    if (!prefixes) continue;
    for (const mountPrefix of prefixes) {
      stemToImports.get(stem).push({ varName: v, mountPrefix });
    }
  }
  const files = fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts");
  const routes = [];
  for (const f of files) {
    const stem = f.replace(/\.ts$/, "");
    const imps = stemToImports.get(stem);
    if (!imps) continue;
    // Resolve the export name(s) from the file: usually `routerVar`
    // matches the imported name 1:1, or maps via `export {x as y}`.
    // Cheap approach: for each call whose varName appears in any of
    // this file's imports' name set, use that mount prefix. If the
    // call's varName isn't in the import set, fall back to the first
    // mounted import (covers the case where the file defines the
    // router locally as `myRouter` and exports it).
    const callsBy = extractRouterCalls(path.join(ROUTES_DIR, f));
    // Emit each call once per mount prefix the file's exported router(s)
    // are mounted on. When a router is mounted at /requests AND
    // /request-catalog, both prefixes are real backend URLs.
    const prefixes = [...new Set(imps.map((i) => i.mountPrefix))];
    for (const c of callsBy) {
      for (const mountPrefix of prefixes) {
        const localPath = c.path.startsWith("/") ? c.path : "/" + c.path;
        const full = ("/api" + mountPrefix + localPath).replace(/\/+$/, "") || "/";
        routes.push({ method: c.method.toUpperCase(), path: full });
      }
    }
  }
  return routes;
}

// ---------- step 2: extract frontend API calls ----------

/**
 * Find every API URL the frontend asks for. The url helpers exist in
 * artifacts/ghayth-erp/src/lib/api.ts and are imported as named symbols.
 * We capture both the symbol and the URL literal.
 *
 * Patterns we recognise (all first-arg-string-literal):
 *   apiFetch("/x")            apiFetch(`/x/${id}`)
 *   apiPatch("/x")            apiPatch(`/x/${id}`)
 *   apiPost("/x")             apiPut("/x")        apiDelete("/x")
 *   useApiQuery([…], "/x")    useApiQuery([…], `/x/${id}`)
 *   useApiMutation("/x", …)
 *
 * The factory-function shape `useApiMutation((body) => `/x/${body.id}`, …)`
 * is also recognised — we walk the arrow body for the first template
 * literal.
 */
function* walk(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) yield* walk(p);
    else if (/\.(ts|tsx)$/.test(entry.name)) yield p;
  }
}

/**
 * Read a JS/TS string literal that starts at `src[start]`. Supports
 * single-quote, double-quote, and backtick (template) literals. For
 * templates it correctly balances nested `${ ... }` interpolations,
 * including arbitrarily-nested `${ \`x${y}\` }` chains.
 *
 * Returns `{ value, end }` where `value` is the raw inner text of the
 * literal (without the surrounding quotes) and `end` is the index
 * AFTER the closing quote/backtick. Returns null if `src[start]` is
 * not a string literal opener.
 */
function readString(src, start) {
  const q = src[start];
  if (q !== "'" && q !== '"' && q !== "`") return null;
  let i = start + 1;
  let buf = "";
  while (i < src.length) {
    const c = src[i];
    if (c === "\\") { buf += c + (src[i + 1] ?? ""); i += 2; continue; }
    if (q === "`" && c === "$" && src[i + 1] === "{") {
      // Nested ${...}; balance braces, allow nested template literals.
      buf += "${";
      i += 2;
      let depth = 1;
      while (i < src.length && depth > 0) {
        const cc = src[i];
        if (cc === "{") { depth++; buf += cc; i++; continue; }
        if (cc === "}") { depth--; buf += cc; i++; continue; }
        if (cc === "'" || cc === '"' || cc === "`") {
          const inner = readString(src, i);
          if (!inner) { buf += cc; i++; continue; }
          buf += src.slice(i, inner.end);
          i = inner.end;
          continue;
        }
        buf += cc;
        i++;
      }
      continue;
    }
    if (c === q) return { value: buf, end: i + 1 };
    buf += c;
    i++;
  }
  return null; // unterminated
}

const HELPERS = new Set([
  "apiFetch", "apiPatch", "apiPost", "apiPut", "apiDelete",
  "useApiQuery", "useApiMutation",
]);

function extractFrontendCalls() {
  const calls = [];
  for (const file of walk(FRONTEND_SRC)) {
    if (file.includes("/lib/api.ts")) continue;
    const src = fs.readFileSync(file, "utf-8");
    const rel = path.relative(REPO, file);
    // Find every call-site of a known helper and extract its URL arg(s)
    // using the balanced string-literal reader above. The regex just
    // anchors us at the call name; the reader walks the arg list.
    const re = /\b(apiFetch|apiPatch|apiPost|apiPut|apiDelete|useApiQuery|useApiMutation)\b\s*<[^>]*>?\s*\(/g;
    for (const m of src.matchAll(re)) {
      const helper = m[1];
      // Cursor sits just past the `(`. Skip whitespace, then read the
      // first arg. For useApiQuery the first arg is the array; skip
      // past it and read the URL from the second arg.
      let i = m.index + m[0].length;
      while (i < src.length && /\s/.test(src[i])) i++;
      if (helper === "useApiQuery") {
        // Skip the array literal arg.
        if (src[i] !== "[") continue;
        let depth = 1;
        i++;
        while (i < src.length && depth > 0) {
          if (src[i] === "[") depth++;
          else if (src[i] === "]") depth--;
          i++;
        }
        // Skip the comma + whitespace before the URL arg.
        while (i < src.length && /[\s,]/.test(src[i])) i++;
      }
      if (helper === "useApiMutation" && src[i] === "(") {
        // useApiMutation((body) => `/x/${body.id}`, …) — skip past the
        // arrow head, then read the template literal that follows.
        let depth = 1;
        i++;
        while (i < src.length && depth > 0) {
          if (src[i] === "(") depth++;
          else if (src[i] === ")") depth--;
          i++;
        }
        // Skip `=>` and whitespace.
        while (i < src.length && /[\s=>]/.test(src[i])) i++;
      }
      const lit = readString(src, i);
      if (!lit) continue;
      if (!lit.value.startsWith("/")) continue;
      calls.push({ file: rel, url: lit.value, line: lineOf(src, m.index) });
    }
  }
  return calls;
}

function lineOf(src, idx) {
  return src.slice(0, idx).split("\n").length;
}

// ---------- step 3: normalise + match ----------

/**
 * Turn a frontend URL into the matching backend pattern shape.
 *   `/finance/journals/${id}/post`  →  /api/finance/journals/:id/post
 *   `/api/x`                        →  /api/x  (already prefixed)
 *   `/x`                            →  /api/x  (frontend strips /api in apiFetch)
 *
 * The api.ts helper prefixes /api automatically, so frontend URLs
 * usually start with /. We add /api back so the comparison lines up
 * with backend route shapes which already include /api.
 */
function normaliseFrontendUrl(url) {
  let u = url;
  // Greedy stripper for nested ${...} (template-literal interpolation).
  // Handles single-level conditionals like `${cond ? "/x" : ""}` by
  // counting braces — a simple `\$\{[^}]+\}` regex misses the nested
  // ones and leaves garbage in the path.
  while (true) {
    const start = u.indexOf("${");
    if (start < 0) break;
    let depth = 0;
    let end = start;
    for (let i = start; i < u.length; i++) {
      if (u[i] === "{") depth++;
      else if (u[i] === "}") {
        depth--;
        if (depth === 0) { end = i; break; }
      }
    }
    if (end <= start) break;
    // Distinguish "path parameter" from "query suffix":
    //   - if the `${…}` lives after a `?` already in the URL, or
    //   - the variable name reads like a query suffix (Qs, QueryString,
    //     Suffix, scopeSuffix), or
    //   - the body is a conditional whose true-branch starts with `?`,
    // treat it as a query-string and drop it entirely.
    const inQueryString = u.slice(0, start).includes("?");
    const body = u.slice(start + 2, end);
    // QS heuristics — keep stacking them, false negatives create
    // misleading "orphan" reports and the only cost is missing a real
    // bug where someone calls a non-existent `/api/foo${id}` route.
    const looksLikeQs =
      // Plain QS variable: scopeSuffix, filterParams, querystring, qs, …
      /^(scope|filter)?(qs|querystring|queryparams|filterparams|suffix|query|params)$/i.test(body.trim()) ||
      // Already a literal query string inside: `?key=…`
      /\?\s*[\w]+\s*=/.test(body) ||
      // Conditional QS suffix: `X ? "?…" : ""`  or  `X ? \`?${…}\` : ""`
      /\?\s*[`"']\s*\?/.test(body) ||
      // Conditional that bottoms out to "" — strong signal of QS
      /:\s*""\s*$/.test(body);
    if (inQueryString || looksLikeQs) {
      u = u.slice(0, start) + u.slice(end + 1);
    } else {
      u = u.slice(0, start) + ":param" + u.slice(end + 1);
    }
  }
  // Strip query string — backend route patterns don't include them.
  u = u.split("?")[0];
  // Strip trailing slash.
  u = u.replace(/\/+$/, "") || "/";
  if (!u.startsWith("/api/") && u !== "/api") u = "/api" + (u.startsWith("/") ? u : "/" + u);
  return u;
}

function normaliseBackendUrl(url) {
  // Backend uses :param. Strip trailing slash.
  return url.replace(/\/+$/, "") || "/";
}

/**
 * Returns true if frontend URL matches a backend route. Both URLs use
 * `:param` for placeholders so a literal comparison on segments works
 * — provided every `:param` on one side aligns with a segment on the
 * other.
 */
function urlsMatch(fe, be) {
  if (fe === be) return true;
  const fs2 = fe.split("/");
  const bs = be.split("/");
  if (fs2.length !== bs.length) return false;
  for (let i = 0; i < fs2.length; i++) {
    const a = fs2[i];
    const b = bs[i];
    if (a === b) continue;
    if (a === ":param" || b === ":param") continue;
    if (a.startsWith(":") || b.startsWith(":")) continue;
    return false;
  }
  return true;
}

// ---------- step 4: report ----------

/**
 * Run the audit and return { resolved, orphans, backendPaths }. Pure
 * function over the filesystem — split out so the test harness can
 * exercise the pieces (normalise/match) without going through main().
 */
export function runAudit() {
  const backend = buildBackendRoutes();
  const backendPaths = new Set(backend.map((r) => normaliseBackendUrl(r.path)));
  const frontend = extractFrontendCalls();

  const resolved = [];
  const orphans = [];

  for (const c of frontend) {
    const fe = normaliseFrontendUrl(c.url);
    let hit = false;
    if (backendPaths.has(fe)) {
      hit = true;
    } else {
      for (const be of backendPaths) {
        if (urlsMatch(fe, be)) {
          hit = true;
          break;
        }
      }
    }
    (hit ? resolved : orphans).push({ ...c, normalised: fe });
  }

  return { resolved, orphans, backendPaths, frontend };
}

// Test-only exports — the .test.mjs sibling exercises each piece
// independently so future regex/heuristic tweaks can't silently
// re-break the audit. Don't import these from non-test code.
export { normaliseFrontendUrl, urlsMatch, readString };

function main() {
  const { resolved, orphans, backendPaths, frontend } = runAudit();

  console.log(`# frontend ↔ backend route wiring audit\n`);
  console.log(`backend routes (mounted):         ${backendPaths.size}`);
  console.log(`frontend API call-sites scanned:  ${frontend.length}`);
  console.log(`resolved → real backend route:    ${resolved.length}`);
  console.log(`orphan (no backend match):        ${orphans.length}\n`);

  if (orphans.length > 0) {
    console.log(`## orphan frontend calls (top by file)\n`);
    const byFile = new Map();
    for (const o of orphans) {
      if (!byFile.has(o.file)) byFile.set(o.file, []);
      byFile.get(o.file).push(o);
    }
    const sorted = [...byFile.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [file, list] of sorted.slice(0, 30)) {
      console.log(`### ${file} (${list.length})`);
      for (const o of list.slice(0, 6)) {
        console.log(`  L${o.line}: ${o.url}   →   ${o.normalised}`);
      }
      if (list.length > 6) console.log(`  … and ${list.length - 6} more`);
      console.log();
    }
    if (sorted.length > 30) {
      console.log(`(${sorted.length - 30} more files with orphans, truncated)`);
    }
    console.log(
      `\n✗ wiring audit: ${orphans.length} orphan frontend call(s).\n` +
        `Each one is an apiFetch/useApi* URL that no backend route serves —\n` +
        `either the backend was renamed/deleted, the URL has a typo, or the\n` +
        `feature was sketched on one side without the other. Fix the URL or\n` +
        `add the route.`,
    );
    process.exit(1);
  }
  console.log(
    `✓ wiring audit: every frontend API call resolves to a real backend route.`,
  );
}

// Only run main() when invoked directly via `node …` — keeps the test
// harness import from triggering the full audit + exit().
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
