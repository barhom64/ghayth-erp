#!/usr/bin/env node
//
// scripts/src/check-dup-filenames.mjs
//
// Duplicate-basename guard. Flags two or more source files that share the
// same file name within a single frontend artifact (e.g. two
// `policies-tab.tsx`, two `print-templates.tsx`, two `contracts-create.tsx`).
//
// Why this exists: copy-paste duplication across the frontend produced
// several pairs of same-named components that drifted apart — one gets a
// bug fix, the other rots, and imports silently resolve to the wrong copy.
// Once the existing duplicate sets are unified (Phase 4 dedup), this guard
// keeps NEW collisions from sneaking back in. Until then it runs in
// baseline mode: every basename currently duplicated is captured in
// `scripts/dup-filename-allowlist.txt`; the guard only fails when a
// basename NOT on the allowlist becomes duplicated.
//
// Detection is PER-ARTIFACT: a `settings.tsx` in ghayth-erp and a
// `settings.tsx` in client-portal are independent app-local files, not a
// duplicate. Only 2+ files with the same basename *inside the same*
// frontend `src/` count.
//
// OFFLINE: pure filename scan, no DB / build / server needed — so it runs
// unconditionally in CI (like check:dump-drift / check:button-nesting).
//
// Algorithm:
//   1. For each frontend artifact `src/`, walk every `.ts`/`.tsx` file.
//   2. Group files by basename; a basename with 2+ files is a duplicate.
//   3. Union the duplicated basenames across artifacts into the finding set.
//   4. A basename on the allowlist is an accepted pre-existing duplicate.
//      A duplicated basename NOT on the allowlist is a NEW collision → fail.
//   5. `--write-allowlist` rewrites the baseline from current findings.
//
// Usage:
//   node scripts/src/check-dup-filenames.mjs                 # gate
//   node scripts/src/check-dup-filenames.mjs --write-allowlist
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative, basename } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWLIST_PATH = join(REPO_ROOT, "scripts/dup-filename-allowlist.txt");

// Frontend artifacts scanned independently for app-local basename collisions.
const FRONTEND_SRC_DIRS = [
  "artifacts/ghayth-erp/src",
  "artifacts/client-portal/src",
  "artifacts/careers-portal/src",
];

const SRC_EXT_RE = /\.tsx?$/;

async function walkSrc(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      await walkSrc(full, out);
    } else if (e.isFile() && SRC_EXT_RE.test(e.name)) {
      out.push(full);
    }
  }
  return out;
}

// Pure helper: given a list of file paths, return a Map of
// basename -> sorted paths[] for every basename owned by 2+ files.
// Exported so the detector logic is unit-testable without touching disk.
export function groupDuplicates(paths) {
  const byBase = new Map();
  for (const p of paths) {
    const b = basename(p);
    if (!byBase.has(b)) byBase.set(b, []);
    byBase.get(b).push(p);
  }
  const dups = new Map();
  for (const [b, ps] of byBase) {
    if (ps.length >= 2) dups.set(b, [...ps].sort());
  }
  return dups;
}

async function findDuplicates() {
  // basename -> Set of repo-relative paths (across all scanned artifacts)
  const merged = new Map();
  for (const rel of FRONTEND_SRC_DIRS) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const files = await walkSrc(abs, []);
    const relPaths = files.map((f) => relative(REPO_ROOT, f).split("\\").join("/"));
    const dups = groupDuplicates(relPaths);
    for (const [b, ps] of dups) {
      if (!merged.has(b)) merged.set(b, new Set());
      for (const p of ps) merged.get(b).add(p);
    }
  }
  return merged;
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return new Set();
  const raw = readFileSync(ALLOWLIST_PATH, "utf8");
  const set = new Set();
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    set.add(t);
  }
  return set;
}

async function main() {
  const writeMode = process.argv.includes("--write-allowlist");
  const dups = await findDuplicates();
  const bases = [...dups.keys()].sort();

  if (writeMode) {
    const header = [
      "# dup-filename-allowlist.txt",
      "#",
      "# Pre-existing basenames duplicated within a single frontend artifact's",
      "# src/. These are accepted baseline duplicates; the guard only fails on",
      "# a basename NOT listed here. Regenerate with:",
      "#   node scripts/src/check-dup-filenames.mjs --write-allowlist",
      "# As duplicate sets are unified, prune the basename here.",
      "#",
      `# Baseline captured: ${bases.length} duplicated basename(s).`,
      "",
    ].join("\n");
    await writeFile(ALLOWLIST_PATH, header + bases.join("\n") + "\n", "utf8");
    console.log(`[check:dup-filenames] wrote ${bases.length} entries to ${relative(REPO_ROOT, ALLOWLIST_PATH)}`);
    return;
  }

  const allow = loadAllowlist();
  const fresh = bases.filter((b) => !allow.has(b));
  const stale = [...allow].filter((b) => !bases.includes(b)).sort();

  if (stale.length) {
    console.log(
      `[check:dup-filenames] NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale ` +
        `(duplicate unified or removed) — prune from ${relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
    );
    for (const b of stale) console.log(`    - ${b}`);
  }

  if (fresh.length) {
    console.error(
      `\n[check:dup-filenames] FAIL: ${fresh.length} NEW duplicated basename(s) within a frontend artifact:`,
    );
    for (const b of fresh) {
      console.error(`    ✗ ${b}`);
      for (const p of [...dups.get(b)].sort()) console.error(`        ${p}`);
    }
    console.error(
      "\n  Fix: rename one file, or unify the duplicates into a single shared module.\n" +
        "  If both files must coexist with the same name, add the basename to\n" +
        "  scripts/dup-filename-allowlist.txt.",
    );
    process.exit(1);
  }

  console.log(
    `[check:dup-filenames] OK — ${bases.length} baseline duplicate(s) allowlisted, 0 new.`,
  );
}

main().catch((err) => {
  console.error("[check:dup-filenames] ERROR:", err);
  process.exit(2);
});
