#!/usr/bin/env node
// scripts/_sot_c_patch_manifest.mjs — SOT-C: patch-queue manifest generator.
//
// PURPOSE
//   SOT-2 classified 1167 paths into LOCAL_ONLY_VALUABLE — files that exist
//   locally but NOT on remote main. Before any restore/cleanup (SOT-B,
//   SOT-D, future work), we need a durable inventory: which of these
//   deserve preservation as a patch, and at what priority?
//
//   This script reads /tmp/diag/sot2/LOCAL_ONLY_VALUABLE.txt (or a path
//   passed via SOT2_LOCAL_FILE env var), classifies each entry into one
//   of 13 buckets via deterministic path-pattern rules, scores each
//   bucket P0/P1/P2/P3 by preservation priority, and writes:
//
//     - audit/patches/MANIFEST.md   (human-readable, grouped, with rationale)
//     - audit/patches/MANIFEST.json (machine-readable, drives the next phase)
//
//   This is the "manifests" half of SOT-C. The actual `.patch` file
//   generation (`git format-patch`-style or remote-baseline-diff) is a
//   separate follow-up that consumes MANIFEST.json deterministically.
//
// CLASSIFICATION RULES (first match wins)
//   migration            artifacts/api-server/src/migrations/*.sql            P0
//   api-route            artifacts/api-server/src/routes/**                    P0
//   api-middleware       artifacts/api-server/src/middlewares/**               P0
//   api-lib              artifacts/api-server/src/lib/**                       P0
//   api-spec             lib/api-spec/**                                       P0
//   db-schema            lib/db/**                                             P0
//   api-zod-gen          lib/api-zod/src/generated/**                          P3 (regeneratable)
//   api-client-hand      lib/api-client-react/src/** (NOT generated/)          P1
//   frontend-main        artifacts/ghayth-erp/src/**                           P1
//   portal-client        artifacts/client-portal/**                            P1
//   portal-careers       artifacts/careers-portal/**                           P1
//   tests                **/tests/**, **/*.test.ts                             P2
//   system-auditor-tool  tools/system-auditor/**                               P2
//   scripts-generated    scripts/src/generated/**                              P3 (generated; not immediate preservation unless explicitly referenced)
//   script-tooling       scripts/** (excluding scripts/src/generated/)         P2
//   audit-system-review  audit/system-review/**                                P3 (review/diagnostic output, not runtime code)
//   docs                 docs/**, *.md at root                                 P3
//   other                anything else                                         P? (review)
//
// PRIORITY DEFINITIONS
//   P0  must-preserve. Loss = silent regression or data corruption.
//   P1  should-preserve. Loss = user-visible bug, recoverable from VCS history.
//   P2  nice-to-preserve. Tooling/tests, recoverable but inconvenient.
//   P3  do-not-preserve. Regeneratable (Orval/codegen) OR purely doc churn.
//   P?  needs human triage.
//
// USAGE
//   node scripts/_sot_c_patch_manifest.mjs              # default paths
//   node scripts/_sot_c_patch_manifest.mjs --self-test  # in-process tests
//   SOT2_LOCAL_FILE=/tmp/foo.txt OUT_DIR=audit/patches \
//     node scripts/_sot_c_patch_manifest.mjs
//
// EXIT CODES
//   0 success
//   2 input missing
//   3 self-test failure

import fs from "node:fs";
import path from "node:path";

const INPUT = process.env.SOT2_LOCAL_FILE || "/tmp/diag/sot2/LOCAL_ONLY_VALUABLE.txt";
const OUT_DIR = process.env.OUT_DIR || "audit/patches";

const RULES = [
  { id: "migration",       p: "P0", test: (f) => /^artifacts\/api-server\/src\/migrations\/.*\.sql$/.test(f) },
  { id: "api-route",       p: "P0", test: (f) => /^artifacts\/api-server\/src\/routes\//.test(f) },
  { id: "api-middleware",  p: "P0", test: (f) => /^artifacts\/api-server\/src\/middlewares\//.test(f) },
  { id: "api-lib",         p: "P0", test: (f) => /^artifacts\/api-server\/src\/lib\//.test(f) },
  { id: "api-spec",        p: "P0", test: (f) => /^lib\/api-spec\//.test(f) },
  { id: "db-schema",       p: "P0", test: (f) => /^lib\/db\//.test(f) },
  { id: "api-zod-gen",     p: "P3", test: (f) => /^lib\/api-zod\/src\/generated\//.test(f) },
  { id: "api-client-hand", p: "P1", test: (f) => /^lib\/api-client-react\/src\//.test(f) && !/\/generated\//.test(f) },
  { id: "frontend-main",   p: "P1", test: (f) => /^artifacts\/ghayth-erp\/src\//.test(f) },
  { id: "portal-client",   p: "P1", test: (f) => /^artifacts\/client-portal\//.test(f) },
  { id: "portal-careers",  p: "P1", test: (f) => /^artifacts\/careers-portal\//.test(f) },
  { id: "tests",               p: "P2", test: (f) => /(^|\/)tests?\//.test(f) || /\.test\.[cm]?[jt]sx?$/.test(f) },
  { id: "system-auditor-tool", p: "P2", test: (f) => /^tools\/system-auditor\//.test(f) },
  // scripts-generated MUST come before script-tooling so generated files
  // are NOT lumped into the tooling preservation bucket. Generated scripts
  // are not immediate preservation candidates unless explicitly referenced.
  { id: "scripts-generated",   p: "P3", test: (f) => /^scripts\/src\/generated\//.test(f) },
  { id: "script-tooling",      p: "P2", test: (f) => /^scripts\// .test(f) && !/^scripts\/src\/generated\//.test(f) },
  // audit/system-review/** is review/diagnostic output (FINDINGS, module
  // reports, diff snapshots, etc.) — NOT runtime code. Demote to P3 so the
  // ~390 entries don't drown the P? triage queue.
  { id: "audit-system-review", p: "P3", test: (f) => /^audit\/system-review\//.test(f) },
  { id: "docs",                p: "P3", test: (f) => /^docs\//.test(f) || /^[^\/]+\.md$/.test(f) },
];

export function classify(file) {
  for (const r of RULES) {
    if (r.test(file)) return { bucket: r.id, priority: r.p };
  }
  return { bucket: "other", priority: "P?" };
}

// Parse a SOT-2 bucket file. Lines have format "<marker>\t<path>" where
// marker is L (local-only), D (differs L≠R), or R (remote source of truth).
// Returns { files: [{path, marker}], skippedRemoteCanonical: N }.
// R-marked entries are EXCLUDED from preservation (remote is canonical;
// local would be overwritten on next pull anyway).
export function readInput(filePath) {
  const raw = fs.readFileSync(filePath, "utf-8");
  const files = [];
  let skippedRemoteCanonical = 0;
  let skippedMalformed = 0;
  for (const line of raw.split("\n")) {
    if (!line.trim()) continue;
    const m = line.match(/^([LDR])\t(.+)$/);
    if (!m) { skippedMalformed++; continue; }
    const marker = m[1];
    // Path may carry SOT-2 byte-size annotation: "path(L:NNNb R:MMMb)".
    // Strip that to recover the actual file path.
    const rawPath = m[2].replace(/\(L:\d+b\s+R:\d+b\)\s*$/, "").trim();
    if (!rawPath) { skippedMalformed++; continue; }
    if (marker === "R") { skippedRemoteCanonical++; continue; }
    files.push({ path: rawPath, marker });
  }
  return { files, skippedRemoteCanonical, skippedMalformed };
}

export function buildManifest(files, extras = {}) {
  // Accepts either ["path", ...] (legacy) or [{path, marker}, ...] (new).
  const norm = files.map((f) => (typeof f === "string" ? { path: f, marker: "L" } : f));
  const byBucket = new Map();
  const byPriority = new Map();
  const byMarker = { L: 0, D: 0 };
  for (const { path: p, marker } of norm) {
    const { bucket, priority } = classify(p);
    if (!byBucket.has(bucket)) byBucket.set(bucket, { priority, entries: [] });
    byBucket.get(bucket).entries.push({ path: p, marker });
    byPriority.set(priority, (byPriority.get(priority) || 0) + 1);
    byMarker[marker] = (byMarker[marker] || 0) + 1;
  }
  for (const v of byBucket.values()) v.entries.sort((a, b) => a.path.localeCompare(b.path));
  const order = ["P0", "P1", "P2", "P3", "P?"];
  const sortedBuckets = [...byBucket.entries()].sort((a, b) => {
    const pa = order.indexOf(a[1].priority);
    const pb = order.indexOf(b[1].priority);
    return pa - pb || a[0].localeCompare(b[0]);
  });
  return {
    generatedAt: new Date().toISOString(),
    inputFile: INPUT,
    totalFiles: norm.length,
    byMarker,
    skippedRemoteCanonical: extras.skippedRemoteCanonical || 0,
    skippedMalformed: extras.skippedMalformed || 0,
    byPriority: Object.fromEntries(order.map((p) => [p, byPriority.get(p) || 0])),
    byBucket: Object.fromEntries(
      sortedBuckets.map(([id, v]) => [id, {
        priority: v.priority,
        count: v.entries.length,
        markers: v.entries.reduce((acc, e) => ((acc[e.marker] = (acc[e.marker]||0)+1), acc), {}),
        files: v.entries.map((e) => `[${e.marker}] ${e.path}`),
      }])
    ),
  };
}

const PRIORITY_HELP = {
  P0: "**Must preserve.** Loss = silent regression or data corruption. Generate patch immediately.",
  P1: "**Should preserve.** Loss = user-visible bug. Generate patch; restore via PR.",
  P2: "**Nice to preserve.** Tooling/tests. Generate patch; restore at convenience.",
  P3: "**Do NOT preserve.** Regeneratable from source (Orval codegen) or doc-only churn.",
  "P?": "**Triage required.** Unknown classification — human review before patching.",
};

const BUCKET_HELP = {
  migration:       "Numbered append-only DB migration files. Loss reverts schema work.",
  "api-route":     "Express route handlers. Loss removes endpoints.",
  "api-middleware":"Express middlewares. Loss disables auth/csrf/idempotency/etc.",
  "api-lib":       "Business-logic libraries (engines, workers, integrations).",
  "api-spec":      "OpenAPI source-of-truth. Loss breaks codegen.",
  "db-schema":     "Drizzle schema definitions.",
  "frontend-main": "Main ERP frontend (artifacts/ghayth-erp).",
  "portal-client": "Client portal frontend.",
  "portal-careers":"Careers portal frontend.",
  "api-client-hand":"Hand-written React Query client (NOT Orval-generated).",
  "script-tooling":"Maintainer scripts (PR push, CI, audit, self-heal).",
  tests:           "Unit/integration/e2e test files.",
  "api-zod-gen":   "Orval-generated Zod schemas. Regeneratable via `pnpm --filter @ghayth-erp/api-spec run generate`.",
  docs:            "Markdown documentation.",
  other:           "Did not match any classification rule — needs human triage.",
};

function renderMarkdown(m) {
  const lines = [];
  lines.push("# SOT-C — Patch Queue Manifest");
  lines.push("");
  lines.push(`Generated: \`${m.generatedAt}\``);
  lines.push(`Source:    \`${m.inputFile}\``);
  lines.push(`Total:     ${m.totalFiles} files (L=${m.byMarker.L || 0} local-only, D=${m.byMarker.D || 0} differs)`);
  lines.push(`Skipped:   ${m.skippedRemoteCanonical} R-marked entries (remote is canonical — local would be overwritten on next pull)${m.skippedMalformed ? `, ${m.skippedMalformed} malformed lines` : ""}`);
  lines.push("");
  lines.push("## Purpose");
  lines.push("");
  lines.push("SOT-2 identified " + m.totalFiles + " files (L=local-only or D=differs from remote) that may need preservation. Before any restore (SOT-B), cleanup (SOT-D), or further reset operation, this manifest records which of those files deserve preservation as patches, and at what priority. R-marked entries (remote is canonical) are excluded automatically.");
  lines.push("");
  lines.push("This is the **inventory + classification** half of SOT-C. The next phase consumes `MANIFEST.json` to generate actual `.patch` files (`git format-patch`-style or remote-baseline diffs) for each P0/P1 bucket.");
  lines.push("");
  lines.push("## Priority distribution");
  lines.push("");
  lines.push("| Priority | Count | Meaning |");
  lines.push("|---|---:|---|");
  for (const [p, n] of Object.entries(m.byPriority)) {
    if (n === 0) continue;
    lines.push(`| ${p} | ${n} | ${PRIORITY_HELP[p]} |`);
  }
  lines.push("");
  lines.push("## Bucket breakdown");
  lines.push("");
  lines.push("| Bucket | Priority | Count | Description |");
  lines.push("|---|---|---:|---|");
  for (const [id, v] of Object.entries(m.byBucket)) {
    lines.push(`| \`${id}\` | ${v.priority} | ${v.count} | ${BUCKET_HELP[id] || "—"} |`);
  }
  lines.push("");
  lines.push("## Files by bucket");
  lines.push("");
  for (const [id, v] of Object.entries(m.byBucket)) {
    lines.push(`### \`${id}\` (${v.priority} · ${v.count} files)`);
    lines.push("");
    lines.push(BUCKET_HELP[id] || "—");
    lines.push("");
    if (v.files.length > 50) {
      lines.push(`<details><summary>${v.files.length} files (click to expand)</summary>`);
      lines.push("");
    }
    lines.push("```text");
    for (const f of v.files) lines.push(f);
    lines.push("```");
    if (v.files.length > 50) {
      lines.push("");
      lines.push("</details>");
    }
    lines.push("");
  }
  lines.push("## Next phase");
  lines.push("");
  lines.push("1. **P0 patches** (highest priority): generate `.patch` files into `audit/patches/p0/` — one per bucket.");
  lines.push("2. **P1 patches**: generate into `audit/patches/p1/`.");
  lines.push("3. **P2 patches**: optional, batch into `audit/patches/p2/`.");
  lines.push("4. **P3 buckets**: skip — regeneratable.");
  lines.push("5. **P? bucket (`other`)**: hand-triage each entry before next phase.");
  lines.push("");
  lines.push("Patch generation consumes `MANIFEST.json` deterministically and must NOT touch any file outside `audit/patches/`. Driven by a separate script (not this one — this one is inventory-only).");
  lines.push("");
  lines.push("---");
  lines.push("");
  lines.push("Regenerate: `node scripts/_sot_c_patch_manifest.mjs`");
  return lines.join("\n") + "\n";
}

// ── Self-test ─────────────────────────────────────────────────────────
function selfTest() {
  let failures = 0;
  function assert(cond, label) {
    if (cond) console.log(`  ✓ ${label}`);
    else { console.error(`  ✗ ${label}`); failures++; }
  }
  console.log("[self-test] classify()");
  assert(classify("artifacts/api-server/src/migrations/178_foo.sql").bucket === "migration", "migrations → migration");
  assert(classify("artifacts/api-server/src/migrations/178_foo.sql").priority === "P0", "migrations → P0");
  assert(classify("artifacts/api-server/src/routes/hr.ts").bucket === "api-route", "routes → api-route P0");
  assert(classify("artifacts/api-server/src/middlewares/auth.ts").bucket === "api-middleware", "middlewares → api-middleware P0");
  assert(classify("artifacts/api-server/src/lib/zatca/worker.ts").bucket === "api-lib", "lib → api-lib P0");
  assert(classify("lib/api-spec/openapi.yaml").bucket === "api-spec", "api-spec → P0");
  assert(classify("lib/db/schema.ts").bucket === "db-schema", "db-schema → P0");
  assert(classify("lib/api-zod/src/generated/types/foo.ts").bucket === "api-zod-gen", "generated zod → api-zod-gen P3");
  assert(classify("lib/api-zod/src/generated/types/foo.ts").priority === "P3", "generated zod priority P3");
  assert(classify("lib/api-client-react/src/idempotency.ts").bucket === "api-client-hand", "hand-written client P1");
  assert(classify("artifacts/ghayth-erp/src/routes/hr.tsx").bucket === "frontend-main", "ghayth-erp → frontend-main P1");
  assert(classify("artifacts/client-portal/src/page.tsx").bucket === "portal-client", "client-portal → P1");
  assert(classify("artifacts/careers-portal/src/page.tsx").bucket === "portal-careers", "careers-portal → P1");
  assert(classify("artifacts/api-server/tests/foo.test.ts").bucket === "tests", "tests/ → tests P2");
  // Rule order: api-lib precedes tests, so a test FILE living inside src/lib/
  // is classified as api-lib (P0). This is correct — co-located tests are
  // part of the lib's preservation unit, not separate.
  assert(classify("artifacts/api-server/src/lib/foo.test.ts").bucket === "api-lib", "src/lib/*.test.ts → api-lib (rule order: api-lib first)");
  assert(classify("artifacts/api-server/tests/standalone.test.ts").priority === "P2", "standalone tests/ → P2");
  assert(classify("scripts/_pr_push.mjs").bucket === "script-tooling", "scripts/ → script-tooling P2");
  assert(classify("docs/RBAC_V2.md").bucket === "docs", "docs/ → docs P3");
  assert(classify("README.md").bucket === "docs", "root *.md → docs P3");
  assert(classify("some/random/path.xyz").bucket === "other", "unknown → other P?");
  assert(classify("some/random/path.xyz").priority === "P?", "unknown priority P?");

  console.log("[self-test] buildManifest()");
  const m = buildManifest([
    { path: "artifacts/api-server/src/migrations/178_foo.sql", marker: "L" },
    { path: "artifacts/api-server/src/routes/hr.ts", marker: "D" },
    { path: "lib/api-zod/src/generated/types/foo.ts", marker: "L" },
    { path: "docs/x.md", marker: "L" },
    { path: "weird/path.xyz", marker: "D" },
  ], { skippedRemoteCanonical: 7, skippedMalformed: 0 });
  assert(m.totalFiles === 5, "totalFiles=5");
  assert(m.byPriority.P0 === 2, "P0 count=2");
  assert(m.byPriority.P3 === 2, "P3 count=2 (zod-gen + docs)");
  assert(m.byPriority["P?"] === 1, "P? count=1");
  assert(m.byMarker.L === 3 && m.byMarker.D === 2, "marker counts L=3 D=2");
  assert(m.skippedRemoteCanonical === 7, "skippedRemoteCanonical propagated");
  assert(Object.keys(m.byBucket).includes("migration"), "migration bucket present");
  assert(m.byBucket["api-route"].files[0].startsWith("[D] "), "route file tagged with [D] marker");
  // Legacy plain-string input still works (auto-marks as L).
  const m2 = buildManifest(["scripts/foo.mjs"]);
  assert(m2.byMarker.L === 1, "legacy string input → marker L");

  console.log("[self-test] readInput() with mixed L/D/R markers");
  const tmpfile = "/tmp/_sot_c_test_input.txt";
  fs.writeFileSync(tmpfile, [
    "L\tartifacts/api-server/src/routes/foo.ts",
    "D\tartifacts/api-server/src/lib/bar.ts(L:100b R:200b)",
    "R\tlib/db/schema.ts",
    "",                                  // blank → skip
    "X\tweird-marker",                   // malformed → skip
    "L\tscripts/baz.mjs",
  ].join("\n"));
  const r = readInput(tmpfile);
  assert(r.files.length === 3, "kept 3 entries (L+D+L)");
  assert(r.skippedRemoteCanonical === 1, "skipped 1 R entry");
  assert(r.skippedMalformed === 1, "skipped 1 malformed");
  assert(r.files[1].path === "artifacts/api-server/src/lib/bar.ts", "byte annotation stripped from D path");
  assert(r.files[1].marker === "D", "D marker preserved");
  fs.unlinkSync(tmpfile);

  console.log("[self-test] new P? drain rules (audit-system-review / system-auditor-tool / scripts-generated)");
  // audit/system-review/** → P3 (was previously falling into 'other' P?)
  assert(classify("audit/system-review/findings/FINDING-003-source-of-truth-drift.md").bucket === "audit-system-review", "audit/system-review/** → audit-system-review");
  assert(classify("audit/system-review/findings/FINDING-003-source-of-truth-drift.md").priority === "P3", "audit-system-review priority P3");
  assert(classify("audit/system-review/modules/hr/SUMMARY.md").bucket === "audit-system-review", "nested audit/system-review/modules/** → audit-system-review");
  // tools/system-auditor/** → P2 (potentially useful CLI; not runtime-critical)
  assert(classify("tools/system-auditor/src/index.ts").bucket === "system-auditor-tool", "tools/system-auditor/** → system-auditor-tool");
  assert(classify("tools/system-auditor/src/index.ts").priority === "P2", "system-auditor-tool priority P2");
  assert(classify("tools/system-auditor/checkers/db.ts").bucket === "system-auditor-tool", "nested tools/system-auditor/** → system-auditor-tool");
  // scripts/src/generated/** → P3 (NOT immediate preservation; was previously
  // mis-classified as script-tooling P2 — comment said excluded, code didn't).
  assert(classify("scripts/src/generated/something.mjs").bucket === "scripts-generated", "scripts/src/generated/** → scripts-generated (NOT script-tooling)");
  assert(classify("scripts/src/generated/something.mjs").priority === "P3", "scripts-generated priority P3");
  // Sibling sanity: hand-written scripts/src/* (non-generated) stays script-tooling P2.
  assert(classify("scripts/src/runtime-audit.cjs").bucket === "script-tooling", "scripts/src/runtime-audit.cjs → script-tooling P2 (not generated)");
  assert(classify("scripts/_pr_push_baseline.mjs").bucket === "script-tooling", "scripts/_pr_push_baseline.mjs → script-tooling P2");
  // R-prefix entries are skipped at parser layer, not classifier — already covered
  // by the readInput() test above, but re-assert end-to-end here:
  const tmpR = "/tmp/_sot_c_test_r_skip.txt";
  fs.writeFileSync(tmpR, [
    "R\taudit/system-review/findings/FINDING-001.md",
    "R\tlib/db/schema.ts(L:100b R:200b)",
    "L\tscripts/keep.mjs",
  ].join("\n"));
  const rs = readInput(tmpR);
  assert(rs.files.length === 1 && rs.files[0].path === "scripts/keep.mjs", "all R entries skipped end-to-end");
  assert(rs.skippedRemoteCanonical === 2, "skippedRemoteCanonical=2 (both R lines)");
  fs.unlinkSync(tmpR);

  if (failures > 0) {
    console.error(`\n[self-test] ${failures} assertion(s) failed`);
    process.exit(3);
  }
  console.log("\n[self-test] all assertions passed");
}

// ── Main ──────────────────────────────────────────────────────────────
const args = new Set(process.argv.slice(2));
if (args.has("--self-test")) {
  selfTest();
} else {
  if (!fs.existsSync(INPUT)) {
    console.error(`[sot-c] input not found: ${INPUT}`);
    console.error(`[sot-c] set SOT2_LOCAL_FILE env var to override`);
    process.exit(2);
  }
  const { files, skippedRemoteCanonical, skippedMalformed } = readInput(INPUT);
  const m = buildManifest(files, { skippedRemoteCanonical, skippedMalformed });
  fs.mkdirSync(OUT_DIR, { recursive: true });
  const jsonPath = path.join(OUT_DIR, "MANIFEST.json");
  const mdPath = path.join(OUT_DIR, "MANIFEST.md");
  fs.writeFileSync(jsonPath, JSON.stringify(m, null, 2) + "\n");
  fs.writeFileSync(mdPath, renderMarkdown(m));
  console.log(`[sot-c] read ${files.length} files from ${INPUT} (skipped: ${skippedRemoteCanonical} R-canonical, ${skippedMalformed} malformed)`);
  console.log(`[sot-c] wrote ${jsonPath}`);
  console.log(`[sot-c] wrote ${mdPath}`);
  console.log(`[sot-c] markers:`, m.byMarker, `priority:`, m.byPriority);
}
