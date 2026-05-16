#!/usr/bin/env node
// scripts/src/check-workflow-silent-failures.test.mjs
//
// Failing-fixture tests for `check-workflow-silent-failures.mjs`.
// Builds a synthetic .github/workflows/ tree per fixture and runs the
// real guard against each via `node`, asserting exit codes + messages.
//
// Run:  node scripts/src/check-workflow-silent-failures.test.mjs
//

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "src", "check-workflow-silent-failures.mjs");

let failed = 0;
function assert(cond, label) {
  if (cond) console.log(`  ✓ ${label}`);
  else { console.error(`  ✗ ${label}`); failed++; }
}

function makeFixture({ workflows, allowlist }) {
  const root = mkdtempSync(join(tmpdir(), "wf-silent-fixture-"));
  const wfDir = join(root, "workflows");
  mkdirSync(wfDir, { recursive: true });
  for (const [name, body] of Object.entries(workflows)) {
    writeFileSync(join(wfDir, name), body, "utf8");
  }
  let allowPath;
  if (allowlist !== undefined) {
    allowPath = join(root, "allowlist.txt");
    writeFileSync(allowPath, allowlist, "utf8");
  }
  return { root, wfDir, allowPath };
}

function runGuard({ wfDir, allowPath }) {
  const env = {
    ...process.env,
    WF_SILENT_WORKFLOWS_DIR: wfDir,
  };
  if (allowPath) env.WF_SILENT_ALLOWLIST = allowPath;
  else env.WF_SILENT_ALLOWLIST = join(wfDir, "no-such-allowlist.txt");
  const res = spawnSync(process.execPath, [SCRIPT], { env, encoding: "utf8" });
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

console.log("check-workflow-silent-failures fixture: clean → exit 0");
{
  const fx = makeFixture({
    workflows: {
      "ok.yml": `
jobs:
  build:
    steps:
      - name: checked continue-on-error
        id: maybe
        run: pnpm run flaky
        continue-on-error: true
      - name: gate
        if: steps.maybe.outcome == 'failure'
        run: echo "flaky failed"
`,
    },
  });
  try {
    const { code, stdout, stderr } = runGuard(fx);
    assert(code === 0, `clean fixture exits 0 (got ${code})`);
    assert(/no unchecked/.test(stdout), "prints success line");
    if (code !== 0) { console.error(stdout); console.error(stderr); }
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
}

console.log("check-workflow-silent-failures fixture: bare `|| true` → exit 1");
{
  const fx = makeFixture({
    workflows: {
      "bad.yml": `
jobs:
  x:
    steps:
      - run: pnpm --filter @ghayth-erp/api-spec run generate || true
`,
    },
  });
  try {
    const { code, stderr } = runGuard(fx);
    assert(code === 1, `or-true fixture exits 1 (got ${code})`);
    assert(
      /masks non-zero exit with `\|\| true`/.test(stderr),
      "error names the || true pattern",
    );
    assert(
      /pnpm --filter @ghayth-erp\/api-spec run generate \|\| true/.test(stderr),
      "error quotes the offending line",
    );
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
}

console.log("check-workflow-silent-failures fixture: `||true` (no space) → exit 1");
{
  const fx = makeFixture({
    workflows: {
      "bad.yml": `
jobs:
  x:
    steps:
      - run: do-thing ||true
`,
    },
  });
  try {
    const { code, stderr } = runGuard(fx);
    assert(code === 1, `tight ||true fixture exits 1 (got ${code})`);
    assert(/masks non-zero exit/.test(stderr), "tight form is detected");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
}

console.log("check-workflow-silent-failures fixture: `|| true` inside YAML comment → ignored");
{
  const fx = makeFixture({
    workflows: {
      "ok.yml": `
jobs:
  x:
    steps:
      # this comment mentions || true but is not executable
      - run: echo hi
`,
    },
  });
  try {
    const { code } = runGuard(fx);
    assert(code === 0, `comment-only fixture exits 0 (got ${code})`);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
}

console.log("check-workflow-silent-failures fixture: continue-on-error w/o id → exit 1");
{
  const fx = makeFixture({
    workflows: {
      "bad.yml": `
jobs:
  x:
    steps:
      - name: dangerous
        run: pnpm run flaky
        continue-on-error: true
`,
    },
  });
  try {
    const { code, stderr } = runGuard(fx);
    assert(code === 1, `coe-no-id fixture exits 1 (got ${code})`);
    assert(/no `id:`/.test(stderr), "error explains the missing id");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
}

console.log("check-workflow-silent-failures fixture: continue-on-error w/ id but unchecked → exit 1");
{
  const fx = makeFixture({
    workflows: {
      "bad.yml": `
jobs:
  x:
    steps:
      - name: dangerous
        id: lonely
        run: pnpm run flaky
        continue-on-error: true
      - run: echo "unrelated"
`,
    },
  });
  try {
    const { code, stderr } = runGuard(fx);
    assert(code === 1, `coe-unchecked-id fixture exits 1 (got ${code})`);
    assert(
      /no later step reads `steps\.lonely\.outcome`/.test(stderr),
      "error names the unchecked step id",
    );
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
}

console.log("check-workflow-silent-failures fixture: continue-on-error checked via .conclusion → exit 0");
{
  const fx = makeFixture({
    workflows: {
      "ok.yml": `
jobs:
  x:
    steps:
      - id: maybe
        run: pnpm run flaky
        continue-on-error: true
      - if: steps.maybe.conclusion == 'failure'
        run: echo "noticed"
`,
    },
  });
  try {
    const { code } = runGuard(fx);
    assert(code === 0, `coe-conclusion-checked exits 0 (got ${code})`);
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
}

console.log("check-workflow-silent-failures fixture: allowlisted `|| true` → exit 0");
{
  const fx = makeFixture({
    workflows: {
      "logs.yml": `
jobs:
  x:
    steps:
      - if: failure()
        run: |
          tail -200 /tmp/x.log || true
`,
    },
    allowlist: "logs.yml:or-true:tail -200 /tmp/x.log || true\n",
  });
  try {
    const { code, stdout } = runGuard(fx);
    assert(code === 0, `allowlisted or-true exits 0 (got ${code})`);
    assert(/1 allowlisted entry/.test(stdout), "counts the allowlist hit");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
}

console.log("check-workflow-silent-failures fixture: allowlisted continue-on-error → exit 0");
{
  const fx = makeFixture({
    workflows: {
      "audit.yml": `
jobs:
  x:
    steps:
      - id: audit
        run: pnpm run audit:runtime
        continue-on-error: true
      - run: test -s /tmp/runtime-audit/all.json || exit 1
`,
    },
    allowlist: "audit.yml:continue-on-error:audit\n",
  });
  try {
    const { code, stdout } = runGuard(fx);
    assert(code === 0, `allowlisted coe exits 0 (got ${code})`);
    assert(/1 allowlisted entry/.test(stdout), "counts the allowlist hit");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
}

console.log("check-workflow-silent-failures fixture: stale allowlist entry → exit 1");
{
  const fx = makeFixture({
    workflows: {
      "ok.yml": `
jobs:
  x:
    steps:
      - run: echo hi
`,
    },
    allowlist: "ok.yml:or-true:rm -rf /tmp/long-gone || true\n",
  });
  try {
    const { code, stderr } = runGuard(fx);
    assert(code === 1, `stale-allowlist exits 1 (got ${code})`);
    assert(/stale allowlist entry/.test(stderr), "error explains the stale entry");
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
}

console.log("check-workflow-silent-failures fixture: trailing # comment on shell line is part of the key → exit 0");
{
  // Regression: the line `sudo true || true  # noop` has a trailing
  // shell comment that must be preserved in the trimmed allowlist
  // value, otherwise the entry never matches and the guard flags it
  // as both a violation AND a stale allowlist entry simultaneously.
  const fx = makeFixture({
    workflows: {
      "ar.yml": `
jobs:
  x:
    steps:
      - run: |
          sudo true || true  # noop; needs sudo on some runners
`,
    },
    allowlist:
      "ar.yml:or-true:sudo true || true  # noop; needs sudo on some runners\n",
  });
  try {
    const { code, stdout, stderr } = runGuard(fx);
    assert(code === 0, `trailing-comment fixture exits 0 (got ${code})`);
    if (code !== 0) { console.error(stdout); console.error(stderr); }
  } finally { rmSync(fx.root, { recursive: true, force: true }); }
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nall check-workflow-silent-failures fixtures passed");
process.exit(0);
