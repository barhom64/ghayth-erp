#!/usr/bin/env node
// scripts/src/check-redirect-targets.mjs
//
// Guard: every redirect-alias target in the ghayth-erp route table must
// resolve to a real, defined route path. A `redirectTo("/x")` whose target
// "/x" is not a mounted route is a silent redirect-to-nowhere — the user
// lands on the SPA 404 (or a blank page) instead of the intended canonical
// page. This is the A4-navigation failure class the runtime audit catches at
// runtime; this guard catches it statically, before merge.
//
// Heavily used: the app aliases dozens of legacy/duplicate URLs onto a single
// canonical page via `redirectTo(...)` (admin->hr, finance v1->v2, bi/* -> /bi,
// /hr/organization -> /hr/org-tree, ...). Deleting or renaming a canonical
// route while leaving its alias behind would strand every bookmark on that
// alias. This guard fails the build the moment that happens.
//
// Scan scope: artifacts/ghayth-erp/src/routes/**/*.tsx (recursive).
//
// Resolution rule: a target resolves ONLY if it exactly equals a defined `path`
// or matches one of the SAME segment count where each `:param` segment matches
// any single concrete segment (so "/x/123" resolves against a defined "/x/:id",
// but NOT against a bare "/x"). This mirrors how the SPA router actually mounts
// routes — there is no catch-all/prefix fallthrough — so a target whose only
// "match" is a shorter ancestor path is a genuine redirect-to-nowhere and is
// flagged, not silently accepted.
//
// Exit codes: 0 = clean, 1 = broken redirect target(s), 2 = scan failed.

import fs from "node:fs";
import path from "node:path";
import url from "node:url";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, "..", "..");
const ROUTES_DIR = "artifacts/ghayth-erp/src/routes";

// Extract every `path: "/..."` literal in a route-table source file. Quote-
// agnostic (double, single, or backtick) so a formatter switch can't silently
// blind the scan; a route path never itself contains a quote char.
export function extractRoutePaths(src) {
  const out = [];
  const re = /path:\s*["'`](\/[^"'`]*)["'`]/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

// Extract every `redirectTo("/...")` target literal in a source file. Quote-
// agnostic for the same reason as extractRoutePaths.
export function extractRedirectTargets(src) {
  const out = [];
  const re = /redirectTo\(\s*["'`](\/[^"'`]*)["'`]\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) out.push(m[1]);
  return out;
}

const segs = (p) => p.split("/").filter(Boolean);

// Does `target` resolve against the set of defined route paths? Exact match, or
// a defined path of the SAME segment count where each `:param` segment matches
// any one concrete segment. No shorter-prefix fallthrough — the SPA router has
// no catch-all, so "/x/123" must match a defined "/x/:id", not merely "/x".
export function resolves(target, definedSet) {
  if (definedSet.has(target)) return true;
  const t = segs(target);
  for (const d of definedSet) {
    const ds = segs(d);
    if (ds.length !== t.length) continue; // same depth only
    let ok = true;
    for (let i = 0; i < ds.length; i++) {
      if (ds[i].startsWith(":")) continue; // param matches any one segment
      if (ds[i] !== t[i]) { ok = false; break; }
    }
    if (ok) return true;
  }
  return false;
}

function listRouteFiles() {
  const abs = path.join(REPO_ROOT, ROUTES_DIR);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  const walk = (dirAbs, dirRel) => {
    for (const entry of fs.readdirSync(dirAbs, { withFileTypes: true })) {
      const childAbs = path.join(dirAbs, entry.name);
      const childRel = path.join(dirRel, entry.name);
      if (entry.isDirectory()) walk(childAbs, childRel);
      else if (entry.isFile() && /\.tsx?$/.test(entry.name)) out.push(childRel);
    }
  };
  walk(abs, ROUTES_DIR);
  return out;
}

function main() {
  const files = listRouteFiles();
  if (files.length === 0) {
    console.error(`[check:redirect-targets] FAIL — no route files under ${ROUTES_DIR}`);
    process.exit(2);
  }

  const defined = new Set();
  const targets = []; // { target, file }
  for (const rel of files) {
    let src;
    try {
      src = fs.readFileSync(path.join(REPO_ROOT, rel), "utf8");
    } catch (err) {
      console.error(`[check:redirect-targets] could not read ${rel}: ${err.message}`);
      process.exit(2);
    }
    for (const p of extractRoutePaths(src)) defined.add(p);
    for (const t of extractRedirectTargets(src)) targets.push({ target: t, file: rel });
  }

  const broken = targets.filter(({ target }) => !resolves(target, defined));

  if (broken.length === 0) {
    console.log(
      `[check:redirect-targets] OK — ${targets.length} redirect target(s) across ${files.length} route file(s) all resolve to defined routes.`,
    );
    process.exit(0);
  }

  console.error(
    `[check:redirect-targets] FAIL — ${broken.length} redirect target(s) point at undefined routes (redirect-to-nowhere):\n`,
  );
  for (const { target, file } of broken) {
    console.error(`  ${file}: redirectTo("${target}") — no mounted route matches "${target}"`);
  }
  console.error(
    "\nEither restore the canonical route the alias points at, or update the redirectTo target to the new canonical path.",
  );
  process.exit(1);
}

// Auto-run only when invoked directly (so the .test.mjs sibling can import the
// pure helpers without triggering a scan/exit).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === url.fileURLToPath(import.meta.url);
if (invokedDirectly) main();
