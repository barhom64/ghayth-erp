#!/usr/bin/env node
//
// scripts/src/check-page-actions.mjs
//
// Page action-bar consistency guard (refresh). Catches the hand-rolled
// refresh control class — a `<Button>`/`<button>` that pairs the
// `RefreshCw` icon with the bare Arabic label «تحديث» — which should be
// the single unified component instead:
//
//     import { RefreshAction } from "@/components/page-actions";
//     <RefreshAction onRefresh={refetch} />
//
// Why this exists: the app shipped dozens of bespoke refresh buttons
// (varied size / variant / icon spacing), so the same action looked and
// behaved differently on every page. They were unified onto RefreshAction
// (icon-only, hover-expands to the label, fixed place in the PageShell
// actions slot). Once unified, this guard keeps NEW bespoke refresh
// buttons from sneaking back in.
//
// Scoped, NOT flagged — these are deliberately different controls, kept
// in scripts/page-actions-refresh-allowlist.txt:
//   • section/card-header refreshes (a per-section control, not the page bar),
//   • per-row table «تحديث» (recompute one row, with per-row spinner state).
// A toggle/recompute whose label is a longer phrase («تحديث تلقائي»،
// «تحديث اللقطة»، «تحديث التحليل») is NOT a standard refresh button and is
// excluded by the detector itself (the label must be the bare «تحديث»).
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
const ALLOWLIST_PATH = join(REPO_ROOT, "scripts/page-actions-refresh-allowlist.txt");

// The app that owns RefreshAction (@/components/page-actions). Other portals
// don't import it, so they're out of scope for this guard.
const SRC_DIR = "artifacts/ghayth-erp/src";

// A `<Button …>…</Button>` (or lowercase `<button>`) body. Non-greedy, so each
// match is a single element; `[\s\S]` crosses newlines for multi-line buttons.
const BTN_RE = /<([Bb]utton)\b[^>]*>([\s\S]*?)<\/\1>/g;
// The bare refresh label: «تحديث» as the element's own text — preceded by a
// tag-close / whitespace / start, and followed by a tag-open, a `{…}` JSX
// expression, or end. A longer phrase («تحديث تلقائي» …) has another Arabic
// word after it, so it does NOT match — those aren't standard refresh buttons.
const BARE_REFRESH_LABEL = /(?:^|>|\s)تحديث\s*(?:<|\{|$)/;

/** True when `text` contains a hand-rolled refresh button: a Button/button
 *  element that pairs the RefreshCw icon with the bare «تحديث» label. */
export function fileHasManualRefresh(text) {
  if (!text.includes("RefreshCw") || !text.includes("تحديث")) return false;
  let m;
  BTN_RE.lastIndex = 0;
  while ((m = BTN_RE.exec(text))) {
    const inner = m[2];
    if (inner.includes("RefreshCw") && BARE_REFRESH_LABEL.test(inner)) return true;
  }
  return false;
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

async function findOffenders() {
  const offenders = [];
  const abs = join(REPO_ROOT, SRC_DIR);
  if (!existsSync(abs)) return offenders;
  const files = await walkTsx(abs, []);
  for (const f of files) {
    const text = await readFile(f, "utf8");
    if (fileHasManualRefresh(text)) {
      offenders.push(relative(REPO_ROOT, f).split("\\").join("/"));
    }
  }
  offenders.sort();
  return offenders;
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return new Set();
  const set = new Set();
  for (const line of readFileSync(ALLOWLIST_PATH, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    set.add(t);
  }
  return set;
}

async function main() {
  const offenders = await findOffenders();

  if (process.argv.includes("--write-allowlist")) {
    const header = [
      "# page-actions-refresh-allowlist.txt",
      "#",
      "# Files with a refresh button (RefreshCw + bare «تحديث») that is",
      "# deliberately NOT the unified RefreshAction — a section/card-header",
      "# control or a per-row table action. The guard only fails on a file",
      "# NOT listed here. Regenerate with:",
      "#   node scripts/src/check-page-actions.mjs --write-allowlist",
      "#",
      `# Baseline captured: ${offenders.length} file(s).`,
      "",
    ].join("\n");
    await writeFile(ALLOWLIST_PATH, header + offenders.join("\n") + "\n", "utf8");
    console.log(`[check:page-actions] wrote ${offenders.length} entries to ${relative(REPO_ROOT, ALLOWLIST_PATH)}`);
    return;
  }

  const allow = loadAllowlist();
  const fresh = offenders.filter((f) => !allow.has(f));
  const stale = [...allow].filter((f) => !offenders.includes(f)).sort();

  if (stale.length) {
    console.log(
      `[check:page-actions] NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale ` +
        `(file changed or removed) — prune from ${relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
    );
    for (const f of stale) console.log(`    - ${f}`);
  }

  if (fresh.length) {
    console.error(
      `\n[check:page-actions] FAIL: ${fresh.length} NEW hand-rolled refresh button(s) ` +
        `(RefreshCw + «تحديث» instead of the unified component):`,
    );
    for (const f of fresh) console.error(`    ✗ ${f}`);
    console.error(
      "\n  Fix: use the unified action so refresh looks/behaves the same everywhere:\n" +
        "      import { RefreshAction } from \"@/components/page-actions\";\n" +
        "      <RefreshAction onRefresh={refetch} />\n" +
        "  If this is genuinely a section/per-row control, add the path to\n" +
        "  scripts/page-actions-refresh-allowlist.txt with a one-line reason.",
    );
    process.exit(1);
  }

  console.log(
    `[check:page-actions] OK — ${offenders.length} baseline exception(s) allowlisted, 0 new.`,
  );
}

main().catch((err) => {
  console.error("[check:page-actions] ERROR:", err);
  process.exit(2);
});
