#!/usr/bin/env node
/**
 * auditPermissionCoverage.mjs — report every router endpoint that does NOT
 * carry an inline auth guard (`authorize({...})`, `requirePermission(...)`,
 * `requireMinLevel(...)`, `requireRole(...)`). Outputs a JSON + CSV report
 * + console summary. Does NOT fail the build — the goal is visibility, not
 * gating. Pair with `lintPermissions.mjs` (which gates against unknown
 * permission strings).
 *
 * Usage:
 *   node scripts/auditPermissionCoverage.mjs           # console only
 *   node scripts/auditPermissionCoverage.mjs --json    # also write JSON
 *   node scripts/auditPermissionCoverage.mjs --csv     # also write CSV
 *
 * Why this exists: the 2026-05-06 system audit flagged 74 endpoints with no
 * inline `requirePermission`. Many were intentional (auth, public, mySpace,
 * health, careers) but the list was never re-checked after RBAC v2 added
 * `authorize()`. This script regenerates the picture on demand.
 */

import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, "..");
const ROUTES_DIR = join(API_ROOT, "src", "routes");

// Inline-guard regex — matches any of the auth helpers we use as middleware
// directly on a route definition. We deliberately accept only the
// middleware-form (parens after the call) so that a `// requirePermission`
// comment doesn't fool the scanner.
const GUARD_RE = /\b(authorize|requirePermission|requireMinLevel|requireRole|requireGuards)\s*\(/;

// In-handler programmatic permission checks. Used by routes that need
// finer-grained control (e.g. "show own record OR check permission") and
// can't express it as flat middleware. We treat these as "soft-guarded".
// `scope.role` and `allowedRoles.includes` cover the role-gated reports
// pattern used in approvalActions.ts.
const IN_HANDLER_GUARD_RE = /\b(userHasPermission|isOwnData|isOwnRecord|requireOwnership|enforceCompanyScope|allowedRoles\.includes|ALLOWED_ROLES|APPROVAL_AUDIT_ROLES|requireRoleInBody)\s*[\(\.]/;

// authMiddleware mounted on the line itself (vs. outer router-level mount)
// — we DON'T treat this as a permission guard (it only proves "logged in"),
// but we do annotate so the operator can decide whether the soft-check is
// enough.
const AUTH_PRESENCE_RE = /\bauthMiddleware\b/;

// Routes that are intentionally unguarded by design. Add the file → reason
// mapping here so the report annotates them as "OK". This is the same kind
// of allow-list that lintSql.mjs / lintPermissions.mjs use for known-safe
// patterns.
//
// Each entry was hand-verified against the actual code on origin/main on
// 2026-05-09. Re-run the audit after any change to one of these files to
// confirm the design is still intact (e.g. someone didn't accidentally add
// a route that needs a guard but inherits this allowlist).
const INTENTIONALLY_UNGUARDED = {
  // --- Public / anonymous surfaces ---
  "auth.ts":            "auth (login/register/refresh) — anon by definition",
  "health.ts":          "liveness probes — public",
  "publicData.ts":      "public reference data — anon by design",
  "careersPortal.ts":   "applicant flow — anon with portalLimiter",
  "clientPortal.ts":    "client-portal JWT — separate auth chain",
  "events.ts":          "SSE stream — auth happens on subscribe",
  "activityIngest.ts":  "ingest endpoint — token-authed via header",

  // --- Self-service surfaces (user can only see their own data) ---
  "mySpace.ts":         "self-service — owner is the user",

  // --- Read-only dashboards ---
  // dashboard.ts and moduleDashboards.ts use scope.companyId via
  // buildFilter() so the user can only see aggregates for their own
  // company. They summarise data the user can already see in modules.
  "dashboard.ts":       "company-scoped via buildFilter(scope)",
  "moduleDashboards.ts": "company-scoped per-module dashboards — same model as dashboard.ts",

  // --- RBAC v2 self-service ---
  // /features and /templates expose read-only catalog metadata anyone
  // authenticated needs for the RBAC editor. JIT routes (/jit/request,
  // /jit/my, /jit/:id/cancel) operate on the requesting user's own
  // records. Approve/grant/revoke endpoints in the same file ARE
  // properly guarded.
  "rbacV2.ts":          "catalog reads + JIT self-service (own requests only) — others guarded inline",

  // --- Webhook endpoints (provider-side authentication) ---
  // WhatsApp webhook uses hub.verify_token shared secret on GET and
  // signature header on POST. PBX endpoints come from the on-prem
  // gateway over a private network. /push/vapid-key returns the PUBLIC
  // key (designed to be public per RFC 8292).
  "communications.ts":  "WhatsApp/PBX webhook auth via provider signatures; vapid-key public by design",

  // --- PDPL ---
  // /privacy-notice is anon (must be readable before login). The other
  // routes use authMiddleware + pdplUserLimiter; data-export has an
  // inline isOwnData / userHasPermission check too.
  "pdpl.ts":            "privacy-notice anon; rest use authMiddleware + pdpl rate limiters",

  // --- Read-only audit views (company-scoped) ---
  // /:entityType/:entityId returns approval history for a specific
  // record, scoped by companyId. /overrides/report has an inline
  // allowedRoles check (already soft-guarded by the linter).
  "approvalActions.ts": "entity-scoped audit reads + role-gated overrides report",

  // --- Action center (role-gated inline) ---
  // The root endpoint enforces ACTION_CENTER_ROLES inline.
  "actionCenter.ts":    "managers-only — enforced inline via ACTION_CENTER_ROLES",

  // --- Permissions (own data) ---
  "permissions.ts":     "/my returns own permissions only — others guarded",

  // --- Public storage ---
  // /storage/public-objects/* is the bucket for public assets (company
  // logos, public document templates). objectStorageService restricts
  // to the public namespace.
  "storage.ts":         "/public-objects/* serves public namespace only — uploads + private files guarded",

  // --- index.ts router-mount file ---
  // /settings/display returns global defaults BEFORE the authMiddleware
  // mount (used by the login screen). /_routes is hidden in production
  // (returns 404) and serves as a dev-only route inventory.
  "index.ts":           "settings/display = pre-auth defaults; /_routes is dev-only (404 in prod)",
};

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(p)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

function* findRouterCalls(src) {
  // Match `router.<verb>("/path", ...)` — start position is the verb so we
  // can include the head of the call in the body slice for guard detection.
  const re = /\brouter\.(get|post|put|patch|delete)\s*\(/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    const start = m.index;
    const callStart = re.lastIndex;
    // Slice from "(" to matching ")" — needed because `authorize({...})`
    // sits between the path and the handler.
    let i = callStart;
    let depth = 1;
    while (i < src.length && depth > 0) {
      const c = src[i];
      if (c === "(") depth++;
      else if (c === ")") depth--;
      i++;
    }
    // For in-handler-guard detection we need the *handler body* too, which
    // continues from `i` (just after the closing paren of the route call)
    // up to the next top-level `router.<verb>(` or end of file.
    let j = i;
    let probe = j;
    let foundNext = -1;
    while (probe < src.length) {
      const idx = src.indexOf("router.", probe);
      if (idx === -1) break;
      // Make sure it's actually a router method call (verb after the dot).
      if (/^router\.(get|post|put|patch|delete)\s*\(/.test(src.slice(idx))) {
        foundNext = idx;
        break;
      }
      probe = idx + 7;
    }
    const handlerEnd = foundNext === -1 ? src.length : foundNext;
    const fullSlice = src.slice(start, handlerEnd);
    const body = src.slice(start, i); // route declaration (path + middlewares)
    yield {
      method: m[1].toUpperCase(),
      startIdx: start,
      body,
      handler: src.slice(i, handlerEnd),
      fullSlice,
    };
  }
}

function pathOf(body) {
  const m = body.match(/router\.\w+\s*\(\s*["'`]([^"'`]+)["'`]/);
  return m ? m[1] : null;
}

async function main() {
  const wantJson = process.argv.includes("--json");
  const wantCsv = process.argv.includes("--csv");

  const files = await walk(ROUTES_DIR);
  const findings = [];
  let total = 0;
  let guarded = 0;

  for (const f of files) {
    const src = await readFile(f, "utf8");
    const fileName = relative(ROUTES_DIR, f);
    const intentional = INTENTIONALLY_UNGUARDED[fileName] ?? null;

    for (const call of findRouterCalls(src)) {
      total++;
      const hasInlineGuard = GUARD_RE.test(call.body);
      if (hasInlineGuard) {
        guarded++;
        continue;
      }
      // call.body covers the whole route declaration including the inline
      // async handler, so it's where userHasPermission(...) calls live.
      const hasInHandlerGuard = IN_HANDLER_GUARD_RE.test(call.body);
      const hasAuthMiddleware = AUTH_PRESENCE_RE.test(call.body);
      findings.push({
        file: fileName,
        method: call.method,
        path: pathOf(call.body) ?? "?",
        intentional,
        inHandlerGuard: hasInHandlerGuard,
        authMiddleware: hasAuthMiddleware,
      });
    }
  }

  const unguardedTotal = findings.length;
  const unintentional = findings.filter((f) => !f.intentional);
  const softGuarded = unintentional.filter((f) => f.inHandlerGuard);
  const truly = unintentional.filter((f) => !f.inHandlerGuard);

  // Per-file roll-up — mirrors what the 2026-05-06 audit table looked like
  // so we can compare deltas at a glance.
  const byFile = {};
  for (const f of findings) {
    byFile[f.file] = byFile[f.file] || { total: 0, intentional: 0, soft: 0, review: 0 };
    byFile[f.file].total++;
    if (f.intentional) byFile[f.file].intentional++;
    else if (f.inHandlerGuard) byFile[f.file].soft++;
    else byFile[f.file].review++;
  }

  console.log("\n=== Permission Coverage Audit ===");
  console.log(`Total endpoints:           ${total}`);
  console.log(`Guarded (inline):          ${guarded} (${Math.round((guarded * 100) / total)}%)`);
  console.log(`Unguarded (intentional):   ${unguardedTotal - unintentional.length}`);
  console.log(`Soft-guarded (in-handler): ${softGuarded.length}`);
  console.log(`HARD review needed:        ${truly.length}`);

  if (Object.keys(byFile).length > 0) {
    console.log("\nPer-file breakdown (only files with unguarded endpoints):");
    const rows = Object.entries(byFile).sort((a, b) => b[1].review - a[1].review);
    for (const [file, c] of rows) {
      const flag = c.review > 0 ? "⚠️ " : c.soft > 0 ? "ℹ️ " : "✅ ";
      console.log(
        `  ${flag}${file.padEnd(36)} unguarded=${c.total}  intentional=${c.intentional}  soft=${c.soft}  review=${c.review}`,
      );
    }
  }

  if (truly.length > 0 && truly.length <= 30) {
    console.log("\nEndpoints needing manual review (NO guard at all):");
    for (const f of truly) {
      const note = f.authMiddleware ? " [auth-only]" : "";
      console.log(`  ${f.method.padEnd(6)} ${f.path}    (${f.file})${note}`);
    }
  } else if (truly.length > 30) {
    console.log(`\n(${truly.length} hard findings — see JSON/CSV report.)`);
  }

  if (wantJson || wantCsv) {
    await mkdir(join(API_ROOT, "..", "..", "audit", "report"), { recursive: true }).catch(() => {});
  }
  if (wantJson) {
    const out = join(API_ROOT, "..", "..", "audit", "report", "permission_coverage.json");
    await writeFile(
      out,
      JSON.stringify(
        { generatedAt: new Date().toISOString(), total, guarded, unguardedTotal, unintentional: unintentional.length, byFile, findings },
        null,
        2,
      ),
    );
    console.log(`\nJSON: ${out}`);
  }
  if (wantCsv) {
    const out = join(API_ROOT, "..", "..", "audit", "report", "permission_coverage.csv");
    const header = "file,method,path,status,note\n";
    const rows = findings
      .map((f) =>
        [
          f.file,
          f.method,
          f.path,
          f.intentional ? "intentional" : "review",
          f.intentional ?? "",
        ]
          .map((s) => `"${String(s).replace(/"/g, '""')}"`)
          .join(","),
      )
      .join("\n");
    await writeFile(out, header + rows + "\n");
    console.log(`CSV:  ${out}`);
  }

  // Soft signal — exit 0 always, since this is a visibility tool.
  process.exit(0);
}

main().catch((err) => {
  console.error("auditPermissionCoverage crashed:", err);
  process.exit(2);
});
