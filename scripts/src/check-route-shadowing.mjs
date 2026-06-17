#!/usr/bin/env node
//
// scripts/src/check-route-shadowing.mjs
//
// "static route shadowed by an earlier :param route" guard. Express matches
// routes in registration order, so a literal route registered AFTER a param
// route on the same method + prefix is UNREACHABLE — the param route captures
// the literal segment as its value:
//
//     router.get("/cost-centers/:id", ...)        // line 280
//     router.get("/cost-centers/ranking", ...)    // line 1243  <-- BUG
//
// A request to GET /cost-centers/ranking matches `:id="ranking"`, the handler
// parses "ranking" as a numeric id and 422s with «معرف غير صالح: id». The
// ranking page never loads its data. The runtime audit recorded this as a 422
// on /api/finance/cost-centers/ranking. The fix is to register the static
// route BEFORE the param route. This is invisible to typecheck/build/lint and
// only manifests at runtime, so it needs a static gate.
//
// Detector:
//   1. Read every api-server route source file.
//   2. Parse `router.<method>(<path>, ...)` registrations IN ORDER per file.
//   3. For each registration, if an EARLIER same-method route in the same file
//      is a `:param` pattern that would match this route's path (Express
//      semantics: same segment count, each pattern segment equals the literal
//      OR is a `:param`), and THIS route has at least one plain-literal segment
//      where the earlier one had a `:param`, then this route is shadowed.
//   4. Any shadow not in the allowlist is a regression -> fail.
//
// OFFLINE: pure source scan, no DB / build / server needed — runs
// unconditionally in CI (like check:register-limiter-misuse / check:dump-drift).
//
// Allowlist: scripts/route-shadowing-allowlist.txt (one `<file>::<METHOD> <path>`
// per line, `#` comments allowed) captures pre-existing/intentional shadows so
// the guard blocks only NEW ones.
//
// Usage:
//   node scripts/src/check-route-shadowing.mjs
//
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES_DIR = "artifacts/api-server/src/routes";
const ALLOWLIST = "scripts/route-shadowing-allowlist.txt";

// Match `router.METHOD( "..."/'...'/`...` , ... )` — we only need the method
// and the path literal (first string argument).
const ROUTE_RE =
  /router\.(get|post|put|patch|delete)\s*\(\s*(["'`])([^"'`]*)\2/g;

/** Parse ordered `{ method, path }[]` route registrations from a source string. */
export function extractRoutes(source) {
  const out = [];
  let m;
  ROUTE_RE.lastIndex = 0;
  while ((m = ROUTE_RE.exec(source)) !== null) {
    out.push({ method: m[1], path: m[3] });
  }
  return out;
}

function segs(path) {
  return path.split("?")[0].split("/").filter(Boolean);
}

/**
 * Would an Express route registered with pattern `pat` match a request whose
 * concrete path matches `target`? Same segment count; each pattern segment must
 * equal the target segment OR be a `:param` (matches any single segment).
 * Wildcards (`*`) are treated as non-shadowing (skipped) to avoid over-flagging
 * intentional catch-alls.
 */
function patternMatches(patSegs, targetSegs) {
  if (patSegs.length !== targetSegs.length) return false;
  for (let i = 0; i < patSegs.length; i++) {
    const p = patSegs[i];
    if (p.includes("*")) return false;
    if (p.startsWith(":")) continue; // matches any single segment
    if (p !== targetSegs[i]) return false;
  }
  return true;
}

/** True if `path` contains at least one plain-literal (non-`:param`) segment. */
function hasLiteralSegment(path) {
  return segs(path).some((s) => !s.startsWith(":") && !s.includes("*"));
}

/**
 * Given ordered route registrations, return the shadowed ones. A route is
 * shadowed when an EARLIER same-method route is a `:param` pattern that would
 * match it AND the current route differs by having a literal where the earlier
 * had a `:param` (i.e. it is a more-specific static route registered too late).
 */
export function findShadowedRoutes(routes) {
  const shadowed = [];
  for (let i = 0; i < routes.length; i++) {
    const cur = routes[i];
    const curSegs = segs(cur.path);
    if (!hasLiteralSegment(cur.path)) continue; // pure param routes can't be shadowed-by-specificity
    for (let j = 0; j < i; j++) {
      const earlier = routes[j];
      if (earlier.method !== cur.method) continue;
      if (!earlier.path.includes(":")) continue; // earlier must be a param pattern
      const earlierSegs = segs(earlier.path);
      if (!patternMatches(earlierSegs, curSegs)) continue;
      // Confirm the difference is a `:param` (earlier) vs literal (current) at
      // some position — that's what makes `cur` unreachable.
      let differsByParam = false;
      for (let k = 0; k < earlierSegs.length; k++) {
        if (earlierSegs[k].startsWith(":") && !curSegs[k].startsWith(":")) {
          differsByParam = true;
          break;
        }
      }
      if (differsByParam) {
        shadowed.push({ method: cur.method, path: cur.path, shadowedBy: earlier.path });
        break;
      }
    }
  }
  return shadowed;
}

function listRouteFiles(absDir) {
  const out = [];
  for (const ent of readdirSync(absDir)) {
    const abs = join(absDir, ent);
    const st = statSync(abs);
    if (st.isDirectory()) out.push(...listRouteFiles(abs));
    else if (ent.endsWith(".ts") && !ent.endsWith(".d.ts")) out.push(abs);
  }
  return out;
}

function loadAllowlist() {
  const abs = join(REPO_ROOT, ALLOWLIST);
  if (!existsSync(abs)) return new Set();
  return new Set(
    readFileSync(abs, "utf8")
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l && !l.startsWith("#")),
  );
}

function main() {
  const absDir = join(REPO_ROOT, ROUTES_DIR);
  if (!existsSync(absDir)) {
    console.log(`\u2713 check:route-shadowing — no routes dir (${ROUTES_DIR}); nothing to scan.`);
    return;
  }
  const allow = loadAllowlist();
  const findings = [];
  let scanned = 0;
  for (const abs of listRouteFiles(absDir)) {
    const rel = relative(REPO_ROOT, abs);
    const routes = extractRoutes(readFileSync(abs, "utf8"));
    scanned += routes.length;
    for (const s of findShadowedRoutes(routes)) {
      const key = `${rel}::${s.method.toUpperCase()} ${s.path}`;
      if (allow.has(key)) continue;
      findings.push({ key, shadowedBy: s.shadowedBy });
    }
  }

  if (findings.length > 0) {
    console.error(
      "\u2717 check:route-shadowing — a static route is unreachable, shadowed by an earlier :param route:\n",
    );
    for (const f of findings) {
      console.error(`  - ${f.key}  (shadowed by earlier "${f.shadowedBy}")`);
    }
    console.error(
      "\nExpress matches routes in registration order. A literal route registered\n" +
        "AFTER a `:param` route on the same method+prefix never runs — the param route\n" +
        "captures the literal segment as its value (e.g. /cost-centers/ranking became\n" +
        "/cost-centers/:id with id=\"ranking\" -> 422 «معرف غير صالح: id»). Register the\n" +
        "static route BEFORE the param route. If this shadow is intentional, add the\n" +
        `line to ${ALLOWLIST}.\n`,
    );
    process.exit(1);
  }

  console.log(
    `\u2713 check:route-shadowing — no static route is shadowed by an earlier :param route (${scanned} routes scanned).`,
  );
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) main();
