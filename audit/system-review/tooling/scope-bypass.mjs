#!/usr/bin/env node
// scope-bypass.mjs — Read-only static detector for routes that
// hand-roll a `"companyId" = $N` tenant-scope predicate instead of
// going through buildScopedWhere/parseScopeFilters (lib/scopedQuery.ts).
//
// Scope (per #685 PR-1, owner-approved):
//   - route-layer ONLY (artifacts/api-server/src/routes/**)
//   - conservative detector; report-only (does NOT exit non-zero on
//     findings — see scripts/src/check-scope-bypass.mjs for the
//     warning-first CI wrapper)
//   - no source file is modified by this tool
//
// Output:
//   audit/system-review/tooling/_scope-bypass.json   (machine-readable)
//   docs/audit/SCOPE_BYPASS.md                       (human-readable)
//
// Classification (Class A/B/C/D mirrors docs/audit/SCOPE_NORMALIZATION_RCA_685.md):
//   A  safe        — hand-rolled `"companyId" = $N`, no aliased join,
//                    not on the allowlist. Mechanical swap candidate.
//   B  risky       — aliased company column (e.g. `je."companyId"`)
//                    OR the file body contains JOIN within the same
//                    handler window. Per-handler companyColumn override
//                    + branch-cascade decision needed.
//   C  manual      — file on the allowlist with category=manual. MUST
//                    NOT migrate (portal own-token scope, auth
//                    bootstrap, intentional cross-tenant, PDPL).
//   D  helper      — file on the allowlist with category=helper.
//                    Caller-side normalisation first.
//
// See docs/audit/SCOPE_NORMALIZATION_RCA_685.md for the RCA and the
// cluster-by-cluster PR plan that consumes this detector's output.

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const ROUTES_DIR = join(REPO, "artifacts/api-server/src/routes");
const ALLOWLIST_FILE = join(__dirname, "scope-bypass-allowlist.txt");
const OUT_JSON = join(__dirname, "_scope-bypass.json");
const OUT_MD = join(REPO, "docs/audit/SCOPE_BYPASS.md");

// ─── 1. Load allowlist ────────────────────────────────────────────────

function loadAllowlist() {
  const map = new Map(); // relPath -> { category, reason }
  if (!existsSync(ALLOWLIST_FILE)) return map;
  const lines = readFileSync(ALLOWLIST_FILE, "utf8").split("\n");
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const m = line.match(/^([^:]+):(manual|helper):(.+)$/);
    if (!m) continue;
    map.set(m[1], { category: m[2], reason: m[3].trim() });
  }
  return map;
}

// ─── 2. Detector patterns (conservative) ──────────────────────────────
//
// The detector intentionally errs on the side of false negatives over
// false positives. We only flag predicates that look like a real
// SQL-text tenant filter; e.g. `"companyId" = $1` or `je."companyId" = $2`.
// We skip:
//   - unquoted bare `companyId = $` (matches JS comparisons too)
//   - `:companyId` (named-param style; not used here)
//   - `companyId` inside a comment line (`// ...`)

const QUOTED_RE = /"companyId"\s*=\s*\$\d+/g;
const ALIASED_RE = /\b([a-zA-Z_]\w*)\."companyId"\s*=\s*\$\d+/g;

// Comment-stripping is line-based and conservative — we only drop
// content after `//` when the `//` is not inside a string literal we
// can't easily detect. For audit purposes, dropping the entire
// line-comment tail is safe.
function stripLineComment(line) {
  // very crude: if `//` appears outside quotes, cut at it
  const noStr = line.replace(/`[^`]*`|'[^']*'|"[^"]*"/g, "");
  const idx = noStr.indexOf("//");
  if (idx === -1) return line;
  // map back: find the same position in the original
  return line.slice(0, idx);
}

function scanFile(absPath) {
  const src = readFileSync(absPath, "utf8");
  const lines = src.split("\n");
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const code = stripLineComment(raw);
    if (!code.includes('"companyId"')) continue;

    // Per-line opt-out for future use; PR-1 doesn't ship any but the
    // detector understands the shape so future scope-ok comments work
    // immediately when owner picks the granularity in a later PR.
    if (/\/\/\s*scope-ok(:|\s|$)/i.test(raw)) continue;

    let m;
    QUOTED_RE.lastIndex = 0;
    while ((m = QUOTED_RE.exec(code)) !== null) {
      // Per-site aliased check: look at the 2 chars immediately
      // preceding the matched `"companyId"`. If they are `<word-char>.`
      // (i.e. the predicate is `je."companyId"` rather than bare
      // `"companyId"`), treat as aliased. This is per-occurrence, not
      // per-file, so a file with mixed plain + aliased hits gets each
      // counted accurately.
      const before = code.slice(Math.max(0, m.index - 2), m.index);
      const aliasedHere = /\w\.$/.test(before);
      hits.push({
        line: i + 1,
        text: raw.trim().slice(0, 200),
        aliased: aliasedHere,
      });
    }
  }
  // dedupe by line+text (the two regexes above can overlap)
  const seen = new Set();
  return hits.filter((h) => {
    const k = h.line + "|" + h.text;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function countUsesBuildScopedWhere(absPath) {
  const src = readFileSync(absPath, "utf8");
  return (src.match(/\bbuildScopedWhere\s*\(/g) || []).length;
}

// ─── 3. Classification ────────────────────────────────────────────────

// Per-FILE classification (predominant class). Per-HIT classification
// is attached to each site in scanFile() so a file with mixed predicate
// shapes shows the right split (e.g. hr.ts is plain-dominant but has
// ~99 aliased report joins).
//
// File rules (in order):
//   1. allowlist match -> C (manual) or D (helper) immediately.
//   2. aliased fraction >= 0.5 -> B (report/join dominant).
//   3. otherwise -> A (plain-predicate dominant; safe-swap dominant).
//
// Note: every individual hit still carries its own per-site class
// (A_safe / B_aliased / C_manual / D_helper) so consumers can ignore
// the file-level rollup if they prefer per-site triage.
function classify(file, hits, allowlist) {
  const allow = allowlist.get(file);
  if (allow) {
    return { category: allow.category === "manual" ? "C" : "D", reason: allow.reason };
  }
  if (hits.length === 0) return { category: "clean", reason: "no hand-rolled predicate" };
  const aliasedHits = hits.filter((h) => h.aliased).length;
  const aliasedFrac = aliasedHits / hits.length;
  if (aliasedFrac >= 0.5) {
    return {
      category: "B",
      reason: `aliased fraction ${(aliasedFrac * 100).toFixed(0)}% (${aliasedHits}/${hits.length}) — predominantly report/join queries; needs per-handler companyColumn override + branch-cascade decision`,
    };
  }
  return {
    category: "A",
    reason: `aliased fraction ${(aliasedFrac * 100).toFixed(0)}% (${aliasedHits}/${hits.length}) — predominantly plain \`"companyId" = $N\`; mechanical buildScopedWhere swap candidate (per-handler review still needed for the ${aliasedHits} aliased hit${aliasedHits === 1 ? "" : "s"})`,
  };
}

function siteClass(file, hit, allowlist) {
  const allow = allowlist.get(file);
  if (allow) return allow.category === "manual" ? "C" : "D";
  return hit.aliased ? "B" : "A";
}

// ─── 4. Run ───────────────────────────────────────────────────────────

const allowlist = loadAllowlist();
const files = readdirSync(ROUTES_DIR)
  .filter((f) => f.endsWith(".ts") && !f.endsWith(".test.ts"))
  .sort();

const report = [];
for (const f of files) {
  const abs = join(ROUTES_DIR, f);
  const rel = relative(REPO, abs);
  const hits = scanFile(abs);
  const usesHelper = countUsesBuildScopedWhere(abs);
  const cls = classify(rel, hits, allowlist);
  if (hits.length === 0 && !allowlist.has(rel)) continue;
  const sitesWithClass = hits.map((h) => ({ ...h, class: siteClass(rel, h, allowlist) }));
  report.push({
    file: rel,
    handRolledHits: hits.length,
    aliasedHits: hits.filter((h) => h.aliased).length,
    usesBuildScopedWhere: usesHelper,
    category: cls.category,
    reason: cls.reason,
    sites: sitesWithClass.slice(0, 50), // cap per file for json size
  });
}

// stale allowlist entries
const stale = [];
for (const [path, info] of allowlist) {
  const found = report.find((r) => r.file === path);
  if (!found || found.handRolledHits === 0) {
    stale.push({ file: path, category: info.category, reason: "allowlisted but no hand-rolled predicate found — remove from allowlist" });
  }
}

// totals
const totals = {
  filesScanned: files.length,
  filesWithHits: report.filter((r) => r.handRolledHits > 0).length,
  totalHits: report.reduce((a, r) => a + r.handRolledHits, 0),
  byCategory: {
    A_safe: { files: 0, hits: 0 },
    B_risky: { files: 0, hits: 0 },
    C_manual: { files: 0, hits: 0 },
    D_helper: { files: 0, hits: 0 },
  },
};
for (const r of report) {
  if (r.category === "A") { totals.byCategory.A_safe.files++; totals.byCategory.A_safe.hits += r.handRolledHits; }
  if (r.category === "B") { totals.byCategory.B_risky.files++; totals.byCategory.B_risky.hits += r.handRolledHits; }
  if (r.category === "C") { totals.byCategory.C_manual.files++; totals.byCategory.C_manual.hits += r.handRolledHits; }
  if (r.category === "D") { totals.byCategory.D_helper.files++; totals.byCategory.D_helper.hits += r.handRolledHits; }
}

// ─── 5. Output ────────────────────────────────────────────────────────

const json = {
  generatedAt: new Date().toISOString(),
  scope: "artifacts/api-server/src/routes/**.ts",
  detector: {
    patterns: ['"companyId" = $N', '<alias>."companyId" = $N'],
    optOut: "// scope-ok: <reason> on the same line",
    allowlistFile: relative(REPO, ALLOWLIST_FILE),
  },
  totals,
  staleAllowlist: stale,
  files: report.sort((a, b) => b.handRolledHits - a.handRolledHits),
};
writeFileSync(OUT_JSON, JSON.stringify(json, null, 2));

function md() {
  const o = [];
  o.push(`# Scope Bypass — Static Detector Report`);
  o.push(``);
  o.push(`Generated: ${json.generatedAt}`);
  o.push(``);
  o.push(`Scope: \`artifacts/api-server/src/routes/**.ts\` only (per #685 PR-1, owner-approved boundary).`);
  o.push(``);
  o.push(`Detector: flags hand-rolled \`"companyId" = $N\` predicates that bypass`);
  o.push(`\`buildScopedWhere\` / \`parseScopeFilters\` in \`artifacts/api-server/src/lib/scopedQuery.ts\`.`);
  o.push(`Per-line opt-out: \`// scope-ok: <reason>\` on the same line.`);
  o.push(`File allowlist for Category C/D: \`${relative(REPO, ALLOWLIST_FILE)}\`.`);
  o.push(``);
  o.push(`**This is a report-only detector.** The companion CI wrapper`);
  o.push(`\`scripts/src/check-scope-bypass.mjs\` exits 0 by default (warning-first)`);
  o.push(`so a new hand-rolled predicate does not break \`main\`. Strict-mode is`);
  o.push(`opt-in via env: \`SCOPE_BYPASS_STRICT=1\`.`);
  o.push(``);
  o.push(`## Totals`);
  o.push(``);
  o.push(`| Metric | Value |`);
  o.push(`|---|---:|`);
  o.push(`| Route files scanned | ${totals.filesScanned} |`);
  o.push(`| Files with ≥1 hand-rolled hit | ${totals.filesWithHits} |`);
  o.push(`| Total hand-rolled hits | ${totals.totalHits} |`);
  o.push(``);
  o.push(`## By Category`);
  o.push(``);
  o.push(`| Class | Meaning | Files | Hits |`);
  o.push(`|---|---|---:|---:|`);
  o.push(`| **A** | Safe — mechanical \`buildScopedWhere\` swap | ${totals.byCategory.A_safe.files} | ${totals.byCategory.A_safe.hits} |`);
  o.push(`| **B** | Risky — aliased company column / report joins | ${totals.byCategory.B_risky.files} | ${totals.byCategory.B_risky.hits} |`);
  o.push(`| **C** | Manual — allowlist (portals / auth / admin / pdpl) | ${totals.byCategory.C_manual.files} | ${totals.byCategory.C_manual.hits} |`);
  o.push(`| **D** | Helper — caller-side normalisation first | ${totals.byCategory.D_helper.files} | ${totals.byCategory.D_helper.hits} |`);
  o.push(``);
  if (stale.length > 0) {
    o.push(`## Stale Allowlist Entries`);
    o.push(``);
    o.push(`These files are listed in \`${relative(REPO, ALLOWLIST_FILE)}\` but no longer have any hand-rolled \`"companyId" = $N\` predicate. Remove from the allowlist to keep it honest.`);
    o.push(``);
    for (const s of stale) o.push(`- \`${s.file}\` (was: ${s.category})`);
    o.push(``);
  }
  o.push(`## Files`);
  o.push(``);
  o.push(`| File | Class | Hits | Aliased | Uses \`buildScopedWhere\` | Reason |`);
  o.push(`|---|:---:|---:|---:|---:|---|`);
  for (const r of json.files) {
    o.push(`| \`${r.file}\` | ${r.category} | ${r.handRolledHits} | ${r.aliasedHits} | ${r.usesBuildScopedWhere} | ${r.reason} |`);
  }
  o.push(``);
  o.push(`## Sites (first 20 per file)`);
  o.push(``);
  for (const r of json.files) {
    if (r.handRolledHits === 0) continue;
    o.push(`### \`${r.file}\` (${r.category}, ${r.handRolledHits} hits)`);
    o.push(``);
    for (const s of r.sites.slice(0, 20)) {
      const flag = s.aliased ? " *(aliased)*" : "";
      o.push(`- L${s.line}${flag}: \`${s.text.replace(/`/g, "\\`")}\``);
    }
    o.push(``);
  }
  o.push(`---`);
  o.push(``);
  o.push(`Regenerate: \`node audit/system-review/tooling/scope-bypass.mjs\``);
  o.push(`CI wrapper:  \`pnpm --filter @workspace/scripts run check:scope-bypass\` (warning-first; set \`SCOPE_BYPASS_STRICT=1\` to fail on new hits)`);
  o.push(`RCA: \`docs/audit/SCOPE_NORMALIZATION_RCA_685.md\``);
  return o.join("\n") + "\n";
}

writeFileSync(OUT_MD, md());

// Console summary
console.log("scope-bypass: scanned", totals.filesScanned, "route files");
console.log("scope-bypass: filesWithHits =", totals.filesWithHits, "totalHits =", totals.totalHits);
console.log("scope-bypass: A_safe   =", totals.byCategory.A_safe.files,  "files /", totals.byCategory.A_safe.hits,  "hits");
console.log("scope-bypass: B_risky  =", totals.byCategory.B_risky.files, "files /", totals.byCategory.B_risky.hits, "hits");
console.log("scope-bypass: C_manual =", totals.byCategory.C_manual.files,"files /", totals.byCategory.C_manual.hits,"hits");
console.log("scope-bypass: D_helper =", totals.byCategory.D_helper.files,"files /", totals.byCategory.D_helper.hits,"hits");
if (stale.length > 0) console.log("scope-bypass: STALE allowlist entries =", stale.length);
console.log("scope-bypass: wrote", relative(REPO, OUT_JSON));
console.log("scope-bypass: wrote", relative(REPO, OUT_MD));
