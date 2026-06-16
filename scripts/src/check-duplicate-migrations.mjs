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

// ── #1945 / R-002 — duplicate NUMERIC-prefix ratchet ─────────────────────
// The runner sorts by full filename, so two files sharing a number still
// apply in a deterministic order — but a duplicate number means two agents
// numbered concurrently without rebasing, and reviewers/tools that refer to
// "migration 287" become ambiguous (the R-002 incident: PR #2017 and #2018
// both shipped a 287). History up to NUMBER_RATCHET_FLOOR is grandfathered
// (renumbering applied migrations would change their identity in every
// environment's tracking table); any duplicate number ABOVE the floor fails
// CI so no NEW collision can land. Bump the floor only when a grandfathered
// duplicate is consolidated away, never to admit a new one.
const NUMBER_RATCHET_FLOOR = 290;

// ── Grandfathered divergent basename pairs ─────────────────────────────────
// Some pairs were discovered in production AFTER the clean-baseline rule was
// established. Adding them here is a one-time amnesty; the allowlist must
// never grow — it exists only to let a critical idempotency-fix PR land
// without blocking the whole migration chain while the root-cause file is
// being restored to the repo.
//
// Each entry is the shared basename (after stripping the numeric prefix).
// Rationale per entry:
//
//   fleet_rental_inspection_and_driver.sql  (282_ + 293_)
//     282_ was the original migration but was missing from the repo; 293_ is
//     a duplicate that ran after it in production environments and 42710'd on
//     the bare ADD CONSTRAINT calls. Both files are intentionally divergent
//     (282_ carries the ADD COLUMN block; 293_ is the later twin). Both were
//     made idempotent by PR #2467. The allowlist entry is removed once the
//     lower-numbered file is safe to delete from all environments' tracking
//     tables.
const BASENAME_DIVERGENT_ALLOWLIST = new Set([
  "fleet_rental_inspection_and_driver.sql",
]);

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
  /** @type {Map<number, string[]>} numeric prefix → [prefixedFile, ...] */
  const numberGroups = new Map();
  for (const entry of entries) {
    const match = PREFIX_RE.exec(entry);
    if (!match) continue;
    const base = match[2];
    if (!groups.has(base)) groups.set(base, []);
    groups.get(base).push(entry);
    const num = Number(match[1]);
    if (!numberGroups.has(num)) numberGroups.set(num, []);
    numberGroups.get(num).push(entry);
  }

  // Numeric-prefix ratchet (R-002): duplicate numbers above the floor fail.
  const numberCollisions = [...numberGroups.entries()]
    .filter(([num, files]) => num > NUMBER_RATCHET_FLOOR && files.length > 1);
  if (numberCollisions.length > 0) {
    for (const [num, files] of numberCollisions) {
      console.error(
        `[check-duplicate-migrations] FAIL — duplicate migration NUMBER ${num} (> ratchet floor ${NUMBER_RATCHET_FLOOR}): ${files.sort().join(", ")}. ` +
        `Renumber the newer file to the next free number before merging (R-002).`,
      );
    }
    process.exit(1);
  }

  const duplicates = [...groups.entries()].filter(([, files]) => files.length > 1);
  if (duplicates.length === 0) {
    console.log("[check-duplicate-migrations] OK — every migration basename is unique.");
    return;
  }

  let divergentCount = 0;
  let identicalCount = 0;
  let allowlistedCount = 0;
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
    } else if (BASENAME_DIVERGENT_ALLOWLIST.has(base)) {
      allowlistedCount++;
      console.log(`  • ${base}: DIVERGENT across ${files.length} files (${sorted.join(", ")}) — grandfathered by allowlist (restore + idempotency fix; remove allowlist entry once lower file is safe to delete from all tracking tables)`);
    } else {
      divergentCount++;
      console.log(`  • ${base}: DIVERGENT across ${files.length} files (${sorted.join(", ")}) — review urgently`);
    }
  }

  console.log(
    `[check-duplicate-migrations] summary: ${identicalCount} identical · ${divergentCount} divergent · ${allowlistedCount} allowlisted`,
  );
  if (allowlistedCount > 0) {
    console.log(
      `  ${allowlistedCount} allowlisted divergent pair(s) — see BASENAME_DIVERGENT_ALLOWLIST in this file for rationale.`,
    );
  }
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
  // Allowlisted divergent pairs (grandfathered production incidents) are
  // exempt from the failure gate; they are logged above for visibility.
  if (identicalCount > 0 || divergentCount > 0) {
    console.error(
      `[check-duplicate-migrations] FAIL — ${identicalCount} identical + ${divergentCount} divergent duplicate(s). ` +
      `Baseline is supposed to be 0/0. Either you re-numbered a migration without ` +
      `deleting the original, copied DDL from an earlier migration, or two migrations claim ` +
      `the same logical change while doing different things. Resolve before merging.`,
    );
    process.exit(1);
  }
  if (allowlistedCount > 0) {
    console.log(`[check-duplicate-migrations] OK — 0 non-allowlisted duplicates (${allowlistedCount} grandfathered pair(s) noted above).`);
    return;
  }
  // unreachable in the no-duplicates path (early-return above), but kept
  // for completeness if a future rule adds a non-failing category.
  console.log(`[check-duplicate-migrations] PASS — 0/0`);
}

main().catch((err) => {
  console.error(err);
  process.exit(2);
});
