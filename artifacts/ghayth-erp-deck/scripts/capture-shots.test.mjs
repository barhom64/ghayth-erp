#!/usr/bin/env node
// Self-test for capture-shots.mjs (Task #421).
//
// Exercises the two integrity guards the script grew to stop the
// "all 6 deck pages quietly redirected to /login and shipped as
// identical PNGs" failure mode:
//
//   1. URL guard      — unit-tests `isRejectedUrl` plus an
//                       integration run against a stub HTTP server
//                       that 302s every protected route to /login.
//                       Expect: exit 1, stderr names the rejected
//                       /login URL, public/screenshots untouched.
//                       (Note: rejected captures are dropped, so the
//                       hash guard does NOT also fire on this case —
//                       there are no surviving captures to compare.)
//   2. Hash guard     — unit-tests `findDuplicateHashes` (the dup
//                       detector) PLUS a second integration run
//                       against a stub that serves a byte-identical
//                       200 OK HTML page on every protected route.
//                       URL guard passes (no redirect to /login),
//                       all 6 PNGs hash identically, hash guard
//                       fires. Expect: exit 1, stderr names the
//                       duplicate files, output dir empty.
//
// Both integration runs reuse the actual capture-shots.mjs binary
// (no mocks / monkey-patching) so the test breaks if either guard
// regresses. Playwright is already a devDependency of this artifact.

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import http from "node:http";
import url from "node:url";
import { spawnSync } from "node:child_process";
import assert from "node:assert/strict";

import { isRejectedUrl, findDuplicateHashes } from "./capture-shots.mjs";
import { chromium } from "playwright";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, "capture-shots.mjs");

let failed = 0;
function check(name, fn) {
  try {
    const out = fn();
    if (out && typeof out.then === "function") {
      return out.then(
        () => console.log(`  ✓ ${name}`),
        (err) => {
          failed++;
          console.error(`  ✗ ${name}\n${err.stack || err.message}`);
        },
      );
    }
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.error(`  ✗ ${name}\n${err.stack || err.message}`);
  }
}

console.log("capture-shots self-tests");

// --- unit: isRejectedUrl ----------------------------------------------------

check("isRejectedUrl: exact /login match fires", () => {
  assert.equal(isRejectedUrl("http://x/login", ["/login"]), true);
  assert.equal(isRejectedUrl("http://x/login/", ["/login"]), true);
});

check("isRejectedUrl: nested /auth/login also fires", () => {
  assert.equal(isRejectedUrl("http://x/auth/login", ["/login"]), true);
});

check("isRejectedUrl: /loginsuffix does NOT fire (segment-bounded)", () => {
  assert.equal(isRejectedUrl("http://x/loginsuffix", ["/login"]), false);
});

check("isRejectedUrl: /dashboard does not fire for /login", () => {
  assert.equal(isRejectedUrl("http://x/dashboard", ["/login"]), false);
});

check("isRejectedUrl: malformed url returns false (no false positive)", () => {
  assert.equal(isRejectedUrl("not-a-url", ["/login"]), false);
});

// --- unit: findDuplicateHashes ---------------------------------------------

check("findDuplicateHashes: all-unique returns []", () => {
  const dupes = findDuplicateHashes([
    { file: "a.png", hash: "aaa" },
    { file: "b.png", hash: "bbb" },
    { file: "c.png", hash: "ccc" },
  ]);
  assert.deepEqual(dupes, []);
});

check("findDuplicateHashes: groups files by shared hash", () => {
  const dupes = findDuplicateHashes([
    { file: "a.png", hash: "same" },
    { file: "b.png", hash: "same" },
    { file: "c.png", hash: "other" },
    { file: "d.png", hash: "other" },
    { file: "e.png", hash: "unique" },
  ]);
  assert.equal(dupes.length, 2);
  const sameGroup = dupes.find((d) => d.hash === "same");
  const otherGroup = dupes.find((d) => d.hash === "other");
  assert.deepEqual(sameGroup.files.sort(), ["a.png", "b.png"]);
  assert.deepEqual(otherGroup.files.sort(), ["c.png", "d.png"]);
});

// --- integration: URL guard fires against a redirect-to-/login stub --------

// mode = "redirect": every protected route 302s to /login (URL guard).
// mode = "duplicate": every protected route serves byte-identical
// 200 OK HTML so all 6 PNGs hash the same (hash guard).
function startStub(mode) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const u = new URL(req.url, "http://x");
      if (req.method === "POST" && u.pathname === "/api/auth/login") {
        let body = "";
        req.on("data", (c) => (body += c));
        req.on("end", () => {
          res.setHeader("set-cookie", "erp_access=stub; HttpOnly; Path=/api");
          res.setHeader("content-type", "application/json");
          res.end(
            JSON.stringify({
              assignments: [
                { companyId: "c1", branchId: "b1", roleId: "admin" },
              ],
            }),
          );
        });
        return;
      }
      if (u.pathname === "/login") {
        res.setHeader("content-type", "text/html");
        res.end(
          "<!doctype html><html><body><h1>STUB LOGIN PAGE</h1></body></html>",
        );
        return;
      }
      if (mode === "duplicate") {
        // Byte-identical static HTML on every protected route — pages
        // do NOT redirect, so URL guard passes; all PNGs hash the
        // same, so hash guard MUST fire.
        res.setHeader("content-type", "text/html");
        res.setHeader("cache-control", "no-store");
        res.end(
          "<!doctype html><html><head><title>X</title></head>" +
            "<body style=\"margin:0;background:#fff\">" +
            "<div style=\"width:200px;height:100px;background:#000\"></div>" +
            "</body></html>",
        );
        return;
      }
      // Default: every protected route 302s to /login — exactly the
      // bug shape Task #421 was filed to catch.
      res.statusCode = 302;
      res.setHeader("location", "/login");
      res.end();
    });
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolve({ server, baseUrl: `http://127.0.0.1:${port}` });
    });
  });
}

async function runScript(baseUrl, outDir) {
  return spawnSync(process.execPath, [SCRIPT], {
    encoding: "utf8",
    timeout: 120_000,
    env: {
      ...process.env,
      DECK_BASE_URL: baseUrl,
      ADMIN_EMAIL: "stub@example.com",
      ADMIN_PASSWORD: "stub",
      SHOT_WAIT_MS: "0",
      SHOTS_DIR: outDir,
    },
  });
}

function assertOutputEmpty(outDir) {
  const left = fs
    .readdirSync(outDir)
    .filter((f) => f.toLowerCase().endsWith(".png"));
  assert.deepEqual(
    left,
    [],
    `output dir should be empty on guard failure, found: ${left.join(", ")}`,
  );
}

async function runUrlGuardIntegration() {
  const { server, baseUrl } = await startStub("redirect");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-shots-out-"));
  try {
    const r = await runScript(baseUrl, outDir);
    assert.equal(
      r.status,
      1,
      `expected exit 1 (URL guard fires), got ${r.status}\n` +
        `--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
    );
    assert.match(
      r.stderr,
      /rejected path .*\/login/,
      `stderr should name the rejected /login URL.\n${r.stderr}`,
    );
    assert.match(
      r.stderr,
      /refusing to commit a login screenshot/,
      `stderr should explain why we refused to commit.\n${r.stderr}`,
    );
    assertOutputEmpty(outDir);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

async function runHashGuardIntegration() {
  const { server, baseUrl } = await startStub("duplicate");
  const outDir = fs.mkdtempSync(path.join(os.tmpdir(), "capture-shots-out-"));
  try {
    const r = await runScript(baseUrl, outDir);
    assert.equal(
      r.status,
      1,
      `expected exit 1 (hash guard fires), got ${r.status}\n` +
        `--- stdout ---\n${r.stdout}\n--- stderr ---\n${r.stderr}`,
    );
    // URL guard must NOT have fired (no /login redirect).
    assert.doesNotMatch(
      r.stderr,
      /rejected path/,
      `URL guard should not fire when stub serves 200 OK on each route.\n${r.stderr}`,
    );
    assert.match(
      r.stderr,
      /duplicate screenshot hash/,
      `stderr should name the duplicate-hash failure.\n${r.stderr}`,
    );
    // The error message should name at least two of the configured
    // screenshot files (the dup detector lists every member of the
    // duplicate group).
    assert.match(
      r.stderr,
      /dashboard\.png/,
      `stderr should name the duplicated files.\n${r.stderr}`,
    );
    assert.match(
      r.stderr,
      /hr-employees\.png|finance-invoices\.png|fleet-vehicles\.png|warehouse-stock\.png|support-tickets\.png/,
      `stderr should name at least one other duplicated file.\n${r.stderr}`,
    );
    assertOutputEmpty(outDir);
  } finally {
    await new Promise((r) => server.close(r));
    fs.rmSync(outDir, { recursive: true, force: true });
  }
}

// Probe whether chromium can actually launch in this environment.
// CI may be missing system libs (libgbm, libnss, …); we don't want
// the unit-test signal to be drowned by an infra failure unrelated
// to the guards. Mirrors how check:prometheus-alerts skips when
// promtool isn't on PATH.
async function chromiumLaunchable() {
  try {
    const b = await chromium.launch({
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    });
    await b.close();
    return true;
  } catch (err) {
    console.log(
      `  ⚠ skipping integration test — chromium can't launch here ` +
        `(${(err.message || "").split("\n")[0]}).`,
    );
    return false;
  }
}

if (await chromiumLaunchable()) {
  await check(
    "URL guard fires end-to-end against a /login-redirect stub",
    runUrlGuardIntegration,
  );
  await check(
    "Hash guard fires end-to-end against a duplicate-content stub",
    runHashGuardIntegration,
  );
}

if (failed > 0) {
  console.error(`\n${failed} test(s) failed.`);
  process.exit(1);
}
console.log("all capture-shots tests passed ✓");
