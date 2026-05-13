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

  // Normalise contents before diffing: every "divergent" pair in the
  // 2026-05-13 baseline turned out to differ *only* in a self-
  // referencing header comment line. Three flavours observed:
  //   `-- 034_hr_discipline_regulation.sql`   (filename echo)
  //   `-- 035: Seed COA accounts ...`         (number-colon-description)
  //   `-- Migration 140: add missing ...`     (Migration-number-colon)
  // None of those affect what the DDL does. Strip them before comparing
  // so the script reports actual behavioural divergence, not the leftover
  // from a copy-rename.
  const HEADER_SELF_REF = /^--\s*(?:Migration\s+)?\d{2,4}[:_].+$/gm;
  const normalise = (s) => s.replace(HEADER_SELF_REF, "-- <header-self-ref-stripped>");

  for (const [base, files] of duplicates) {
    const sorted = files.slice().sort();
    const contents = await Promise.all(
      sorted.map((f) => readFile(join(MIGRATIONS_DIR, f), "utf8")),
    );
    const normalised = contents.map(normalise);
    const allIdentical = normalised.every((c) => c === normalised[0]);
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

  // After the 2026-05-13 cleanup both baselines are at 0. Any *new*
  // collision (identical OR divergent) must fail CI immediately. There
  // is no excuse for shipping one once the baseline is clean.
  if (identicalCount > 0 || divergentCount > 0) {
    console.error(
      `[check-duplicate-migrations] FAIL — ${identicalCount} identical + ${divergentCount} divergent duplicate(s). ` +
      `Baseline is supposed to be 0/0. Either you re-numbered a migration without ` +
      `deleting the original, copied DDL from an earlier migration, or two migrations claim ` +
      `the same logical change while doing different things. Resolve before merging.`,
    );
    process.exit(1);
  }
  // unreachable in the no-duplicates path (early-return above), but kept
  // for completeness if a future rule adds a non-failing category.
  console.log(`[check-duplicate-migrations] PASS — 0/0`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
