#!/usr/bin/env node
//
// scripts/src/check-workflow-pnpm-filters.test.mjs
//
// Failing-fixture test for `check-workflow-pnpm-filters.mjs`. Builds a
// synthetic .github/workflows/ + workspace tree on disk and runs the
// real guard against each shape via `node`, asserting exit codes and
// error messages.
//
// Covers both regression modes from Task #404:
//   1. wrong package name  (`@ghayth-erp/api-spec` vs `@workspace/api-spec`)
//   2. wrong script name   (`preview` vs `serve`)
//
// Plus a clean fixture (exit 0) and the lifecycle-without-run shape
// (`pnpm --filter @workspace/api-server start`).
//
// Run:  node scripts/src/check-workflow-pnpm-filters.test.mjs
//

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "..", "..");
const SCRIPT = join(REPO_ROOT, "scripts", "src", "check-workflow-pnpm-filters.mjs");

let failed = 0;
function assert(cond, label) {
  if (cond) {
    console.log(`  ✓ ${label}`);
  } else {
    console.error(`  ✗ ${label}`);
    failed++;
  }
}

function makeFixture({ workflows, packages, strayPackages = [], allowlist }) {
  const root = mkdtempSync(join(tmpdir(), "wf-filter-fixture-"));
  const wfDir = join(root, "workflows");
  const pkgRoot = join(root, "pkgs");
  mkdirSync(wfDir, { recursive: true });
  mkdirSync(pkgRoot, { recursive: true });
  for (const [name, body] of Object.entries(workflows)) {
    writeFileSync(join(wfDir, name), body, "utf8");
  }
  // Build a real pnpm-workspace.yaml with one glob per top-level
  // package dir (`pkgs/*` mirrors `artifacts/*` in the real repo).
  writeFileSync(
    join(pkgRoot, "pnpm-workspace.yaml"),
    "packages:\n  - 'workspace/*'\n",
    "utf8",
  );
  const wsDir = join(pkgRoot, "workspace");
  mkdirSync(wsDir, { recursive: true });
  for (const pkg of packages) {
    const dir = join(wsDir, pkg.dir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: pkg.name, scripts: pkg.scripts || {} }, null, 2),
      "utf8",
    );
  }
  // `strayPackages` simulate package.json files that exist on disk
  // but are NOT matched by any pnpm-workspace.yaml glob. The guard
  // must NOT treat these as valid filter targets.
  const strayDir = join(pkgRoot, "outside-of-workspace");
  if (strayPackages.length > 0) mkdirSync(strayDir, { recursive: true });
  for (const pkg of strayPackages) {
    const dir = join(strayDir, pkg.dir);
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify({ name: pkg.name, scripts: pkg.scripts || {} }, null, 2),
      "utf8",
    );
  }
  let allowPath;
  if (allowlist !== undefined) {
    allowPath = join(root, "allowlist.txt");
    writeFileSync(allowPath, allowlist, "utf8");
  }
  return { root, wfDir, pkgRoot, allowPath };
}

function runGuard({ wfDir, pkgRoot, allowPath }) {
  const env = {
    ...process.env,
    WF_FILTER_WORKFLOWS_DIR: wfDir,
    WF_FILTER_PACKAGES_ROOT: pkgRoot,
  };
  if (allowPath) env.WF_FILTER_ALLOWLIST = allowPath;
  // Force the guard NOT to inherit the repo's real allowlist.
  if (!allowPath) env.WF_FILTER_ALLOWLIST = join(pkgRoot, "no-such-allowlist.txt");
  const res = spawnSync(
    process.execPath,
    [SCRIPT],
    { env, encoding: "utf8" },
  );
  return { code: res.status, stdout: res.stdout, stderr: res.stderr };
}

const PACKAGES = [
  {
    dir: "api-spec",
    name: "@workspace/api-spec",
    scripts: { codegen: "orval" },
  },
  {
    dir: "ghayth-erp",
    name: "@workspace/ghayth-erp",
    scripts: { build: "vite build", serve: "vite preview", typecheck: "tsc" },
  },
  {
    dir: "api-server",
    name: "@workspace/api-server",
    scripts: { start: "node dist/index.js", build: "tsc" },
  },
];

console.log("check-workflow-pnpm-filters fixture: clean → exit 0");
{
  const fx = makeFixture({
    workflows: {
      "ok.yml": `
jobs:
  build:
    steps:
      - run: pnpm --filter @workspace/ghayth-erp run build
      - run: pnpm --filter @workspace/api-server start > /tmp/x.log 2>&1 &
      - run: pnpm -s --filter @workspace/api-spec run codegen
`,
    },
    packages: PACKAGES,
  });
  try {
    const { code, stdout, stderr } = runGuard(fx);
    assert(code === 0, `clean fixture exits 0 (got ${code})`);
    assert(/all reference real pnpm workspace packages/.test(stdout), "clean fixture prints success line");
    if (code !== 0) { console.error(stdout); console.error(stderr); }
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
}

console.log("check-workflow-pnpm-filters fixture: wrong package name → exit 1");
{
  const fx = makeFixture({
    workflows: {
      "bad-pkg.yml": `
jobs:
  x:
    steps:
      - run: pnpm --filter @ghayth-erp/api-spec run codegen
`,
    },
    packages: PACKAGES,
  });
  try {
    const { code, stderr } = runGuard(fx);
    assert(code === 1, `wrong-package fixture exits 1 (got ${code})`);
    assert(
      /package "@ghayth-erp\/api-spec" is not a pnpm workspace package/.test(stderr),
      "error names the bad package",
    );
    assert(/@workspace\/api-spec/.test(stderr), "error suggests the real package");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
}

console.log("check-workflow-pnpm-filters fixture: wrong script name → exit 1");
{
  const fx = makeFixture({
    workflows: {
      "bad-script.yml": `
jobs:
  x:
    steps:
      - run: pnpm --filter @workspace/ghayth-erp run preview
`,
    },
    packages: PACKAGES,
  });
  try {
    const { code, stderr } = runGuard(fx);
    assert(code === 1, `wrong-script fixture exits 1 (got ${code})`);
    assert(
      /script "preview" is not defined in package "@workspace\/ghayth-erp"/.test(stderr),
      "error names the bad script",
    );
    assert(/serve/.test(stderr), "error suggests a near-miss script");
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
}

console.log("check-workflow-pnpm-filters fixture: lifecycle script missing → exit 1");
{
  const fx = makeFixture({
    workflows: {
      "lifecycle.yml": `
jobs:
  x:
    steps:
      - run: pnpm --filter @workspace/api-spec start
`,
    },
    packages: PACKAGES,
  });
  try {
    const { code, stderr } = runGuard(fx);
    assert(code === 1, `missing-lifecycle fixture exits 1 (got ${code})`);
    assert(
      /lifecycle script "start" is not defined/.test(stderr),
      "error explains lifecycle no-op",
    );
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
}

console.log("check-workflow-pnpm-filters fixture: stray non-workspace package.json → exit 1");
{
  // A package.json exists on disk under outside-of-workspace/, but no
  // pnpm-workspace.yaml glob matches it. The guard MUST reject the
  // filter call instead of silently treating the stray package as
  // valid (this is exactly the kind of false-negative the reviewer
  // flagged on the first iteration of this guard).
  const fx = makeFixture({
    workflows: {
      "stray.yml": `
jobs:
  x:
    steps:
      - run: pnpm --filter @stray/not-in-workspace run codegen
`,
    },
    packages: PACKAGES,
    strayPackages: [
      { dir: "stray", name: "@stray/not-in-workspace", scripts: { codegen: "noop" } },
    ],
  });
  try {
    const { code, stderr } = runGuard(fx);
    assert(code === 1, `stray-package fixture exits 1 (got ${code})`);
    assert(
      /package "@stray\/not-in-workspace" is not a pnpm workspace package/.test(stderr),
      "error names the stray package as non-workspace",
    );
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
}

console.log("check-workflow-pnpm-filters fixture: allowlisted bad package → exit 0");
{
  const fx = makeFixture({
    workflows: {
      "broken.yml": `
jobs:
  x:
    steps:
      - run: pnpm --filter @workspace/missing run something
`,
    },
    packages: PACKAGES,
    allowlist: "broken.yml:@workspace/missing\n",
  });
  try {
    const { code, stdout, stderr } = runGuard(fx);
    assert(code === 0, `allowlisted-bad-pkg fixture exits 0 (got ${code})`);
    assert(/1 allowlisted entry/.test(stdout), "success line counts the allowlist hit");
    if (code !== 0) { console.error(stdout); console.error(stderr); }
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
}

console.log("check-workflow-pnpm-filters fixture: stale allowlist entry → exit 1");
{
  const fx = makeFixture({
    workflows: {
      "ok.yml": `
jobs:
  x:
    steps:
      - run: pnpm --filter @workspace/ghayth-erp run build
`,
    },
    packages: PACKAGES,
    allowlist: "ok.yml:@workspace/no-longer-referenced\n",
  });
  try {
    const { code, stderr } = runGuard(fx);
    assert(code === 1, `stale-allowlist fixture exits 1 (got ${code})`);
    assert(
      /stale allowlist entry/.test(stderr),
      "error explains the stale allowlist entry",
    );
  } finally {
    rmSync(fx.root, { recursive: true, force: true });
  }
}

if (failed > 0) {
  console.error(`\n${failed} assertion(s) failed`);
  process.exit(1);
}
console.log("\nall check-workflow-pnpm-filters fixtures passed");
process.exit(0);
