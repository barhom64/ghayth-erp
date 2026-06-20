#!/usr/bin/env node
//
// scripts/src/check-page-actions.mjs
//
// Page action-bar consistency guard. Catches hand-rolled versions of the
// three unified page actions — a `<Button>`/`<button>` that pairs the action's
// lucide icon with its bare Arabic label — which should be the single unified
// component instead:
//
//     تحديث  RefreshCw → <RefreshAction onRefresh={…} />   (@/components/page-actions)
//     طباعة  Printer   → <PrintButton … />                 (@/components/shared/print-button)
//     تصدير  Download  → <ExportAction onExport={…} />      (@/components/page-actions)
//
// Why this exists: the app shipped dozens of bespoke action buttons (varied
// size / variant / icon spacing), so the same action looked and behaved
// differently on every page. They were unified onto these components (icon-only,
// hover-expands to the label, fixed place in the PageShell actions slot). Once
// unified, this guard keeps NEW bespoke ones from sneaking back in.
//
// Scoped, NOT flagged — deliberately different controls, kept in
// scripts/page-actions-allowlist.txt as `action:path` entries:
//   • section/card-header refreshes (a per-section control, not the page bar),
//   • per-row table «تحديث» (recompute one row, with per-row spinner state).
// A toggle/recompute whose label is a longer phrase («تحديث تلقائي»، «طباعة A4»،
// «تصدير Excel» …) is NOT a standard action button — the detector requires the
// BARE label, so those are excluded automatically.
//
// OFFLINE: pure source scan, no DB / build / server needed — so it runs
// unconditionally in CI (like check:button-nesting).
//
// Usage:
//   node scripts/src/check-page-actions.mjs                 # gate
//   node scripts/src/check-page-actions.mjs --write-allowlist
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWLIST_PATH = join(REPO_ROOT, "scripts/page-actions-allowlist.txt");

// The app that owns the unified actions. Other portals don't import them.
const SRC_DIR = "artifacts/ghayth-erp/src";

// A `<Button …>…</Button>` (or lowercase `<button>`) body. Non-greedy, so each
// match is a single element; `[\s\S]` crosses newlines for multi-line buttons.
const BTN_RE = /<([Bb]utton)\b[^>]*>([\s\S]*?)<\/\1>/g;

// The three unified page actions: lucide icon + bare Arabic label + the fix.
const ACTIONS = [
  { key: "refresh", icon: "RefreshCw", label: "تحديث", fix: 'import { RefreshAction } from "@/components/page-actions";  →  <RefreshAction onRefresh={…} />' },
  { key: "print",   icon: "Printer",   label: "طباعة", fix: 'import { PrintButton } from "@/components/shared/print-button";  →  <PrintButton … />' },
  { key: "export",  icon: "Download",  label: "تصدير", fix: 'import { ExportAction } from "@/components/page-actions";  →  <ExportAction onExport={…} />' },
];

// The bare label as the element's own text — preceded by a tag-close / whitespace
// / start, and followed by a tag-open, a `{…}` JSX expression, or end. A longer
// phrase has another word after it, so it does NOT match.
const bareRe = (label) => new RegExp(`(?:^|>|\\s)${label}\\s*(?:<|\\{|$)`);
const RE_CACHE = new Map(ACTIONS.map((a) => [a.key, bareRe(a.label)]));

/** Map<actionKey, count> — how many hand-rolled buttons (a Button/button
 *  pairing the action's icon with its bare label) `text` has, per action.
 *  Counting (not a boolean) lets the allowlist record a per-file baseline so a
 *  NEW occurrence in an already-allowlisted file still trips the gate. */
export function fileManualActionCounts(text) {
  const counts = new Map();
  for (const a of ACTIONS) {
    if (!text.includes(a.icon) || !text.includes(a.label)) continue;
    const re = RE_CACHE.get(a.key);
    let m, n = 0;
    BTN_RE.lastIndex = 0;
    while ((m = BTN_RE.exec(text))) {
      if (m[2].includes(a.icon) && re.test(m[2])) n++;
    }
    if (n > 0) counts.set(a.key, n);
  }
  return counts;
}

/** The set of action keys for which `text` has ≥1 hand-rolled button. */
export function fileManualActions(text) {
  return new Set(fileManualActionCounts(text).keys());
}

/** Back-compat: true when `text` has a hand-rolled refresh button. */
export function fileHasManualRefresh(text) {
  return fileManualActionCounts(text).has("refresh");
}

async function walkTsx(dir, out) {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name === "dist") continue;
      await walkTsx(full, out);
    } else if (e.isFile() && e.name.endsWith(".tsx")) {
      out.push(full);
    }
  }
  return out;
}

/** Offenders as a Map<`action:relpath`, count>, sorted by key. */
async function findOffenders() {
  const offenders = new Map();
  const abs = join(REPO_ROOT, SRC_DIR);
  if (!existsSync(abs)) return offenders;
  const files = await walkTsx(abs, []);
  for (const f of files) {
    const text = await readFile(f, "utf8");
    const rel = relative(REPO_ROOT, f).split("\\").join("/");
    for (const [key, n] of fileManualActionCounts(text)) offenders.set(`${key}:${rel}`, n);
  }
  return new Map([...offenders].sort((a, b) => a[0].localeCompare(b[0])));
}

/** Map<`action:path`, allowedCount>. A line is `action:path` (allows 1) or
 *  `action:path N` (allows N occurrences of that action in that file). */
function loadAllowlist() {
  const map = new Map();
  if (!existsSync(ALLOWLIST_PATH)) return map;
  for (const line of readFileSync(ALLOWLIST_PATH, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const sp = t.split(/\s+/);
    map.set(sp[0], sp[1] ? Math.max(1, parseInt(sp[1], 10) || 1) : 1);
  }
  return map;
}

async function main() {
  const offenders = await findOffenders(); // Map<`action:path`, count>

  if (process.argv.includes("--write-allowlist")) {
    const lines = [...offenders].map(([id, n]) => (n > 1 ? `${id} ${n}` : id));
    const header = [
      "# page-actions-allowlist.txt",
      "#",
      "# Accepted hand-rolled page-action buttons, one `action:path` per line",
      "# (action ∈ refresh|print|export), with an optional trailing occurrence",
      "# count `action:path N` (default 1). These are deliberately NOT the unified",
      "# component — a framework mechanism, a section/card-header control, or a",
      "# per-row table action. The guard fails on an `action:path` NOT listed, OR",
      "# when a listed file gains MORE occurrences than its baseline count.",
      "#   node scripts/src/check-page-actions.mjs --write-allowlist   # regenerate",
      "#",
      `# Baseline captured: ${lines.length} file/action entr${lines.length === 1 ? "y" : "ies"}.`,
      "",
    ].join("\n");
    await writeFile(ALLOWLIST_PATH, header + lines.join("\n") + "\n", "utf8");
    console.log(`[check:page-actions] wrote ${lines.length} entries to ${relative(REPO_ROOT, ALLOWLIST_PATH)}`);
    return;
  }

  const allow = loadAllowlist(); // Map<`action:path`, allowedCount>
  // fresh = a file/action whose CURRENT count exceeds its allowlisted baseline
  // (0 if unlisted) — so a brand-new offender OR a new occurrence inside an
  // already-allowlisted file both fail the gate.
  const fresh = [];
  for (const [id, count] of offenders) {
    const allowed = allow.get(id) ?? 0;
    if (count > allowed) fresh.push({ id, count, allowed });
  }
  const stale = [...allow.keys()].filter((id) => !offenders.has(id)).sort();

  if (stale.length) {
    console.log(
      `[check:page-actions] NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale ` +
        `(file changed or removed) — prune from ${relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
    );
    for (const id of stale) console.log(`    - ${id}`);
  }

  if (fresh.length) {
    console.error(`\n[check:page-actions] FAIL: ${fresh.length} NEW hand-rolled page-action button(s):`);
    for (const a of ACTIONS) {
      const hits = fresh.filter((o) => o.id.startsWith(`${a.key}:`));
      if (!hits.length) continue;
      console.error(`\n  «${a.label}» (use ${a.fix}):`);
      for (const o of hits) {
        const path = o.id.slice(a.key.length + 1);
        const extra = o.allowed > 0 ? `  (found ${o.count}, allowlisted ${o.allowed} — a NEW one was added)` : "";
        console.error(`    ✗ ${path}${extra}`);
      }
    }
    console.error(
      "\n  Fix: use the unified component so the action looks/behaves the same\n" +
        "  everywhere. If this is genuinely a framework/section/per-row control, add\n" +
        "  the `action:path` line (with a count if >1) to scripts/page-actions-allowlist.txt.",
    );
    process.exit(1);
  }

  const total = [...offenders.values()].reduce((s, n) => s + n, 0);
  console.log(
    `[check:page-actions] OK — ${offenders.size} baseline file/action exception(s) ` +
      `(${total} occurrence(s)) allowlisted, 0 new (refresh/print/export).`,
  );
}

main().catch((err) => {
  console.error("[check:page-actions] ERROR:", err);
  process.exit(2);
});
