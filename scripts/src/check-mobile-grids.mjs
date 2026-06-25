#!/usr/bin/env node
//
// scripts/src/check-mobile-grids.mjs
//
// Mobile grid-cramping guard. The 2026-06 mobile-responsiveness pass collapsed
// every cramped stat/input/tab grid so it reflows on a phone. Tailwind is
// mobile-first: a BARE (unprefixed) `grid-cols-N` IS the mobile layout, so
// `grid-cols-5 md:grid-cols-10` still shows 5 columns on a 360px screen
// (~70px/column) — stat cards, number inputs and Arabic tab labels get
// truncated. The fix is `grid-cols-2 md:grid-cols-5` (collapse on mobile).
// This guard keeps NEW bare `grid-cols-N` (N>=4) out of `src/pages/**`.
//
// It is deliberately narrow — a bare `grid-cols-N` is LEGITIMATE in shapes
// that are not cramped data grids, and those are excluded mechanically:
//
//   • key-value rows      — `grid grid-cols-3` with a `col-span-2` value
//                           (label + value = 2 visual columns).
//   • horizontal-scroll   — a grid inside `overflow-x-auto` or carrying
//                           `min-w-[..]` is meant to scroll sideways, not reflow
//                           (emulated wide tables: project-costing, rbac SoD).
//   • calendars           — 7-column weekday grids (path contains "calendar").
//
// Whatever survives the exclusions and is still intentional (a 12-month
// seasonal heat-strip, a 7-day "this week" overview) is pinned in the
// allowlist with its path:line. The guard fails only on a bare grid-cols>=4
// that is NEITHER excluded NOR allowlisted.
//
// OFFLINE: pure source scan, no DB / build / server — runs unconditionally in
// CI like check:display-tables. `.test.tsx` files are skipped.
//
// Usage:
//   node scripts/src/check-mobile-grids.mjs                 # gate
//   node scripts/src/check-mobile-grids.mjs --write-allowlist
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWLIST_PATH = join(REPO_ROOT, "scripts/mobile-grids-allowlist.txt");

const PAGE_SRC_DIRS = [
  "artifacts/ghayth-erp/src/pages",
  "artifacts/client-portal/src/pages",
  "artifacts/careers-portal/src/pages",
];

const MIN_COLS = 4; // 3 narrow columns fit a phone; >=4 is the cramped threshold

// Files that are not operational UI (guide / mock / preview screens render
// intentional miniature desktop previews) or are weekday calendars — their
// dense grids are by design, never a cramped operational data grid.
const EXCLUDED_FILE = /(calendar|guide|mock|demo|preview|sandbox)/i;

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
    } else if (e.isFile() && e.name.endsWith(".tsx") && !e.name.endsWith(".test.tsx")) {
      out.push(full);
    }
  }
  return out;
}

// A line is an offender when it carries a BARE (no sm:/md:/lg:/xl:/2xl: prefix)
// `grid-cols-N` with N >= MIN_COLS, and none of the mechanical exclusions apply.
export function lineIsCrampedGrid(lines, i, fileExcluded) {
  const line = lines[i];
  const t = line.trim();
  if (t.startsWith("*") || t.startsWith("//") || t.startsWith("/*")) return false;
  // exclusion: calendar / guide / mock / preview file (dense grids by design)
  if (fileExcluded) return false;
  // BARE grid-cols tokens only. A token is bare (the mobile layout) iff it is
  // NOT preceded by `:` (any responsive/state variant ends in `:`, including
  // arbitrary ones like `min-[480px]:` / `data-[open]:` / `2xl:`) and NOT by a
  // word char or `-` (so `auto-grid-cols-6` / `xgrid-cols-6` sub-tokens don't
  // match). The lookbehind handles every variant without enumerating its chars.
  const bare = [...line.matchAll(/(?<![\w:-])grid-cols-(\d+)/g)].map((m) => Number(m[1]));
  if (bare.length === 0 || Math.max(...bare) < MIN_COLS) return false;
  // exclusion: horizontal-scroll content (min-w on the element itself)
  if (/min-w-\[/.test(line)) return false;
  // exclusion: key-value rows (a col-span value in this element's window).
  // Looks one line up (value-first markup) and a few down (the spanned child).
  if (/col-span-/.test(lines.slice(Math.max(0, i - 1), i + 5).join("\n"))) return false;
  // exclusion: inside a horizontal-scroll wrapper (overflow-x-auto a few lines up)
  if (/overflow-(x-)?(auto|scroll)/.test(lines.slice(Math.max(0, i - 8), i + 1).join("\n"))) return false;
  return true;
}

async function findOffenders() {
  const offenders = [];
  for (const rel of PAGE_SRC_DIRS) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const files = await walkTsx(abs, []);
    for (const f of files) {
      const fileExcluded = EXCLUDED_FILE.test(f);
      const lines = (await readFile(f, "utf8")).split("\n");
      const relPath = relative(REPO_ROOT, f).split("\\").join("/");
      for (let i = 0; i < lines.length; i++) {
        if (lineIsCrampedGrid(lines, i, fileExcluded)) offenders.push(`${relPath}:${i + 1}`);
      }
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
    set.add(t.split(/\s+#/)[0].trim());
  }
  return set;
}

// allowlist entry matches either an exact `path:line` or a whole `path`
function isAllowed(offender, allow) {
  if (allow.has(offender)) return true;
  const path = offender.replace(/:\d+$/, "");
  return allow.has(path);
}

async function main() {
  const writeMode = process.argv.includes("--write-allowlist");
  const offenders = await findOffenders();

  if (writeMode) {
    const header = [
      "# mobile-grids-allowlist.txt",
      "#",
      "# Bare `grid-cols-N` (N>=4) occurrences kept on purpose — an intentional",
      "# dense layout that is NOT a cramped mobile data/stat grid (e.g. a 12-month",
      "# seasonal heat-strip, a 7-day week overview). The guard fails only on a",
      "# bare grid-cols>=4 NOT excluded and NOT listed here.",
      "# An entry may be `path:line` (one spot) or `path` (the whole file).",
      "# Regenerate with:",
      "#   node scripts/src/check-mobile-grids.mjs --write-allowlist",
      "# When a spot is made responsive (grid-cols-2 md:grid-cols-N), prune it.",
      "#",
      `# Baseline captured: ${offenders.length} occurrence(s).`,
      "",
    ].join("\n");
    await writeFile(ALLOWLIST_PATH, header + offenders.join("\n") + (offenders.length ? "\n" : ""), "utf8");
    console.log(`[check:mobile-grids] wrote ${offenders.length} entries to ${relative(REPO_ROOT, ALLOWLIST_PATH)}`);
    return;
  }

  const allow = loadAllowlist();
  const fresh = offenders.filter((o) => !isAllowed(o, allow));

  // Stale entries — an allowlisted `path:line` or `path` that no longer matches
  // any offender (the spot was made responsive / removed). Surfaced as a NOTE
  // so the allowlist can't silently rot, mirroring check-display-tables.
  const stale = [...allow]
    .filter((e) => !offenders.some((o) => o === e || o.replace(/:\d+$/, "") === e))
    .sort();
  if (stale.length) {
    console.log(
      `[check:mobile-grids] NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale ` +
        `(made responsive or removed) — prune from ${relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
    );
    for (const e of stale) console.log(`    - ${e}`);
  }

  if (fresh.length) {
    console.error(
      `\n[check:mobile-grids] FAIL: ${fresh.length} bare grid-cols>=${MIN_COLS} (cramped on mobile):`,
    );
    for (const o of fresh) console.error(`    ✗ ${o}`);
    console.error(
      "\n  Tailwind is mobile-first: a bare `grid-cols-N` IS the phone layout.\n" +
        "  Collapse it so it reflows on a phone, e.g.:\n" +
        "      grid-cols-2 md:grid-cols-5      (stat/input cards)\n" +
        "  A TabsList also needs h-auto md:h-9 so the wrapped row is not clipped.\n" +
        "  If this is genuinely an intentional dense layout (viz strip, week\n" +
        "  overview) or a sideways-scroll table, add its path:line to\n" +
        "  scripts/mobile-grids-allowlist.txt.",
    );
    process.exit(1);
  }

  console.log(`[check:mobile-grids] OK — no cramped mobile grids in pages outside the allowlist (${offenders.length} allowlisted).`);
}

main().catch((err) => {
  console.error("[check:mobile-grids] ERROR:", err);
  process.exit(1);
});
