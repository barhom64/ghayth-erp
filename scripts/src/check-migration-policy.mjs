#!/usr/bin/env node
//
// scripts/src/check-migration-policy.mjs — migration discipline guard.
//
// Enforces docs/MIGRATION_POLICY.md against the live migration directory
// (artifacts/api-server/src/migrations — the one the runtime migration
// runner actually applies).
//
// Two tiers of rules:
//
//   1. UNIVERSAL (every migration, old or new)
//      - filename matches  NNN[suffix]_snake_case_name.sql
//      - file is not empty
//
//   2. STRICT (new migrations only — those NOT listed in the legacy
//      allowlist scripts/migration-policy-legacy-allowlist.txt)
//      - starts with a `--` header comment block
//      - carries a rollback annotation  (`-- @rollback ...`)
//      - any destructive statement (DROP TABLE / TRUNCATE / DROP COLUMN /
//        DROP DATABASE / DROP SCHEMA) is explicitly acknowledged with a
//        `-- @policy:destructive` line
//
// The allowlist freezes the migrations that pre-date this policy so the
// guard never retroactively fails historical files — exactly the pattern
// already used by scripts/ghost-row-allowlist.txt. Every NEW migration
// must satisfy the strict rules.
//
// Advisory warnings (printed, do not fail the build) flag non-idempotent
// DDL in new migrations.
//
// Usage:
//   node scripts/src/check-migration-policy.mjs      # exit 0 clean, 1 on violation
//   pnpm audit:migrations                            # workspace alias

import { readdir, readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MIGRATIONS_DIR = join(REPO_ROOT, "artifacts/api-server/src/migrations");
const ALLOWLIST_FILE = join(
  REPO_ROOT,
  "scripts/migration-policy-legacy-allowlist.txt",
);

const NAME_RE = /^[0-9]{3,}[a-z]?_[A-Za-z0-9_]+\.sql$/;
const ROLLBACK_RE = /--\s*@?rollback\b/i;
const DESTRUCTIVE_ACK_RE = /--\s*@policy:destructive\b/i;
const DESTRUCTIVE_RE =
  /\b(?:DROP\s+TABLE|TRUNCATE(?:\s+TABLE)?|DROP\s+COLUMN|DROP\s+DATABASE|DROP\s+SCHEMA)\b/i;
const NON_IDEMPOTENT_CREATE_RE = /\bCREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS)/i;

/** Remove SQL comments + string literals so keyword scans don't false-match. */
function stripSql(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/--[^\n]*/g, " ")
    .replace(/'(?:[^']|'')*'/g, "''");
}

function firstNonEmptyLine(content) {
  for (const line of content.split("\n")) {
    if (line.trim().length > 0) return line.trim();
  }
  return "";
}

async function loadAllowlist() {
  if (!existsSync(ALLOWLIST_FILE)) {
    console.error(
      `[check-migration-policy] FAIL — legacy allowlist missing at ${relative(
        REPO_ROOT,
        ALLOWLIST_FILE,
      )}.\n` +
        "  The allowlist freezes pre-policy migrations; without it the guard " +
        "cannot tell new migrations from historical ones. Restore it from git.",
    );
    process.exit(1);
  }
  const raw = await readFile(ALLOWLIST_FILE, "utf8");
  return new Set(
    raw
      .split("\n")
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#")),
  );
}

async function main() {
  if (!existsSync(MIGRATIONS_DIR)) {
    console.log(
      `[check-migration-policy] no migrations directory at ${relative(
        REPO_ROOT,
        MIGRATIONS_DIR,
      )} — skipping`,
    );
    return;
  }

  const allowlist = await loadAllowlist();
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith(".sql"))
    .sort();

  const errors = [];
  const warnings = [];
  let strictChecked = 0;

  for (const file of files) {
    // ── universal rules ──────────────────────────────────────────────────
    if (!NAME_RE.test(file)) {
      errors.push(
        `${file}: filename does not match the required pattern ` +
          "NNN[suffix]_snake_case_name.sql (3+ digit zero-padded prefix).",
      );
      continue;
    }

    const content = await readFile(join(MIGRATIONS_DIR, file), "utf8");
    if (content.trim().length === 0) {
      errors.push(`${file}: migration file is empty.`);
      continue;
    }

    // ── strict rules (new migrations only) ───────────────────────────────
    if (allowlist.has(file)) continue;
    strictChecked++;

    if (!firstNonEmptyLine(content).startsWith("--")) {
      errors.push(
        `${file}: must start with a "--" header comment block describing ` +
          "what the migration does and why (see docs/migration-template.sql).",
      );
    }

    if (!ROLLBACK_RE.test(content)) {
      errors.push(
        `${file}: missing a rollback annotation. Add a "-- @rollback: ..." ` +
          "line documenting how to undo this migration (or why it cannot be).",
      );
    }

    const stripped = stripSql(content);
    if (DESTRUCTIVE_RE.test(stripped) && !DESTRUCTIVE_ACK_RE.test(content)) {
      errors.push(
        `${file}: contains a destructive statement (DROP/TRUNCATE) without a ` +
          '"-- @policy:destructive" acknowledgement line. Destructive changes ' +
          "must be explicit and reviewed — see docs/MIGRATION_POLICY.md §4.",
      );
    }

    if (NON_IDEMPOTENT_CREATE_RE.test(stripped)) {
      warnings.push(
        `${file}: CREATE TABLE without "IF NOT EXISTS" — prefer idempotent ` +
          "DDL so a partially-applied migration can be re-run safely.",
      );
    }
  }

  if (warnings.length > 0) {
    console.log(`[check-migration-policy] ${warnings.length} advisory warning(s):`);
    for (const w of warnings) console.log(`  ! ${w}`);
  }

  if (errors.length > 0) {
    console.error(
      `[check-migration-policy] FAIL — ${errors.length} policy violation(s):`,
    );
    for (const e of errors) console.error(`  ✗ ${e}`);
    console.error(
      "\n  Fix the migrations above, or — only for genuinely historical " +
        "files — add them to scripts/migration-policy-legacy-allowlist.txt.",
    );
    process.exit(1);
  }

  console.log(
    `[check-migration-policy] PASS — ${files.length} migration(s) checked ` +
      `(${strictChecked} under strict policy, ${files.length - strictChecked} legacy).`,
  );
}

main().catch((err) => {
  console.error("[check-migration-policy] crashed:", err);
  process.exit(1);
});
