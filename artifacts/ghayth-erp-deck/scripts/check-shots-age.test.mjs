#!/usr/bin/env node
// Self-test for check-shots-age.mjs
//
// Runs the script against a temp directory of synthetic screenshots
// with controlled mtimes (using SHOTS_AGE_SOURCE=mtime so the test
// is independent of git history) and asserts the exit-code/output
// contract for the four cases that matter:
//   1. fresh-only      → exit 0 ("all screenshots are fresh")
//   2. stale + FAIL_ON_STALE=1   → exit 1 (lists stale files)
//   3. stale + FAIL_ON_STALE=0   → exit 0 (warns but doesn't block)
//   4. empty dir + ALLOW_EMPTY=1 → exit 0 (skips)
//   5. missing dir, no ALLOW_EMPTY, FAIL_ON_STALE=1 → exit 1

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import url from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, "check-shots-age.mjs");

function makeTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), "shots-age-"));
}

function writeShot(dir, name, ageDays) {
  const file = path.join(dir, name);
  fs.writeFileSync(file, "x");
  const t = (Date.now() - ageDays * 24 * 60 * 60 * 1000) / 1000;
  fs.utimesSync(file, t, t);
  return file;
}

function run(env) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    env: { ...process.env, SHOTS_AGE_SOURCE: "mtime", ...env },
  });
}

let failed = 0;
function check(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n${err.message}`);
  }
}

console.log("check-shots-age self-tests");

// 1. fresh only → exit 0
check("fresh-only screenshots pass", () => {
  const dir = makeTempDir();
  writeShot(dir, "a.png", 1);
  writeShot(dir, "b.jpg", 5);
  const r = run({
    SHOTS_DIR: dir,
    SHOTS_MAX_AGE_DAYS: "14",
    FAIL_ON_STALE: "1",
  });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /all screenshots are fresh/);
});

// 2. stale + FAIL_ON_STALE=1 → exit 1
check("stale screenshots fail in CI mode", () => {
  const dir = makeTempDir();
  writeShot(dir, "fresh.png", 1);
  writeShot(dir, "stale.png", 30);
  const r = run({
    SHOTS_DIR: dir,
    SHOTS_MAX_AGE_DAYS: "14",
    FAIL_ON_STALE: "1",
  });
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /1 stale screenshot/);
  assert.match(r.stderr, /stale\.png/);
  assert.doesNotMatch(r.stderr, /fresh\.png/);
});

// 3. stale + FAIL_ON_STALE=0 → exit 0 (warning only)
check("stale screenshots warn but don't block locally", () => {
  const dir = makeTempDir();
  writeShot(dir, "stale.png", 30);
  const r = run({
    SHOTS_DIR: dir,
    SHOTS_MAX_AGE_DAYS: "14",
    FAIL_ON_STALE: "0",
  });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /1 stale screenshot/);
});

// 4. empty dir + ALLOW_EMPTY=1 → exit 0
check("empty dir with ALLOW_EMPTY=1 passes", () => {
  const dir = makeTempDir();
  const r = run({
    SHOTS_DIR: dir,
    SHOTS_MAX_AGE_DAYS: "14",
    FAIL_ON_STALE: "1",
    ALLOW_EMPTY: "1",
  });
  assert.equal(r.status, 0, `expected exit 0, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stdout, /no screenshots in /);
});

// 5. missing dir + FAIL_ON_STALE=1 + no ALLOW_EMPTY → exit 1
check("missing dir without ALLOW_EMPTY fails in CI mode", () => {
  const dir = path.join(os.tmpdir(), `shots-missing-${Date.now()}`);
  const r = run({
    SHOTS_DIR: dir,
    SHOTS_MAX_AGE_DAYS: "14",
    FAIL_ON_STALE: "1",
  });
  assert.equal(r.status, 1, `expected exit 1, got ${r.status}\n${r.stdout}\n${r.stderr}`);
  assert.match(r.stderr, /screenshots dir not found/);
});

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}
console.log("all check-shots-age tests passed ✓");
