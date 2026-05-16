#!/usr/bin/env node
// scripts/src/check-workflow-pnpm-filters.mjs
//
// Guard: every `pnpm --filter <pkg> [run] <script>` invocation in
// `.github/workflows/*.yml` must reference a real **pnpm workspace
// package** (resolved from `pnpm-workspace.yaml` globs, not just any
// stray `package.json` lying around) AND a real script in that
// package's `package.json`.
//
// Why: Task #404 was caused by `.github/workflows/audit-runtime.yml`
// invoking `pnpm --filter @ghayth-erp/api-spec run generate` (wrong
// package name — the real one is `@workspace/api-spec`) and
// `pnpm --filter ghayth-erp run preview` (wrong script — the real
// one is `serve`). Both were hidden behind `|| true`, so the audit
// workflow silently no-op'd those steps for weeks.
//
// Same family as check:event-name-tense / check:audit-action-vocab /
// check:schema-drift — catch the typo before merge.
//
// Allowlist: known-broken workflows can be listed in
// `scripts/workflow-pnpm-filters-allowlist.txt` (one
// `<workflow-basename>:<package-name>` per line, `#` comments OK)
// to keep the guard green while a follow-up task fixes the underlying
// workflow. Stale entries are reported so the file stays honest.
//
// Exit codes: 0 = clean, 1 = violation(s) found, 2 = bad setup.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");

// Allow tests to point the guard at a fixture tree.
const WORKFLOWS_DIR =
  process.env.WF_FILTER_WORKFLOWS_DIR ||
  path.join(REPO_ROOT, ".github", "workflows");
const PACKAGES_ROOT = process.env.WF_FILTER_PACKAGES_ROOT || REPO_ROOT;
const ALLOWLIST_PATH =
  process.env.WF_FILTER_ALLOWLIST ||
  path.join(REPO_ROOT, "scripts", "workflow-pnpm-filters-allowlist.txt");

// Lifecycle script names that pnpm/npm execute without an explicit
// `run`. From the npm-scripts spec.
const LIFECYCLE_SCRIPTS = new Set([
  "start", "stop", "restart", "test",
  "prepare", "prepublish", "prepublishOnly", "prepack", "postpack",
  "publish", "postpublish",
  "install", "preinstall", "postinstall",
  "uninstall", "preuninstall", "postuninstall",
  "version", "preversion", "postversion",
  "shrinkwrap",
]);

const PNPM_BUILTINS = new Set([
  "exec", "dlx", "add", "remove", "update", "list", "ls",
  "why", "outdated", "audit", "store", "rebuild", "deploy",
  "create", "import", "patch", "unlink", "link", "fetch",
  "install", "i", "uninstall", "rm", "publish",
]);

function listWorkflowFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".yml") || f.endsWith(".yaml"))
    .map((f) => path.join(dir, f));
}

// Parse `pnpm-workspace.yaml` for the `packages:` glob list. We do
// this with a tiny line-based parser instead of pulling in `js-yaml`
// because the guard runs in CI before `pnpm install` has populated
// dev deps and we want zero runtime dependencies (same as the other
// scripts/src/check-*.mjs guards).
function readWorkspaceGlobs(root) {
  const wsPath = path.join(root, "pnpm-workspace.yaml");
  if (!fs.existsSync(wsPath)) return null;
  const text = fs.readFileSync(wsPath, "utf8");
  const lines = text.split("\n");
  const globs = [];
  let inPackages = false;
  for (const raw of lines) {
    const line = raw.replace(/\r$/, "");
    if (/^packages\s*:\s*$/.test(line)) { inPackages = true; continue; }
    if (inPackages) {
      // Continue while indented list items.
      const m = line.match(/^\s+-\s+['"]?([^'"#\s]+)['"]?\s*$/);
      if (m) { globs.push(m[1]); continue; }
      // Blank lines tolerated; any other top-level key ends the list.
      if (/^\S/.test(line)) inPackages = false;
    }
  }
  return globs;
}

// Expand a single workspace glob into concrete directories that
// contain a `package.json`. We support the two patterns pnpm
// workspace files use in practice:
//   - "scripts"          → exact dir
//   - "artifacts/*"      → one-level wildcard
//   - "lib/integrations/*" → one-level wildcard at deeper path
function expandGlob(root, glob) {
  const dirs = [];
  if (!glob.includes("*")) {
    const abs = path.join(root, glob);
    if (fs.existsSync(path.join(abs, "package.json"))) dirs.push(abs);
    return dirs;
  }
  // Split on the first `*` segment; everything before is the parent
  // dir, everything after the `*` (if any) is unsupported here —
  // pnpm-workspace.yaml never uses `**` in this repo.
  const parts = glob.split("/");
  const starIdx = parts.findIndex((p) => p === "*");
  if (starIdx === -1) return dirs;
  if (parts.slice(starIdx + 1).length > 0) {
    // Pattern like "foo/*/bar" — not used here. Fall back to a shallow
    // walk under the parent and check for `package.json`.
    const parent = path.join(root, ...parts.slice(0, starIdx));
    if (!fs.existsSync(parent)) return dirs;
    for (const ent of fs.readdirSync(parent, { withFileTypes: true })) {
      if (!ent.isDirectory()) continue;
      const candidate = path.join(parent, ent.name, ...parts.slice(starIdx + 1));
      if (fs.existsSync(path.join(candidate, "package.json"))) dirs.push(candidate);
    }
    return dirs;
  }
  const parent = path.join(root, ...parts.slice(0, starIdx));
  if (!fs.existsSync(parent)) return dirs;
  for (const ent of fs.readdirSync(parent, { withFileTypes: true })) {
    if (!ent.isDirectory()) continue;
    if (ent.name === "node_modules" || ent.name.startsWith(".")) continue;
    const abs = path.join(parent, ent.name);
    if (fs.existsSync(path.join(abs, "package.json"))) dirs.push(abs);
  }
  return dirs;
}

// Resolve real pnpm workspace membership: only directories matched by
// a glob in `pnpm-workspace.yaml` AND containing a `package.json`
// count. A stray `package.json` deeper in the tree (e.g. inside
// `node_modules` or a subdir of an artifact) is NOT a workspace
// package and must NOT be treated as a valid filter target.
function resolveWorkspacePackages(root) {
  const out = new Map(); // name -> { dir, scripts: Set }
  const globs = readWorkspaceGlobs(root);
  if (!globs || globs.length === 0) return out;
  const seenDirs = new Set();
  for (const g of globs) {
    for (const dir of expandGlob(root, g)) {
      if (seenDirs.has(dir)) continue;
      seenDirs.add(dir);
      try {
        const pkg = JSON.parse(
          fs.readFileSync(path.join(dir, "package.json"), "utf8"),
        );
        if (pkg && typeof pkg.name === "string") {
          out.set(pkg.name, {
            dir,
            scripts: new Set(Object.keys(pkg.scripts || {})),
          });
        }
      } catch {
        // skip unparseable package.json
      }
    }
  }
  return out;
}

function readAllowlist(p) {
  // Format: one entry per line, `<workflow-basename>:<package-name>`
  // (script-level allowlisting deliberately not supported — if a
  // package is wrong, the script can't be right). `#` starts a
  // comment. Returned as a Set of `"<basename>:<pkg>"` keys plus a
  // hits map so we can flag stale entries.
  const allow = new Map(); // key -> { hit: false, lineNo }
  if (!fs.existsSync(p)) return allow;
  const lines = fs.readFileSync(p, "utf8").split("\n");
  lines.forEach((raw, i) => {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) return;
    if (!line.includes(":")) return;
    allow.set(line, { hit: false, lineNo: i + 1 });
  });
  return allow;
}

// Find every `pnpm --filter <pkg> ...` call in a file's text.
// We deliberately scan raw text (not parsed YAML) because the
// invocations live inside `run: |` script blocks anyway. This also
// tolerates a leading `&` background prefix and pipe redirections.
function extractInvocations(text) {
  const calls = [];
  const re = /\bpnpm\b([^\n]*?)\s--filter\s+(\S+)\s+([^\n]*)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const lineStart = text.lastIndexOf("\n", m.index) + 1;
    const lineNo = text.slice(0, m.index).split("\n").length;
    const lineEnd = text.indexOf("\n", m.index);
    const lineText = text.slice(lineStart, lineEnd === -1 ? text.length : lineEnd);
    // Skip YAML comment lines — `# يُشغّل \`pnpm --filter ... run capture-shots\``
    // is documentation, not an actual invocation. The trailing backtick from
    // the markdown code-span otherwise leaks into the parsed script name.
    if (/^\s*#/.test(lineText)) continue;
    const pkg = m[2];
    const rest = m[3];
    const tokens = [];
    for (const tok of rest.split(/\s+/)) {
      if (!tok) continue;
      if (/^(&&?|\|\|?|;|>|<|>>|2>&1)$/.test(tok)) break;
      if (tok.startsWith(">") || tok.startsWith("<")) break;
      tokens.push(tok);
    }
    let i = 0;
    while (i < tokens.length && tokens[i].startsWith("-")) i++;
    if (i >= tokens.length) continue;
    let script;
    let usedRun = false;
    if (tokens[i] === "run") {
      usedRun = true;
      i++;
      if (i >= tokens.length) continue;
      script = tokens[i];
    } else {
      script = tokens[i];
    }
    if (PNPM_BUILTINS.has(script) && !usedRun) continue; // ambiguous
    calls.push({ pkg, script, line: lineNo, lineText: lineText.trim(), usedRun });
  }
  return calls;
}

function main() {
  const wfFiles = listWorkflowFiles(WORKFLOWS_DIR);
  if (wfFiles.length === 0) {
    console.error(`ERROR: no workflow files under ${WORKFLOWS_DIR}`);
    process.exit(2);
  }

  const packages = resolveWorkspacePackages(PACKAGES_ROOT);
  if (packages.size === 0) {
    console.error(
      `ERROR: no pnpm workspace packages resolved from ${PACKAGES_ROOT}/pnpm-workspace.yaml`,
    );
    process.exit(2);
  }

  const allow = readAllowlist(ALLOWLIST_PATH);

  const violations = [];
  let totalChecked = 0;
  for (const file of wfFiles) {
    const wfBase = path.basename(file);
    const text = fs.readFileSync(file, "utf8");
    const calls = extractInvocations(text);
    for (const call of calls) {
      totalChecked++;
      const pkg = packages.get(call.pkg);
      if (!pkg) {
        const allowKey = `${wfBase}:${call.pkg}`;
        if (allow.has(allowKey)) {
          allow.get(allowKey).hit = true;
          continue;
        }
        const guesses = [...packages.keys()].filter((n) => {
          const a = n.toLowerCase();
          const b = call.pkg.toLowerCase();
          return a.includes(b.replace(/^@[^/]+\//, "")) ||
            b.includes(a.replace(/^@[^/]+\//, ""));
        });
        violations.push({
          file,
          line: call.line,
          lineText: call.lineText,
          reason: `package "${call.pkg}" is not a pnpm workspace package`,
          hint: guesses.length
            ? `did you mean: ${guesses.slice(0, 3).join(", ")}?`
            : `known packages: ${[...packages.keys()].slice(0, 5).join(", ")}, …`,
          allowKey,
        });
        continue;
      }
      if (pkg.scripts.has(call.script)) continue;
      if (!call.usedRun && LIFECYCLE_SCRIPTS.has(call.script)) {
        violations.push({
          file,
          line: call.line,
          lineText: call.lineText,
          reason: `lifecycle script "${call.script}" is not defined in package "${call.pkg}"`,
          hint: pkg.scripts.size
            ? `available scripts: ${[...pkg.scripts].join(", ")}`
            : `package has no scripts`,
        });
        continue;
      }
      const close = [...pkg.scripts].filter((s) => {
        const a = s.toLowerCase();
        const b = call.script.toLowerCase();
        return a.includes(b) || b.includes(a) ||
          (a[0] === b[0] && Math.abs(a.length - b.length) <= 2);
      });
      violations.push({
        file,
        line: call.line,
        lineText: call.lineText,
        reason: `script "${call.script}" is not defined in package "${call.pkg}"`,
        hint: close.length
          ? `did you mean: ${close.slice(0, 3).join(", ")}?`
          : `available scripts: ${[...pkg.scripts].join(", ") || "(none)"}`,
      });
    }
  }

  // Stale allowlist entries are violations too — keeps the file honest.
  const stale = [];
  for (const [key, v] of allow.entries()) {
    if (!v.hit) stale.push({ key, lineNo: v.lineNo });
  }

  if (violations.length > 0 || stale.length > 0) {
    if (violations.length > 0) {
      console.error(
        `\n✗ check:workflow-pnpm-filters — ${violations.length} violation(s) ` +
          `(checked ${totalChecked} invocation(s) across ${wfFiles.length} workflow file(s)):\n`,
      );
      for (const v of violations) {
        const rel = path.relative(REPO_ROOT, v.file);
        console.error(`  • ${rel}:${v.line}`);
        console.error(`      ${v.lineText}`);
        console.error(`      ${v.reason}`);
        console.error(`      ${v.hint}`);
        if (v.allowKey) {
          console.error(
            `      (to silence while a fix is in flight, add "${v.allowKey}" to ${path.relative(REPO_ROOT, ALLOWLIST_PATH)})`,
          );
        }
      }
    }
    if (stale.length > 0) {
      console.error(
        `\n✗ check:workflow-pnpm-filters — ${stale.length} stale allowlist entry/entries in ${path.relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
      );
      for (const s of stale) {
        console.error(`  • line ${s.lineNo}: "${s.key}" no longer matches any workflow invocation — remove it.`);
      }
    }
    console.error(
      `\nWhy: Task #404 — \`pnpm --filter @ghayth-erp/api-spec run generate\` was wrong on both axes ` +
        `(package + script) and silently no-op'd behind \`|| true\` for weeks. This guard catches that class.`,
    );
    process.exit(1);
  }

  console.log(
    `✓ check:workflow-pnpm-filters — ${totalChecked} invocation(s) across ${wfFiles.length} workflow file(s) ` +
      `all reference real pnpm workspace packages + scripts (${allow.size} allowlisted entry/entries hit).`,
  );
}

main();
