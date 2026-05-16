#!/usr/bin/env node
// artifacts/ghayth-erp-deck/scripts/check-shots-age.mjs
//
// Screenshot freshness gate for the GM-facing deck.
//
// Walks `artifacts/ghayth-erp-deck/public/screenshots/` recursively
// and flags any image file (.png/.jpg/.jpeg/.webp) whose age exceeds
// SHOTS_MAX_AGE_DAYS (default 14).
//
// Age source of truth: the file's last git commit timestamp
// (`git log -1 --format=%ct -- <file>`). Filesystem mtime is NOT
// reliable here — `actions/checkout` rewrites mtimes on every CI run,
// so an mtime-based gate would silently treat year-old committed
// screenshots as fresh. Untracked / not-yet-committed files fall back
// to mtime (covers the local pre-commit case). Set
// SHOTS_AGE_SOURCE=mtime to force mtime (used by the unit tests).
//
// Exit codes:
//   0 = all screenshots are fresh (or empty + ALLOW_EMPTY=1)
//   1 = stale screenshot(s) found AND FAIL_ON_STALE=1
//   2 = bad setup (missing dir without ALLOW_EMPTY, etc.)
//
// FAIL_ON_STALE defaults to 0 locally so devs aren't blocked while
// re-capturing; CI sets FAIL_ON_STALE=1 (see
// .github/workflows/check-shots-age.yml).
//
// Tunables (all env vars):
//   SHOTS_DIR             — override the screenshots directory
//   SHOTS_MAX_AGE_DAYS    — staleness threshold (default 14)
//   FAIL_ON_STALE         — 1 = exit non-zero on staleness (CI mode)
//   ALLOW_EMPTY           — 1 = treat missing/empty dir as pass
//   SHOTS_AGE_SOURCE      — "git" (default) | "mtime" (test override)

import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { execFileSync } from "node:child_process";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const DECK_ROOT = path.resolve(__dirname, "..");
const REPO_ROOT = path.resolve(DECK_ROOT, "..", "..");

const SHOTS_DIR =
  process.env.SHOTS_DIR ||
  path.join(DECK_ROOT, "public", "screenshots");
const MAX_AGE_DAYS = Number(process.env.SHOTS_MAX_AGE_DAYS || "14");
const FAIL_ON_STALE = process.env.FAIL_ON_STALE === "1";
const ALLOW_EMPTY = process.env.ALLOW_EMPTY === "1";
const AGE_SOURCE = (process.env.SHOTS_AGE_SOURCE || "git").toLowerCase();

const IMAGE_EXTS = new Set([".png", ".jpg", ".jpeg", ".webp"]);

function walk(dir) {
  const out = [];
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (err) {
    if (err.code === "ENOENT") return null;
    throw err;
  }
  for (const ent of entries) {
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      const sub = walk(full);
      if (sub) out.push(...sub);
    } else if (
      ent.isFile() &&
      IMAGE_EXTS.has(path.extname(ent.name).toLowerCase())
    ) {
      out.push(full);
    }
  }
  return out;
}

// Returns the file's last-commit unix timestamp in ms, or null if the
// file isn't tracked / git isn't available.
export function gitLastCommitMs(file, cwd = REPO_ROOT) {
  try {
    const out = execFileSync(
      "git",
      ["log", "-1", "--format=%ct", "--", file],
      { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] },
    ).trim();
    if (!out) return null;
    const sec = Number(out);
    if (!Number.isFinite(sec)) return null;
    return sec * 1000;
  } catch {
    return null;
  }
}

export function fileAgeMs(file, now = Date.now()) {
  if (AGE_SOURCE === "git") {
    const committed = gitLastCommitMs(file);
    if (committed != null) return now - committed;
    // Untracked / brand-new file: fall back to mtime so devs running
    // the check locally before committing aren't surprised.
    return now - fs.statSync(file).mtimeMs;
  }
  return now - fs.statSync(file).mtimeMs;
}

function main() {
  if (!Number.isFinite(MAX_AGE_DAYS) || MAX_AGE_DAYS <= 0) {
    console.error(
      `SHOTS_MAX_AGE_DAYS must be a positive number, got ${process.env.SHOTS_MAX_AGE_DAYS}`,
    );
    process.exit(2);
  }

  const shots = walk(SHOTS_DIR);

  if (shots === null) {
    if (ALLOW_EMPTY) {
      console.log(
        `[check-shots-age] screenshots dir missing (${SHOTS_DIR}), ALLOW_EMPTY=1, skipping.`,
      );
      process.exit(0);
    }
    console.error(`[check-shots-age] screenshots dir not found: ${SHOTS_DIR}`);
    console.error(
      `  set ALLOW_EMPTY=1 to skip when the deck has no captures yet.`,
    );
    process.exit(FAIL_ON_STALE ? 1 : 0);
  }

  if (shots.length === 0) {
    if (ALLOW_EMPTY) {
      console.log(
        `[check-shots-age] no screenshots in ${SHOTS_DIR}, ALLOW_EMPTY=1, skipping.`,
      );
      process.exit(0);
    }
    console.error(`[check-shots-age] no screenshots found in ${SHOTS_DIR}`);
    console.error(`  capture some, or set ALLOW_EMPTY=1 to skip.`);
    process.exit(FAIL_ON_STALE ? 1 : 0);
  }

  const now = Date.now();
  const cutoffMs = MAX_AGE_DAYS * 24 * 60 * 60 * 1000;

  const stale = [];
  for (const file of shots) {
    const ageMs = fileAgeMs(file, now);
    if (ageMs > cutoffMs) {
      stale.push({
        file: path.relative(DECK_ROOT, file),
        ageDays: ageMs / (24 * 60 * 60 * 1000),
      });
    }
  }

  console.log(
    `[check-shots-age] checked ${shots.length} screenshot(s) in ${SHOTS_DIR} ` +
      `(threshold: ${MAX_AGE_DAYS} day${MAX_AGE_DAYS === 1 ? "" : "s"}, ` +
      `source: ${AGE_SOURCE})`,
  );

  if (stale.length === 0) {
    console.log("[check-shots-age] all screenshots are fresh ✓");
    process.exit(0);
  }

  console.error(`[check-shots-age] ${stale.length} stale screenshot(s):`);
  for (const { file, ageDays } of stale.sort((a, b) => b.ageDays - a.ageDays)) {
    console.error(`  - ${file} (${ageDays.toFixed(1)}d old)`);
  }
  console.error(
    `\nRe-capture before sharing the deck PDF with the GM. Run:\n` +
      `  pnpm --filter @workspace/ghayth-erp-deck run export-pdf-fresh\n` +
      `(see "Screenshot Refresh" in replit.md).`,
  );

  process.exit(FAIL_ON_STALE ? 1 : 0);
}

// Allow `import` from tests without running the CLI.
const isMain =
  import.meta.url === `file://${process.argv[1]}` ||
  process.argv[1]?.endsWith("check-shots-age.mjs");
if (isMain) main();
