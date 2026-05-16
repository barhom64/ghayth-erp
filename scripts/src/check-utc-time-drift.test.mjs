#!/usr/bin/env node
// Self-tests for check-utc-time-drift.mjs — guards the guard.
// Runs the CLI against synthetic fixtures and asserts each anti-pattern
// is caught (and that the `utc-ok:` opt-out silences a hit).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, "check-utc-time-drift.mjs");

function runOnce(repoFiles) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "utc-drift-test-"));
  // Mirror the on-disk layout the guard scans.
  for (const [rel, body] of Object.entries(repoFiles)) {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  // Symlink the guard into the temp tree so REPO_ROOT resolves there.
  const scriptDir = path.join(tmp, "scripts", "src");
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(scriptDir, "check-utc-time-drift.mjs"));
  const r = spawnSync(
    process.execPath,
    [path.join(scriptDir, "check-utc-time-drift.mjs")],
    { encoding: "utf8" },
  );
  fs.rmSync(tmp, { recursive: true, force: true });
  return { code: r.status, stdout: r.stdout, stderr: r.stderr };
}

function assert(cond, msg) {
  if (!cond) {
    console.error(`FAIL: ${msg}`);
    process.exit(1);
  }
}

// 1. Every banned pattern is flagged.
{
  const fixtures = {
    "artifacts/api-server/src/routes/example.ts":
      `const a = toDateISO(new Date());\n` +
      `const b = new Date().toISOString().slice(0, 10);\n` +
      `const c = new Date().toISOString().slice(0, 7);\n` +
      `const d = new Date().toISOString().split("T")[0];\n` +
      `const e = new Date(d + "T00:00:00");\n`,
  };
  const r = runOnce(fixtures);
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.stderr}`);
  for (const id of ["toDateISO-now", "iso-slice-10", "iso-slice-7", "iso-split-T", "date-T00-no-Z"]) {
    assert(r.stderr.includes(`[${id}]`), `missing rule ${id} in output:\n${r.stderr}`);
  }
}

// 2. Z-suffixed `T00:00:00Z` is allowed (UTC-unambiguous).
{
  const fixtures = {
    "artifacts/api-server/src/routes/ok.ts":
      `const x = new Date(today + "T00:00:00Z").getUTCDay();\n`,
  };
  const r = runOnce(fixtures);
  assert(r.code === 0, `Z-suffixed should pass, got ${r.code}\n${r.stderr}`);
}

// 3. `// utc-ok:` opt-out silences a hit.
{
  const fixtures = {
    "artifacts/api-server/src/lib/storage.ts":
      `const k = new Date().toISOString().slice(0, 10); // utc-ok: object-storage partition\n`,
  };
  const r = runOnce(fixtures);
  assert(r.code === 0, `utc-ok comment should silence, got ${r.code}\n${r.stderr}`);
}

// 4. Tests/migrations are skipped.
{
  const fixtures = {
    "artifacts/api-server/src/lib/foo.test.ts":
      `const a = toDateISO(new Date());\n`,
    "artifacts/api-server/src/migrations/001-init.ts":
      `const a = new Date().toISOString().slice(0, 10);\n`,
  };
  const r = runOnce(fixtures);
  assert(r.code === 0, `test/migration files should be skipped, got ${r.code}\n${r.stderr}`);
}

// 5b. ISO time slice (.slice(11, 16)) is flagged.
{
  const fixtures = {
    "artifacts/ghayth-erp/src/pages/y.tsx":
      `const t = e.checkInTime.slice(11, 16);\n`,
  };
  const r = runOnce(fixtures);
  assert(r.code === 1, `time slice should be flagged, got ${r.code}\n${r.stderr}`);
  assert(r.stderr.includes("[iso-slice-time]"), `missing iso-slice-time rule:\n${r.stderr}`);
}

// 5. Frontend slice patterns are flagged.
{
  const fixtures = {
    "artifacts/ghayth-erp/src/pages/x.tsx":
      `const t = new Date().toISOString().slice(0, 10);\n`,
  };
  const r = runOnce(fixtures);
  assert(r.code === 1, `frontend slice should be flagged, got ${r.code}\n${r.stderr}`);
}

// 6. Client portal and careers portal are walked too (Task #441).
{
  const fixtures = {
    "artifacts/client-portal/src/pages/invoices.tsx":
      `const t = new Date().toISOString().slice(0, 10);\n`,
    "artifacts/careers-portal/src/pages/apply.tsx":
      `const t = new Date().toISOString().split("T")[0];\n`,
  };
  const r = runOnce(fixtures);
  assert(r.code === 1, `portal slices should be flagged, got ${r.code}\n${r.stderr}`);
  assert(
    r.stderr.includes("artifacts/client-portal/src/pages/invoices.tsx"),
    `client-portal should be scanned:\n${r.stderr}`,
  );
  assert(
    r.stderr.includes("artifacts/careers-portal/src/pages/apply.tsx"),
    `careers-portal should be scanned:\n${r.stderr}`,
  );
}

console.log("check-utc-time-drift: all self-tests passed.");
