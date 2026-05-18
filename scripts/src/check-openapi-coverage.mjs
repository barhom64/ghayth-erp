#!/usr/bin/env node
// scripts/src/check-openapi-coverage.mjs
//
// Report-only OpenAPI vs runtime-routes coverage scanner. Companion to
// issue #628 ("API contract drift: OpenAPI لا يغطي كامل سطح API ولا يوجد
// فحص تغطية واضح").
//
// What it does:
//   1. Walks every `.ts` under `artifacts/api-server/src/routes/` and
//      extracts every `router.<method>("<path>", ...)` invocation,
//      reconstructing the full `/api/...` URL by following the mount
//      chain in `routes/index.ts` (e.g. router.use("/hr", hrRouter) +
//      router.get("/leaves") => /api/hr/leaves).
//   2. Loads `lib/api-spec/openapi.yaml` and pulls every path under
//      `paths:` plus the methods declared on each.
//   3. Diffs the two sets and prints:
//        - runtime routes count
//        - documented paths count
//        - undocumented routes (in code, not in spec)
//        - over-documented paths (in spec, not in code)
//        - method mismatches (path in both, but spec missing a method
//          the code implements, or vice versa)
//
// What it does NOT do (deliberately):
//   - Does NOT fail CI. Exit code is always 0. The goal of #628 is to
//     make the gap visible first; failure-gating comes in a later PR
//     once the baseline is shrunk and an allowlist exists (same staged
//     approach the as-any guard followed in Task #278).
//   - Does NOT enforce parameter / response-shape matching — that's
//     orval's territory (`lib/api-spec/orval.config.ts`), and the spec
//     side of it lands automatically when codegen runs against a
//     well-formed openapi.yaml.
//   - Does NOT walk lib/engines/* or cron handlers — those aren't HTTP
//     surface and don't belong in OpenAPI.
//
// Output is plain text on stdout. Pipe to a file (`> /tmp/openapi-cov.md`)
// or read directly.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, "../..");
const ROUTES_DIR = path.join(REPO, "artifacts/api-server/src/routes");
const ROUTES_INDEX = path.join(ROUTES_DIR, "index.ts");
const OPENAPI = path.join(REPO, "lib/api-spec/openapi.yaml");

const HTTP_METHODS = ["get", "post", "put", "patch", "delete"];

// ---------- step 1: build the mount prefix map from routes/index.ts ----------

/**
 * Parse `routes/index.ts` and return:
 *   {
 *     mounts: { "<importName>": "<mountPrefix>" },
 *     globalPrefix: "/api"
 *   }
 *
 * Handles two shapes:
 *   router.use("/hr", hrRouter)            → mounts.hrRouter = "/hr"
 *   router.use(healthRouter)               → mounts.healthRouter = ""
 *
 * The outer mount of the whole router onto "/api" happens in app.ts
 * (`app.use("/api", router)`); we just hard-code that prefix.
 */
function parseRoutesIndex() {
  const src = fs.readFileSync(ROUTES_INDEX, "utf-8");
  const imports = new Map(); // routerVarName -> module file stem
  const mounts = new Map(); // routerVarName -> mountPath ("" for unprefixed)

  // Parse `import xRouter from "./y.js"` (or `.ts`)
  const importRe =
    /import\s+(\w+)\s+from\s+["']\.\/([\w\-./]+?)(?:\.js|\.ts)?["']/g;
  for (const m of src.matchAll(importRe)) {
    const [, varName, modPath] = m;
    imports.set(varName, modPath);
  }

  // Parse `router.use("/path", xRouter)` and `router.use(xRouter)`
  const useRe = /router\.use\(\s*(?:["']([^"']*)["']\s*,\s*)?(\w+)\s*[,)]/g;
  for (const m of src.matchAll(useRe)) {
    const [, mountPath, varName] = m;
    if (!imports.has(varName)) continue; // not a router import; skip
    mounts.set(varName, mountPath ?? "");
  }

  return { imports, mounts, globalPrefix: "/api" };
}

// ---------- step 2: walk routes/*.ts and extract router.<method>(...) ----------

/**
 * Returns an array of { file, method, path } for every router.<method>(...)
 * found in `filePath`. `path` is the literal in the source (no prefix yet).
 *
 * Heuristic: only matches `router.<m>("<lit>", ...)` — string-literal first
 * arg. Dynamic paths (e.g. via concatenation) are reported as `__dynamic__`
 * and counted separately.
 */
function extractRouterCalls(filePath) {
  const src = fs.readFileSync(filePath, "utf-8");
  const calls = [];
  const callRe =
    /router\.(get|post|put|patch|delete)\(\s*(?:["']([^"']+)["']|`([^`$]+)`|([A-Za-z_][\w.]*))/g;
  for (const m of src.matchAll(callRe)) {
    const [, method, doubleOrSingle, backtick, identifier] = m;
    let pathLit;
    if (doubleOrSingle !== undefined) pathLit = doubleOrSingle;
    else if (backtick !== undefined && !backtick.includes("${"))
      pathLit = backtick;
    else if (identifier !== undefined) pathLit = `__var:${identifier}__`;
    else pathLit = "__dynamic__";
    calls.push({ file: path.relative(REPO, filePath), method, path: pathLit });
  }
  return calls;
}

function buildRuntimeRoutes() {
  const { imports, mounts, globalPrefix } = parseRoutesIndex();
  const files = fs
    .readdirSync(ROUTES_DIR)
    .filter((f) => f.endsWith(".ts") && f !== "index.ts");
  const routes = [];

  // Build a stem→mountPrefix map by matching the module stem in the import
  // path back to the router var name.
  // imports: varName -> "x" (e.g. "health", "hr", "subdir/foo")
  // We want: stem("health.ts") -> mountPrefix("" for healthRouter)
  const stemToMount = new Map();
  for (const [varName, modStem] of imports.entries()) {
    if (!mounts.has(varName)) continue; // imported but not mounted
    const stem = modStem.split("/").pop(); // last segment
    stemToMount.set(stem, mounts.get(varName));
  }

  for (const f of files) {
    const stem = f.replace(/\.ts$/, "");
    const calls = extractRouterCalls(path.join(ROUTES_DIR, f));
    const mountPrefix = stemToMount.get(stem);
    if (mountPrefix === undefined) {
      // Imported but not mounted, OR named differently in index.ts.
      // Don't fabricate a prefix; mark as unmounted so the report can
      // surface the issue.
      for (const c of calls)
        routes.push({ ...c, fullPath: null, unmounted: true });
      continue;
    }
    for (const c of calls) {
      if (c.path.startsWith("__")) {
        routes.push({ ...c, fullPath: null, dynamic: true });
        continue;
      }
      const localPath = c.path.startsWith("/") ? c.path : "/" + c.path;
      const full = (globalPrefix + mountPrefix + localPath).replace(
        /\/+$/,
        ""
      ) || "/";
      routes.push({ ...c, fullPath: full });
    }
  }
  return routes;
}

// ---------- step 3: parse openapi.yaml paths section ----------

/**
 * Minimal YAML walker — we only need top-level `paths:` and the methods
 * under each path. Avoids pulling in a dependency.
 *
 * Returns: Map<pathString, Set<methodString>>.
 */
function parseOpenApi() {
  const src = fs.readFileSync(OPENAPI, "utf-8");
  const lines = src.split("\n");
  const out = new Map();

  let inPaths = false;
  let currentPath = null;
  let pathIndent = -1;
  let methodIndent = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^paths\s*:/.test(line)) {
      inPaths = true;
      continue;
    }
    if (!inPaths) continue;

    // A top-level (non-indented) key after paths ends the paths block.
    if (/^[A-Za-z]/.test(line) && line.includes(":")) {
      inPaths = false;
      currentPath = null;
      continue;
    }

    // Detect path entry: 2-space indented `  /something:` or `  '/x':`
    const pathMatch = line.match(/^(\s+)(['"]?)(\/[^'":]*)\2\s*:\s*$/);
    if (pathMatch) {
      const [, indent, , p] = pathMatch;
      if (pathIndent < 0) pathIndent = indent.length;
      if (indent.length === pathIndent) {
        currentPath = p;
        if (!out.has(currentPath)) out.set(currentPath, new Set());
        methodIndent = -1;
        continue;
      }
    }

    // Detect method entry under current path
    if (currentPath) {
      const methodMatch = line.match(/^(\s+)(get|post|put|patch|delete)\s*:/);
      if (methodMatch) {
        const [, indent, m] = methodMatch;
        if (methodIndent < 0) methodIndent = indent.length;
        if (indent.length === methodIndent) {
          out.get(currentPath).add(m);
        }
      }
    }
  }
  return out;
}

// ---------- step 4: diff + report ----------

/**
 * Normalise route path for comparison:
 *   - Express `:id` → OpenAPI `{id}`
 *   - Trailing slash stripped (already done at extract time, but defensive)
 */
function normaliseExpressPath(p) {
  return p.replace(/:([A-Za-z_][\w]*)/g, "{$1}").replace(/\/+$/, "") || "/";
}

function main() {
  const runtime = buildRuntimeRoutes();
  const spec = parseOpenApi();

  // Build runtime path → method-set
  const runtimeByPath = new Map();
  const dynamicCount = runtime.filter((r) => r.dynamic).length;
  const unmountedCount = runtime.filter((r) => r.unmounted).length;
  for (const r of runtime) {
    if (!r.fullPath) continue;
    const np = normaliseExpressPath(r.fullPath);
    if (!runtimeByPath.has(np)) runtimeByPath.set(np, new Set());
    runtimeByPath.get(np).add(r.method);
  }

  // Compare. Both sides include the /api prefix on the runtime side, but
  // OpenAPI paths are usually authored WITHOUT /api (orval prepends it via
  // `servers:` or its codegen base). Try both orientations.
  const specPaths = new Set(spec.keys());
  const specPathsApi = new Set(
    [...spec.keys()].map((p) => (p.startsWith("/api") ? p : "/api" + p))
  );

  const undocumented = []; // in runtime, not in spec
  const methodGaps = []; // path in both, but missing method on one side

  for (const [rp, rmethods] of runtimeByPath.entries()) {
    const specMethods =
      spec.get(rp.replace(/^\/api/, "")) || spec.get(rp) || null;
    if (!specMethods) {
      undocumented.push({ path: rp, methods: [...rmethods].sort() });
      continue;
    }
    const missingOnSpec = [...rmethods].filter((m) => !specMethods.has(m));
    if (missingOnSpec.length > 0) {
      methodGaps.push({
        path: rp,
        side: "spec-missing-methods",
        methods: missingOnSpec,
      });
    }
  }

  const overDocumented = []; // in spec, not in runtime
  for (const sp of specPaths) {
    const candidate = sp.startsWith("/api") ? sp : "/api" + sp;
    if (!runtimeByPath.has(candidate) && !runtimeByPath.has(sp)) {
      overDocumented.push({
        path: sp,
        methods: [...spec.get(sp)].sort(),
      });
    }
  }

  // ---- Report ----
  const lines = [];
  lines.push("# OpenAPI coverage report");
  lines.push("");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push(`Source (runtime): ${path.relative(REPO, ROUTES_DIR)}`);
  lines.push(`Source (spec):    ${path.relative(REPO, OPENAPI)}`);
  lines.push("");
  lines.push("## Headline counts");
  lines.push("");
  lines.push(`- runtime routes (unique path+method): ${[...runtimeByPath.values()].reduce(
    (n, s) => n + s.size,
    0
  )}`);
  lines.push(`- runtime paths (unique):              ${runtimeByPath.size}`);
  lines.push(`- documented paths (openapi.yaml):     ${specPaths.size}`);
  lines.push(`- undocumented runtime paths:          ${undocumented.length}`);
  lines.push(`- over-documented spec paths:          ${overDocumented.length}`);
  lines.push(`- method mismatches:                   ${methodGaps.length}`);
  lines.push(`- dynamic-path runtime calls (skipped): ${dynamicCount}`);
  lines.push(`- unmounted-router runtime calls (skipped): ${unmountedCount}`);
  lines.push("");

  const coveragePct =
    runtimeByPath.size === 0
      ? 0
      : Math.round(
          ((runtimeByPath.size - undocumented.length) / runtimeByPath.size) *
            100
        );
  lines.push(`**Path-level coverage: ${coveragePct}%**`);
  lines.push("");

  lines.push("## Undocumented runtime paths");
  lines.push("");
  if (undocumented.length === 0) {
    lines.push("_(none — every runtime path is documented)_");
  } else {
    lines.push("| Path | Methods |");
    lines.push("|---|---|");
    for (const u of undocumented
      .sort((a, b) => a.path.localeCompare(b.path))
      .slice(0, 500)) {
      lines.push(`| \`${u.path}\` | ${u.methods.join(", ")} |`);
    }
    if (undocumented.length > 500) {
      lines.push(`| _… ${undocumented.length - 500} more truncated_ |  |`);
    }
  }
  lines.push("");

  lines.push("## Over-documented spec paths");
  lines.push("");
  if (overDocumented.length === 0) {
    lines.push("_(none — every spec path has a matching runtime route)_");
  } else {
    lines.push("| Path | Methods |");
    lines.push("|---|---|");
    for (const o of overDocumented.sort((a, b) =>
      a.path.localeCompare(b.path)
    )) {
      lines.push(`| \`${o.path}\` | ${o.methods.join(", ")} |`);
    }
  }
  lines.push("");

  lines.push("## Method mismatches (path in both, methods diverge)");
  lines.push("");
  if (methodGaps.length === 0) {
    lines.push("_(none — every matched path has matching methods)_");
  } else {
    lines.push("| Path | Side | Methods |");
    lines.push("|---|---|---|");
    for (const g of methodGaps.sort((a, b) =>
      a.path.localeCompare(b.path)
    )) {
      lines.push(`| \`${g.path}\` | ${g.side} | ${g.methods.join(", ")} |`);
    }
  }
  lines.push("");

  lines.push("---");
  lines.push("");
  lines.push(
    "_Report-only: this script does not fail CI. To enforce, wire it into a guard step once the undocumented list is shrunk to an acceptable allowlist (see Task #278 / as-any-comments for the staged-rollout pattern)._"
  );

  process.stdout.write(lines.join("\n") + "\n");
  // Always exit 0 — report-only by design.
  process.exit(0);
}

main();
