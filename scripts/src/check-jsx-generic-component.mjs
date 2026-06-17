#!/usr/bin/env node
//
// scripts/src/check-jsx-generic-component.mjs
//
// JSX component-generic guard. Catches the dev-preview-breaking pattern
// `<Component<any> …>` — a component RENDERED in JSX with an explicit
// `<any>` type argument, e.g.
//
//     <DataTable<any> columns={cols} data={rows} />
//
// Why this exists: the Replit dev-metadata Babel plugin injects
// `data-replit-metadata`/`data-component-name` onto the opening tag and
// mangles the generic into malformed output (`<DataTable data-…="…"<any>`)
// which Babel then fails to parse (`Unexpected token`). Vite pushes that
// transform error to EVERY connected client as a full-screen error
// overlay, so a single offending file (lazily loaded on one route) freezes
// the ENTIRE dev preview — every page shows the red overlay and the app
// becomes untestable, even on routes that never import the broken file.
// `tsc` accepts the generic, so typecheck/guard-CI passes and the bug is
// invisible until someone actually opens the preview. Production
// (`vite build` / @vitejs/plugin-react) is unaffected.
//
// The fix is zero-behavior-change: drop the `<any>` so T is inferred from
// the `columns`/`data` props (cast the data prop to `any[]` if the source
// row type was `unknown[]`). See replit.md Gotchas ("avoid `<DataTable<any>>`").
//
// SCOPE — deliberately narrow to avoid false positives:
//   * Only `<any>` type arguments are flagged. Named generics
//     (`<DataTable<MyRow> …>`) render fine in the preview and are used
//     across dozens of working pages — do NOT flag them.
//   * Only JSX-CALL positions are flagged (component generic immediately
//     followed by a JSX attribute, a `{…}` expr/spread, or a `/>` close).
//     TYPE positions like `useMemo<DataTableColumn<any>[]>(…)`,
//     `.map<DataTableColumn<any>>(…)`, `useState<Foo<any>>()`,
//     `Record<string, Foo<any>>`, and `x as Foo<any>` are NOT flagged.
//
// OFFLINE: pure source scan, no DB / build / server needed — runs
// unconditionally in CI (like check:button-nesting / check:dump-drift).
//
// Algorithm:
//   1. Walk every `.tsx` under each frontend artifact's `src/`.
//   2. Flag a file if its text contains a JSX-call component generic `<any>`.
//   3. A file on the allowlist is an accepted pre-existing offender.
//      A flagged file NOT on the allowlist is a NEW regression → fail.
//   4. `--write-allowlist` rewrites the baseline from current findings.
//
// Usage:
//   node scripts/src/check-jsx-generic-component.mjs                 # gate
//   node scripts/src/check-jsx-generic-component.mjs --write-allowlist
//
import { readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const REPO_ROOT = fileURLToPath(new URL("../../", import.meta.url));
const ALLOWLIST_PATH = join(REPO_ROOT, "scripts/jsx-generic-component-allowlist.txt");

const FRONTEND_SRC_DIRS = [
  "artifacts/ghayth-erp/src",
  "artifacts/client-portal/src",
  "artifacts/careers-portal/src",
];

// A component (Uppercase tag) RENDERED in JSX with an explicit `<any>`
// type argument, immediately followed by one of:
//   * a JSX attribute      (`\s+name=`)
//   * a `{…}` expr / spread (`\s+{`)
//   * a spread token        (`\s+...`)
//   * a self-closing tag    (`\s*/>`)
// `\s` crosses newlines so multi-line opening tags are matched. A bare
// `>` after `<any>` is intentionally NOT matched — that is the TYPE form
// (`useState<Foo<any>>`, `Array<Foo<any> >`), never a JSX call here.
const JSX_GENERIC_ANY_RE =
  /<[A-Z][A-Za-z0-9]*<any>(\s+([A-Za-z][\w-]*=|\{|\.\.\.)|\s*\/>)/;

export function fileHasJsxGenericAny(text) {
  return JSX_GENERIC_ANY_RE.test(text);
}

export function findJsxGenericAnyLines(text) {
  const re = new RegExp(JSX_GENERIC_ANY_RE.source, "g");
  const hits = [];
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    // Test a small window (current + next line) so multi-line opening tags
    // are still attributed to the line the tag starts on.
    const window = lines[i] + "\n" + (lines[i + 1] ?? "");
    re.lastIndex = 0;
    if (re.test(window) && JSX_GENERIC_ANY_RE.test(lines[i] + "\n" + (lines[i + 1] ?? ""))) {
      // Only attribute when the tag actually starts on this line.
      if (/<[A-Z][A-Za-z0-9]*<any>/.test(lines[i])) {
        hits.push({ line: i + 1, text: lines[i].trim() });
      }
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
      if (fileHasJsxGenericAny(text)) {
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
      "# jsx-generic-component-allowlist.txt",
      "#",
      "# Pre-existing files rendering a component with an explicit `<any>` JSX",
      "# type argument (`<DataTable<any> …>`), which breaks the Replit dev",
      "# preview (global Babel parse-error overlay). De-allowlist by dropping",
      "# the `<any>` generic (T is inferred from columns/data) and pruning the",
      "# line here.",
      "#",
      `# Baseline captured: ${offenders.length} file(s).`,
      "",
    ].join("\n");
    await writeFile(ALLOWLIST_PATH, header + offenders.join("\n") + (offenders.length ? "\n" : ""), "utf8");
    console.log(`[check:jsx-generic-component] wrote ${offenders.length} entries to ${relative(REPO_ROOT, ALLOWLIST_PATH)}`);
    return;
  }

  const allow = loadAllowlist();
  const fresh = offenders.filter((f) => !allow.has(f));
  const stale = [...allow].filter((f) => !offenders.includes(f)).sort();

  if (stale.length) {
    console.log(
      `[check:jsx-generic-component] NOTE: ${stale.length} allowlist entr${stale.length === 1 ? "y is" : "ies are"} stale ` +
        `(file fixed or removed) — prune from ${relative(REPO_ROOT, ALLOWLIST_PATH)}:`,
    );
    for (const f of stale) console.log(`    - ${f}`);
  }

  if (fresh.length) {
    console.error(
      `\n[check:jsx-generic-component] FAIL: ${fresh.length} NEW file(s) render a component with an explicit ` +
        `<any> JSX generic (breaks the dev preview with a global parse-error overlay):`,
    );
    for (const f of fresh) {
      console.error(`    ✗ ${f}`);
      try {
        const hits = findJsxGenericAnyLines(readFileSync(join(REPO_ROOT, f), "utf8"));
        for (const h of hits) console.error(`        ${f}:${h.line}  ${h.text}`);
      } catch {
        /* best-effort line reporting */
      }
    }
    console.error(
      "\n  Fix: drop the `<any>` so T is inferred from the columns/data props\n" +
        "      -  <DataTable<any> columns={cols} data={rows} />\n" +
        "      +  <DataTable columns={cols} data={rows as any[]} />\n" +
        "  (zero behavior change; clears the dev-preview Babel parse error).\n" +
        "  If this is genuinely intentional, add the path to scripts/jsx-generic-component-allowlist.txt.",
    );
    process.exit(1);
  }

  console.log(
    `[check:jsx-generic-component] OK — ${offenders.length} baseline offender(s) allowlisted, 0 new.`,
  );
}

const invokedDirectly =
  process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1];
if (invokedDirectly) {
  main().catch((err) => {
    console.error("[check:jsx-generic-component] ERROR:", err);
    process.exit(2);
  });
}
