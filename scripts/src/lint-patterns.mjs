#!/usr/bin/env node
//
// scripts/src/lint-patterns.mjs — Phase 6 pattern guard.
//
// Lightweight regex-based linter that fails the build when any of the
// banned legacy patterns reappear in the API surface. Replaces a full
// ESLint setup which would require 30+ deps just to enforce 4 rules.
//
// Forbidden patterns (each row: { id, files, regex, message }):
//
//   1. local-requireRole
//      A locally-defined `function requireRole(scope, allowedRoles, res)`
//      helper that bypasses the typed-error pipeline. Use the shared
//      `assertRole` from `lib/roleGuards.js` instead — it throws
//      `ForbiddenError` so handleRouteError lights up `code: "FORBIDDEN"`.
//
//   2. legacy-validationError-call
//      A call to the deleted `validationError(res, ...)` helper. Throw
//      `new ValidationError(message, { field, fix })` instead so the
//      response goes through the TypedError pipeline.
//
//   3. legacy-validationError-import
//      A stale `validationError` named import from `lib/errorHandler.js`.
//      The export was removed in Phase 5c.
//
// Future rule (deferred until the codebase has been migrated):
//
//   4. raw-403-in-route — `res.status(403).json(...)` inside a route handler
//      bypasses the typed-error pipeline. There are ~90 legacy callsites
//      across hr.ts/admin.ts/auth.ts that still use this pattern. They will
//      be converted to `throw new ForbiddenError(...)` in a follow-up phase
//      and only then will this rule become enforceable. Adding it now would
//      flag pre-existing tech debt unrelated to Phase 5's cleanups.
//
// Usage:
//
//   node scripts/src/lint-patterns.mjs            # exit 0 if clean
//   pnpm lint:patterns                            # workspace alias
//
// Add new rules by appending to the RULES array. Rule IDs are stable
// so we can reference them in commit messages and incident reports.

import { readdir, readFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const LIB_DIR = join(REPO_ROOT, "artifacts/api-server/src/lib");
const MIDDLEWARES_DIR = join(REPO_ROOT, "artifacts/api-server/src/middlewares");

/** @type {Array<{ id: string, scan: string[], skip?: (file: string) => boolean, regex: RegExp, message: string }>} */
const RULES = [
  {
    id: "local-requireRole",
    scan: [ROUTES_DIR],
    regex: /^\s*function\s+requireRole\s*\(\s*scope\s*[:,]/m,
    message:
      "Local `function requireRole(scope, ...)` helper is forbidden. " +
      "Import `assertRole` from `../lib/roleGuards.js` and call " +
      "`assertRole(scope, [...allowedRoles])` so the failure flows " +
      "through `handleRouteError` as a typed `ForbiddenError`.",
  },
  {
    id: "legacy-validationError-call",
    scan: [ROUTES_DIR, LIB_DIR],
    skip: (file) => file.endsWith("/lib/errorHandler.ts"),
    regex: /\bvalidationError\s*\(\s*res\b/,
    message:
      "`validationError(res, ...)` was deleted in Phase 5c. Throw " +
      "`new ValidationError(message, { field, fix })` so the response " +
      "goes through the TypedError → handleRouteError pipeline.",
  },
  {
    id: "legacy-validationError-import",
    scan: [ROUTES_DIR, LIB_DIR],
    skip: (file) => file.endsWith("/lib/errorHandler.ts"),
    // Lowercase-v `validationError` next to other named imports from errorHandler.
    // The class `ValidationError` (capital V) is fine.
    regex: /^\s*validationError\s*,?\s*$/m,
    message:
      "Stale `validationError` named import. The lowercase-v helper was " +
      "removed in Phase 5c — only the `ValidationError` class is exported now.",
  },
];

/** Recursively yield every `.ts` file under a directory. */
async function* walk(dir) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return;
    throw err;
  }
  for (const entry of entries) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      yield* walk(full);
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      yield full;
    }
  }
}

const failures = [];

for (const rule of RULES) {
  for (const root of rule.scan) {
    for await (const file of walk(root)) {
      if (rule.skip && rule.skip(file)) continue;
      const source = await readFile(file, "utf8");
      const lines = source.split("\n");
      lines.forEach((line, index) => {
        if (rule.regex.test(line)) {
          failures.push({
            rule: rule.id,
            file: relative(REPO_ROOT, file),
            line: index + 1,
            snippet: line.trim(),
            message: rule.message,
          });
        }
      });
    }
  }
}

if (failures.length === 0) {
  console.log("✓ lint-patterns: clean — no forbidden legacy patterns found.");
  process.exit(0);
}

console.error(
  `✗ lint-patterns: ${failures.length} violation(s) of forbidden patterns:\n`,
);
const grouped = new Map();
for (const f of failures) {
  if (!grouped.has(f.rule)) grouped.set(f.rule, []);
  grouped.get(f.rule).push(f);
}
for (const [rule, hits] of grouped) {
  const head = hits[0];
  console.error(`── ${rule} (${hits.length}) ──`);
  console.error(`   ${head.message}`);
  for (const h of hits) {
    console.error(`   • ${h.file}:${h.line}  ${h.snippet}`);
  }
  console.error("");
}
process.exit(1);
