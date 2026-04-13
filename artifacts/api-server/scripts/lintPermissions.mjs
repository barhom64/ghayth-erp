#!/usr/bin/env node
/**
 * lintPermissions.mjs — static check that every permission string referenced
 * in the routes exists in `lib/rbacCatalog.ts`. Fails with a non-zero exit
 * code when it finds a stray permission, so it can be wired into CI.
 *
 * Usage: node scripts/lintPermissions.mjs [--json]
 */

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { dirname, join, relative } from "node:path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const API_ROOT = join(__dirname, "..");
const ROUTES_DIR = join(API_ROOT, "src", "routes");
const CATALOG_PATH = join(API_ROOT, "src", "lib", "rbacCatalog.ts");

async function walk(dir) {
  const out = [];
  const entries = await readdir(dir, { withFileTypes: true });
  for (const entry of entries) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await walk(p)));
    } else if (entry.isFile() && entry.name.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

async function loadCatalogPermissions() {
  const src = await readFile(CATALOG_PATH, "utf8");
  // Parse the `export const PERMISSIONS = [...]` block. Intentionally simple
  // — we don't want to spin up a TS compiler for a linter.
  const match = src.match(/export const PERMISSIONS = \[([\s\S]*?)\] as const;/);
  if (!match) {
    throw new Error("Could not find PERMISSIONS array in rbacCatalog.ts");
  }
  const perms = new Set();
  for (const line of match[1].split("\n")) {
    const m = line.match(/"([^"]+)"/);
    if (m) perms.add(m[1]);
  }
  return perms;
}

async function scanRoute(file, catalog, offenders) {
  const src = await readFile(file, "utf8");
  // Match both `requirePermission("x", "y")` and `requireAnyPermission("x")`.
  const callRe = /require(?:Any)?Permission\(([^)]+)\)/g;
  let m;
  while ((m = callRe.exec(src)) !== null) {
    const argStr = m[1];
    const permRe = /"([^"]+)"/g;
    let pm;
    while ((pm = permRe.exec(argStr)) !== null) {
      const perm = pm[1];
      // Allow module wildcards (`hr:*`) and the global wildcard (`*`).
      if (perm === "*" || /^[a-z_]+:\*$/.test(perm)) continue;
      if (!catalog.has(perm)) {
        offenders.push({
          file: relative(API_ROOT, file),
          permission: perm,
        });
      }
    }
  }
}

async function main() {
  const wantJson = process.argv.includes("--json");
  const catalog = await loadCatalogPermissions();
  const files = await walk(ROUTES_DIR);
  const offenders = [];
  for (const f of files) {
    await scanRoute(f, catalog, offenders);
  }
  if (offenders.length === 0) {
    if (wantJson) console.log(JSON.stringify({ ok: true, unknown: [] }, null, 2));
    else console.log(`lintPermissions: OK — ${files.length} files scanned, ${catalog.size} permissions in catalogue.`);
    return;
  }
  if (wantJson) {
    console.log(JSON.stringify({ ok: false, unknown: offenders }, null, 2));
  } else {
    console.error(`lintPermissions: FAIL — ${offenders.length} unknown permission(s):`);
    for (const o of offenders) {
      console.error(`  - ${o.permission}  (${o.file})`);
    }
    console.error("Add the permission to src/lib/rbacCatalog.ts or fix the call.");
  }
  process.exit(1);
}

main().catch((err) => {
  console.error("lintPermissions crashed:", err);
  process.exit(2);
});
