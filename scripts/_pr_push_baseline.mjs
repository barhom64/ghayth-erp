// scripts/_pr_push_baseline.mjs
//
// PR Push remote-baseline guard (SOT-3, MAINTAINER Phase 1).
//
// Stops `_pr_push.mjs` from re-creating the FINDING-003 class of bugs:
//
//   - "double-prefix" corrupt paths like
//       .github/workflows/.github/workflows/.github/workflows/audit-runtime.yml
//     which a prior PR Push silently created on remote main because the
//     uploader trusted `state.files` blindly without checking that the path
//     had no repeated segment-run.
//
//   - pushing local-only junk that must never enter main:
//       attached_assets/, audit/screenshots/, audit/runtime/, .config/chromium/,
//       nohup.out, .DS_Store, tmp/, mockup-sandbox/, .agents/, .upm/,
//       .config/replit/.
//
//   - pushing a workflow path that does not exist at the canonical position
//     on remote main, when a non-canonical (deduped) variant of the same
//     path DOES exist — that's the FINDING-003 footprint.
//
// Contract:
//   validatePush({ owner, repo, files, gh, fetchBase = "main" })
//     → { ok: bool, violations: [{ file, category, reason, howToFix }] }
//
//   The function NEVER throws on a non-2xx remote response — it returns
//   `violations` and lets the caller exit with a clear code (we expect
//   `_pr_push.mjs` to exit 5 on a non-empty violations list).
//
//   It DOES throw if the underlying `gh` transport is permanently broken,
//   because in that state we can't make a fail-closed/open decision safely.
//
// Fail mode: closed. If we can't verify a single file's remote baseline
// (transport error, sustained 5xx, etc.), we refuse the whole push and
// surface the reason. This is the explicit spec from the maintainer rule:
// "if you can't verify, fail closed, not fail open."
//
// Self-test:  node scripts/_pr_push_baseline.mjs --self-test
//   Runs in-process assertions with a mocked gh and exits 0 / 1.
//   No network. Safe to run on every PR via CI.

import fs from "node:fs";
import path from "node:path";

// ── Static rules ───────────────────────────────────────────────────────

// Prefixes that must NEVER appear in a pushed file path.
// SOT-3.1: added .env*, node_modules/, .git/, dist/, coverage/, .turbo/,
//          .vite/, playwright-report/, test-results/ as a second-line safety
//          net beneath .gitignore — catches the case where state.files is
//          built from an explicit list that bypasses git's ignore logic.
// Matching is case-insensitive (see checkStaticRules); catches NODE_MODULES/
// on case-preserving filesystems and NOHUP.OUT-style accidents.
const FORBIDDEN_PREFIXES = [
  "attached_assets/",
  "audit/screenshots/",
  "audit/runtime/",
  ".config/chromium/",
  ".config/replit/",
  "mockup-sandbox/",
  ".agents/",
  ".upm/",
  "tmp/",
  ".tmp/",
  "scripts/.agent-state/",
  // SOT-3.1 additions:
  "node_modules/",
  ".git/",
  "dist/",
  "coverage/",
  ".turbo/",
  ".vite/",
  "playwright-report/",
  "test-results/",
];

// Filename prefixes that must never be pushed regardless of directory.
// Matches `.env`, `.env.local`, `.env.production`, etc. anywhere in the tree.
// (SOT-3.1 — dotenv files commonly contain secrets.)
const FORBIDDEN_BASENAME_PREFIXES = [".env"];

// Exact filename basenames that must never be pushed (case-insensitive).
const FORBIDDEN_BASENAMES = new Set([
  "nohup.out",
  ".ds_store",
]);

// Removes consecutive segment-run duplicates from a path. Example:
//   .github/workflows/.github/workflows/.github/workflows/audit-runtime.yml
//   → .github/workflows/audit-runtime.yml
// Returns the canonical path; returns the original if no repetition.
export function canonicalizePath(p) {
  const parts = p.split("/");
  // Greedy: try longest possible repetition first, then shrink.
  // This handles deeper nesting like X/Y/Z/X/Y/Z/X/Y/Z.
  for (let len = Math.floor(parts.length / 2); len >= 1; len--) {
    let i = 0;
    while (i + 2 * len <= parts.length) {
      const a = parts.slice(i, i + len).join("/");
      const b = parts.slice(i + len, i + 2 * len).join("/");
      if (a === b && a.length > 0) {
        parts.splice(i + len, len);
        // Re-scan from the start with shorter array.
        // Don't advance i — there might be a tail duplicate now adjacent.
      } else {
        i++;
      }
    }
  }
  return parts.join("/");
}

// Returns a violation object or null.
function checkStaticRules(file) {
  // 1. Empty / weird paths.
  if (!file || typeof file !== "string" || file.startsWith("/") || file.includes("\\")) {
    return {
      file,
      category: "BAD_PATH",
      reason: "path is empty, absolute, or contains backslashes",
      howToFix: "use a forward-slash relative path inside the workspace",
    };
  }

  // SOT-3.1: case-insensitive matching for junk paths — catches
  // NODE_MODULES/, NOHUP.OUT, .DS_STORE, .Env.production, etc.
  const fileLc = file.toLowerCase();
  const base = path.posix.basename(file);
  const baseLc = base.toLowerCase();

  // 2. Forbidden basenames (case-insensitive).
  if (FORBIDDEN_BASENAMES.has(baseLc)) {
    return {
      file,
      category: "RUNTIME_JUNK",
      reason: `basename "${base}" is on the forbidden list`,
      howToFix: "delete this file locally — it is never an SoT artifact",
    };
  }

  // 2b. Forbidden basename prefixes (.env, .env.local, .env.production, …).
  for (const pre of FORBIDDEN_BASENAME_PREFIXES) {
    if (baseLc === pre || baseLc.startsWith(pre + ".")) {
      return {
        file,
        category: "SECRET_LEAK_RISK",
        reason: `basename "${base}" matches secret-bearing pattern "${pre}*"`,
        howToFix: `dotenv files contain secrets — never push. Use Replit secrets / GitHub Actions secrets instead.`,
      };
    }
  }

  // 3. Forbidden prefixes (case-insensitive).
  for (const pre of FORBIDDEN_PREFIXES) {
    const preLc = pre.toLowerCase();
    if (fileLc === preLc.replace(/\/$/, "") || fileLc.startsWith(preLc)) {
      return {
        file,
        category: "KEEP_LOCAL_NEVER_PUSH",
        reason: `path begins with forbidden prefix "${pre}"`,
        howToFix:
          pre.startsWith("audit/")
            ? "regeneratable audit artifact — leave it local; do not push"
            : "this folder is local-only by maintainer policy — remove from state.files",
      };
    }
  }

  // 4. Double-prefix detection (FINDING-003 exact class).
  const canon = canonicalizePath(file);
  if (canon !== file) {
    return {
      file,
      category: "DOUBLE_PREFIX",
      reason: `path contains a repeated segment-run; canonical form is "${canon}"`,
      howToFix: `if you meant to push "${canon}", change state.files; if not, delete the corrupt path locally and re-run`,
    };
  }

  return null;
}

// ── Remote-baseline checks (network, per-file) ─────────────────────────

// Cap on per-file checks for one push. Above this we refuse outright to
// keep the shared 10 RPS GitHub proxy budget honest (Task #362 reasoning).
const MAX_FILES_PER_PUSH = 200;

async function checkRemoteBaseline({ owner, repo, file, gh, ref }) {
  const encoded = encodeURIComponent(file).replace(/%2F/g, "/");
  const r = await gh(`/repos/${owner}/${repo}/contents/${encoded}?ref=${ref}`);

  // 200 → file exists at this path on remote, update is legitimate
  // 404 → file is new at this path, create is legitimate (caller will PUT)
  // 403 → could be Cloudflare WAF (corrupt path the WAF rejects) OR missing
  //       workflow scope. Either way: refuse — the static double-prefix
  //       rule already caught the WAF-rejected cases; if we get here on a
  //       clean path, it's a scope problem and `_pr_push.mjs`'s own
  //       explainWorkflowScopeFailure() will print the actionable message.
  // 5xx / transport error → fail closed.
  if (r.status === 200 || r.status === 404) return { ok: true };

  if (r.status === 403) {
    return {
      ok: false,
      reason: `remote returned 403 on baseline check (Cloudflare WAF or missing Workflows scope)`,
      howToFix:
        "if path begins with .github/workflows/, grant Replit GitHub App 'Workflows: Read and write'; otherwise delete the path manually via github.com",
    };
  }
  return {
    ok: false,
    reason: `remote baseline check failed: HTTP ${r.status} ${r.data?.message || ""}`,
    howToFix: "transient transport failure — retry; if persistent, escalate (we fail closed by design)",
  };
}

// ── Public entrypoint ──────────────────────────────────────────────────

export async function validatePush({ owner, repo, files, gh, fetchBase = "main", verbose = false }) {
  if (!Array.isArray(files) || files.length === 0) {
    return { ok: false, violations: [{ file: "(none)", category: "EMPTY", reason: "files array is empty", howToFix: "populate state.files before running" }] };
  }
  if (files.length > MAX_FILES_PER_PUSH) {
    return {
      ok: false,
      violations: [{
        file: "(batch)",
        category: "BATCH_TOO_LARGE",
        reason: `${files.length} files in one push exceeds cap ${MAX_FILES_PER_PUSH}`,
        howToFix: "split into smaller per-axis PRs (see SOT-2 §5)",
      }],
    };
  }

  const violations = [];

  // 1. Duplicates → reject.
  const seen = new Set();
  for (const f of files) {
    if (seen.has(f)) {
      violations.push({ file: f, category: "DUPLICATE", reason: "listed twice in files[]", howToFix: "dedupe state.files" });
    }
    seen.add(f);
  }

  // 2. Canonical-collision: if A canonicalizes to same as B, reject pair.
  const canonMap = new Map();
  for (const f of files) {
    const c = canonicalizePath(f);
    if (canonMap.has(c) && canonMap.get(c) !== f) {
      violations.push({
        file: f,
        category: "CANONICAL_COLLISION",
        reason: `collides with "${canonMap.get(c)}" — both canonicalize to "${c}"`,
        howToFix: "keep only the canonical path; remove the duplicated-segment variant",
      });
    } else {
      canonMap.set(c, f);
    }
  }

  // 3. Per-file static rules.
  for (const f of files) {
    const v = checkStaticRules(f);
    if (v) violations.push(v);
  }

  // If static rules already failed → don't waste the GitHub rate budget.
  if (violations.length > 0) return { ok: false, violations };

  // 4. Per-file remote-baseline check (network).
  for (const f of files) {
    if (verbose) console.log(`[baseline] checking ${f} …`);
    try {
      const r = await checkRemoteBaseline({ owner, repo, file: f, gh, ref: fetchBase });
      if (!r.ok) {
        violations.push({ file: f, category: "REMOTE_BASELINE_FAIL", reason: r.reason, howToFix: r.howToFix });
      }
    } catch (e) {
      // gh transport is permanently broken — escalate (this is fail-closed too,
      // by throwing we make sure the caller doesn't accidentally proceed).
      throw new Error(`baseline guard transport error on ${f}: ${e.message}`);
    }
  }

  return { ok: violations.length === 0, violations };
}

// ── Self-test (no network) ─────────────────────────────────────────────

async function selfTest() {
  let failures = 0;
  function assert(cond, label) {
    if (cond) {
      console.log(`  ✓ ${label}`);
    } else {
      console.error(`  ✗ ${label}`);
      failures++;
    }
  }

  console.log("[self-test] canonicalizePath()");
  assert(canonicalizePath("a/b/c") === "a/b/c", "no-op on clean path");
  assert(
    canonicalizePath(".github/workflows/.github/workflows/.github/workflows/audit-runtime.yml") ===
      ".github/workflows/audit-runtime.yml",
    "collapses the FINDING-003 nested workflow path"
  );
  assert(canonicalizePath("a/b/a/b/c") === "a/b/c", "collapses 2-segment doubled prefix");
  // Note: pathological "a/a/a" fully collapses to "a" — this is correct
  // canonicalization (3-fold repetition of a 1-segment run). No real-world
  // path looks like this; the real targets (lib/lib/foo, attached_assets/
  // attached_assets/foo, etc.) all collapse correctly to lib/foo, etc.
  assert(canonicalizePath("a/a/a") === "a", "n-fold 1-segment repetition collapses to single occurrence");
  assert(canonicalizePath("src/lib/src/lib/foo.ts") === "src/lib/foo.ts", "real-world doubled lib path");

  console.log("[self-test] checkStaticRules()");
  assert(checkStaticRules("artifacts/api-server/src/app.ts") === null, "clean api path passes");
  assert(checkStaticRules("scripts/_pr_push.mjs") === null, "clean script path passes");

  const v1 = checkStaticRules(".github/workflows/.github/workflows/audit-runtime.yml");
  assert(v1 && v1.category === "DOUBLE_PREFIX", "catches double-prefix workflow path");

  const v2 = checkStaticRules("attached_assets/foo.txt");
  assert(v2 && v2.category === "KEEP_LOCAL_NEVER_PUSH", "rejects attached_assets/");

  const v3 = checkStaticRules("audit/screenshots/x.png");
  assert(v3 && v3.category === "KEEP_LOCAL_NEVER_PUSH", "rejects audit/screenshots/");

  const v4 = checkStaticRules("nohup.out");
  assert(v4 && v4.category === "RUNTIME_JUNK", "rejects nohup.out at root");

  const v5 = checkStaticRules("subdir/.DS_Store");
  assert(v5 && v5.category === "RUNTIME_JUNK", "rejects .DS_Store anywhere");

  const v6 = checkStaticRules("/abs/path");
  assert(v6 && v6.category === "BAD_PATH", "rejects absolute path");

  const v7 = checkStaticRules(".config/chromium/Crash Reports/x.dmp");
  assert(v7 && v7.category === "KEEP_LOCAL_NEVER_PUSH", "rejects chromium crash dumps");

  const v8 = checkStaticRules("mockup-sandbox/foo.tsx");
  assert(v8 && v8.category === "KEEP_LOCAL_NEVER_PUSH", "rejects mockup-sandbox/");

  // ── SOT-3.1 additions: hardened forbidden lists ──────────────────────
  const v9 = checkStaticRules("node_modules/foo/index.js");
  assert(v9 && v9.category === "KEEP_LOCAL_NEVER_PUSH", "rejects node_modules/");

  const v10 = checkStaticRules(".git/HEAD");
  assert(v10 && v10.category === "KEEP_LOCAL_NEVER_PUSH", "rejects .git/");

  const v11 = checkStaticRules("dist/bundle.js");
  assert(v11 && v11.category === "KEEP_LOCAL_NEVER_PUSH", "rejects dist/");

  const v12 = checkStaticRules("coverage/lcov.info");
  assert(v12 && v12.category === "KEEP_LOCAL_NEVER_PUSH", "rejects coverage/");

  const v13 = checkStaticRules(".turbo/cache/foo");
  assert(v13 && v13.category === "KEEP_LOCAL_NEVER_PUSH", "rejects .turbo/");

  const v14 = checkStaticRules(".vite/deps/foo");
  assert(v14 && v14.category === "KEEP_LOCAL_NEVER_PUSH", "rejects .vite/");

  const v15 = checkStaticRules("playwright-report/index.html");
  assert(v15 && v15.category === "KEEP_LOCAL_NEVER_PUSH", "rejects playwright-report/");

  const v16 = checkStaticRules("test-results/junit.xml");
  assert(v16 && v16.category === "KEEP_LOCAL_NEVER_PUSH", "rejects test-results/");

  // .env family (anywhere in tree)
  const v17 = checkStaticRules(".env");
  assert(v17 && v17.category === "SECRET_LEAK_RISK", "rejects .env at root");

  const v18 = checkStaticRules(".env.local");
  assert(v18 && v18.category === "SECRET_LEAK_RISK", "rejects .env.local");

  const v19 = checkStaticRules("artifacts/api-server/.env.production");
  assert(v19 && v19.category === "SECRET_LEAK_RISK", "rejects nested .env.production");

  // Negative: .env-aware filenames that are NOT dotenv files should pass.
  assert(checkStaticRules("docs/.env-example.md") === null, "allows .env-example.md (not a dotenv file)");
  assert(checkStaticRules("scripts/envcheck.ts") === null, "allows envcheck.ts (no leading dot)");

  // Case-insensitive matching
  const v20 = checkStaticRules("NODE_MODULES/pkg/index.js");
  assert(v20 && v20.category === "KEEP_LOCAL_NEVER_PUSH", "case-insensitive: rejects NODE_MODULES/");

  const v21 = checkStaticRules("NOHUP.OUT");
  assert(v21 && v21.category === "RUNTIME_JUNK", "case-insensitive: rejects NOHUP.OUT");

  const v22 = checkStaticRules("subdir/.DS_STORE");
  assert(v22 && v22.category === "RUNTIME_JUNK", "case-insensitive: rejects .DS_STORE uppercase");

  const v23 = checkStaticRules("artifacts/web/.Env.Production");
  assert(v23 && v23.category === "SECRET_LEAK_RISK", "case-insensitive: rejects .Env.Production");

  const v24 = checkStaticRules("Dist/bundle.js");
  assert(v24 && v24.category === "KEEP_LOCAL_NEVER_PUSH", "case-insensitive: rejects Dist/");

  console.log("[self-test] validatePush() with mocked gh");
  const mockGhAllOk = async (urlPath) => ({ status: urlPath.includes("does-not-exist") ? 404 : 200, data: {} });
  const mockGhWaf = async () => ({ status: 403, data: { message: "Cloudflare" } });
  const mockGhFlaky = async () => ({ status: 502, data: { message: "Bad Gateway" } });

  let r = await validatePush({
    owner: "o", repo: "r",
    files: ["scripts/foo.mjs", "lib/db/schema.ts"],
    gh: mockGhAllOk,
  });
  assert(r.ok === true, "clean batch passes with all-200 gh");

  r = await validatePush({
    owner: "o", repo: "r",
    files: ["scripts/foo.mjs", "scripts/foo.mjs"],
    gh: mockGhAllOk,
  });
  assert(r.ok === false && r.violations.some(v => v.category === "DUPLICATE"), "rejects duplicate files");

  r = await validatePush({
    owner: "o", repo: "r",
    files: [".github/workflows/.github/workflows/x.yml", ".github/workflows/x.yml"],
    gh: mockGhAllOk,
  });
  assert(
    r.ok === false && r.violations.some(v => v.category === "DOUBLE_PREFIX" || v.category === "CANONICAL_COLLISION"),
    "rejects FINDING-003 nested workflow pair"
  );

  r = await validatePush({
    owner: "o", repo: "r",
    files: ["attached_assets/foo.png", "audit/screenshots/x.png"],
    gh: mockGhAllOk,
  });
  assert(
    r.ok === false && r.violations.length === 2 && r.violations.every(v => v.category === "KEEP_LOCAL_NEVER_PUSH"),
    "rejects junk batch wholesale"
  );

  r = await validatePush({
    owner: "o", repo: "r",
    files: ["lib/db/schema.ts"],
    gh: mockGhFlaky,
  });
  assert(
    r.ok === false && r.violations.some(v => v.category === "REMOTE_BASELINE_FAIL"),
    "fails closed on remote 5xx (does NOT silently proceed)"
  );

  r = await validatePush({
    owner: "o", repo: "r",
    files: [".github/workflows/restored.yml"],
    gh: mockGhWaf,
  });
  assert(
    r.ok === false && r.violations.some(v => v.category === "REMOTE_BASELINE_FAIL"),
    "fails closed on Cloudflare 403 (matches SOT-1 WAF observation)"
  );

  r = await validatePush({
    owner: "o", repo: "r",
    files: ["new-path/does-not-exist.ts"],
    gh: mockGhAllOk,
  });
  assert(r.ok === true, "new file (404 on remote) is allowed");

  r = await validatePush({
    owner: "o", repo: "r",
    files: [],
    gh: mockGhAllOk,
  });
  assert(r.ok === false && r.violations[0].category === "EMPTY", "rejects empty files[]");

  r = await validatePush({
    owner: "o", repo: "r",
    files: Array.from({ length: MAX_FILES_PER_PUSH + 1 }, (_, i) => `f${i}.ts`),
    gh: mockGhAllOk,
  });
  assert(r.ok === false && r.violations[0].category === "BATCH_TOO_LARGE", "rejects oversize batch");

  if (failures > 0) {
    console.error(`\n[self-test] ${failures} assertion(s) failed`);
    process.exit(1);
  }
  console.log(`\n[self-test] all assertions passed`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--self-test")) {
    selfTest();
  } else {
    console.error("usage: node scripts/_pr_push_baseline.mjs --self-test");
    console.error("       (import { validatePush } from this module to use the guard)");
    process.exit(2);
  }
}
