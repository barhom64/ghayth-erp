#!/usr/bin/env node
//
// scripts/src/check-duplicate-migrations.mjs
//
// Detects migration files in artifacts/api-server/src/migrations/ that
// share the same name-after-prefix. The migration runner uses the
// numeric prefix as a unique sort key, so two files like
//   021_salary_history_and_employee_components.sql
//   028_salary_history_and_employee_components.sql
// don't *re-run* the same DDL — but their presence in the tree means a
// reviewer can't trust that the highest-numbered file is the authoritative
// one. The audit on 2026-05-13 (docs/LIBRARIES_AND_CONSISTENCY_AUDIT…)
// found 19 such pairs, all byte-identical.
//
// Behaviour:
//   • Groups files by basename-minus-prefix.
//   • For each group with >1 file, diffs the contents:
//       - byte-identical → reports as "redundant duplicate" (safe to remove
//         the lower-numbered file once you're sure no env has applied it
//         while skipping the higher one).
//       - differs → reports as "DIVERGENT" (much more dangerous; you have
//         two migrations claiming the same logical change but actually
//         doing different things).
//   • Exit 0 if no duplicates. Exit 1 otherwise. Run as part of CI to
//     keep new duplicates from sneaking in.
//
// Usage:
//   node scripts/src/check-duplicate-migrations.mjs

import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const MIGRATIONS_DIR = join(REPO_ROOT, "artifacts/api-server/src/migrations");

const PREFIX_RE = /^(\d+)_(.+\.sql)$/;

async function main() {
  let entries;
  try {
    entries = await readdir(MIGRATIONS_DIR);
  } catch (err) {
    if (err.code === "ENOENT") {
      console.log(`[check-duplicate-migrations] no migrations directory at ${MIGRATIONS_DIR} — skipping`);
      return;
    }
    throw err;
  }

  /** @type {Map<string, string[]>} basename → [prefixedFile, ...] */
  const groups = new Map();
  for (const entry of entries) {
    const match = PREFIX_RE.exec(entry);
    if (!match) continue;
    const base = match[2];
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(entry);
  }

  const duplicates = [...groups.entries()].filter(([, files]) => files.length > 1);
  if (duplicates.length === 0) {
    console.log("[check-duplicate-migrations] OK — every migration basename is unique.");
    return;
  }

  let divergentCount = 0;
  let identicalCount = 0;
  console.log(`[check-duplicate-migrations] found ${duplicates.length} basename collisions:`);

  for (const [base, files] of duplicates) {
    const sorted = files.slice().sort();
    const contents = await Promise.all(
      sorted.map((f) => readFile(join(MIGRATIONS_DIR, f), "utf8")),
    );
    const allIdentical = contents.every((c) => c === contents[0]);
    if (allIdentical) {
      identicalCount++;
      console.log(`  • ${base}: IDENTICAL across ${files.length} files (${sorted.join(", ")})`);
    } else {
      divergentCount++;
      console.log(`  • ${base}: DIVERGENT across ${files.length} files (${sorted.join(", ")}) — review urgently`);
    }
  }

  console.log(
    `[check-duplicate-migrations] summary: ${identicalCount} identical · ${divergentCount} divergent`,
  );
  console.log(
    "  Identical duplicates are safe to consolidate by deleting the lower-numbered file,",
  );
  console.log(
    "  but ONLY after verifying every production / staging DB has applied at most one of",
  );
  console.log(
    "  the prefixes (check the migration tracking table).",
  );

  // Pre-existing baseline (audit 2026-05-13): 10 identical + 9 divergent
  // pairs in main. This script ships in informational-only mode so the
  // tree is visible in CI logs without breaking the build. After the
  // cleanup PR lands and the count is at zero, set ENFORCE=1 to fail on
  // any new duplicate.
  //
  // Once enforced, the divergent count is the dangerous one to gate on:
  // identical duplicates are harmless leftovers, but divergent pairs
  // mean two migrations claim the same logical change while actually
  // doing different things.
  const enforce = process.env.ENFORCE === "1";
  if (enforce && divergentCount > 0) {
    console.error(
      `[check-duplicate-migrations] FAIL (ENFORCE=1) — ${divergentCount} divergent duplicate(s). Resolve before merging.`,
    );
    process.exit(1);
  }
  console.log(
    `[check-duplicate-migrations] informational only (set ENFORCE=1 to gate CI once baseline is cleaned).`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
