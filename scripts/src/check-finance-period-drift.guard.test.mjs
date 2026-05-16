#!/usr/bin/env node
// Self-tests for check-finance-period-drift.mjs — guards the guard.
// Runs the CLI against synthetic fixtures and asserts each anti-pattern
// is caught (and that `utc-ok:`/allowlist opt-outs silence a hit, and
// that stale allowlist entries fail).

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const SCRIPT = path.join(__dirname, "check-finance-period-drift.mjs");

function runOnce(repoFiles, allowlist = "") {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "fin-period-drift-test-"));
  for (const [rel, body] of Object.entries(repoFiles)) {
    const abs = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, body);
  }
  const scriptDir = path.join(tmp, "scripts", "src");
  fs.mkdirSync(scriptDir, { recursive: true });
  fs.copyFileSync(SCRIPT, path.join(scriptDir, "check-finance-period-drift.mjs"));
  fs.writeFileSync(
    path.join(tmp, "scripts", "finance-period-drift-allowlist.txt"),
    allowlist,
  );
  const r = spawnSync(
    process.execPath,
    [path.join(scriptDir, "check-finance-period-drift.mjs")],
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

// 1. Inline `new Date().getMonth()` is flagged.
{
  const r = runOnce({
    "artifacts/api-server/src/routes/x.ts":
      `const m = new Date().getMonth();\n`,
  });
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.stderr}`);
  assert(r.stderr.includes("[inline-getMonth]"), `missing inline-getMonth:\n${r.stderr}`);
}

// 2. Inline `new Date().getFullYear()` is flagged.
{
  const r = runOnce({
    "artifacts/ghayth-erp/src/pages/x.tsx":
      `const y = new Date().getFullYear();\n`,
  });
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.stderr}`);
  assert(r.stderr.includes("[inline-getFullYear]"), `missing inline-getFullYear:\n${r.stderr}`);
}

// 3. Variable-bound `const now = new Date(); now.getMonth()` is flagged.
{
  const r = runOnce({
    "artifacts/api-server/src/lib/x.ts":
      `const now = new Date();\nconst m = now.getMonth();\nconst y = now.getFullYear();\n`,
  });
  assert(r.code === 1, `expected exit 1, got ${r.code}\n${r.stderr}`);
  assert(r.stderr.includes("[bound-getMonth]"), `missing bound-getMonth:\n${r.stderr}`);
  assert(r.stderr.includes("[bound-getFullYear]"), `missing bound-getFullYear:\n${r.stderr}`);
}

// 4. `new Date(someISO).getMonth()` (non-zero-arg) is NOT flagged —
//    intentionally about a stored historical date.
{
  const r = runOnce({
    "artifacts/api-server/src/routes/x.ts":
      `const m = new Date(hireDate).getMonth();\nconst y = hireDate.getFullYear();\n`,
  });
  assert(r.code === 0, `non-zero-arg new Date should not flag, got ${r.code}\n${r.stderr}`);
}

// 5. `// utc-ok:` opt-out silences a hit.
{
  const r = runOnce({
    "artifacts/api-server/src/lib/x.ts":
      `const y = new Date().getFullYear(); // utc-ok: footer copyright\n`,
  });
  assert(r.code === 0, `utc-ok comment should silence, got ${r.code}\n${r.stderr}`);
}

// 6. Allowlist entry silences a hit.
{
  const r = runOnce(
    {
      "artifacts/api-server/src/lib/x.ts":
        `const y = new Date().getFullYear();\n`,
    },
    "artifacts/api-server/src/lib/x.ts:1\n",
  );
  assert(r.code === 0, `allowlist should silence, got ${r.code}\n${r.stderr}`);
}

// 7. Stale allowlist entries fail the guard.
{
  const r = runOnce(
    {
      "artifacts/api-server/src/lib/x.ts": `const y = 1;\n`,
    },
    "artifacts/api-server/src/lib/x.ts:1\n",
  );
  assert(r.code === 1, `stale entry should fail, got ${r.code}\n${r.stderr}`);
  assert(
    r.stderr.includes("stale allowlist entry"),
    `missing stale-entry message:\n${r.stderr}`,
  );
}

// 8. Tests/migrations are skipped.
{
  const r = runOnce({
    "artifacts/api-server/src/lib/foo.test.ts":
      `const m = new Date().getMonth();\n`,
    "artifacts/api-server/src/migrations/001-init.ts":
      `const y = new Date().getFullYear();\n`,
  });
  assert(r.code === 0, `test/migration files should be skipped, got ${r.code}\n${r.stderr}`);
}

// 9. The variable-bound declaration line itself is NOT flagged (only
//    subsequent uses are).
{
  const r = runOnce({
    "artifacts/api-server/src/lib/x.ts":
      `const now = new Date();\nconsole.log("nothing");\n`,
  });
  assert(r.code === 0, `bare declaration should not flag, got ${r.code}\n${r.stderr}`);
}

// 10. Different variable name (e.g. `d`) is also caught.
{
  const r = runOnce({
    "artifacts/ghayth-erp/src/pages/x.tsx":
      `const d = new Date();\nreturn d.getMonth() + 1;\n`,
  });
  assert(r.code === 1, `bound name 'd' should flag, got ${r.code}\n${r.stderr}`);
  assert(r.stderr.includes("[bound-getMonth]"), `missing bound-getMonth:\n${r.stderr}`);
}

// 11. JSX `{/* utc-ok: ... */}` style block comment also silences.
{
  const r = runOnce({
    "artifacts/ghayth-erp/src/pages/x.tsx":
      `<span>{new Date().getFullYear()}</span> {/* utc-ok: footer year */}\n`,
  });
  assert(r.code === 0, `JSX utc-ok comment should silence, got ${r.code}\n${r.stderr}`);
}

console.log("check-finance-period-drift: all self-tests passed.");
