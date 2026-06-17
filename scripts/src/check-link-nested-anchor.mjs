#!/usr/bin/env node
//
// scripts/src/check-link-nested-anchor.mjs
//
// Nested-anchor guard. Catches the invalid-HTML class
// `<Link …><a …>…</a></Link>` WITHOUT the `asChild` prop, which under
// wouter v3 renders as `<a><a>…</a></a>` — an anchor nested inside another
// anchor.
//
// Why this exists: wouter's <Link> only forwards href/onClick onto a child
// element (instead of rendering its OWN <a>) when `asChild` is set:
//
//     // wouter/src/index.js
//     return asChild && isValidElement(children)
//       ? cloneElement(children, { onClick, href })   // single <a>
//       : h("a", { …restProps, onClick, href }, children); // wraps in <a>
//
// So `<Link href="…"><a>…</a></Link>` (no `asChild`) emits an OUTER <a>
// (carrying href+onClick) wrapping the author's INNER <a> (carrying the
// className+content but no href). Nested anchors are invalid HTML: React
// logs a `validateDOMNesting` / hydration warning ("<a> cannot be a
// descendant of <a>") and the browser un-nests them at parse time, which
// strips the click target's href/onClick and can break tab/link navigation.
// typecheck/build/lint all pass — invisible until you open the page.
//
// The fix is zero-visual-change: add `asChild` to the <Link> so wouter
// clones the inner <a> (merging href+onClick) instead of wrapping it:
//
//     -  <Link href="…"><a className="…">…</a></Link>
//     +  <Link href="…" asChild><a className="…">…</a></Link>
//
// OFFLINE: pure source scan, no DB / build / server needed — runs
// unconditionally in CI (like check:button-nesting / check:dump-drift).
//
// Algorithm:
//   1. Walk every `.tsx` under each frontend artifact's `src/`.
//   2. Flag a file if its text contains a `<Link …>` opening tag WITHOUT
//      `asChild` directly wrapping `<a` (whitespace/newlines allowed).
//   3. A file on the allowlist is an accepted pre-existing offender.
//      A flagged file NOT on the allowlist is a NEW regression → fail.
//   4. `--write-allowlist` rewrites the baseline from current findings.
//
// Usage:
//   node scripts/src/check-link-nested-anchor.mjs                 # gate
//   node scripts/src/check-link-nested-anchor.mjs --write-allowlist
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWLIST_PATH = join(REPO_ROOT, "scripts/link-nested-anchor-allowlist.txt");

const FRONTEND_SRC_DIRS = [
  "artifacts/ghayth-erp/src",
  "artifacts/client-portal/src",
  "artifacts/careers-portal/src",
];

// A `<Link …>` opening tag that does NOT contain `asChild` among its
// attributes, whose FIRST nested JSX element is `<a`. After the opening
// tag's `>` we allow only: optional whitespace/newlines (`\s*`) and an
// optional `{cond && ` conditional prefix (`\{[^<}]*` — chars that are
// neither `<` nor `}`), then `<a`. The negative lookahead
// `(?![^>]*\basChild\b)` keeps the asChild scan inside the SAME opening tag
// because `[^>]` never crosses the tag's closing `>`.
//
// Deliberately TIGHT to avoid false positives: because the gap before `<a`
// cannot contain arbitrary text, this does NOT match
//   * `<Link>text</Link>`            (text child, wouter renders its own <a>)
//   * `<Link><span><a>`              (indirect — first child is <span>)
//   * `<Link><Button>`               (the separate button-nesting guard)
//   * prose comments that merely mention `<Link>` and `<a>` separately
//   * a wouter test mock `Link: () => <a …>` (no `<Link …>` JSX tag at all)
// `\s` and the negated classes cross newlines, so multi-line opening tags
// and `<Link …>\n  <a>` wrappers ARE matched.
const NESTED_ANCHOR_RE =
  /<Link\b(?![^>]*\basChild\b)[^>]*>\s*(\{[^<}]*)?<a\b/;

export function fileHasLinkNestedAnchor(text) {
  return NESTED_ANCHOR_RE.test(text);
}

export function findLinkNestedAnchorLines(text) {
  const lines = text.split("\n");
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    // A window of the current + next two lines so a multi-line opening tag
    // (`<Link\n  href=…\n>`) followed by `<a` is still attributed to the
    // line the `<Link` starts on.
    const window = lines.slice(i, i + 3).join("\n");
    if (/<Link\b/.test(lines[i]) && NESTED_ANCHOR_RE.test(window)) {
      hits.push({ line: i + 1, text: lines[i].trim() });
    }
  }
  return hits;
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
  for (const rel of FRONTEND_SRC_DIRS) {
    const abs = join(REPO_ROOT, rel);
    if (!existsSync(abs)) continue;
    const files = await walkTsx(abs, []);
    for (const f of files) {
      const text = await readFile(f, "utf8");
      if (fileHasLinkNestedAnchor(text)) {
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
      "# link-nested-anchor-allowlist.txt",
      "#",
      "# Pre-existing files where a wouter `<Link>` (without `asChild`)",
      "# directly wraps an `<a>`, rendering invalid nested `<a><a>`. These",
      "# are accepted baseline offenders; the guard only fails on a file NOT",
      "# listed here. Regenerate with:",
      "#   node scripts/src/check-link-nested-anchor.mjs --write-allowlist",
      "# As files are fixed (add `asChild` to the <Link>), prune their line.",
      "#",
      `# Baseline captured: ${offenders.length} file(s).`,
      "",
    ].join("\n");
    await writeFile(ALLOWLIST_PATH, header + offenders.join("\n") + (offenders.length ? "\n" : ""), "utf8");
    console.log(`[check:link-nested-anchor] wrote ${offenders.length} entries to ${relative(REPO_ROOT, ALLOWLIST_PATH)}`);
    return;
  }

  const allow = loadAllowlist();
  const fresh = offenders.filter((f) => !allow.has(f));
  const stale = [...allow].filter((f) => !offenders.includes(f)).sort();

  if (stale.length) {
    console.log(
      `[check:link-nested-anchor] NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale ` +
        `(file fixed or removed) — prune from ${relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
    );
    for (const f of stale) console.log(`    - ${f}`);
  }

  if (fresh.length) {
    console.error(
      `\n[check:link-nested-anchor] FAIL: ${fresh.length} NEW file(s) wrap <a> inside <Link> without ` +
        `asChild (renders invalid nested <a><a>):`,
    );
    for (const f of fresh) {
      console.error(`    ✗ ${f}`);
      try {
        const hits = findLinkNestedAnchorLines(readFileSync(join(REPO_ROOT, f), "utf8"));
        for (const h of hits) console.error(`        ${f}:${h.line}  ${h.text}`);
      } catch {
        /* best-effort line reporting */
      }
    }
    console.error(
      "\n  Fix: add `asChild` to the <Link> so wouter clones the inner <a>\n" +
        "      -  <Link href=\"…\"><a className=\"…\">…</a></Link>\n" +
        "      +  <Link href=\"…\" asChild><a className=\"…\">…</a></Link>\n" +
        "  (zero visual change; clears the invalid nested-anchor / hydration warning).\n" +
        "  If this is genuinely intentional, add the path to scripts/link-nested-anchor-allowlist.txt.",
    );
    process.exit(1);
  }

  console.log(
    `[check:link-nested-anchor] OK — ${offenders.length} baseline offender(s) allowlisted, 0 new.`,
  );
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[check:link-nested-anchor] ERROR:", err);
    process.exit(2);
  });
}
