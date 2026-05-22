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
const API_SRC_DIR = join(REPO_ROOT, "artifacts/api-server/src");
const ROUTES_DIR = join(REPO_ROOT, "artifacts/api-server/src/routes");
const LIB_DIR = join(REPO_ROOT, "artifacts/api-server/src/lib");
const MIDDLEWARES_DIR = join(REPO_ROOT, "artifacts/api-server/src/middlewares");
const ERP_PAGES_DIR = join(REPO_ROOT, "artifacts/ghayth-erp/src/pages");
const ERP_COMPONENTS_DIR = join(REPO_ROOT, "artifacts/ghayth-erp/src/components");

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
    regex: /^\s*validationError\s*,?\s*$/m,
    message:
      "Stale `validationError` named import. The lowercase-v helper was " +
      "removed in Phase 5c — only the `ValidationError` class is exported now.",
  },
  {
    id: "direct-gl-import-in-domain-route",
    scan: [ROUTES_DIR],
    skip: (file) => {
      const base = file.split("/").pop();
      return base.startsWith("finance") || base === "index.ts";
    },
    regex: /\b(?:createJournalEntry|createGuardedJournalEntry)\b/,
    message:
      "Direct GL function import in non-finance route is forbidden. " +
      "Use the domain engine's GL method (e.g. hrEngine.postPayrollRunGL) " +
      "which routes through financialEngine.postJournalEntry() with " +
      "period checks, sourceKey idempotency, and budget validation.",
  },
  {
    id: "save-button-missing-rateLimitAware",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR],
    extensions: [".tsx"],
    skip: (file) => file.endsWith("/components/ui/button.tsx"),
    // Match `<Button ...>` whose attribute span (`...`) contains either
    // `type="submit"` or an `onClick={handleSomeWriteAction}` but does NOT
    // contain `rateLimitAware`. Action verbs are intentionally limited to
    // write/submit-style handlers; pure navigation handlers (handleEdit,
    // handleView, handleClose, handleCancel, etc.) are not flagged.
    // `[^>]` excludes `>` so the match stops at the closing bracket of the
    // opening tag; `s` flag lets `.` style classes span newlines, and
    // because `[^>]` already crosses newlines we naturally cover multiline
    // `<Button\n  prop={...}\n  onClick={handleSave}\n>` declarations
    // in a whole-file (not line-by-line) scan.
    regex: /<Button\b(?![^>]*\brateLimitAware\b)[^>]*\b(?:type="submit"|onClick=\{handle(?:Save|Submit|Create|Update|Add|Pay|Approve|Reject|Apply|Send|Post|Settle|Issue|Match|Search|Record|Confirm|Process|Generate|Allocate|Distribute|Refund|Verify|Activate|Deactivate|Renew|Extend|Terminate|Transfer|Assign|Reconcile|Upload|Import|Export|Schedule|Run|Bulk|Batch)[A-Za-z]*\})[^>]*>/g,
    multiline: true,
    message:
      "Save / submit / write-action <Button> is missing the `rateLimitAware` " +
      "prop. During a global 429 cooldown the button must disable itself and " +
      "show \"حاول بعد N ثانية…\". Add `rateLimitAware` to the button (Task #155 / #164). " +
      "If the handler is purely read-only (e.g. open a dialog, navigate, toggle UI), " +
      "rename it so it doesn't start with one of the write verbs the rule scans for.",
  },
  {
    id: "direct-account-mapping-in-domain-route",
    scan: [ROUTES_DIR],
    skip: (file) => {
      const base = file.split("/").pop();
      return base.startsWith("finance") || base === "index.ts";
    },
    regex: /\bgetAccountCodeFromMapping\b/,
    message:
      "Direct getAccountCodeFromMapping call in non-finance route is forbidden. " +
      "Account code resolution should happen inside the domain engine " +
      "(e.g. fleetEngine, propertiesEngine) via financialEngine.resolveAccountCode().",
  },
  {
    id: "unlocalized-toLocaleString",
    scan: [ERP_PAGES_DIR, ERP_COMPONENTS_DIR],
    extensions: [".tsx", ".ts"],
    // The shadcn chart wrapper uses toLocaleString() for tooltip values
    // and is upstream code; date-utils + formatters are the canonical
    // formatters and are allowed to call it directly with an explicit
    // locale (which the regex below already excludes).
    skip: (file) =>
      file.endsWith("/components/ui/chart.tsx")
      || file.endsWith("/lib/date-utils.ts")
      || file.endsWith("/lib/formatters.ts"),
    // Match `.toLocaleString(` followed immediately by `)` — i.e. no
    // arguments. Calls with a locale string (`toLocaleString("ar-SA")`)
    // and calls with a NumberFormat options object pass cleanly.
    regex: /\.toLocaleString\(\s*\)/,
    message:
      "`.toLocaleString()` without an explicit locale falls back to the " +
      "user's browser locale, producing inconsistent digit grouping and " +
      "numerals across users. Import `formatNumber` from `@/lib/formatters` " +
      "(returns Arabic-Indic digits with en-US grouping) or pass an " +
      "explicit locale string if you need a non-default behaviour.",
  },
  {
    id: "direct-process-env-read",
    scan: [API_SRC_DIR],
    // lib/config.ts is the ONE module allowed to touch process.env — it
    // parses and validates every variable into the typed `config` object.
    skip: (file) => file.endsWith("/lib/config.ts"),
    regex: /\bprocess\.env\b/,
    message:
      "Direct `process.env` access is forbidden outside lib/config.ts (FND-003). " +
      "Declare the variable in the lib/config.ts zod schema, expose it on the " +
      "`AppConfig` shape, and read it through the typed `config` object. This " +
      "keeps validation, defaults and the startup fail-fast gate in one place.",
  },
];

/** Recursively yield every file under a directory matching the given extensions. */
async function* walk(dir, extensions = [".ts"]) {
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
      yield* walk(full, extensions);
    } else if (entry.isFile() && extensions.some((ext) => entry.name.endsWith(ext))) {
      yield full;
    }
  }
}

const failures = [];

for (const rule of RULES) {
  for (const root of rule.scan) {
    for await (const file of walk(root, rule.extensions ?? [".ts"])) {
      if (rule.skip && rule.skip(file)) continue;
      const source = await readFile(file, "utf8");
      if (rule.multiline) {
        // Whole-file scan: walk every regex match and report it at the
        // 1-based line number where the match begins. Catches multi-line
        // JSX declarations that a per-line scan would miss.
        const re = rule.regex.global
          ? rule.regex
          : new RegExp(rule.regex.source, rule.regex.flags + "g");
        let m;
        while ((m = re.exec(source)) !== null) {
          const lineNumber = source.slice(0, m.index).split("\n").length;
          const snippet = m[0].split("\n")[0].trim();
          failures.push({
            rule: rule.id,
            file: relative(REPO_ROOT, file),
            line: lineNumber,
            snippet:
              snippet.length > 200 ? snippet.slice(0, 200) + "…" : snippet,
            message: rule.message,
          });
          if (re.lastIndex === m.index) re.lastIndex++; // safety against zero-width
        }
      } else {
        source.split("\n").forEach((line, index) => {
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
