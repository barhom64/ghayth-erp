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
    // The `(?:<[^>]*>)?` is the OPTIONAL generic-type slot —
    // `useApiMutation<T, B>(…)` vs the much commoner
    // `useApiMutation(…)`. The original regex had `<[^>]*>?` which
    // *required* the `<`, silently dropping every call without an
    // explicit type argument. That false-negative was big enough to
    // make the "POST /api/finance/invoices" endpoint look unused even
    // though invoices-create.tsx calls it on line 151.
    // Generic-slot regex allows nested `<T, Record<K, V>>` — one level of
    // angle-bracket nesting. Previously `[^>]*` was non-balanced so a
    // `useApiMutation<T, Record<string, unknown>>(...)` call would parse
    // as `<T, Record<string, unknown>` then fail to reach the `(`,
    // hiding every typed-mutation call with a Record/Array/Map generic.
    const re = /\b(apiFetch|apiPatch|apiPost|apiPut|apiDelete|useApiQuery|useApiMutation)\b\s*(?:<(?:[^<>]|<[^<>]*>)*>)?\s*\(/g;
    for (const m of src.matchAll(re)) {
      const helper = m[1];
      // Cursor sits just past the `(`. Skip whitespace, then read the
      // first arg. For useApiQuery the first arg is the array; skip
      // past it and read the URL from the second arg.
      let i = m.index + m[0].length;
      while (i < src.length && /\s/.test(src[i])) i++;
      if (helper === "useApiQuery") {
        // First arg is the query key. Normally an array literal but
        // sometimes pre-built into a `const qk = [...]` variable that
        // gets passed as an identifier (entity-tags pattern). Skip
        // either form, then the comma + whitespace before the URL.
        if (src[i] === "[") {
          let depth = 1;
          i++;
          while (i < src.length && depth > 0) {
            if (src[i] === "[") depth++;
            else if (src[i] === "]") depth--;
            i++;
          }
        } else if (/[a-zA-Z_$]/.test(src[i])) {
          // Identifier (variable holding the key). Read until comma.
          while (i < src.length && src[i] !== "," && src[i] !== ")") i++;
        } else {
          // Anything else (digit, paren, etc.) — bail out, this isn't
          // a shape we can confidently parse.
          continue;
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
      // Conditional URL form: `cond ? "..." : null`. The URL we want
      // is the truthy branch. The audit used to miss these because
      // readString stopped at the leading identifier. Detect a
      // `<ident>(?.<ident>)*\s*\?\s*` prefix and skip to the URL.
      // useApiQuery's third arg is the `enabled` flag so a bare-template
      // URL is the recommended shape, but legacy pages use the
      // conditional shape extensively (44 sites at last count).
      const cond = /^[a-zA-Z_$][\w$]*(?:\?\.[a-zA-Z_$][\w$]*|\.[a-zA-Z_$][\w$]*)*\s*\?\s*/.exec(src.slice(i));
      if (cond) {
        i += cond[0].length;
      }
      const lit = readString(src, i);
      if (!lit) continue;
      if (!lit.value.startsWith("/")) continue;
      // Pull the HTTP method off the call. Each helper signals it
      // differently:
      //   apiPatch/apiPost/apiPut/apiDelete : method is in the name
      //   apiFetch                          : method is in the options
      //                                       object's `method` key
      //   useApiQuery                       : always GET
      //   useApiMutation                    : method is the SECOND arg,
      //                                       a string literal
      const method = inferMethod(helper, src, lit.end);
      calls.push({ file: rel, url: lit.value, line: lineOf(src, m.index), method, source: "helper" });
    }

    // Workflow-kit's <ApprovalActions> takes the approve/reject/return
    // URLs as JSX props (`approveEndpoint`, `rejectEndpoint`,
    // `returnEndpoint`) plus a sibling `approveMethod` / `rejectMethod`
    // / `returnMethod` prop. The helpers scan above doesn't see them
    // because they aren't function calls. This second pass extracts
    // each prop pair, pinned by the method-prop sibling for the verb.
    //
    // Without this the audit reported every per-row approve endpoint
    // across vouchers / salary-advances / commitments / receivables /
    // financial-requests / journal-manual as "unused" even though
    // ApprovalActions calls them at run time — a chronic blind spot
    // that hid ~15 endpoints behind the dynamic-URL detection limit.
    //
    // Tagged as source:"prop" so the orphan/method-mismatch hard gates
    // (which only run against helper-source calls) don't trip on
    // pre-existing FE-vs-BE drift in approval flows — those need their
    // own fix-up pass. The prop calls still count toward backend
    // coverage so the Phase C "unused endpoints" list gets credit for
    // them.
    const propRe = /\b(approve|reject|return)Endpoint\s*=\s*\{/g;
    for (const m of src.matchAll(propRe)) {
      const kind = m[1]; // "approve" | "reject" | "return"
      let i = m.index + m[0].length;
      while (i < src.length && /\s/.test(src[i])) i++;
      const lit = readString(src, i);
      if (!lit) continue;
      if (!lit.value.startsWith("/")) continue;
      // Find the sibling `{kind}Method=` prop in the same JSX element.
      // ApprovalActions usage is small (one element at a time), so
      // scanning ±400 chars around the endpoint prop is enough.
      const window = src.slice(Math.max(0, m.index - 400), Math.min(src.length, m.index + 400));
      const methodRe = new RegExp(`\\b${kind}Method\\s*=\\s*["'\`](GET|POST|PATCH|PUT|DELETE)["'\`]`, "i");
      const mm = window.match(methodRe);
      const method = mm ? mm[1].toUpperCase() : "PATCH"; // default to PATCH
      calls.push({ file: rel, url: lit.value, line: lineOf(src, m.index), method, source: "prop" });
    }

    // ConfirmDeleteDialog's `deletePath` prop maps to DELETE — same
    // dynamic-URL blind spot as ApprovalActions. Catches per-row
    // delete buttons across cost-centers, journal-templates,
    // subsidiary-accounts, etc.
    const delRe = /\bdeletePath\s*=\s*\{/g;
    for (const m of src.matchAll(delRe)) {
      let i = m.index + m[0].length;
      while (i < src.length && /\s/.test(src[i])) i++;
      const lit = readString(src, i);
      if (!lit) continue;
      if (!lit.value.startsWith("/")) continue;
      calls.push({ file: rel, url: lit.value, line: lineOf(src, m.index), method: "DELETE", source: "prop" });
    }

    // apiUrl("/…") helper from lib/api.ts — wraps a path with /api prefix
    // for use in `<a href={apiUrl(…)} download>` anchors. The href scanner
    // below sees `href={…}` but the value is a function call, not a
    // string literal, so the URL stays dark. Catch the apiUrl call sites
    // directly. Tag method=? since anchors don't carry HTTP verb info
    // and could be download or POST-via-form.
    const apiUrlRe = /\bapiUrl\s*\(\s*[`"']/g;
    for (const m of src.matchAll(apiUrlRe)) {
      let i = m.index + m[0].length - 1;
      const lit = readString(src, i);
      if (!lit) continue;
      if (!lit.value.startsWith("/")) continue;
      calls.push({ file: rel, url: lit.value, line: lineOf(src, m.index), method: "?", source: "prop" });
    }

    // Raw anchor href to /api/* — file-serving endpoints (PDFs,
    // downloads, previews) can't use apiFetch because the response
    // is a stream, not JSON. The convention across the app is
    // `<a href="/api/documents/:id/download" download>` or
    // `<a href={`/api/print/jobs/${id}/download`} target="_blank">`.
    // Handles both the JSX `href="…"` string-prop form and the
    // `href={…}` expression form (with template literals).
    const hrefRe = /\bhref\s*=\s*([{`"'])/g;
    for (const m of src.matchAll(hrefRe)) {
      let i = m.index + m[0].length - 1; // back up onto opening delimiter
      // JSX brace expression — skip past `{` and any leading whitespace.
      if (src[i] === "{") {
        i++;
        while (i < src.length && /\s/.test(src[i])) i++;
      }
      const lit = readString(src, i);
      if (!lit) continue;
      if (!lit.value.startsWith("/api/")) continue;
      calls.push({ file: rel, url: lit.value, line: lineOf(src, m.index), method: "GET", source: "prop" });
    }

    // <ExportButton endpoint="/export/excel/x" /> + the array form
    // { endpoint: "/export/...", … } inside <MultiExportButton items={[…]}>
    // The shared shared/export-buttons.tsx component fires a
    // window-level fetch with auth headers; the `endpoint` prop is the
    // URL path. Same JSX-blind-spot pattern as ApprovalActions —
    // covered here with a dedicated scanner so every report-export
    // route gets credit.
    //
    // ExportButton variants accept either a string literal or a
    // template literal (for per-row IDs). readString handles both —
    // but the JSX brace form `endpoint={…}` needs a separate match
    // class. The combined regex catches both `endpoint="…"` and
    // `endpoint={…}` followed by the literal/template.
    const exportRe = /\b(?:ExportButton[^/>]*?\bendpoint\s*=\s*|endpoint\s*:\s*)([{`"'])/g;
    for (const m of src.matchAll(exportRe)) {
      let i = m.index + m[0].length - 1;
      // JSX brace expression — skip past `{` and any leading whitespace.
      if (src[i] === "{") {
        i++;
        while (i < src.length && /\s/.test(src[i])) i++;
      }
      const lit = readString(src, i);
      if (!lit) continue;
      // The /export/* prefix is the marker that this `endpoint:` is for
      // an export button (rather than EntityEditDialog or ImpactPreviewButton
      // which have their own scanners and matchers).
      if (!/^\/export\//.test(lit.value)) continue;
      calls.push({ file: rel, url: lit.value, line: lineOf(src, m.index), method: "GET", source: "prop" });
    }

    // useDetailEditDelete({ patchPath: "/...", deletePath: "/..." })
    // wraps apiPatch + apiDelete with variable URLs — invisible to the
    // helper-call scanner. Credits the PATCH + DELETE per call.
    const detailRe = /\b(patchPath|deletePath)\s*:\s*[`"']/g;
    for (const m of src.matchAll(detailRe)) {
      const kind = m[1];
      let i = m.index + m[1].length;
      while (i < src.length && /[\s:]/.test(src[i])) i++;
      const lit = readString(src, i);
      if (!lit) continue;
      if (!lit.value.startsWith("/")) continue;
      // Require a useDetailEditDelete( ancestor within the preceding span
      // so we don't pick up an unrelated property name.
      const before = src.slice(Math.max(0, m.index - 800), m.index);
      if (!/useDetailEditDelete\s*\(/.test(before)) continue;
      const method = kind === "patchPath" ? "PATCH" : "DELETE";
      calls.push({ file: rel, url: lit.value, line: lineOf(src, m.index), method, source: "prop" });
    }

    // EntityEditDialog's `endpoint` prop maps to PATCH (or PUT). The
    // dialog wraps useApiMutation internally so the URL never appears
    // in a helper call the scanner can read directly. Without this
    // pass, every detail-page Edit dialog (governance, legal,
    // warehouse, finance, admin/ai-prompt-detail, …) had its PATCH
    // route flagged as "unused" even though clicking save fires it.
    // Sibling `method="PUT"` on the same element overrides the
    // default PATCH.
    const editRe = /\bendpoint\s*=\s*\{/g;
    for (const m of src.matchAll(editRe)) {
      let i = m.index + m[0].length;
      while (i < src.length && /\s/.test(src[i])) i++;
      const lit = readString(src, i);
      if (!lit) continue;
      if (!lit.value.startsWith("/")) continue;
      // Require an EntityEditDialog opening tag in the preceding span
      // so we don't pick up arbitrary `endpoint=` props on unrelated
      // components (impact-preview, etc. have their own scanners).
      // 1200-char window accommodates large defaultValues={{…}} blocks
      // between the opening tag and the endpoint prop (correspondence /
      // pilgrim / judgment detail pages can run 600-800 chars of seed
      // values).
      const before = src.slice(Math.max(0, m.index - 1200), m.index);
      if (!/<EntityEditDialog\b/.test(before)) continue;
      const window = src.slice(Math.max(0, m.index - 400), Math.min(src.length, m.index + 400));
      const methodMatch = window.match(/\bmethod\s*=\s*["'`](PATCH|PUT)["'`]/);
      const method = methodMatch ? methodMatch[1].toUpperCase() : "PATCH";
      calls.push({ file: rel, url: lit.value, line: lineOf(src, m.index), method, source: "prop" });
    }

    // useInlineActions({ endpoint: "/x", ... }) — the shared hook in
    // components/inline-actions.tsx that wraps PATCH /:id + (optionally)
    // DELETE /:id for per-row actions on list pages. The hook itself
    // fires `apiPatch(\`${endpoint}/${id}\`)` and `apiDelete(...)`, but
    // the audit can't resolve the `endpoint` variable so both verbs
    // were invisible on every page using the hook (recruitment / crm /
    // legal / fleet / support / store / etc. — 22 pages total).
    //
    // Per-call: always emit PATCH. Only emit DELETE if delete-related
    // identifiers (handleDelete / startDelete / deletingId) appear
    // either in the destructure literal OR as `.method` accessors on
    // the returned object — covers both `const { startDelete } = use…`
    // (governance/capa-tab.tsx style) and `const jobActions = use…;
    // jobActions.startDelete(…)` (hr/recruitment.tsx style).
    const inlineRe = /(?:const\s+(?:\{([^}]*)\}|([a-zA-Z_$][\w$]*))\s*=\s*)?useInlineActions\s*\(\s*\{[^}]*endpoint\s*:\s*/g;
    for (const m of src.matchAll(inlineRe)) {
      let i = m.index + m[0].length;
      while (i < src.length && /\s/.test(src[i])) i++;
      const lit = readString(src, i);
      if (!lit) continue;
      if (!lit.value.startsWith("/")) continue;
      const url = `${lit.value}/:param`;
      const line = lineOf(src, m.index);
      calls.push({ file: rel, url, line, method: "PATCH", source: "prop" });
      const destructure = m[1] ?? "";
      const varName = m[2] ?? "";
      const usesDelete =
        /\b(handleDelete|startDelete|deletingId)\b/.test(destructure) ||
        (varName && new RegExp(`\\b${varName}\\.(handleDelete|startDelete|deletingId)\\b`).test(src));
      if (usesDelete) {
        calls.push({ file: rel, url, line, method: "DELETE", source: "prop" });
      }
    }

    // <ImpactPreviewButton endpoint="/x/impact-preview" ... /> — the
    // shared shared/impact-preview.tsx wrapper around apiFetch(endpoint,
    // { method: "POST" }). The `endpoint` is a JSX-string prop the
    // helper-call scan can't trace, so without this scanner the six
    // call-sites (invoices-create, expenses-create, purchase-orders-
    // create, projects-create, properties/contracts-create, hr/leave-
    // management) all marked their impact-preview endpoints as unused.
    const impactRe = /\bImpactPreviewButton\b[^/>]*?\bendpoint\s*=\s*/g;
    for (const m of src.matchAll(impactRe)) {
      let i = m.index + m[0].length;
      while (i < src.length && /\s/.test(src[i])) i++;
      // JSX prop value can be `"…"` (string literal) or `{…}` (expression
      // — typically a template). Handle the string case directly; the
      // brace case falls through to readString which handles backticks.
      if (src[i] === "{") {
        let depth = 1; i++;
        while (i < src.length && /\s/.test(src[i])) i++;
      }
      const lit = readString(src, i);
      if (!lit) continue;
      if (!lit.value.startsWith("/")) continue;
      calls.push({ file: rel, url: lit.value, line: lineOf(src, m.index), method: "POST", source: "prop" });
    }

    // Config-object URL property values:
    //   `approveEndpoint: "/workflows/:id/approve"` in approval-registry.ts
    //   `rejectEndpoint:  "/x/:id/reject"` / `returnEndpoint: "/x/:id/return"` etc.
    // These are consumed via getApprovalEndpoint(type, id) which calls
    // .replace(":id", String(id)) — runtime substitution invisible to a
    // static scan. Without crediting them, every /workflows/:id/approve,
    // /workflows/:id/reject style registry entry shows as unused even
    // though the action-center fires them.
    //
    // The verb is taken from the key prefix (approve/reject/return/refer/
    // escalate) → PATCH by default, POST when the same object literal has
    // a sibling `method: "POST"`. Mirrors the approval-actions defaults.
    const cfgRe = /\b(approve|reject|return|refer|escalate)Endpoint\s*:\s*[`"']/g;
    for (const m of src.matchAll(cfgRe)) {
      let i = m.index + m[0].length - 1;
      const lit = readString(src, i);
      if (!lit) continue;
      if (!lit.value.startsWith("/")) continue;
      // Same-object `method:` sibling overrides the default. Approval-
      // registry entries default to PATCH; the workflow row carries
      // `method: "POST"` because /workflows/:id/approve is a POST route.
      const window = src.slice(Math.max(0, m.index - 200), Math.min(src.length, m.index + 200));
      const mm = window.match(/\bmethod\s*:\s*["'`](GET|POST|PATCH|PUT|DELETE)["'`]/i);
      const method = mm ? mm[1].toUpperCase() : "PATCH";
      calls.push({ file: rel, url: lit.value, line: lineOf(src, m.index), method, source: "prop" });
    }

    // Record<Key, (id) => `/url/${id}/action`> — config tables that map
    // a tab/key to a URL builder. action-center.tsx uses this for the
    // per-tab approval endpoints (workflows / leaves / advances / …),
    // and several stat-tab pages use the same idiom. The arrow body is
    // a template literal starting with `/` — readString handles it.
    //
    // Disambiguation from wouter routing tables (e.g.
    // `Record<string, (id) => \`/finance/invoices/${id}\`>`): require
    // the URL to have at least one *literal* segment after the first
    // `${…}` interpolation. Approval URLs end with `/approve`/`/reject`
    // etc., while routing-only URLs are bare entity references and get
    // skipped. The verb stays "?" because the arrow alone doesn't
    // signal it — backend method resolution falls back to path-only.
    const arrowUrlRe = /=>\s*[`"']\//g;
    for (const m of src.matchAll(arrowUrlRe)) {
      const i = m.index + m[0].length - 2;
      const lit = readString(src, i);
      if (!lit) continue;
      if (!lit.value.startsWith("/")) continue;
      // Require a literal path segment AFTER an interpolation — that's
      // the signal this is an action URL, not just an entity reference.
      // Matches `…/${id}/approve` (✓) but rejects `…/${id}` (skip).
      // `lit.value` preserves `${…}` placeholders verbatim before the
      // url-normaliser rewrites them to `:param`.
      if (!/\$\{[^}]+\}\/[a-z][a-z0-9_-]*/i.test(lit.value)) continue;
      calls.push({ file: rel, url: lit.value, line: lineOf(src, m.index), method: "?", source: "prop" });
    }

    // `const endpoint = cond ? "/url1" : cond2 ? "/url2" : null;` —
    // the variable-bound conditional URL pattern, used by
    // entity-timeline.tsx (workflow timeline switches between the
    // instance-scoped and ref-scoped endpoints). The audit's inline
    // ternary scanner only fires when the ternary is the URL argument
    // itself; here the URL is bound to an identifier first, so the
    // helper-call scan reads only the identifier and misses both URLs.
    //
    // Restricted to variables named exactly `endpoint` / `apiUrl` /
    // `apiPath` — these names are the codebase's explicit convention
    // for API URLs and are NOT reused for wouter route strings.
    //
    // Additional guard: the file must already use a known API helper
    // (useApiQuery / useApiMutation / apiFetch / apiPatch / …), so we
    // don't credit URLs in pure config files or routing tables.
    const hasApiHelper = /\b(?:useApiQuery|useApiMutation|apiFetch|apiPatch|apiPost|apiPut|apiDelete)\s*[(<]/.test(src);
    if (hasApiHelper) {
      const condVarRe = /\b(?:const|let)\s+(endpoint|apiUrl|apiPath)\s*(?::\s*[^=]+)?=\s*[^;]+\?/g;
      for (const m of src.matchAll(condVarRe)) {
        const start = m.index + m[0].length;
        const tail = src.slice(start, Math.min(src.length, start + 600));
        const endRel = tail.search(/;|\n\s*\n|\n[^\s)]/);
        const segment = endRel === -1 ? tail : tail.slice(0, endRel);
        const strRe = /[`"']\/[^`"']*[`"']/g;
        for (const sm of segment.matchAll(strRe)) {
          const lit = readString(src, start + sm.index);
          if (!lit) continue;
          if (!lit.value.startsWith("/")) continue;
          calls.push({ file: rel, url: lit.value, line: lineOf(src, start + sm.index), method: "GET", source: "prop" });
        }
      }

      // `const xUrl = `/...`;` followed by `useApiQuery(..., xUrl, ...)` —
      // the same variable-bound URL pattern as above, but for non-conditional
      // template URLs that are bound to a `*Url` named variable. Wires
      // PurchaseOrderReceiveSection (matchUrl, receiptsUrl) and similar.
      //
      // Restricted to *Url suffix to avoid colliding with route constants in
      // sidebar/routing config. We also verify the variable is actually
      // passed as the URL arg to a known helper later in the file before
      // crediting — otherwise dead variables would leak.
      const urlVarRe = /\b(?:const|let)\s+([a-zA-Z_$][\w$]*Url)\s*(?::\s*[^=]+)?=\s*[`"'](\/[^`"']*)[`"']/g;
      for (const m of src.matchAll(urlVarRe)) {
        const varName = m[1];
        const url = m[2];
        // Confirm the variable is actually used as an argument to an API
        // helper later in the file. The previous form used `[^)]*` which
        // stops at the first `)` and missed `useApiQuery([key, String(x)],
        // varName)` (the inner `)` of `String(x)` aborted the match). A
        // bounded `[\s\S]{0,500}` window with lazy expansion catches the
        // common arg-list shapes without false positives.
        const passedToHelper = new RegExp(
          `\\b(?:useApiQuery|useApiMutation|apiFetch|apiPatch|apiPost|apiPut|apiDelete)\\b[\\s\\S]{0,500}?\\b${varName}\\b`,
        ).test(src);
        if (!passedToHelper) continue;
        calls.push({ file: rel, url, line: lineOf(src, m.index), method: "GET", source: "prop" });
      }
    }
  }
  return calls;
}

/**
 * Walk past a URL arg to extract the HTTP method the call uses. Returns
 * an uppercased method string ("GET" / "POST" / …) or "?" when the
 * call's method can't be resolved statically (e.g. apiFetch with an
 * options spread). "?" means "skip the method match, fall back to
 * path-only".
 */
function inferMethod(helper, src, afterUrlEnd) {
  // 1. apiPatch/apiPost/apiPut/apiDelete name encodes the method.
  if (helper === "apiPatch") return "PATCH";
  if (helper === "apiPost") return "POST";
  if (helper === "apiPut") return "PUT";
  if (helper === "apiDelete") return "DELETE";
  // 2. useApiQuery is always GET (no options to override).
  if (helper === "useApiQuery") return "GET";
  // 3. apiFetch: default GET; explicit method lives inside the
  // options object's `method` key. Walk to the next arg, find the
  // method literal inside an object literal if present.
  if (helper === "apiFetch") {
    let i = afterUrlEnd;
    while (i < src.length && /[\s,]/.test(src[i])) i++;
    if (src[i] !== "{") return "GET"; // no options bag → default
    // Walk the object literal until the matching `}`, scanning for a
    // `method: "X"` key. We don't need a full JSON parser — just look
    // for the literal `method:` followed by a string.
    let depth = 1;
    i++;
    const start = i;
    while (i < src.length && depth > 0) {
      if (src[i] === "{") depth++;
      else if (src[i] === "}") depth--;
      i++;
    }
    const body = src.slice(start, i - 1);
    const mm = body.match(/\bmethod\s*:\s*["']([A-Z]+)["']/);
    return mm ? mm[1].toUpperCase() : "GET";
  }
  // 4. useApiMutation: the second arg is the method literal.
  if (helper === "useApiMutation") {
    let i = afterUrlEnd;
    while (i < src.length && /[\s,]/.test(src[i])) i++;
    const lit = readString(src, i);
    if (!lit) return "?";
    return lit.value.toUpperCase();
  }
  return "?";
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
      // Plain QS variable: scopeSuffix, filterParams, querystring, qs,
      // dateParams (period-close-preflight + finance reports inherit
      // this idiom from main), inboxSuffix, transcriptsSuffix, …
      // Accept any *Suffix / *Query / *Params / *QS name — page code
      // commonly prefixes with the entity (inbox/transcripts/etc.)
      // when more than one suffix lives in scope.
      /^([a-z][a-zA-Z0-9]*)?(qs|querystring|queryparams|filterparams|dateparams|suffix|query|params)$/i.test(body.trim()) ||
      // Already a literal query string inside: `?key=…`
      /\?\s*[\w]+\s*=/.test(body) ||
      // Conditional QS suffix: `X ? "?…" : ""`  or  `X ? \`?${…}\` : ""`
      // The opening `?` of the value (after the ternary's `?`) is the
      // signal that this is a query string, not a path-segment value.
      // `X ? editingId : ""` doesn't match because the value side has
      // no leading `?` — it's a numeric ID substitution.
      /\?\s*[`"']\s*\?/.test(body);
    if (inQueryString || looksLikeQs) {
      u = u.slice(0, start) + u.slice(end + 1);
    } else {
      u = u.slice(0, start) + ":param" + u.slice(end + 1);
    }
  }
  // Strip query string — backend route patterns don't include them.
  u = u.split("?")[0];
  // Adjacent interpolations `${a}${b}` end up as `:param:param` after
  // the strip loop above (no `/` separator between them in the source).
  // The convention in this codebase is that the second interpolation
  // is a path FRAGMENT starting with `/` (e.g.
  // `apiFetch(\`/x/${id}${path}\`)` where path === "/approve"). Force
  // a `/` between adjacent placeholders so the segment count matches
  // the backend's `/x/:id/:action` shape.
  u = u.replace(/:param:param/g, ":param/:param");
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
  const feSegs = fe.split("/");
  const beSegs = be.split("/");
  if (feSegs.length !== beSegs.length) return false;
  for (let i = 0; i < feSegs.length; i++) {
    const a = feSegs[i];
    const b = beSegs[i];
    if (a === b) continue;
    // Frontend `:param` is what the normaliser produces for any `${…}`
    // interpolation — it represents a runtime ID slot. The backend
    // counterpart MUST also be a placeholder segment (`:id`, `:phaseId`,
    // …). Letting `:param` match an arbitrary literal segment is what
    // made the original urlsMatch route `/projects/:param` to
    // `/projects/impact-preview` and miss the real `/projects/:id`
    // → POST mismatch.
    if (a === ":param" && b.startsWith(":")) continue;
    if (b === ":param" && a.startsWith(":")) continue;
    // Both sides bare placeholders — `:x` matches `:y`.
    if (a.startsWith(":") && b.startsWith(":")) continue;
    // Literal-vs-placeholder when the placeholder lives on the BACKEND
    // (frontend wrote out a numeric ID directly, e.g. `/api/users/42`).
    // Frontend-side literal can fill a backend placeholder slot.
    if (b.startsWith(":") && !a.startsWith(":")) continue;
    return false;
  }
  return true;
}

/**
 * Returns true if a frontend method matches a backend route's method.
 * Frontend "?" (unresolved) matches anything — we already gave up on
 * statically resolving the method, so don't force a mismatch.
 */
function methodsMatch(feMethod, beMethod) {
  if (feMethod === "?" || beMethod === "?") return true;
  return feMethod === beMethod;
}

// ---------- step 4: report ----------

/**
 * Run the audit and return { resolved, orphans, backendPaths }. Pure
 * function over the filesystem — split out so the test harness can
 * exercise the pieces (normalise/match) without going through main().
 */
export function runAudit() {
  const backend = buildBackendRoutes();
  // Group backend routes by normalised path → set of methods served
  // there. A route file usually serves several methods per path
  // (GET/POST/PATCH for the collection, GET/PATCH/DELETE for the
  // resource), so a path-only match isn't enough — we also need to
  // confirm the method.
  const backendPaths = new Map(); // path -> Set<method>
  for (const r of backend) {
    const p = normaliseBackendUrl(r.path);
    if (!backendPaths.has(p)) backendPaths.set(p, new Set());
    backendPaths.get(p).add(r.method);
  }
  const frontend = extractFrontendCalls();

  const resolved = [];
  const orphans = [];
  const methodMismatches = [];
  // Track which (path, method) pairs the frontend touched, so we can
  // compute the REVERSE direction below: backend endpoints with no
  // frontend caller. The Set value is "PATH|METHOD".
  const touchedByFrontend = new Set();

  for (const c of frontend) {
    const fe = normaliseFrontendUrl(c.url);
    // Find every backend path that matches segment-by-segment. When
    // a frontend `:param` lines up with multiple backend paths that
    // each use a different placeholder name (`:userId` vs `:id`),
    // the methods served on those paths must be UNIONed — otherwise
    // a DELETE on `/api/admin/user-roles/:id` is reported as a
    // mismatch just because `/api/admin/user-roles/:userId` (GET)
    // was found first.
    let beMatchedPath = null;
    let beMethods = null;
    if (backendPaths.has(fe)) {
      beMatchedPath = fe;
      beMethods = new Set(backendPaths.get(fe));
    } else {
      const matchedPaths = [];
      for (const [be, methods] of backendPaths) {
        if (urlsMatch(fe, be)) matchedPaths.push([be, methods]);
      }
      if (matchedPaths.length > 0) {
        beMatchedPath = matchedPaths[0][0]; // for the touched-by bookkeeping
        beMethods = new Set();
        for (const [, ms] of matchedPaths) for (const m of ms) beMethods.add(m);
      }
    }
    // Dynamic-action escape hatch: the frontend builds URLs like
    // `\`/x/${id}/${action}\`` where `action` is a runtime string
    // ("approve", "reject", "cancel", …). After normalisation that
    // becomes `/api/x/:param/:param`, which won't segment-match
    // backend routes like `/api/x/:id/approve`, `/api/x/:id/reject`.
    // Treat the call as resolved if the backend has ANY routes
    // under the same prefix (everything up to the last `:param`),
    // and union their methods. This matches what's actually true at
    // runtime — the dispatcher hits one of those routes.
    if (!beMethods && fe.endsWith("/:param") && fe.lastIndexOf(":param") > fe.indexOf(":param")) {
      // Strip the trailing `:param` (the dynamic action) and walk the
      // backend list for routes whose prefix segment-matches the
      // shorter pattern. Use urlsMatch on the prefix so `:param` here
      // still matches `:id`, `:requestId`, etc. on the backend side.
      const fePrefixSegs = fe.split("/").slice(0, -1); // drop final `:param`
      const fePrefix = fePrefixSegs.join("/");
      const targetDepth = fe.split("/").length;
      const sibling = [];
      for (const [be, ms] of backendPaths) {
        const beSegs = be.split("/");
        if (beSegs.length !== targetDepth) continue;
        // Match every segment except the last (the action).
        const bePrefix = beSegs.slice(0, -1).join("/");
        if (urlsMatch(fePrefix, bePrefix)) sibling.push([be, ms]);
      }
      if (sibling.length > 0) {
        beMatchedPath = sibling[0][0];
        beMethods = new Set();
        for (const [, ms] of sibling) for (const m of ms) beMethods.add(m);
      }
    }
    if (!beMethods) {
      // Both helper-source and prop-source orphans now hard-fail the
      // audit. The "best-effort" carve-out existed to ride out pre-
      // existing FE/BE drift the prop scanner first surfaced
      // (compliance/legal-contract/ticket/budget detail pages calling
      // non-existent /:id/approve endpoints). All four have been
      // fixed — compliance + ticket repointed to PATCH /:id with the
      // domain's real status enum, legal-contract + budget had dead
      // cards removed since those domains don't actually have approval
      // workflows. Locking prop URLs into the same gate now means any
      // new ApprovalActions reference to a non-existent endpoint will
      // be caught at audit time instead of 404'ing for the user.
      orphans.push({ ...c, normalised: fe });
      continue;
    }
    // Path matched — check method. "?" (unresolved) is allowed through.
    if (c.method === "?" || beMethods.has(c.method)) {
      resolved.push({ ...c, normalised: fe });
      // When a frontend `:param` URL matches multiple backend paths
      // (different placeholder names), we don't know which specific
      // backend path the call resolves to at runtime — so mark every
      // matching (path, method) pair as touched. Same for "?" method.
      const isDynamicAction =
        fe.endsWith("/:param") && fe.lastIndexOf(":param") > fe.indexOf(":param");
      for (const [bePath, msSet] of backendPaths) {
        let isCovered = urlsMatch(fe, bePath);
        // Dynamic-action variant: trailing `:param` may stand for
        // multiple sibling routes (`/x/:id/approve`, `/x/:id/reject`).
        // Treat any same-depth route under the same prefix as covered.
        if (!isCovered && isDynamicAction) {
          const fePrefix = fe.split("/").slice(0, -1).join("/");
          const beSegs = bePath.split("/");
          if (beSegs.length === fe.split("/").length) {
            const bePrefix = beSegs.slice(0, -1).join("/");
            isCovered = urlsMatch(fePrefix, bePrefix);
          }
        }
        if (!isCovered) continue;
        if (c.method === "?") {
          for (const m of msSet) touchedByFrontend.add(`${bePath}|${m}`);
        } else if (msSet.has(c.method)) {
          touchedByFrontend.add(`${bePath}|${c.method}`);
        }
      }
    } else {
      // Same as orphans above — prop-source method mismatches now
      // hard-fail. Was a temporary carve-out for the audit's first
      // run when 6 pre-existing method-mismatch URLs in requests-
      // page.tsx + request-detail.tsx were surfaced (PATCH→POST).
      // Both have been fixed.
      methodMismatches.push({
        ...c,
        normalised: fe,
        wantedMethod: c.method,
        actualMethods: [...beMethods].sort(),
      });
    }
  }

  // Reverse direction: every backend (path, method) that no frontend
  // call covers. These are real features the server implements but no
  // UI consumes — exactly the "النظام يفتقر إلى الجانب العملي"
  // signal the user asked about.
  const unusedBackend = [];
  for (const [bePath, methods] of backendPaths) {
    for (const method of methods) {
      if (!touchedByFrontend.has(`${bePath}|${method}`)) {
        unusedBackend.push({ path: bePath, method });
      }
    }
  }

  return {
    resolved,
    orphans,
    methodMismatches,
    unusedBackend,
    backendPaths,
    frontend,
  };
}

// Test-only exports — the .test.mjs sibling exercises each piece
// independently so future regex/heuristic tweaks can't silently
// re-break the audit. Don't import these from non-test code.
export { normaliseFrontendUrl, urlsMatch, methodsMatch, readString, inferMethod };

function main() {
  const { resolved, orphans, methodMismatches, unusedBackend, backendPaths, frontend } = runAudit();

  // Count total backend (path, method) endpoints — many paths serve
  // 3-5 methods each, so this is the right denominator for "what %
  // of the backend surface does the UI cover?".
  let totalEndpoints = 0;
  for (const ms of backendPaths.values()) totalEndpoints += ms.size;
  const usedEndpoints = totalEndpoints - unusedBackend.length;
  const coveragePercent = totalEndpoints === 0
    ? 0
    : Math.round((usedEndpoints / totalEndpoints) * 1000) / 10;

  console.log(`# frontend ↔ backend route wiring audit\n`);
  console.log(`backend routes (mounted):         ${backendPaths.size} paths, ${totalEndpoints} (path,method) endpoints`);
  console.log(`frontend API call-sites scanned:  ${frontend.length}`);
  console.log(`resolved → real backend route:    ${resolved.length}`);
  console.log(`orphan (no backend match):        ${orphans.length}`);
  console.log(`method mismatch (path ok, verb wrong): ${methodMismatches.length}`);
  console.log(`backend coverage by UI:           ${usedEndpoints}/${totalEndpoints} (${coveragePercent}%)`);
  console.log(`unused backend endpoints:         ${unusedBackend.length}\n`);

  let failed = false;

  if (orphans.length > 0) {
    failed = true;
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
  }

  if (methodMismatches.length > 0) {
    failed = true;
    console.log(`## method mismatches (path resolves but verb doesn't)\n`);
    for (const m of methodMismatches) {
      console.log(
        `  ${m.file}:L${m.line}  ${m.wantedMethod} ${m.url}` +
          `\n    → backend serves: ${m.actualMethods.join(", ")}`,
      );
    }
    console.log();
  }

  // Report-only section: every backend (path, method) that no
  // frontend call covers. This does NOT fail the build — many
  // endpoints are intentionally backend-only (cron triggers, internal
  // /admin/* probes, webhooks). The list is the "what features does
  // the server implement that no UI exposes" surface the user asked
  // about.
  if (unusedBackend.length > 0) {
    console.log(`## unused backend endpoints (no frontend caller)\n`);
    // Group by top-level segment so the report is browseable.
    const byDomain = new Map();
    for (const u of unusedBackend) {
      // Skip the /api/ prefix.
      const after = u.path.replace(/^\/api\/?/, "");
      const domain = after.split("/")[0] || "(root)";
      if (!byDomain.has(domain)) byDomain.set(domain, []);
      byDomain.get(domain).push(`${u.method} ${u.path}`);
    }
    const sorted = [...byDomain.entries()].sort(
      (a, b) => b[1].length - a[1].length,
    );
    for (const [domain, list] of sorted.slice(0, 20)) {
      console.log(`### /${domain} (${list.length})`);
      for (const line of list.slice(0, 8)) console.log(`  ${line}`);
      if (list.length > 8) console.log(`  … and ${list.length - 8} more`);
      console.log();
    }
    if (sorted.length > 20) {
      console.log(`(${sorted.length - 20} more domains with unused endpoints, truncated)`);
    }
  }

  if (failed) {
    const lines = [];
    if (orphans.length > 0) {
      lines.push(
        `${orphans.length} orphan frontend call(s) — apiFetch/useApi* URL with no backend match.`,
      );
    }
    if (methodMismatches.length > 0) {
      lines.push(
        `${methodMismatches.length} method mismatch(es) — path exists but the verb the frontend uses isn't served (e.g. POST against a GET-only endpoint).`,
      );
    }
    console.log(
      `\n✗ wiring audit:\n  ${lines.join("\n  ")}\nFix the URL/method or add the route.`,
    );
    process.exit(1);
  }
  console.log(
    `✓ wiring audit: every frontend API call resolves to a real backend route with a matching HTTP method.`,
  );
}

// Only run main() when invoked directly via `node …` — keeps the test
// harness import from triggering the full audit + exit().
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
