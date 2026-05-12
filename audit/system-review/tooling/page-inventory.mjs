#!/usr/bin/env node
// page-inventory.mjs — Read-only.
// Walks every `routes/*Routes.tsx`, plus App.tsx for root routes,
// and emits `_page-inventory.json` with one row per registered route.
//
// Output row shape:
//   {
//     module, path, componentName, sourceFile, routeFile, routeLine,
//     subKey?, minRoleLevel?
//   }

import { readFileSync, writeFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(__dirname, "../../..");
const ROUTES_DIR = join(REPO, "artifacts/ghayth-erp/src/routes");
const PAGES_ROOT = join(REPO, "artifacts/ghayth-erp/src/pages");
const APP_TSX = join(REPO, "artifacts/ghayth-erp/src/App.tsx");

const MODULE_FROM_FILE = {
  hrRoutes: "hr", financeRoutes: "finance", fleetRoutes: "fleet",
  governanceRoutes: "governance", biRoutes: "bi", adminRoutes: "admin",
  settingsRoutes: "settings", legalRoutes: "legal", propertyRoutes: "properties",
  storeRoutes: "store", documentsRoutes: "documents", requestsRoutes: "requests",
  commsRoutes: "communications", miscRoutes: "misc", umrahRoutes: "umrah",
};

function readLines(file) {
  return readFileSync(file, "utf8").split(/\r?\n/);
}

function parseImports(lines) {
  // const X = lazy(() => import("@/pages/foo/bar"));
  const out = {};
  const re = /const\s+(\w+)\s*=\s*lazy\(\s*\(\)\s*=>\s*import\(["'](@\/pages\/[^"']+)["']\)/;
  for (const line of lines) {
    const m = line.match(re);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function parseRouteEntries(lines, imports, module, routeFile) {
  // { path: "/x", component: Foo, subKey: "k", minRoleLevel: 40, module: "y" }
  // Parse one entry per `path:` line. Restrict the search window to the
  // braces of the current entry only — joining several lines was leaking
  // `module:` from an adjacent entry into the wrong row.
  const rows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const pm = line.match(/path:\s*["']([^"']+)["']/);
    if (!pm) continue;
    // Find the entry's own braces. Most entries are on a single line:
    //   { path: "...", component: X, module: "y" },
    // For multi-line entries, expand until the matching `}` is found.
    let scope = line;
    if (!line.includes("}")) {
      const collected = [line];
      for (let j = i + 1; j < Math.min(lines.length, i + 6); j++) {
        collected.push(lines[j]);
        if (lines[j].includes("}")) break;
      }
      scope = collected.join(" ");
    }
    const cm = scope.match(/component:\s*(\w+)/);
    const sm = scope.match(/subKey:\s*["']([^"']+)["']/);
    const rm = scope.match(/minRoleLevel:\s*(\d+)/);
    const mm = scope.match(/module:\s*["']([^"']+)["']/);
    const componentName = cm ? cm[1] : null;
    const sourceImport = componentName ? imports[componentName] : null;
    rows.push({
      module: mm ? mm[1] : module,
      path: pm[1],
      componentName,
      sourceFile: sourceImport
        ? sourceImport.replace("@/", "artifacts/ghayth-erp/src/") + ".tsx"
        : null,
      routeFile: routeFile.replace(REPO + "/", ""),
      routeLine: i + 1,
      subKey: sm ? sm[1] : null,
      minRoleLevel: rm ? Number(rm[1]) : null,
    });
  }
  return rows;
}

function fileExists(p) {
  if (!p) return false;
  const full = join(REPO, p);
  if (existsSync(full)) return true;
  // try index.tsx for folder import
  if (existsSync(full.replace(/\.tsx$/, "/index.tsx"))) return true;
  return false;
}

function main() {
  const out = [];
  const routeFiles = readdirSync(ROUTES_DIR).filter((f) => f.endsWith(".tsx"));
  for (const rf of routeFiles) {
    const full = join(ROUTES_DIR, rf);
    const lines = readLines(full);
    const imports = parseImports(lines);
    const moduleKey = rf.replace(".tsx", "");
    const module = MODULE_FROM_FILE[moduleKey] || "unknown";
    out.push(...parseRouteEntries(lines, imports, module, full));
  }
  // Root routes from App.tsx (/, /dashboard, /login, etc.)
  const appLines = readLines(APP_TSX);
  for (let i = 0; i < appLines.length; i++) {
    const m = appLines[i].match(/<Route\s+path=["']([^"']+)["']\s+component=\{(\w+)\}/);
    if (m) {
      out.push({
        module: "root",
        path: m[1],
        componentName: m[2],
        sourceFile: null,
        routeFile: "artifacts/ghayth-erp/src/App.tsx",
        routeLine: i + 1,
        subKey: null,
        minRoleLevel: null,
      });
    }
  }

  // Flag broken file refs
  for (const row of out) {
    row.sourceFileExists = fileExists(row.sourceFile);
  }

  const outFile = join(__dirname, "_page-inventory.json");
  writeFileSync(outFile, JSON.stringify(out, null, 2));

  // Summary
  const byModule = {};
  for (const r of out) {
    byModule[r.module] = (byModule[r.module] || 0) + 1;
  }
  console.log(`page-inventory: ${out.length} routes`);
  for (const [m, n] of Object.entries(byModule).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${m.padEnd(16)} ${n}`);
  }
  const missing = out.filter((r) => r.sourceFile && !r.sourceFileExists);
  if (missing.length) {
    console.log(`\n⚠ ${missing.length} routes point to missing source files:`);
    for (const r of missing.slice(0, 10)) {
      console.log(`  ${r.path} → ${r.sourceFile}`);
    }
  }
}

main();
