#!/usr/bin/env node
//
// scripts/src/check-button-nesting.mjs
//
// Interactive-element nesting guard. Catches the invalid-HTML class
// `<Link ...><Button ...>…</Button></Link>` which renders as
// `<a><button>…</button></a>` — an interactive element nested inside
// another interactive element. This is invalid HTML, breaks keyboard
// and screen-reader semantics, and trips React hydration / a11y audits.
//
// The shadcn idiom is the inverse, using `asChild` so a single element
// is emitted:
//
//     <Button asChild variant="…"><Link to="…">…</Link></Button>
//
// Why this exists: the pattern is copy-pasted across ~180 frontend
// pages. Once the existing occurrences are refactored, this guard keeps
// NEW ones from sneaking back in. Until then it runs in baseline mode:
// every offender currently present is captured in
// `scripts/button-nesting-allowlist.txt`; the guard only fails when a
// file NOT on the allowlist introduces the pattern.
//
// OFFLINE: pure source scan, no DB / build / server needed — so it runs
// unconditionally in CI (like check:dump-drift).
//
// Algorithm:
//   1. Walk every `.tsx` under each frontend artifact's `src/`.
//   2. Flag a file if its text contains `<Link …>` directly wrapping
//      `<Button …>` (optional whitespace and a single `{…}` guard
//      expression between them) — the same heuristic that produced the
//      committed baseline, so detector output == allowlist exactly.
//   3. A file on the allowlist is an accepted pre-existing offender.
//      A flagged file NOT on the allowlist is a NEW regression → fail.
//   4. `--write-allowlist` rewrites the baseline from current findings.
//
// Usage:
//   node scripts/src/check-button-nesting.mjs                 # gate
//   node scripts/src/check-button-nesting.mjs --write-allowlist
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWLIST_PATH = join(REPO_ROOT, "scripts/button-nesting-allowlist.txt");

// Frontend artifacts that use react-router <Link> + shadcn <Button>.
const FRONTEND_SRC_DIRS = [
  "artifacts/ghayth-erp/src",
  "artifacts/client-portal/src",
  "artifacts/careers-portal/src",
];

// `<Link …>` directly wrapping `<Button …>`, allowing whitespace and a
// single `{…}` conditional between the two tags. `\s` and the negated
// classes cross newlines, so multi-line tags / wrappers are matched.
const NESTING_RE = /<Link\b[^>]*>\s*(\{[^}]*\}\s*)?<Button\b/;

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

export function fileHasNesting(text) {
  return NESTING_RE.test(text);
}

async function findOffenders() {
  const offenders = [];
  for (const rel of FRONTEND_SRC_DIRS) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const files = await walkTsx(abs, []);
    for (const f of files) {
      const text = await readFile(f, "utf8");
      if (fileHasNesting(text)) {
        offenders.push(relative(REPO_ROOT, f).split("\\").join("/"));
      }
    }
  }
  offenders.sort();
  return offenders;
}

function loadAllowlist() {
  if (!existsSync(ALLOWLIST_PATH)) return new Set();
  const raw = readFileSync(ALLOWLIST_PATH, "utf8");
  const set = new Set();
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    set.add(t);
  }
  return set;
}

async function main() {
  const writeMode = process.argv.includes("--write-allowlist");
  const offenders = await findOffenders();

  if (writeMode) {
    const header = [
      "# button-nesting-allowlist.txt",
      "#",
      "# Pre-existing files containing `<Link><Button>` invalid nesting.",
      "# These are accepted baseline offenders; the guard only fails on a",
      "# file NOT listed here. Regenerate with:",
      "#   node scripts/src/check-button-nesting.mjs --write-allowlist",
      "# As files are refactored to `<Button asChild><Link/></Button>`,",
      "# prune their line here.",
      "#",
      `# Baseline captured: ${offenders.length} file(s).`,
      "",
    ].join("\n");
    await writeFile(ALLOWLIST_PATH, header + offenders.join("\n") + "\n", "utf8");
    console.log(`[check:button-nesting] wrote ${offenders.length} entries to ${relative(REPO_ROOT, ALLOWLIST_PATH)}`);
    return;
  }

  const allow = loadAllowlist();
  const fresh = offenders.filter((f) => !allow.has(f));
  const stale = [...allow].filter((f) => !offenders.includes(f)).sort();

  if (stale.length) {
    console.log(
      `[check:button-nesting] NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale ` +
        `(file refactored or removed) — prune from ${relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
    );
    for (const f of stale) console.log(`    - ${f}`);
  }

  if (fresh.length) {
    console.error(
      `\n[check:button-nesting] FAIL: ${fresh.length} NEW file(s) nest <Button> inside <Link> ` +
        `(renders invalid <a><button>):`,
    );
    for (const f of fresh) console.error(`    ✗ ${f}`);
    console.error(
      "\n  Fix: use the shadcn `asChild` idiom so a single element is emitted:\n" +
        "      <Button asChild variant=\"…\"><Link to=\"…\">…</Link></Button>\n" +
        "  If this is genuinely intentional, add the path to scripts/button-nesting-allowlist.txt.",
    );
    process.exit(1);
  }

  console.log(
    `[check:button-nesting] OK — ${offenders.length} baseline offender(s) allowlisted, 0 new.`,
  );
}

main().catch((err) => {
  console.error("[check:button-nesting] ERROR:", err);
  process.exit(2);
});
