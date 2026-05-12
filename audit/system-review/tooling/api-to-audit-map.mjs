#!/usr/bin/env node
// api-to-audit-map.mjs — Read-only.
// Scans api-server routes for handlers and detects:
//   - emitEvent / createAuditLog / applyTransition / sendNotification / queueNotification
//   - permission/requireRole guards
// Emits per-route file a list of endpoints with the integration flags.
//
// Output: tooling/_api-audit.json

import { readFileSync, writeFileSync, readdirSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const ROUTES = join(REPO, "artifacts/api-server/src/routes");
const INDEX_TS = join(ROUTES, "index.ts");

// Build a map of routerFile.ts → [mountPrefix1, mountPrefix2, ...] by parsing
// routes/index.ts. Without this, every endpoint was recorded with only its
// local path (`/leave-requests`) and the frontend lookup for the full path
// (`/hr/leave-requests`) returned no match, producing false-positive
// "broken-integration" findings.
function buildMountMap() {
  const src = readFileSync(INDEX_TS, "utf8");
  // imports: import xRouter from "./y.js" | import { xRouter } from "./y.js"
  const importRe = /import\s+(?:\{?\s*(\w+)\s*\}?)\s+from\s+["'](\.\/[^"']+)["']/g;
  const routerToFile = {};
  let m;
  while ((m = importRe.exec(src))) {
    const name = m[1];
    const file = m[2].replace(/\.js$/, ".ts").replace(/^\.\//, "");
    routerToFile[name] = file;
  }
  // router.use("/x", middleware1, middleware2, xRouter);
  //
  // We must stop the body match at the closing `);` of THIS call. If we let
  // `[\s\S]*?` cross into the next statement, a `router.use("/request-catalog",
  // (req,res,next)=>{...})` followed by `router.use("/marketing", marketingRouter)`
  // wrongly pairs `/request-catalog` with `marketingRouter`. Forbid `;` in
  // the body window so the non-greedy match cannot escape past the end of
  // the current call.
  const useRe = /router\.use\(\s*["']([^"']+)["']([^;]*?)(\w+Router)\s*\)/g;
  const map = {};
  while ((m = useRe.exec(src))) {
    const prefix = m[1];
    const routerName = m[3];
    const file = routerToFile[routerName];
    if (!file) continue;
    (map[file] = map[file] || new Set()).add(prefix);
  }
  // Convert Sets to sorted arrays
  for (const k of Object.keys(map)) map[k] = [...map[k]];
  return map;
}

const MOUNT_MAP = buildMountMap();

// app.ts mounts a global `auditMiddleware` that auto-logs any mutating
// request whose path matches a prefix in its ENTITY_MAP. Endpoints under
// those prefixes do NOT need an explicit createAuditLog() call. Without
// this awareness the scanner produces a wall of false-positive
// "missing-audit" findings for routes like /hr/check-in, /finance/expenses,
// etc. that are already covered by the middleware.
const AUDIT_MW = join(REPO, "artifacts/api-server/src/middlewares/auditMiddleware.ts");
function buildAuditedPrefixes() {
  try {
    const src = readFileSync(AUDIT_MW, "utf8");
    const block = src.match(/ENTITY_MAP\s*:[^=]*=\s*\{([\s\S]*?)\};/);
    if (!block) return [];
    const prefixes = [];
    for (const m of block[1].matchAll(/["']([^"']+)["']\s*:\s*["'][^"']+["']/g)) {
      prefixes.push(m[1]);
    }
    // Sort longest first so "/hr/check-in" wins over "/hr".
    return prefixes.sort((a, b) => b.length - a.length);
  } catch {
    return [];
  }
}
const AUDITED_PREFIXES = buildAuditedPrefixes();
function isAuditedByMiddleware(fullPath) {
  for (const p of AUDITED_PREFIXES) {
    if (fullPath === p || fullPath.startsWith(p + "/")) return true;
  }
  return false;
}

function scanFile(file) {
  const src = readFileSync(file, "utf8");
  const lines = src.split(/\r?\n/);
  const endpoints = [];
  // Match any variable name (e.g. invoicesRouter, hrRouter) followed by an
  // HTTP verb. Previously restricted to /(router|r|app)/, which silently
  // dropped finance-invoices.ts, finance-journal.ts, and every other file
  // that uses a named router export.
  const re = /\b(\w+)\.(get|post|put|patch|delete)\(\s*[`"']([^`"']+)[`"']/i;
  // Pre-scan all blocks
  for (let i = 0; i < lines.length; i++) {
    const m = lines[i].match(re);
    if (!m) continue;
    // Window: next 120 lines or until next route
    const winStart = i;
    let winEnd = i + 1;
    while (winEnd < lines.length && winEnd - winStart < 200) {
      if (re.test(lines[winEnd])) break;
      winEnd++;
    }
    const win = lines.slice(winStart, winEnd).join("\n");
    const fileRel = file.replace(REPO + "/", "");
    const fileBase = fileRel.replace(/^artifacts\/api-server\/src\/routes\//, "");
    const prefixes = MOUNT_MAP[fileBase] || [""];
    // One endpoint record per mount prefix, so a router mounted at both
    // `/hr` and `/hr/discipline` yields entries with both full paths.
    for (const prefix of prefixes) {
    // When the local path is "/" the naive concatenation produces a trailing
    // slash ("/employees/"), which then fails to match the frontend call to
    // "/employees". Strip the trailing slash from the joined path.
    let joined = prefix + m[3];
    if (joined.length > 1 && joined.endsWith("/")) joined = joined.slice(0, -1);
    endpoints.push({
      method: m[2].toUpperCase(),
      path: joined,
      localPath: m[3],
      mountPrefix: prefix,
      file: fileRel,
      line: i + 1,
      hasAudit: /createAuditLog\s*\(/.test(win) || isAuditedByMiddleware(joined),
      hasEmitEvent: /emitEvent\s*\(/.test(win),
      hasLifecycle: /applyTransition\s*\(|nextState\s*\(/.test(win),
      hasNotification: /sendNotification\s*\(|queueNotification\s*\(|notify\(/.test(win),
      hasPermission: /\bauthorize\s*\(|requirePermission\s*\(|requireRole\s*\(/.test(win),
      hasTenant: /tenantId|tenant_id|withTenantScope|companyId|assignmentId/.test(win),
      hasTransaction: /\bwithTransaction\s*\(|\bdb\.transaction\s*\(|\bwithTx\s*\(/.test(win),
    });
    } // end prefix loop
  }
  return endpoints;
}

const all = [];
for (const f of readdirSync(ROUTES)) {
  if (!f.endsWith(".ts")) continue;
  all.push(...scanFile(join(ROUTES, f)));
}

const OUT = join(__dirname, "_api-audit.json");
writeFileSync(OUT, JSON.stringify(all, null, 2));

const total = all.length;
const writes = all.filter((e) => e.method !== "GET");
const pct = (n) => `${((n / writes.length) * 100).toFixed(0)}%`;
console.log(`api-to-audit-map: ${total} endpoints (${writes.length} writes)`);
console.log(`  with audit       : ${writes.filter((e) => e.hasAudit).length} (${pct(writes.filter((e) => e.hasAudit).length)})`);
console.log(`  with emitEvent   : ${writes.filter((e) => e.hasEmitEvent).length} (${pct(writes.filter((e) => e.hasEmitEvent).length)})`);
console.log(`  with lifecycle   : ${writes.filter((e) => e.hasLifecycle).length} (${pct(writes.filter((e) => e.hasLifecycle).length)})`);
console.log(`  with notify      : ${writes.filter((e) => e.hasNotification).length} (${pct(writes.filter((e) => e.hasNotification).length)})`);
console.log(`  with permission  : ${writes.filter((e) => e.hasPermission).length} (${pct(writes.filter((e) => e.hasPermission).length)})`);
console.log(`  with tenant      : ${writes.filter((e) => e.hasTenant).length} (${pct(writes.filter((e) => e.hasTenant).length)})`);
console.log(`  with transaction : ${writes.filter((e) => e.hasTransaction).length} (${pct(writes.filter((e) => e.hasTransaction).length)})`);
